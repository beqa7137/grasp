import { TestBed } from '@angular/core/testing';
import { ToastController } from '@ionic/angular';
import { ApiError, ApiService } from './api.service';
import { AuthTokens } from './auth-tokens.service';
import { AuthService } from './auth.service';
import { LearnerService } from './learner.service';
import { ProgressService } from './progress.service';
import { type GitHubCredential, type ProviderConfig, SocialSignInService } from './social-sign-in.service';

const session = (n: number, learnerId = 'account-learner') => ({
  accessToken: `access-${n}`,
  refreshToken: `refresh-${n}-0123456789abcdefghij`,
  user: { id: 'u1', email: 'ada@example.com' },
  learnerId,
});

const identity = (provider: 'google' | 'github') => ({ provider, email: 'ada@example.com', linkedAt: '2026-09-24T00:00:00.000Z' });

const githubCredential: GitHubCredential = { ticket: 'github-ticket', codeVerifier: 'github-verifier' };

const bothProviders: ProviderConfig = {
  google: { webClientId: 'web.apps.googleusercontent.com', iosClientId: null },
  github: { clientId: 'Ov23abc', authorizeUrl: 'https://github.com/login/oauth/authorize' },
};

interface Options {
  post?: (path: string, body: unknown) => Promise<unknown>;
  config?: () => Promise<ProviderConfig>;
  google?: string | null;
  github?: GitHubCredential | null;
}

function setup(opts: Options = {}) {
  localStorage.clear();
  const calls: string[] = [];
  const bodies: Record<string, unknown> = {};
  const timeouts: Record<string, number | undefined> = {};
  const toasts: string[] = [];
  const learnerId = { value: 'device-learner' };
  const post =
    opts.post ??
    (async (path: string) => {
      if (path === '/auth/google/nonce') return { nonce: 'nonce-1' };
      if (path.endsWith('/link')) return { identities: [identity('google'), identity('github')] };
      return session(1);
    });
  TestBed.configureTestingModule({
    providers: [
      {
        provide: ApiService,
        useValue: {
          post: async (path: string, body: unknown, timeoutMs?: number) => (
            calls.push(`post ${path}`),
            (bodies[path] = body),
            (timeouts[path] = timeoutMs),
            post(path, body)
          ),
          get: async (path: string) => (calls.push(`get ${path}`), { user: session(1).user, identities: [identity('github')] }),
        },
      },
      {
        provide: ProgressService,
        useValue: {
          flush: async () => calls.push('flush'),
          resync: async () => calls.push('resync'),
          clearLocal: async () => calls.push('clearLocal'),
          invalidateSync: () => calls.push('invalidateSync'),
        },
      },
      {
        provide: LearnerService,
        useValue: {
          id: () => learnerId.value,
          setId: async (id: string) => ((learnerId.value = id), calls.push(`learner ${id}`)),
          reload: async () => {
            const stored = localStorage.getItem('CapacitorStorage.grasp.learnerId');
            if (!stored || stored === learnerId.value) return false;
            learnerId.value = stored;
            calls.push(`learner reload ${stored}`);
            return true;
          },
          reset: async () => ((learnerId.value = 'fresh'), calls.push('learner reset')),
        },
      },
      {
        provide: ToastController,
        useValue: { create: async ({ message }: { message: string }) => ({ present: async () => toasts.push(message) }) },
      },
      {
        provide: SocialSignInService,
        useValue: {
          providers: opts.config ?? (async () => bothProviders),
          prepare: () => calls.push('prepare'),
          google: async (nonce: string) => (calls.push(`google ${nonce}`), opts.google === undefined ? 'google-id-token' : opts.google),
          github: async () => (calls.push('github'), opts.github === undefined ? githubCredential : opts.github),
        },
      },
    ],
  });
  return { auth: TestBed.inject(AuthService), tokens: TestBed.inject(AuthTokens), calls, bodies, timeouts, learnerId, toasts };
}

describe('AuthService (app)', () => {
  it('signs in with Google: nonce, provider, then pushes offline progress, adopts the account learner and resyncs', async () => {
    const { auth, tokens, calls, bodies } = setup();
    expect(await auth.signIn('google')).toBe(true);
    expect(calls).toEqual([
      'post /auth/google/nonce',
      'google nonce-1',
      'flush',
      'post /auth/google',
      'invalidateSync',
      'learner account-learner',
      'resync',
      'get /auth/me',
    ]);
    expect(bodies['/auth/google']).toEqual({ idToken: 'google-id-token', nonce: 'nonce-1' });
    expect(tokens.accessToken()).toBe('access-1');
    expect(auth.user()).toEqual({ id: 'u1', email: 'ada@example.com' });
    expect(auth.identities()).toEqual([identity('github')]);
    expect(localStorage.getItem('CapacitorStorage.grasp.auth.refresh')).toBe(session(1).refreshToken);
  });

  it('signs in with GitHub by redeeming the ticket with its PKCE verifier through the same sequence', async () => {
    const { auth, calls, bodies } = setup();
    expect(await auth.signIn('github')).toBe(true);
    expect(calls).toEqual(['github', 'flush', 'post /auth/github', 'invalidateSync', 'learner account-learner', 'resync', 'get /auth/me']);
    expect(bodies['/auth/github']).toEqual({ ticket: 'github-ticket', codeVerifier: 'github-verifier' });
  });

  it('after a session ended, clears the local copy when signing in to a different account', async () => {
    const { auth, tokens, calls } = setup();
    tokens.signInRequired.set(true);
    await auth.signIn('github');
    expect(calls).toEqual([
      'github',
      'post /auth/github',
      'clearLocal',
      'invalidateSync',
      'learner account-learner',
      'resync',
      'get /auth/me',
    ]);
    expect(tokens.signInRequired()).toBe(false);
  });

  it('gives signing in and connecting longer than an ordinary request, since the server may merge the device history', async () => {
    const { auth, timeouts } = setup();
    await auth.signIn('github');
    await auth.connect('github');
    expect(timeouts['/auth/github']).toBe(30_000);
    expect(timeouts['/auth/github/link']).toBe(30_000);
  });

  it('keeps the local copy when the ended session comes back to the same learner', async () => {
    const { auth, tokens, calls } = setup({ post: async () => session(1, 'device-learner') });
    tokens.signInRequired.set(true);
    await auth.signIn('github');
    expect(calls).toEqual(['github', 'post /auth/github', 'invalidateSync', 'resync', 'get /auth/me']);
  });

  it('does nothing further when the person cancels at the provider', async () => {
    const github = setup({ github: null });
    expect(await github.auth.signIn('github')).toBe(false);
    expect(github.calls).toEqual(['github']);
    TestBed.resetTestingModule();

    const google = setup({ google: null });
    expect(await google.auth.signIn('google')).toBe(false);
    expect(google.calls).toEqual(['post /auth/google/nonce', 'google nonce-1']);
    expect(google.auth.signedIn()).toBe(false);
  });

  it('rejects with the API error code and keeps the device anonymous', async () => {
    const { auth, calls } = setup({
      post: async () => {
        throw new ApiError(409, 'This email already has an account.', 'account_exists');
      },
    });
    const error = await auth.signIn('github').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ code: 'account_exists' });
    expect(auth.signedIn()).toBe(false);
    expect(calls).toEqual(['github', 'flush', 'post /auth/github']);
  });

  it('connects another provider to the signed-in account without touching progress', async () => {
    const { auth, calls, bodies } = setup();
    await auth.signIn('github');
    calls.length = 0;
    expect(await auth.connect('google')).toBe(true);
    expect(calls).toEqual(['post /auth/google/nonce', 'google nonce-1', 'post /auth/google/link']);
    expect(bodies['/auth/google/link']).toEqual({ idToken: 'google-id-token', nonce: 'nonce-1' });
    expect(auth.identities()).toEqual([identity('google'), identity('github')]);
  });

  it('connects GitHub by sending the ticket with its PKCE verifier', async () => {
    const { auth, calls, bodies } = setup();
    await auth.signIn('google');
    calls.length = 0;
    expect(await auth.connect('github')).toBe(true);
    expect(calls).toEqual(['github', 'post /auth/github/link']);
    expect(bodies['/auth/github/link']).toEqual({ ticket: 'github-ticket', codeVerifier: 'github-verifier' });
  });

  it('connects nothing when the person cancels at the provider', async () => {
    const { auth, calls } = setup({ github: null });
    await auth.signIn('google');
    calls.length = 0;
    expect(await auth.connect('github')).toBe(false);
    expect(calls).toEqual(['github']);
  });

  it('lists the providers this device offers and warms up the plugin for them', async () => {
    const both = setup();
    await both.auth.loadProviders();
    expect(both.auth.providers()).toEqual(['google', 'github']);
    expect(both.calls).toEqual(['prepare']);
    TestBed.resetTestingModule();

    const none = setup({ config: async () => ({ google: null, github: null }) });
    await none.auth.loadProviders();
    expect(none.auth.providers()).toEqual([]);
    expect(none.calls).toEqual([]);
    TestBed.resetTestingModule();

    const offline = setup({
      config: async () => {
        throw new ApiError(0, 'offline');
      },
    });
    await offline.auth.loadProviders();
    expect(offline.auth.providers()).toBeNull();
  });

  it('tells a failed provider lookup apart from one still loading, and recovers on retry', async () => {
    let online = false;
    let answer: () => void = () => undefined;
    const { auth } = setup({
      config: async () => {
        if (!online) throw new ApiError(0, 'offline');
        await new Promise<void>((resolve) => (answer = resolve));
        return bothProviders;
      },
    });
    expect(auth.providersFailed()).toBe(false);
    await auth.loadProviders();
    expect(auth.providers()).toBeNull();
    expect(auth.providersFailed()).toBe(true);

    online = true;
    const retry = auth.loadProviders();
    expect(auth.providersFailed()).toBe(false);
    answer();
    await retry;
    expect(auth.providers()).toEqual(['google', 'github']);
    expect(auth.providersFailed()).toBe(false);
  });

  it('only loads identities for a signed-in account', async () => {
    const { auth, calls } = setup();
    await auth.loadIdentities();
    expect(calls).toEqual([]);
    expect(auth.identities()).toBeNull();
  });

  it.each([429, 503, 0])('preserves credentials and exposes a temporary %s renewal failure to API callers', async (status) => {
    const failure = new ApiError(status, 'Please try again shortly.', status === 429 ? 'rate_limited' : undefined);
    let unavailable = false;
    const { auth, tokens, calls } = setup({
      post: async (path) => {
        if (path === '/auth/refresh' && unavailable) throw failure;
        return session(1);
      },
    });
    await auth.init();
    await auth.signIn('google');
    unavailable = true;
    const before = localStorage.getItem('CapacitorStorage.grasp.auth.refresh');
    calls.length = 0;
    await expect(tokens.refresher!()).rejects.toBe(failure);
    expect(await auth.refresh()).toBe(false);
    expect(auth.signedIn()).toBe(true);
    expect(tokens.signInRequired()).toBe(false);
    expect(localStorage.getItem('CapacitorStorage.grasp.auth.refresh')).toBe(before);
    expect(calls).not.toContain('clearLocal');
    unavailable = false;
    await expect(tokens.refresher!()).resolves.toBe(true);
  });

  it('shares one refresh between concurrent callers', async () => {
    let refreshes = 0;
    const { auth, tokens } = setup({
      post: async (path) => {
        if (path === '/auth/refresh') refreshes++;
        return session(refreshes + 1);
      },
    });
    await auth.init();
    await auth.signIn('github');
    const results = await Promise.all([tokens.refresher!(), tokens.refresher!(), auth.refresh()]);
    expect(results).toEqual([true, true, true]);
    expect(refreshes).toBe(1);
  });

  it('keeps local progress but asks to sign in again when the session has ended', async () => {
    let expired = false;
    const { auth, tokens, calls } = setup({
      post: async (path) => {
        if (path === '/auth/refresh' && expired) throw new ApiError(401, 'Your session has ended.');
        return session(1);
      },
    });
    await auth.signIn('github');
    expired = true;
    expect(await auth.refresh()).toBe(false);
    expect(auth.signedIn()).toBe(false);
    expect(auth.identities()).toBeNull();
    expect(tokens.signInRequired()).toBe(true);
    expect(tokens.accessToken()).toBeNull();
    expect(calls).not.toContain('clearLocal');
  });

  it('keeps the session through network errors', async () => {
    let offline = false;
    const { auth } = setup({
      post: async (path) => {
        if (path === '/auth/refresh' && offline) throw new ApiError(0, 'offline');
        return session(1);
      },
    });
    await auth.signIn('github');
    offline = true;
    expect(await auth.refresh()).toBe(false);
    expect(auth.signedIn()).toBe(true);
  });

  it('signs out by revoking the session and starting the device fresh', async () => {
    const { auth, calls } = setup();
    await auth.signIn('github');
    calls.length = 0;
    await auth.signOut();
    expect(calls).toEqual(['post /auth/logout', 'invalidateSync', 'clearLocal', 'learner reset']);
    expect(auth.signedIn()).toBe(false);
    expect(auth.identities()).toBeNull();
    expect(localStorage.getItem('CapacitorStorage.grasp.auth.refresh')).toBeNull();
  });

  it('keeps the session for retry when the server cannot revoke it', async () => {
    const { auth, tokens, calls } = setup({
      post: async (path) => {
        if (path === '/auth/logout') throw new Error('Logout unavailable');
        return session(1);
      },
    });
    await auth.signIn('github');
    calls.length = 0;

    await expect(auth.signOut()).rejects.toThrow('Logout unavailable');
    expect(calls).toEqual(['post /auth/logout']);
    expect(auth.signedIn()).toBe(true);
    expect(tokens.accessToken()).toBe('access-1');
    expect(localStorage.getItem('CapacitorStorage.grasp.auth.refresh')).toBe(session(1).refreshToken);
  });

  it('does not claim sign-out succeeded when the refresh token is missing', async () => {
    const { auth, tokens, calls } = setup();
    await auth.signIn('github');
    localStorage.removeItem('CapacitorStorage.grasp.auth.refresh');
    calls.length = 0;

    await expect(auth.signOut()).rejects.toThrow('The session cannot be revoked');
    expect(calls).toEqual([]);
    expect(auth.signedIn()).toBe(true);
    expect(tokens.accessToken()).toBe('access-1');
  });

  it('revokes the latest refresh token when a renewal overlaps sign-out', async () => {
    let releaseRefresh!: () => void;
    const refreshGate = new Promise<void>((resolve) => (releaseRefresh = resolve));
    const { auth, calls, bodies } = setup({
      post: async (path) => {
        if (path === '/auth/refresh') {
          await refreshGate;
          return session(2);
        }
        return session(1);
      },
    });
    await auth.signIn('github');
    calls.length = 0;

    const refresh = auth.refresh();
    const signOut = auth.signOut();
    expect(await auth.refresh()).toBe(false);
    releaseRefresh();
    await Promise.all([refresh, signOut]);

    expect(calls).toEqual(['post /auth/refresh', 'post /auth/logout', 'invalidateSync', 'clearLocal', 'learner reset']);
    expect(bodies['/auth/logout']).toEqual({ refreshToken: session(2).refreshToken });
    expect(auth.signedIn()).toBe(false);
  });

  it('clears a refresh that finishes after server deletion', async () => {
    let releaseRefresh!: () => void;
    const refreshGate = new Promise<void>((resolve) => (releaseRefresh = resolve));
    const { auth, tokens } = setup({
      post: async (path) => {
        if (path === '/auth/refresh') {
          await refreshGate;
          return session(2);
        }
        return session(1);
      },
    });
    await auth.signIn('github');

    const refresh = auth.refresh();
    const deleted = auth.startFreshAfterDeletion();
    expect(await auth.refresh()).toBe(false);
    releaseRefresh();
    await Promise.all([refresh, deleted]);

    expect(auth.signedIn()).toBe(false);
    expect(tokens.accessToken()).toBeNull();
    expect(localStorage.getItem('CapacitorStorage.grasp.auth.refresh')).toBeNull();
  });

  it('starts fresh once when the account learner was erased on another device', async () => {
    const { auth, tokens, calls, learnerId, toasts } = setup();
    await auth.init();
    await auth.signIn('github');
    calls.length = 0;
    tokens.accessToken.set(null);
    tokens.signInRequired.set(true);

    await Promise.all([
      tokens.learnerRetired!('learner_erased', 'account-learner'),
      tokens.learnerRetired!('learner_erased', 'account-learner'),
    ]);

    expect(calls).toEqual(['invalidateSync', 'clearLocal', 'learner reset']);
    expect(learnerId.value).toBe('fresh');
    expect(auth.signedIn()).toBe(false);
    expect(tokens.signInRequired()).toBe(false);
    expect(localStorage.getItem('CapacitorStorage.grasp.auth.refresh')).toBeNull();
    expect(toasts).toEqual(["This learner's data was deleted on another device."]);
  });

  it('keeps local progress and adopts stored account credentials for a moved learner', async () => {
    const { auth, tokens, calls, learnerId, toasts } = setup({
      post: async (path) => session(path === '/auth/refresh' ? 2 : 1, 'new-account-learner'),
    });
    await auth.init();
    learnerId.value = 'merged-guest';
    localStorage.setItem('CapacitorStorage.grasp.learnerId', 'new-account-learner');
    localStorage.setItem('CapacitorStorage.grasp.auth.refresh', session(1).refreshToken);

    await tokens.learnerRetired!('learner_moved', 'merged-guest');

    expect(calls).toEqual(['learner reload new-account-learner', 'invalidateSync', 'post /auth/refresh', 'resync']);
    expect(learnerId.value).toBe('new-account-learner');
    expect(tokens.accessToken()).toBe('access-2');
    expect(calls).not.toContain('clearLocal');
    expect(toasts).toEqual([]);
  });

  it('does not carry already-synced erased events into a new account when sign-in wins the startup race', async () => {
    localStorage.clear();
    const pushes: string[][] = [];
    const pulledWith: { learnerId: string; localEvents: string | null }[] = [];
    let releaseStartupPull!: () => void;
    const startupPull = new Promise<void>((resolve) => (releaseStartupPull = resolve));
    let pullCount = 0;
    let learner!: LearnerService;
    const api = {
      get: async (path: string) => {
        if (path === '/auth/me') return { identities: [] };
        if (++pullCount === 1) await startupPull;
        pulledWith.push({ learnerId: learner.id(), localEvents: localStorage.getItem('CapacitorStorage.grasp.events') });
        return { events: [] };
      },
      post: async (path: string, body: { events?: { id: string }[] }) => {
        if (path === '/progress/events') {
          pushes.push(body.events!.map((event) => event.id));
          return { acknowledgedIds: body.events!.map((event) => event.id), deferredFutureIds: [], serverTime: new Date().toISOString() };
        }
        return { ...session(1, 'fresh-account'), deviceLearnerErased: true };
      },
    };
    TestBed.configureTestingModule({
      providers: [
        { provide: ApiService, useValue: api },
        { provide: ToastController, useValue: { create: async () => ({ present: async () => undefined }) } },
        { provide: SocialSignInService, useValue: { github: async () => githubCredential } },
      ],
    });
    learner = TestBed.inject(LearnerService);
    const progress = TestBed.inject(ProgressService);
    const auth = TestBed.inject(AuthService);
    await learner.init();
    await auth.init();
    await progress.init();
    await progress.record({ type: 'settings.changed', settings: { newPerDay: 5 }, id: 'erased-event' });
    await progress.flush();
    expect(pushes).toEqual([['erased-event']]);

    await auth.signIn('github');
    releaseStartupPull();

    expect(pushes).toEqual([['erased-event']]);
    expect(learner.id()).toBe('fresh-account');
    expect(pulledWith.at(-1)).toEqual({ learnerId: 'fresh-account', localEvents: null });
    expect(localStorage.getItem('CapacitorStorage.grasp.events')).toBeNull();
  });
});
