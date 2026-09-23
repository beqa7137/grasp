import { TestBed } from '@angular/core/testing';
import { ApiError, ApiService } from './api.service';
import { AuthTokens } from './auth-tokens.service';
import { AuthService } from './auth.service';
import { LearnerService } from './learner.service';
import { ProgressService } from './progress.service';

const session = (n: number, learnerId = 'account-learner') => ({
  accessToken: `access-${n}`,
  refreshToken: `refresh-${n}-0123456789abcdefghij`,
  user: { id: 'u1', email: 'ada@example.com' },
  learnerId,
});

function setup(post: (path: string, body: unknown) => Promise<unknown>) {
  localStorage.clear();
  const calls: string[] = [];
  const learnerId = { value: 'device-learner' };
  TestBed.configureTestingModule({
    providers: [
      { provide: ApiService, useValue: { post: async (path: string, body: unknown) => (calls.push(`post ${path}`), post(path, body)) } },
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
    ],
  });
  return { auth: TestBed.inject(AuthService), tokens: TestBed.inject(AuthTokens), calls, learnerId };
}

describe('AuthService (app)', () => {
  it('pushes offline progress before signing in, then adopts the account learner and resyncs', async () => {
    const { auth, tokens, calls } = setup(async () => session(1));
    await auth.verifyEmail('ada@example.com', '123456');
    expect(calls).toEqual(['flush', 'post /auth/email/verify', 'learner account-learner', 'resync']);
    expect(tokens.accessToken()).toBe('access-1');
    expect(auth.user()).toEqual({ id: 'u1', email: 'ada@example.com' });
    expect(localStorage.getItem('CapacitorStorage.grasp.auth.refresh')).toBe(session(1).refreshToken);
  });

  it('shares one refresh between concurrent callers', async () => {
    let refreshes = 0;
    const { auth, tokens } = setup(async (path) => {
      if (path === '/auth/refresh') refreshes++;
      return session(refreshes + 1);
    });
    await auth.init();
    await auth.verifyEmail('ada@example.com', '123456');
    const results = await Promise.all([tokens.refresher!(), tokens.refresher!(), auth.refresh()]);
    expect(results).toEqual([true, true, true]);
    expect(refreshes).toBe(1);
  });

  it('keeps local progress but asks to sign in again when the session has ended', async () => {
    let expired = false;
    const { auth, tokens, calls } = setup(async (path) => {
      if (path === '/auth/refresh' && expired) throw new ApiError(401, 'Your session has ended.');
      return session(1);
    });
    await auth.verifyEmail('ada@example.com', '123456');
    expired = true;
    expect(await auth.refresh()).toBe(false);
    expect(auth.signedIn()).toBe(false);
    expect(tokens.signInRequired()).toBe(true);
    expect(tokens.accessToken()).toBeNull();
    expect(calls).not.toContain('clearLocal');
  });

  it('keeps the session through network errors', async () => {
    let offline = false;
    const { auth } = setup(async (path) => {
      if (path === '/auth/refresh' && offline) throw new ApiError(0, 'offline');
      return session(1);
    });
    await auth.verifyEmail('ada@example.com', '123456');
    offline = true;
    expect(await auth.refresh()).toBe(false);
    expect(auth.signedIn()).toBe(true);
  });

  it('signs out by revoking the session and starting the device fresh', async () => {
    const { auth, calls } = setup(async () => session(1));
    await auth.verifyEmail('ada@example.com', '123456');
    calls.length = 0;
    await auth.signOut();
    expect(calls).toEqual(['post /auth/logout', 'clearLocal', 'learner reset']);
    expect(auth.signedIn()).toBe(false);
    expect(localStorage.getItem('CapacitorStorage.grasp.auth.refresh')).toBeNull();
  });
});
