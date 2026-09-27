import { TestBed } from '@angular/core/testing';
import { ApiError, ApiService } from './api.service';
import { AuthTokens } from './auth-tokens.service';
import { LearnerService } from './learner.service';
import { RuntimeConfigService } from './runtime-config.service';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

function setup(respond: (path: string, token: string | null) => Response) {
  const requests: string[] = [];
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    const token = (init.headers as Record<string, string>)['authorization'] ?? null;
    requests.push(`${url} ${token ?? 'anonymous'}`);
    return respond(url.replace('/api', ''), token);
  }) as typeof fetch;
  TestBed.configureTestingModule({
    providers: [
      { provide: LearnerService, useValue: { id: () => 'device-learner' } },
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

  it('never renews around the refresh call itself', async () => {
    let refreshes = 0;
    const { api, tokens } = setup(() => json(401, { statusCode: 401, message: 'Expired', code: 'token_invalid' }));
    tokens.refresher = async () => (refreshes++, true);
    await expect(api.post('/auth/refresh', { refreshToken: 'r' })).rejects.toBeInstanceOf(ApiError);
    expect(refreshes).toBe(0);
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
