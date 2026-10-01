import { AuthRateLimitService } from './auth-rate-limit.service.js';
import { HttpException, Logger } from '@nestjs/common';
import { MemoryAuthStore, MemoryCoordinationStore } from '../persistence/memory.stores.js';
import type { User } from './auth.types.js';
import { SessionService } from './session.service.js';
import { TokenService } from './tokens.js';

const SECRET = 'unit-test-secret-0123456789abcdef-0123456789';
const t0 = new Date('2026-09-20T10:00:00Z');
const at = (ms: number) => new Date(t0.getTime() + ms);
const MIN = 60_000;

const status = (e: unknown) => (e instanceof HttpException ? e.getStatus() : e);

async function setup() {
  const store = new MemoryAuthStore();
  const tokens = new TokenService(SECRET);
  const user: User = {
    id: '11111111-1111-4111-8111-111111111111',
    email: 'eve@example.com',
    learnerId: '22222222-2222-4222-8222-222222222222',
    createdAt: t0.toISOString(),
    lastLoginAt: null,
  };
  await store.createUser(user);
  return {
    sessions: new SessionService(store, tokens, new AuthRateLimitService(new MemoryCoordinationStore(() => t0.getTime(), store))),
    store,
    tokens,
    user,
  };
}

beforeAll(() => Logger.overrideLogger(false));
afterEach(() => vi.restoreAllMocks());

describe('SessionService', () => {
  it('issues an access token for the user and learner', async () => {
    const { sessions, tokens, user } = await setup();
    const session = await sessions.start(user, t0);
    expect(session).toMatchObject({ user: { id: user.id, email: user.email }, learnerId: user.learnerId, expiresIn: 900 });
    expect(await tokens.verify(session.accessToken, at(MIN))).toEqual({
      userId: user.id,
      learnerId: user.learnerId,
      familyId: expect.any(String),
    });
  });

  it('rotates refresh tokens and treats late reuse of an old one as theft', async () => {
    const logged = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    const { sessions, user } = await setup();
    const first = await sessions.start(user, t0);

    const second = await sessions.refresh(first.refreshToken, at(MIN));
    expect(second.refreshToken).not.toBe(first.refreshToken);
    // A second tab refreshing with the same token moments later is tolerated.
    const sibling = await sessions.refresh(first.refreshToken, at(MIN + 5_000));
    expect(sibling.user.id).toBe(first.user.id);

    expect(await sessions.refresh(first.refreshToken, at(2 * MIN)).catch(status)).toBe(401);
    expect(await sessions.refresh(second.refreshToken, at(2 * MIN)).catch(status)).toBe(401);
    expect(await sessions.refresh(sibling.refreshToken, at(2 * MIN)).catch(status)).toBe(401);
    expect(logged.mock.calls).toEqual([[{ operation: 'auth.refresh-reuse' }]]);
  });

  it('ends the session family on logout and rejects expired refresh tokens', async () => {
    const { sessions, store, tokens, user } = await setup();
    const session = await sessions.start(user, t0);
    await sessions.logout(session.refreshToken, at(MIN));
    expect(await sessions.refresh(session.refreshToken, at(MIN)).catch(status)).toBe(401);
    const claims = await tokens.verify(session.accessToken, at(MIN));
    expect(await store.activeFamily(claims.userId, claims.learnerId, claims.familyId)).toBe(false);

    const again = await sessions.start(user, at(2 * MIN));
    expect(await sessions.refresh(again.refreshToken, at(31 * 24 * 60 * MIN)).catch(status)).toBe(401);
  });

  it('sweeps a session whose refresh tokens expired over a day ago and keeps an active one', async () => {
    const { sessions, store, tokens, user } = await setup();
    const now = new Date();
    const started = new Date(now.getTime() - 32 * 24 * 60 * MIN);
    const old = await sessions.start(user, started);
    const current = await sessions.start(user, now);

    expect(await store.sweepExpired()).toBe(2);
    expect(await sessions.refresh(old.refreshToken, now).catch(status)).toBe(401);
    const claims = await tokens.verify(old.accessToken, new Date(started.getTime() + MIN));
    expect(await store.activeFamily(claims.userId, claims.learnerId, claims.familyId)).toBe(false);
    expect((await sessions.refresh(current.refreshToken, now)).user.id).toBe(user.id);
    expect(await store.sweepExpired()).toBe(0);
  });

  it('does not issue a new token when logout wins a refresh race', async () => {
    const { sessions, store, user } = await setup();
    const session = await sessions.start(user, t0);
    let reachedIssue!: () => void;
    let resumeIssue!: () => void;
    const issuing = new Promise<void>((resolve) => (reachedIssue = resolve));
    const paused = new Promise<void>((resolve) => (resumeIssue = resolve));
    const addRefreshToken = store.addRefreshToken.bind(store);
    store.addRefreshToken = async (token) => {
      reachedIssue();
      await paused;
      return addRefreshToken(token);
    };

    const refresh = sessions.refresh(session.refreshToken, at(MIN)).catch(status);
    await issuing;
    await sessions.logout(session.refreshToken, at(MIN));
    resumeIssue();
    expect(await refresh).toBe(401);
  });
});

describe('TokenService', () => {
  it('rejects expired, tampered and foreign tokens', async () => {
    const tokens = new TokenService(SECRET);
    const claims = {
      userId: '11111111-1111-4111-8111-111111111111',
      learnerId: '22222222-2222-4222-8222-222222222222',
      familyId: '33333333-3333-4333-8333-333333333333',
    };
    const token = await tokens.sign(claims, t0);
    await expect(tokens.verify(token, at(14 * MIN))).resolves.toEqual(claims);
    await expect(tokens.verify(token, at(16 * MIN))).rejects.toThrow('Token expired');
    await expect(tokens.verify(await tokens.sign({ ...claims, familyId: 'not-a-uuid' }, t0), t0)).rejects.toThrow('Malformed token');
    await expect(tokens.verify(`${token.slice(0, -2)}xx`, t0)).rejects.toThrow('Invalid token');
    await expect(new TokenService(`${SECRET}-other`).verify(token, t0)).rejects.toThrow('Invalid token');
  });
});
