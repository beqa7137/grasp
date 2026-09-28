import { TestBed } from '@angular/core/testing';
import { Preferences } from '@capacitor/preferences';
import { ToastController } from '@ionic/angular';
import { ApiService } from './api.service';
import { AuthTokens } from './auth-tokens.service';
import { AuthService } from './auth.service';
import { LearnerService } from './learner.service';
import { ProgressService } from './progress.service';
import { RuntimeConfigService } from './runtime-config.service';
import { SocialSignInService } from './social-sign-in.service';

vi.mock('@capacitor/preferences', () => ({
  Preferences: {
    get: vi.fn(async ({ key }: { key: string }) => ({ value: localStorage.getItem(`CapacitorStorage.${key}`) })),
    set: vi.fn(async ({ key, value }: { key: string; value: string }) => localStorage.setItem(`CapacitorStorage.${key}`, value)),
    remove: vi.fn(async ({ key }: { key: string }) => localStorage.removeItem(`CapacitorStorage.${key}`)),
    keys: vi.fn(async () => ({
      keys: Object.keys(localStorage)
        .filter((key) => key.startsWith('CapacitorStorage.'))
        .map((key) => key.slice('CapacitorStorage.'.length)),
    })),
  },
}));

interface FetchCall {
  path: string;
  method: string;
  learnerId: string;
  authorization: string | null;
  body: string | undefined;
  signal: AbortSignal | null;
}

const githubCredential = { ticket: 'github-ticket', codeVerifier: 'github-verifier' };
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const session = (accessToken: string, learnerId: string) => ({
  accessToken,
  refreshToken: `refresh-${accessToken}`,
  user: { id: 'account-user', email: 'learner@example.com' },
  learnerId,
});
const event = (id: string, newPerDay: number) => ({
  id,
  at: '2026-09-27T00:00:00.000Z',
  type: 'settings.changed' as const,
  settings: { newPerDay },
});
const acknowledgment = (call: FetchCall) => {
  const events = (JSON.parse(call.body ?? '{}') as { events: { id: string }[] }).events;
  return json(200, {
    accepted: events.length,
    duplicates: 0,
    rejectedFuture: 0,
    acknowledgedIds: events.map(({ id }) => id),
    deferredFutureIds: [],
    serverTime: '2026-09-27T00:00:00.000Z',
  });
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => (resolve = complete));
  return { promise, resolve };
}

async function setup(respond: (call: FetchCall) => Response | Promise<Response>, learnerId = 'guest-learner') {
  const calls: FetchCall[] = [];
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const headers = init?.headers as Record<string, string> | undefined;
    const call: FetchCall = {
      path: String(input).replace(/^\/api/, ''),
      method: init?.method ?? 'GET',
      learnerId: headers?.['x-learner-id'] ?? '',
      authorization: headers?.['authorization'] ?? null,
      body: typeof init?.body === 'string' ? init.body : undefined,
      signal: init?.signal ?? null,
    };
    calls.push(call);
    return Promise.resolve(respond(call));
  }) as typeof fetch;
  await Preferences.set({ key: 'grasp.learnerId', value: learnerId });
  TestBed.configureTestingModule({
    providers: [
      { provide: RuntimeConfigService, useValue: { apiBase: () => '/api' } },
      { provide: SocialSignInService, useValue: { github: async () => githubCredential } },
      { provide: ToastController, useValue: { create: async () => ({ present: async () => undefined }) } },
    ],
  });
  const learner = TestBed.inject(LearnerService);
  await learner.init();
  const auth = TestBed.inject(AuthService);
  await auth.init();
  return {
    calls,
    learner,
    auth,
    tokens: TestBed.inject(AuthTokens),
    progress: TestBed.inject(ProgressService),
    api: TestBed.inject(ApiService),
  };
}

describe('Progress and authentication integration', () => {
  const realFetch = globalThis.fetch;

  beforeEach(() => localStorage.clear());
  afterEach(() => {
    TestBed.resetTestingModule();
    localStorage.clear();
    globalThis.fetch = realFetch;
  });

  it('cancels an old upload before its delayed 401 can retry after same-learner sign-in', async () => {
    const oldReply = deferred<Response>();
    const oldUploadStarted = deferred<void>();
    const { auth, calls, learner, progress, tokens } = await setup((call) => {
      if (call.path === '/auth/github') return json(200, session('replacement-token', 'guest-learner'));
      if (call.path === '/auth/me') return json(200, { identities: [] });
      if (call.path === '/progress/events' && call.method === 'GET') return json(200, { events: [] });
      if (call.path === '/progress/events' && call.authorization === 'Bearer old-token') {
        oldUploadStarted.resolve();
        return oldReply.promise;
      }
      if (call.path === '/progress/events' && call.method === 'POST') return acknowledgment(call);
      throw new Error(`Unexpected request: ${call.method} ${call.path}`);
    });
    tokens.accessToken.set('old-token');
    await progress.record(event('local-event', 5));
    const oldFlush = progress.flush();
    await oldUploadStarted.promise;
    const oldSignal = calls.find((call) => call.path === '/progress/events' && call.method === 'POST')?.signal;
    tokens.signInRequired.set(true);

    expect(await auth.signIn('github')).toBe(true);
    expect(learner.id()).toBe('guest-learner');
    expect(oldSignal?.aborted).toBe(true);
    oldReply.resolve(json(401, { message: 'Expired', code: 'token_invalid' }));
    await oldFlush;

    expect(calls.filter((call) => call.path === '/progress/events' && call.method === 'POST' && call.signal === oldSignal)).toHaveLength(1);
    expect(
      calls
        .filter((call) => call.path === '/progress/events' && call.method === 'POST' && call.signal !== oldSignal)
        .map((call) => call.authorization),
    ).toEqual(['Bearer replacement-token']);
    expect(calls.filter((call) => call.path === '/auth/refresh')).toHaveLength(0);
    expect(progress.syncStatus()).toBe('synced');
  });

  it('pulls a changed account while the former guest pull is still blocked', async () => {
    const guestStarted = deferred<void>();
    const guestReply = deferred<Response>();
    const accountStarted = deferred<void>();
    const localEvent = event('guest-local-event', 5);
    const accountEvent = event('account-event', 10);
    const staleEvent = event('stale-guest-event', 20);
    const { auth, calls, learner, progress } = await setup((call) => {
      if (call.path === '/auth/github') return json(200, session('account-token', 'account-learner'));
      if (call.path === '/auth/me') return json(200, { identities: [] });
      if (call.path === '/progress/events' && call.method === 'POST') return acknowledgment(call);
      if (call.path === '/progress/events' && call.learnerId === 'guest-learner') {
        guestStarted.resolve();
        return guestReply.promise;
      }
      if (call.path === '/progress/events' && call.learnerId === 'account-learner') {
        accountStarted.resolve();
        return json(200, { events: [localEvent, accountEvent] });
      }
      throw new Error(`Unexpected request: ${call.method} ${call.path}`);
    });
    await progress.record(localEvent);
    const oldSync = progress.resync();
    await guestStarted.promise;

    const signIn = auth.signIn('github');
    await accountStarted.promise;
    expect(await signIn).toBe(true);
    expect(learner.id()).toBe('account-learner');
    expect(calls.filter((call) => call.path === '/progress/events' && call.method === 'GET').map((call) => call.learnerId)).toEqual([
      'guest-learner',
      'account-learner',
    ]);

    guestReply.resolve(json(200, { events: [staleEvent] }));
    await oldSync;
    const { value } = await Preferences.get({ key: 'grasp.events' });
    expect((JSON.parse(value!).events as { id: string }[]).map(({ id }) => id)).toEqual([localEvent.id, accountEvent.id]);
    expect(progress.syncStatus()).toBe('synced');
  });

  it.each(['success', 'expired'] as const)(
    'keeps explicit sign-in after an old upload is cancelled during shared renewal (%s)',
    async (outcome) => {
      const refreshStarted = deferred<void>();
      const refreshReply = deferred<Response>();
      const { auth, calls, progress, tokens } = await setup((call) => {
        if (call.path === '/auth/refresh') {
          refreshStarted.resolve();
          return refreshReply.promise;
        }
        if (call.path === '/auth/github') return json(200, session('replacement-token', 'guest-learner'));
        if (call.path === '/auth/me') return json(200, { identities: [] });
        if (call.path === '/progress/events' && call.method === 'GET') return json(200, { events: [] });
        if (call.path === '/progress/events' && call.authorization === 'Bearer old-token') {
          return json(401, { message: 'Expired', code: 'token_invalid' });
        }
        if (call.path === '/progress/events' && call.method === 'POST') return acknowledgment(call);
        throw new Error(`Unexpected request: ${call.method} ${call.path}`);
      });
      await Preferences.set({ key: 'grasp.auth.refresh', value: 'old-refresh-token' });
      tokens.accessToken.set('old-token');
      await progress.record(event('renewing-event', 5));
      const oldFlush = progress.flush();
      await refreshStarted.promise;
      const renewal = tokens.refresher!();
      const oldSignal = calls.find((call) => call.path === '/progress/events' && call.method === 'POST')?.signal;
      tokens.signInRequired.set(true);

      expect(await auth.signIn('github')).toBe(true);
      expect(oldSignal?.aborted).toBe(true);
      refreshReply.resolve(
        outcome === 'success'
          ? json(200, session('old-renewed-token', 'guest-learner'))
          : json(401, { message: 'Old refresh token expired', code: 'token_invalid' }),
      );
      await renewal;
      await oldFlush;

      expect(calls.filter((call) => call.path === '/auth/refresh')).toHaveLength(1);
      expect(calls.filter((call) => call.path === '/progress/events' && call.method === 'POST' && call.signal === oldSignal)).toHaveLength(
        1,
      );
      expect(tokens.accessToken()).toBe('replacement-token');
      expect(tokens.signInRequired()).toBe(false);
      expect(auth.signedIn()).toBe(true);
      expect((await Preferences.get({ key: 'grasp.auth.refresh' })).value).toBe('refresh-replacement-token');
      expect(progress.syncStatus()).toBe('synced');
    },
  );

  it('starts fresh account sync when renewal changes the learner during the startup guest pull', async () => {
    const guestStarted = deferred<void>();
    const guestReply = deferred<Response>();
    const accountStarted = deferred<void>();
    const accountUploadStarted = deferred<void>();
    const localEvent = event('renewal-local-event', 5);
    const accountEvent = event('renewal-account-event', 10);
    const { auth, calls, learner, progress, tokens } = await setup((call) => {
      if (call.path === '/auth/refresh') return json(200, session('fresh-account-token', 'account-learner'));
      if (call.path === '/progress/events' && call.method === 'GET' && call.learnerId === 'guest-learner') {
        guestStarted.resolve();
        return guestReply.promise;
      }
      if (call.path === '/progress/events' && call.method === 'GET' && call.learnerId === 'account-learner') {
        accountStarted.resolve();
        return json(200, { events: [accountEvent] });
      }
      if (call.path === '/progress/events' && call.method === 'POST' && call.learnerId === 'account-learner') {
        accountUploadStarted.resolve();
        return acknowledgment(call);
      }
      throw new Error(`Unexpected request: ${call.method} ${call.path}`);
    });
    await Preferences.set({ key: 'grasp.auth.refresh', value: 'guest-refresh-token' });
    await Preferences.set({ key: 'grasp.events', value: JSON.stringify([localEvent]) });
    tokens.accessToken.set('guest-stale-token');
    await progress.init();
    await guestStarted.promise;
    const oldSync = progress.resync();
    const oldSignal = calls.find((call) => call.path === '/progress/events' && call.method === 'GET')?.signal;
    guestReply.resolve(json(401, { message: 'Expired', code: 'token_invalid' }));

    await accountStarted.promise;
    await accountUploadStarted.promise;
    await oldSync;
    await progress.resync();

    expect(oldSignal?.aborted).toBe(true);
    expect(learner.id()).toBe('account-learner');
    expect(auth.signedIn()).toBe(true);
    expect(calls.filter((call) => call.path === '/progress/events' && call.method === 'GET' && call.signal === oldSignal)).toHaveLength(1);
    expect(
      calls.filter((call) => call.path === '/progress/events' && call.method === 'GET' && call.learnerId === 'account-learner'),
    ).toHaveLength(1);
    expect(
      calls.filter((call) => call.path === '/progress/events' && call.method === 'POST' && call.learnerId === 'account-learner'),
    ).toHaveLength(1);
    const { value } = await Preferences.get({ key: 'grasp.events' });
    expect((JSON.parse(value!).events as { id: string }[]).map(({ id }) => id)).toEqual([localEvent.id, accountEvent.id]);
    expect(progress.syncStatus()).toBe('synced');
  });

  it('keeps replacement credentials and learner storage when an older renewal write finishes late', async () => {
    const githubStarted = deferred<void>();
    const githubReply = deferred<Response>();
    const oldWriteStarted = deferred<void>();
    const releaseOldWrite = deferred<void>();
    const { auth, learner, progress, tokens } = await setup((call) => {
      if (call.path === '/auth/refresh') return json(200, session('old-renewed-token', 'old-account-learner'));
      if (call.path === '/auth/github') {
        githubStarted.resolve();
        return githubReply.promise;
      }
      if (call.path === '/auth/me') return json(200, { identities: [] });
      if (call.path === '/progress/events' && call.method === 'GET') return json(200, { events: [] });
      throw new Error(`Unexpected request: ${call.method} ${call.path}`);
    });
    await Preferences.set({ key: 'grasp.auth.refresh', value: 'initial-refresh-token' });
    tokens.accessToken.set('stale-token');
    const storageSpy = vi.spyOn(Preferences, 'set').mockImplementation(async (options) => {
      if (options.key === 'grasp.auth.refresh' && options.value === 'refresh-old-renewed-token') {
        oldWriteStarted.resolve();
        await releaseOldWrite.promise;
      }
      localStorage.setItem(`CapacitorStorage.${options.key}`, options.value);
    });

    try {
      const oldRenewal = tokens.refresher!();
      await oldWriteStarted.promise;
      const signIn = auth.signIn('github');
      await githubStarted.promise;
      const adoptionStarted = deferred<void>();
      const originalInvalidate = progress.invalidateSync.bind(progress);
      const invalidateSpy = vi.spyOn(progress, 'invalidateSync').mockImplementation(() => {
        originalInvalidate();
        adoptionStarted.resolve();
      });
      try {
        githubReply.resolve(json(200, session('replacement-token', 'replacement-learner')));
        await adoptionStarted.promise;
        expect(tokens.accessToken()).toBe('replacement-token');
        releaseOldWrite.resolve();
        await Promise.all([oldRenewal, signIn]);
      } finally {
        releaseOldWrite.resolve();
        invalidateSpy.mockRestore();
      }

      expect(tokens.accessToken()).toBe('replacement-token');
      expect(auth.signedIn()).toBe(true);
      expect(learner.id()).toBe('replacement-learner');
      expect((await Preferences.get({ key: 'grasp.auth.refresh' })).value).toBe('refresh-replacement-token');
      expect((await Preferences.get({ key: 'grasp.learnerId' })).value).toBe('replacement-learner');
    } finally {
      releaseOldWrite.resolve();
      storageSpy.mockRestore();
    }
  });

  it('keeps sign-in active when an older expired renewal finishes removing stored credentials', async () => {
    const githubStarted = deferred<void>();
    const githubReply = deferred<Response>();
    const removalStarted = deferred<void>();
    const releaseRemoval = deferred<void>();
    const { auth, learner, progress, tokens } = await setup((call) => {
      if (call.path === '/auth/refresh') return json(401, { message: 'Old refresh token expired', code: 'token_invalid' });
      if (call.path === '/auth/github') {
        githubStarted.resolve();
        return githubReply.promise;
      }
      if (call.path === '/auth/me') return json(200, { identities: [] });
      if (call.path === '/progress/events' && call.method === 'GET') return json(200, { events: [] });
      throw new Error(`Unexpected request: ${call.method} ${call.path}`);
    });
    await Preferences.set({ key: 'grasp.auth.refresh', value: 'initial-refresh-token' });
    tokens.accessToken.set('stale-token');
    const removalSpy = vi.spyOn(Preferences, 'remove').mockImplementation(async ({ key }) => {
      if (key === 'grasp.auth.refresh') {
        removalStarted.resolve();
        await releaseRemoval.promise;
      }
      localStorage.removeItem(`CapacitorStorage.${key}`);
    });

    try {
      const oldRenewal = tokens.refresher!();
      await removalStarted.promise;
      const signIn = auth.signIn('github');
      await githubStarted.promise;
      const adoptionStarted = deferred<void>();
      const originalInvalidate = progress.invalidateSync.bind(progress);
      const invalidateSpy = vi.spyOn(progress, 'invalidateSync').mockImplementation(() => {
        originalInvalidate();
        adoptionStarted.resolve();
      });
      try {
        githubReply.resolve(json(200, session('replacement-token', 'replacement-learner')));
        await adoptionStarted.promise;
        expect(tokens.accessToken()).toBe('replacement-token');
        releaseRemoval.resolve();
        await Promise.all([oldRenewal, signIn]);
      } finally {
        releaseRemoval.resolve();
        invalidateSpy.mockRestore();
      }

      expect(tokens.accessToken()).toBe('replacement-token');
      expect(tokens.signInRequired()).toBe(false);
      expect(auth.signedIn()).toBe(true);
      expect(learner.id()).toBe('replacement-learner');
      expect((await Preferences.get({ key: 'grasp.auth.refresh' })).value).toBe('refresh-replacement-token');
    } finally {
      releaseRemoval.resolve();
      removalSpy.mockRestore();
    }
  });

  it('retries the same serialized upload after ordinary same-account token renewal', async () => {
    const { auth, calls, progress, tokens } = await setup((call) => {
      if (call.path === '/auth/refresh') return json(200, session('fresh-token', 'guest-learner'));
      if (call.path === '/progress/events' && call.authorization === 'Bearer stale-token') {
        return json(401, { message: 'Expired', code: 'token_invalid' });
      }
      if (call.path === '/progress/events' && call.method === 'POST') return acknowledgment(call);
      throw new Error(`Unexpected request: ${call.method} ${call.path}`);
    });
    await Preferences.set({ key: 'grasp.auth.refresh', value: 'old-refresh-token' });
    tokens.accessToken.set('stale-token');
    await progress.record(event('ordinary-refresh-event', 5));
    await progress.flush();

    const uploads = calls.filter((call) => call.path === '/progress/events' && call.method === 'POST');
    expect(uploads.map(({ authorization }) => authorization)).toEqual(['Bearer stale-token', 'Bearer fresh-token']);
    expect(uploads[0]?.body).toBe(uploads[1]?.body);
    expect(calls.filter((call) => call.path === '/auth/refresh')).toHaveLength(1);
    expect(auth.signedIn()).toBe(true);
    expect(progress.syncStatus()).toBe('synced');
    expect((await Preferences.get({ key: 'grasp.acknowledged.v1' })).value).toBe(JSON.stringify(['ordinary-refresh-event']));
  });
  it('cancels the old debounce before delayed logout storage cleanup and leaves the new learner unsigned', async () => {
    const removing = deferred<void>();
    const finishRemoval = deferred<void>();
    const { auth, progress, tokens, learner, calls } = await setup((call) => {
      if (call.path === '/auth/logout') return new Response(null, { status: 204 });
      if (call.path === '/progress/events') return json(401, { code: 'sign_in_required' });
      throw new Error(`Unexpected request: ${call.path}`);
    });
    await Preferences.set({ key: 'grasp.auth.refresh', value: 'logout-refresh-token' });
    tokens.accessToken.set('signed-in-token');
    const removal = vi.spyOn(Preferences, 'remove').mockImplementation(async ({ key }) => {
      if (key === 'grasp.auth.refresh') {
        removing.resolve();
        await finishRemoval.promise;
      }
      localStorage.removeItem(`CapacitorStorage.${key}`);
    });
    vi.useFakeTimers();
    try {
      await progress.record(event('before-logout', 5));
      const signOut = auth.signOut();
      await removing.promise;
      await vi.advanceTimersByTimeAsync(1500);
      expect(calls.filter((call) => call.path === '/progress/events')).toHaveLength(0);
      await progress.resync();
      finishRemoval.resolve();
      await signOut;
      expect(learner.id()).not.toBe('guest-learner');
      expect(auth.signedIn()).toBe(false);
      expect(tokens.signInRequired()).toBe(false);
      expect((await Preferences.get({ key: 'grasp.events' })).value).toBeNull();
    } finally {
      finishRemoval.resolve();
      removal.mockRestore();
      vi.useRealTimers();
    }
  });
});
