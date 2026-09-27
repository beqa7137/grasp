import { MemoryAuthStore, MemoryCoordinationStore } from '../persistence/memory.stores.js';
import { AUTH_WINDOW_MS, AuthRateLimitService } from './auth-rate-limit.service.js';
import type { VerifiedIdentity } from './auth.types.js';
import { hashToken } from './tokens.js';

describe('AuthRateLimitService', () => {
  let now: number;
  let store: MemoryCoordinationStore;
  let limits: AuthRateLimitService;
  const identity: VerifiedIdentity = { provider: 'google', subject: 'verified-subject', email: 'one@example.com', authoritative: true };

  beforeEach(() => {
    now = Date.parse('2026-09-20T10:00:00Z');
    store = new MemoryCoordinationStore(() => now);
    limits = new AuthRateLimitService(store);
  });

  it('shares a subject allowance across email changes, isolates providers and resets at the window boundary', async () => {
    await Promise.all(Array.from({ length: 10 }, () => limits.signIn(identity)));
    await expect(limits.signIn({ ...identity, email: 'renamed@example.com' })).rejects.toMatchObject({
      status: 429,
      retryAfterSeconds: 900,
    });
    await expect(limits.signIn({ ...identity, provider: 'github' })).resolves.toBeUndefined();
    now += AUTH_WINDOW_MS - 1;
    await expect(limits.signIn(identity)).rejects.toMatchObject({ retryAfterSeconds: 1 });
    now += 1;
    await expect(limits.signIn(identity)).resolves.toBeUndefined();
  });

  it('stores hashed principals without provider credentials or email addresses', async () => {
    const counted = vi.spyOn(store, 'add');
    await limits.signIn(identity);
    await limits.githubTicket(identity.subject);
    expect(counted.mock.calls).toEqual([
      [`auth:sign-in:${hashToken('google:verified-subject')}`, AUTH_WINDOW_MS, 1],
      [`auth:github-ticket:${hashToken('verified-subject')}`, AUTH_WINDOW_MS, 1],
    ]);
  });

  it('fails closed when principal counters fail', async () => {
    const failure = new Error('counter unavailable');
    vi.spyOn(store, 'add').mockRejectedValue(failure);
    vi.spyOn(store, 'addForSession').mockRejectedValue(failure);
    await expect(limits.signIn(identity)).rejects.toBe(failure);
    await expect(limits.githubTicket(identity.subject)).rejects.toBe(failure);
    await expect(limits.refresh({ userId: 'user', learnerId: 'learner', familyId: 'family' })).rejects.toBe(failure);
  });

  it('checks the active session family before counting a refresh', async () => {
    const auth = new MemoryAuthStore();
    const claims = { userId: 'user', learnerId: 'learner', familyId: 'family' };
    await auth.createUser({
      id: claims.userId,
      learnerId: claims.learnerId,
      email: 'one@example.com',
      createdAt: new Date(now).toISOString(),
      lastLoginAt: null,
    });
    await auth.createFamily(claims.userId, claims.familyId, new Date(now).toISOString());
    store = new MemoryCoordinationStore(() => now, auth);
    limits = new AuthRateLimitService(store);
    await limits.refresh(claims);
    await auth.revokeFamily(claims.familyId, new Date(now).toISOString());
    await expect(limits.refresh(claims)).rejects.toMatchObject({ status: 401 });
    expect(await store.read(`auth:refresh:${hashToken(claims.userId)}`, AUTH_WINDOW_MS)).toBe(1);
  });
});
