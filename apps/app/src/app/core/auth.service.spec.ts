import { TestBed } from '@angular/core/testing';
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
          post: async (path: string, body: unknown) => (calls.push(`post ${path}`), (bodies[path] = body), post(path, body)),
          get: async (path: string) => (calls.push(`get ${path}`), { user: session(1).user, identities: [identity('github')] }),
        },
      },
      {
        provide: ProgressService,
        useValue: {
          flush: async () => calls.push('flush'),
          resync: async () => calls.push('resync'),
          clearLocal: async () => calls.push('clearLocal'),
        },
      },
      {
        provide: LearnerService,
        useValue: {
          id: () => learnerId.value,
          setId: async (id: string) => ((learnerId.value = id), calls.push(`learner ${id}`)),
          reset: async () => ((learnerId.value = 'fresh'), calls.push('learner reset')),
        },
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
  return { auth: TestBed.inject(AuthService), tokens: TestBed.inject(AuthTokens), calls, bodies, learnerId };
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
    expect(calls).toEqual(['github', 'flush', 'post /auth/github', 'learner account-learner', 'resync', 'get /auth/me']);
    expect(bodies['/auth/github']).toEqual({ ticket: 'github-ticket', codeVerifier: 'github-verifier' });
  });

  it('after a session ended, clears the local copy when signing in to a different account', async () => {
    const { auth, tokens, calls } = setup();
    tokens.signInRequired.set(true);
    await auth.signIn('github');
    expect(calls).toEqual(['github', 'post /auth/github', 'clearLocal', 'learner account-learner', 'resync', 'get /auth/me']);
    expect(tokens.signInRequired()).toBe(false);
  });

  it('keeps the local copy when the ended session comes back to the same learner', async () => {
    const { auth, tokens, calls } = setup({ post: async () => session(1, 'device-learner') });
    tokens.signInRequired.set(true);
    await auth.signIn('github');
    expect(calls).toEqual(['github', 'post /auth/github', 'resync', 'get /auth/me']);
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
    expect(calls).toEqual(['post /auth/logout', 'clearLocal', 'learner reset']);
    expect(auth.signedIn()).toBe(false);
    expect(auth.identities()).toBeNull();
    expect(localStorage.getItem('CapacitorStorage.grasp.auth.refresh')).toBeNull();
  });
});
