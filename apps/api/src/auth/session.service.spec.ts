import { HttpException, Logger } from '@nestjs/common';
import { MemoryAuthStore } from '../persistence/memory.stores.js';
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
  const user: User = { id: 'u-eve', email: 'eve@example.com', learnerId: 'l-eve', createdAt: t0.toISOString(), lastLoginAt: null };
  await store.createUser(user);
  return { sessions: new SessionService(store, tokens), tokens, user };
}

beforeAll(() => Logger.overrideLogger(false));

describe('SessionService', () => {
  it('issues an access token for the user and learner', async () => {
    const { sessions, tokens, user } = await setup();
    const session = await sessions.start(user, t0);
    expect(session).toMatchObject({ user: { id: user.id, email: user.email }, learnerId: user.learnerId, expiresIn: 900 });
    expect(await tokens.verify(session.accessToken, at(MIN))).toEqual({ userId: user.id, learnerId: user.learnerId });
  });

  it('rotates refresh tokens and treats late reuse of an old one as theft', async () => {
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
  });

  it('ends the session family on logout and rejects expired refresh tokens', async () => {
    const { sessions, user } = await setup();
    const session = await sessions.start(user, t0);
    await sessions.logout(session.refreshToken, at(MIN));
    expect(await sessions.refresh(session.refreshToken, at(MIN)).catch(status)).toBe(401);

    const again = await sessions.start(user, at(2 * MIN));
    expect(await sessions.refresh(again.refreshToken, at(31 * 24 * 60 * MIN)).catch(status)).toBe(401);
  });
});

describe('TokenService', () => {
  it('rejects expired, tampered and foreign tokens', async () => {
    const tokens = new TokenService(SECRET);
    const token = await tokens.sign({ userId: 'u1', learnerId: 'l1' }, t0);
    await expect(tokens.verify(token, at(14 * MIN))).resolves.toEqual({ userId: 'u1', learnerId: 'l1' });
    await expect(tokens.verify(token, at(16 * MIN))).rejects.toThrow('Token expired');
    await expect(tokens.verify(`${token.slice(0, -2)}xx`, t0)).rejects.toThrow('Invalid token');
    await expect(new TokenService(`${SECRET}-other`).verify(token, t0)).rejects.toThrow('Invalid token');
  });
});
