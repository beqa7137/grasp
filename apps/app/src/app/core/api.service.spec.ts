import { TestBed } from '@angular/core/testing';
import { ApiError, ApiService } from './api.service';
import { AuthTokens } from './auth-tokens.service';
import { LearnerService } from './learner.service';
import { RuntimeConfigService } from './runtime-config.service';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

function setup(respond: (path: string, token: string | null) => Response | Promise<Response>, learnerId = () => 'device-learner') {
  const requests: string[] = [];
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    const token = (init.headers as Record<string, string>)['authorization'] ?? null;
    requests.push(`${url} ${token ?? 'anonymous'}`);
    return respond(url.replace('/api', ''), token);
  }) as typeof fetch;
  TestBed.configureTestingModule({
    providers: [
      { provide: LearnerService, useValue: { id: learnerId } },
      { provide: RuntimeConfigService, useValue: { apiBase: () => '/api' } },
    ],
  });
  const tokens = TestBed.inject(AuthTokens);
  return { api: TestBed.inject(ApiService), tokens, requests };
}

describe('ApiService', () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
    vi.useRealTimers();
  });

  it('renews an expired access token for signed-in account routes, then retries once', async () => {
    const { api, tokens, requests } = setup((_, token) =>
      token === 'Bearer fresh' ? json(200, { identities: [] }) : json(401, { statusCode: 401, message: 'Expired', code: 'token_invalid' }),
    );
    tokens.accessToken.set('stale');
    tokens.refresher = async () => (tokens.accessToken.set('fresh'), true);
    expect(await api.get('/auth/me')).toEqual({ identities: [] });
    expect(requests).toEqual(['/api/auth/me Bearer stale', '/api/auth/me Bearer fresh']);
  });

  it.each(['request', 'stream'])('shows a temporary renewal failure without marking the session ended for %s', async (kind) => {
    const { api, tokens, requests } = setup(() => json(401, { message: 'Sign in to continue.', code: 'sign_in_required' }));
    const failure = new ApiError(429, 'Please try again in 2 minutes.', 'rate_limited');
    tokens.refresher = async () => {
      throw failure;
    };
    const attempt =
      kind === 'request' ? api.get('/progress/events') : api.stream('/interview/sessions/one/messages', {}, { delta: () => undefined });
    await expect(attempt).rejects.toBe(failure);
    expect(tokens.signInRequired()).toBe(false);
    expect(requests).toHaveLength(1);
  });

  it.each(['request', 'stream'])('does not retry a %s under a learner changed by renewal', async (kind) => {
    let learnerId = 'original';
    const { api, tokens, requests } = setup(
      () => json(401, { code: 'token_invalid' }),
      () => learnerId,
    );
    tokens.refresher = async () => {
      learnerId = 'replacement';
      tokens.accessToken.set('replacement-token');
      return true;
    };
    const result =
      kind === 'request'
        ? api.post('/progress/events', { events: [{ id: 'original-event' }] })
        : api.stream('/interview/sessions/one/messages', {}, { delta: () => undefined });
    await expect(result).rejects.toMatchObject({ name: 'AbortError' });
    expect(requests).toHaveLength(1);
  });

  it('does not mark a replacement learner signed out when an old request cannot renew', async () => {
    let learnerId = 'owned';
    const { api, tokens } = setup(
      () => json(401, { code: 'sign_in_required' }),
      () => learnerId,
    );
    tokens.refresher = async () => {
      learnerId = 'fresh';
      return false;
    };
    await expect(api.get('/progress/events')).rejects.toMatchObject({ name: 'AbortError' });
    expect(tokens.signInRequired()).toBe(false);
  });

  it('never renews around the refresh call itself', async () => {
    let refreshes = 0;
    const { api, tokens } = setup(() => json(401, { statusCode: 401, message: 'Expired', code: 'token_invalid' }));
    tokens.refresher = async () => (refreshes++, true);
    await expect(api.post('/auth/refresh', { refreshToken: 'r' })).rejects.toBeInstanceOf(ApiError);
    expect(refreshes).toBe(0);
  });

  it.each(['get', 'post'] as const)('does not dispatch a cancelled %s', async (method) => {
    const { api, requests } = setup(() => json(200, { events: [] }));
    const abort = new AbortController();
    abort.abort();
    const request =
      method === 'get'
        ? api.get('/progress/events', undefined, abort.signal)
        : api.post('/progress/events', { events: [] }, undefined, abort.signal);
    await expect(request).rejects.toMatchObject({ name: 'AbortError' });
    expect(requests).toEqual([]);
  });

  it('does not renew or resend a cancelled upload when an old response arrives', async () => {
    let learnerId = 'old-learner';
    let respond!: (value: Response) => void;
    const response = new Promise<Response>((resolve) => (respond = resolve));
    const { api, tokens, requests } = setup(
      () => response,
      () => learnerId,
    );
    const renew = vi.fn(async () => true);
    tokens.refresher = renew;
    const abort = new AbortController();
    const request = api.post('/progress/events', { events: [{ id: 'old-event' }] }, undefined, abort.signal);
    const cancelled = expect(request).rejects.toMatchObject({ name: 'AbortError' });
    abort.abort();
    learnerId = 'replacement-learner';
    tokens.accessToken.set('replacement-token');
    respond(json(401, { message: 'Expired', code: 'token_invalid' }));
    await cancelled;
    await Promise.resolve();
    expect(renew).not.toHaveBeenCalled();
    expect(requests).toEqual(['/api/progress/events anonymous']);
  });

  it.each(['request', 'stream'] as const)(
    'settles %s cancellation during shared renewal without a replacement-account retry',
    async (kind) => {
      let learnerId = 'old-learner';
      let entered!: () => void;
      let finish!: () => void;
      const renewing = new Promise<void>((resolve) => (entered = resolve));
      const renewed = new Promise<void>((resolve) => (finish = resolve));
      const { api, tokens, requests } = setup(
        (_, token) => (token === 'Bearer replacement-token' ? json(200, {}) : json(401, { message: 'Expired', code: 'token_invalid' })),
        () => learnerId,
      );
      tokens.accessToken.set('old-token');
      tokens.refresher = async () => {
        entered();
        await renewed;
        return true;
      };
      const abort = new AbortController();
      let outcome: unknown;
      const attempt =
        kind === 'request'
          ? api.post('/progress/events', { events: [{ id: 'old-event' }] }, undefined, abort.signal)
          : api.stream('/interview/sessions/one/messages', { content: 'old answer' }, { delta: () => undefined }, abort.signal);
      const request = attempt.then(
        (value) => (outcome = value),
        (error: unknown) => (outcome = error),
      );
      await renewing;
      abort.abort();
      try {
        await expect.poll(() => outcome, { timeout: 250 }).toMatchObject({ name: 'AbortError' });
        learnerId = 'replacement-learner';
        tokens.accessToken.set('replacement-token');
      } finally {
        finish();
        await request;
      }
      await Promise.resolve();
      expect(requests).toEqual([
        kind === 'request' ? '/api/progress/events Bearer old-token' : '/api/interview/sessions/one/messages Bearer old-token',
      ]);
    },
  );

  it('keeps the serialized upload unchanged when an ordinary refresh retries it', async () => {
    const { api, tokens } = setup(() => json(200, {}));
    const body = { events: [{ id: 'event', settings: { newPerDay: 5 } }] };
    const bodies: string[] = [];
    tokens.accessToken.set('old-token');
    tokens.refresher = async () => {
      body.events[0]!.settings.newPerDay = 10;
      tokens.accessToken.set('fresh-token');
      return true;
    };
    globalThis.fetch = (async (_url, init) => {
      bodies.push(String(init?.body));
      return bodies.length === 1 ? json(401, { message: 'Expired', code: 'token_invalid' }) : json(200, {});
    }) as typeof fetch;
    await api.post('/progress/events', body);
    expect(bodies).toEqual([JSON.stringify({ events: [{ id: 'event', settings: { newPerDay: 5 } }] }), bodies[0]]);
  });

  it("rejects with the API's status, code and message", async () => {
    const { api } = setup(() =>
      json(409, { statusCode: 409, message: 'This email already has a Grasp account.', code: 'account_exists', providers: ['google'] }),
    );
    const error = await api.post('/auth/github', { ticket: 't', codeVerifier: 'v' }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 409, code: 'account_exists', message: 'This email already has a Grasp account.' });
  });

  it('routes bearerless retired learner codes to recovery without replaying the rejected write', async () => {
    for (const code of ['learner_erased', 'learner_moved'] as const) {
      const { api, tokens, requests } = setup(() => json(410, { statusCode: 410, message: 'Learner retired', code }));
      const recovered = vi.fn(async () => undefined);
      tokens.learnerRetired = recovered;

      await expect(api.post('/progress/events', { events: [] })).rejects.toMatchObject({ status: 410, code });
      expect(recovered).toHaveBeenCalledExactlyOnceWith(code, 'device-learner');
      expect(requests).toEqual(['/api/progress/events anonymous']);
      TestBed.resetTestingModule();
    }
  });

  it('does not reset a learner when a bearer request receives 410', async () => {
    const { api, tokens } = setup(() => json(410, { statusCode: 410, message: 'Learner retired', code: 'learner_erased' }));
    const recovered = vi.fn(async () => undefined);
    tokens.accessToken.set('account-token');
    tokens.learnerRetired = recovered;

    await expect(api.post('/progress/events', { events: [] })).rejects.toMatchObject({ status: 410, code: 'learner_erased' });
    expect(recovered).not.toHaveBeenCalled();
  });

  it('recovers from an anonymous retired learner read without a pending write', async () => {
    const { api, tokens, requests } = setup(() => json(410, { statusCode: 410, message: 'Learner erased', code: 'learner_erased' }));
    const recovered = vi.fn(async () => undefined);
    tokens.learnerRetired = recovered;

    await expect(api.get('/progress/events')).rejects.toMatchObject({ status: 410, code: 'learner_erased' });
    expect(recovered).toHaveBeenCalledWith('learner_erased', 'device-learner');
    expect(requests).toEqual(['/api/progress/events anonymous']);
  });

  it('does not replay a cached 410 after recovery changes the learner id', async () => {
    let learnerId = 'retired-learner';
    let cached: Response | null = null;
    const requestedLearners: string[] = [];
    const { api, tokens } = setup(
      () => json(200, { events: [] }),
      () => learnerId,
    );
    tokens.learnerRetired = async (_code, requestedId) => {
      expect(requestedId).toBe('retired-learner');
      learnerId = 'fresh-learner';
    };
    globalThis.fetch = ((_url, init) => {
      requestedLearners.push((init?.headers as Record<string, string> | undefined)?.['x-learner-id'] ?? '');
      if (init?.cache !== 'no-store' && cached) return Promise.resolve(cached.clone());
      const response = json(
        learnerId === 'retired-learner' ? 410 : 200,
        learnerId === 'retired-learner' ? { statusCode: 410, message: 'Learner erased', code: 'learner_erased' } : { events: [] },
      );
      if (init?.cache !== 'no-store') cached = response.clone();
      return Promise.resolve(response);
    }) as typeof fetch;

    await expect(api.get('/progress/events')).rejects.toMatchObject({ status: 410, code: 'learner_erased' });
    await expect(api.get('/progress/events')).resolves.toEqual({ events: [] });
    expect(requestedLearners).toEqual(['retired-learner', 'fresh-learner']);
  });

  it('handles a coded learner move after an interview stream has started', async () => {
    const event = 'event: error\ndata: {"status":410,"message":"Learner moved","code":"learner_moved"}\n\n';
    const { api, tokens } = setup(
      () =>
        new Response(
          new ReadableStream({ start: (controller) => (controller.enqueue(new TextEncoder().encode(event)), controller.close()) }),
        ),
    );
    const recovered = vi.fn(async () => undefined);
    tokens.learnerRetired = recovered;

    await expect(api.stream('/interview/sessions/one/messages', {}, { delta: () => undefined })).rejects.toMatchObject({
      status: 410,
      code: 'learner_moved',
    });
    expect(recovered).toHaveBeenCalledWith('learner_moved', 'device-learner');
  });

  it('aborts a stalled request by its deadline and allows the learner to retry', async () => {
    vi.useFakeTimers();
    const { api } = setup(() => json(200, { events: [] }));
    let signal: AbortSignal | undefined;
    let attempts = 0;
    globalThis.fetch = ((_url, init) => {
      attempts++;
      if (attempts > 1) return Promise.resolve(json(200, { events: [] }));
      signal = init?.signal as AbortSignal;
      return new Promise<Response>(() => undefined);
    }) as typeof fetch;

    const first = api.get('/auth/me');
    const timedOut = expect(first).rejects.toMatchObject({
      status: 0,
      code: 'request_timeout',
      message: expect.stringContaining('try again'),
    });
    await vi.advanceTimersByTimeAsync(8_000);
    await timedOut;
    expect(signal?.aborted).toBe(true);
    expect(await api.get('/auth/me')).toEqual({ events: [] });
    expect(attempts).toBe(2);
  });

  it('allows a slow progress body but still bounds a stalled pull', async () => {
    vi.useFakeTimers();
    const { api } = setup(() => json(200, {}));
    let signal: AbortSignal | undefined;
    globalThis.fetch = ((_url, init) => {
      signal = init?.signal as AbortSignal;
      return Promise.resolve(
        new Response(
          new ReadableStream({
            start(controller) {
              setTimeout(() => {
                controller.enqueue(new TextEncoder().encode('{"events":[]}'));
                controller.close();
              }, 10_000);
            },
          }),
        ),
      );
    }) as typeof fetch;

    const pull = api.get('/progress/events', 20_000);
    await vi.advanceTimersByTimeAsync(8_000);
    expect(signal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(await pull).toEqual({ events: [] });
    expect(signal?.aborted).toBe(false);

    globalThis.fetch = ((_url, init) => {
      signal = init?.signal as AbortSignal;
      return new Promise<Response>(() => undefined);
    }) as typeof fetch;
    const stalled = api.get('/progress/events', 20_000);
    const timedOut = expect(stalled).rejects.toMatchObject({ status: 0, code: 'request_timeout' });
    await vi.advanceTimersByTimeAsync(20_000);
    await timedOut;
    expect(signal?.aborted).toBe(true);
  });

  it('bounds a stalled interview stream connection', async () => {
    vi.useFakeTimers();
    const { api } = setup(() => json(200, {}));
    let signal: AbortSignal | undefined;
    globalThis.fetch = ((_url, init) => {
      signal = init?.signal as AbortSignal;
      return new Promise<Response>(() => undefined);
    }) as typeof fetch;

    const stream = api.stream('/interview/sessions/one/messages', {}, { delta: () => undefined });
    const timedOut = expect(stream).rejects.toMatchObject({ status: 0, code: 'request_timeout' });
    await vi.advanceTimersByTimeAsync(190_000);
    await timedOut;
    expect(signal?.aborted).toBe(true);
  });

  it('lets an established interview stream continue past the connection deadline', async () => {
    vi.useFakeTimers();
    const { api } = setup(() => json(200, {}));
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        setTimeout(() => {
          controller.enqueue(new TextEncoder().encode('event: done\ndata: {"reply":true}\n\n'));
          controller.close();
        }, 195_000);
      },
    });
    globalThis.fetch = (() => Promise.resolve(new Response(body))) as typeof fetch;

    const stream = api.stream<{ reply: boolean }>('/interview/sessions/one/messages', {}, { delta: () => undefined });
    await vi.advanceTimersByTimeAsync(195_000);
    expect(await stream).toEqual({ reply: true });
  });
});
