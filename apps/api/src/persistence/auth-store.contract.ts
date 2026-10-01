import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { AuthIdentity, OneTimeRecord, RefreshTokenRecord, User } from '../auth/auth.types.js';
import type { AuthStore } from './stores.js';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const iso = (offsetMs = 0) => new Date(Date.now() + offsetMs).toISOString();

const newUser = (email = `${randomUUID()}@example.com`): User => ({
  id: randomUUID(),
  email,
  learnerId: randomUUID(),
  createdAt: iso(),
  lastLoginAt: null,
});

const identityOf = (user: User, subject: string = randomUUID(), createdAt = iso()): AuthIdentity => ({
  id: randomUUID(),
  userId: user.id,
  provider: 'github',
  subject,
  email: 'someone@example.com',
  createdAt,
  lastLoginAt: null,
});

const oneTime = (overrides: Partial<OneTimeRecord> = {}): OneTimeRecord => ({
  hash: randomUUID(),
  purpose: 'github_ticket',
  payload: { subject: '42', email: null },
  expiresAt: iso(HOUR),
  consumedAt: null,
  createdAt: iso(),
  ...overrides,
});

/** Identity and one-time value behaviour every AuthStore must have; run against each implementation. */
export function authStoreContract(name: string, make: () => AuthStore) {
  describe(`${name} auth store`, () => {
    it('creates an account only when its email is free', async () => {
      const store = make();
      const user = newUser();
      expect(await store.createUser(user)).toBe(true);
      expect(await store.createUser({ ...newUser(), email: user.email })).toBe(false);
      expect((await store.userByEmail(user.email))?.id).toBe(user.id);
    });

    it('creates an account together with its first sign-in method, or neither', async () => {
      const store = make();
      const user = newUser();
      const identity = identityOf(user);
      expect(await store.createUser(user, identity)).toBe(true);
      expect(await store.identity('github', identity.subject)).toEqual(identity);

      const sameIdentity = newUser();
      expect(await store.createUser(sameIdentity, identityOf(sameIdentity, identity.subject))).toBe(false);
      expect(await store.userByEmail(sameIdentity.email)).toBeNull();
      expect(await store.userByLearner(sameIdentity.learnerId)).toBeNull();

      const sameEmail = { ...newUser(), email: user.email };
      const unused = identityOf(sameEmail);
      expect(await store.createUser(sameEmail, unused)).toBe(false);
      expect(await store.identity('github', unused.subject)).toBeNull();
      expect(await store.userByLearner(sameEmail.learnerId)).toBeNull();
    });

    it('creates one account when the same one is created concurrently', async () => {
      const store = make();
      const email = `${randomUUID()}@example.com`;
      const subject = randomUUID();
      const created = await Promise.all(
        Array.from({ length: 8 }, () => {
          const user = newUser(email);
          return store.createUser(user, identityOf(user, subject));
        }),
      );
      expect(created.filter(Boolean)).toHaveLength(1);
      const owner = await store.userByEmail(email);
      expect((await store.identity('github', subject))?.userId).toBe(owner?.id);
    });

    it('links an identity once, however many links race, and reports who holds it', async () => {
      const store = make();
      const [owner, other] = [newUser(), newUser()];
      await store.createUser(owner);
      await store.createUser(other);
      const subject = randomUUID();

      const holders = await Promise.all(Array.from({ length: 8 }, () => store.linkIdentity(identityOf(owner, subject))));
      expect(new Set(holders.map((h) => h.id)).size).toBe(1);
      expect(holders[0]).toMatchObject({ userId: owner.id, provider: 'github', subject });

      expect((await store.linkIdentity(identityOf(other, subject))).userId).toBe(owner.id);
      expect(await store.identitiesForUser(other.id)).toEqual([]);
      expect(await store.identity('github', subject)).toEqual(holders[0]);
      expect(await store.identity('google', subject)).toBeNull();
    });

    it('records sign-ins on an identity, keeping the last verified email when none is given', async () => {
      const store = make();
      const user = newUser();
      await store.createUser(user);
      const linked = await store.linkIdentity(identityOf(user));
      const at = iso(1_000);
      await store.touchIdentity(linked.id, 'new@example.com', at);
      await store.touchIdentity(linked.id, null, at);
      expect(await store.identity('github', linked.subject)).toMatchObject({ email: 'new@example.com', lastLoginAt: at });
    });

    it('lists identities oldest first and removes them with the account', async () => {
      const store = make();
      const user = newUser();
      await store.createUser(user);
      const later = await store.linkIdentity({ ...identityOf(user, randomUUID(), iso(1_000)), provider: 'google' });
      const earlier = await store.linkIdentity(identityOf(user, randomUUID(), iso()));
      expect((await store.identitiesForUser(user.id)).map((i) => i.id)).toEqual([earlier.id, later.id]);

      await store.deleteByLearner(user.learnerId);
      expect(await store.identitiesForUser(user.id)).toEqual([]);
      expect(await store.identity('github', earlier.subject)).toBeNull();
    });

    it('ends a session family without affecting another and cascades account deletion', async () => {
      const store = make();
      const user = newUser();
      await store.createUser(user);
      const ended = randomUUID();
      const active = randomUUID();
      expect(await store.createFamily(user.id, ended, iso())).toBe(true);
      expect(await store.createFamily(user.id, active, iso())).toBe(true);
      expect(await store.activeFamily(user.id, user.learnerId, ended)).toBe(true);
      expect(await store.activeFamily(user.id, randomUUID(), ended)).toBe(false);

      await store.revokeFamily(ended, iso());
      expect(await store.activeFamily(user.id, user.learnerId, ended)).toBe(false);
      expect(await store.activeFamily(user.id, user.learnerId, active)).toBe(true);
      expect(
        await store.addRefreshToken({
          id: randomUUID(),
          userId: user.id,
          familyId: ended,
          tokenHash: randomUUID(),
          expiresAt: iso(HOUR),
          rotatedAt: null,
          revokedAt: null,
          createdAt: iso(),
        }),
      ).toBe(false);

      await store.deleteByLearner(user.learnerId);
      expect(await store.activeFamily(user.id, user.learnerId, active)).toBe(false);
      expect(await store.createFamily(user.id, randomUUID(), iso())).toBe(false);
    });

    it('sweeps refresh tokens a day past expiry and the sessions they leave without a live token', async () => {
      const store = make();
      const user = newUser();
      await store.createUser(user);
      const token = (familyId: string, expiresAt: string): RefreshTokenRecord => ({
        id: randomUUID(),
        userId: user.id,
        familyId,
        tokenHash: randomUUID(),
        expiresAt,
        rotatedAt: null,
        revokedAt: null,
        createdAt: iso(),
      });
      const [ended, mixed, active, recent] = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
      for (const family of [ended, mixed, active, recent]) expect(await store.createFamily(user.id, family, iso())).toBe(true);
      const swept = [token(ended, iso(-2 * DAY)), token(ended, iso(-DAY - HOUR)), token(mixed, iso(-2 * DAY))];
      const kept = [token(mixed, iso(HOUR)), token(active, iso(30 * DAY)), token(recent, iso(-HOUR))];
      for (const t of [...swept, ...kept]) expect(await store.addRefreshToken(t)).toBe(true);

      expect(await store.sweepExpired()).toBeGreaterThanOrEqual(swept.length + 1);
      for (const t of swept) expect(await store.refreshTokenByHash(t.tokenHash)).toBeNull();
      for (const t of kept) expect(await store.refreshTokenByHash(t.tokenHash)).toEqual(t);
      expect(await store.activeFamily(user.id, user.learnerId, ended)).toBe(false);
      for (const family of [mixed, active, recent]) expect(await store.activeFamily(user.id, user.learnerId, family)).toBe(true);
      expect(await store.addRefreshToken(token(ended, iso(HOUR)))).toBe(false);
    });

    it('hands out a one-time value exactly once, even to concurrent callers', async () => {
      const store = make();
      const record = oneTime();
      await store.addOneTime(record);
      const at = iso();
      expect(await store.consumeOneTime(record.hash, 'google_nonce', at)).toBeNull();

      const results = await Promise.all(Array.from({ length: 8 }, () => store.consumeOneTime(record.hash, 'github_ticket', at)));
      const winners = results.filter(Boolean);
      expect(winners).toHaveLength(1);
      expect(winners[0]).toMatchObject({ hash: record.hash, purpose: 'github_ticket', payload: record.payload, consumedAt: at });
      expect(await store.consumeOneTime(record.hash, 'github_ticket', at)).toBeNull();
    });

    it('never hands out an expired or unknown one-time value, and sweeps expired ones', async () => {
      const store = make();
      const expired = oneTime({ expiresAt: iso(-HOUR), purpose: 'google_nonce', payload: null });
      await store.addOneTime(expired);
      expect(await store.consumeOneTime(expired.hash, 'google_nonce', iso())).toBeNull();
      expect(await store.consumeOneTime(randomUUID(), 'google_nonce', iso())).toBeNull();

      expect(await store.sweepExpired()).toBeGreaterThanOrEqual(1);
      expect(await store.sweepExpired()).toBe(0);
    });
  });
}
