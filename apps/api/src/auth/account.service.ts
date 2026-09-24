import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { AuthStore, FeedbackStore, InterviewStore, ProgressStore } from '../persistence/stores.js';
import { accountExists, emailUnverified, identityInUse, sessionEnded } from './auth-errors.js';
import type { AuthIdentity, IdentitySummary, Provider, User, VerifiedIdentity } from './auth.types.js';
import { type AuthSession, SessionService } from './session.service.js';

export const toIdentitySummary = (identity: AuthIdentity): IdentitySummary => ({
  provider: identity.provider,
  email: identity.email,
  linkedAt: identity.createdAt,
});

/** Decides which account a verified provider identity signs in to, matched on the provider's subject id, creating or linking as needed. */
@Injectable()
export class AccountService {
  private readonly log = new Logger(AccountService.name);

  constructor(
    private readonly store: AuthStore,
    private readonly progress: ProgressStore,
    private readonly interviews: InterviewStore,
    private readonly feedback: FeedbackStore,
    private readonly sessions: SessionService,
  ) {}

  /**
   * A new account adopts the device's anonymous learner; an existing account absorbs it, so nothing
   * learned before signing in is lost. A learner that already belongs to an account is never taken over.
   */
  async signIn(verified: VerifiedIdentity, deviceLearnerId: string | null, now = new Date()): Promise<AuthSession> {
    const unclaimedDevice = deviceLearnerId && !(await this.store.userByLearner(deviceLearnerId)) ? deviceLearnerId : null;
    const user = await this.accountFor(normalized(verified), unclaimedDevice, now);
    if (unclaimedDevice && unclaimedDevice !== user.learnerId) await this.mergeLearner(unclaimedDevice, user.learnerId);
    await this.store.touchLogin(user.id, now.toISOString());
    return this.sessions.start(user, now);
  }

  /** Connects another provider account to a signed-in user. Repeating it is harmless. */
  async link(userId: string, verified: VerifiedIdentity, now = new Date()): Promise<IdentitySummary[]> {
    if (!(await this.store.userById(userId))) throw sessionEnded();
    await this.attach(userId, normalized(verified), null, now);
    return this.identities(userId);
  }

  async me(userId: string) {
    const user = await this.store.userById(userId);
    if (!user) throw sessionEnded();
    return { user: { id: user.id, email: user.email }, learnerId: user.learnerId, identities: await this.identities(userId) };
  }

  async identities(userId: string): Promise<IdentitySummary[]> {
    return (await this.store.identitiesForUser(userId)).map(toIdentitySummary);
  }

  private async accountFor(verified: VerifiedIdentity, unclaimedDevice: string | null, now: Date): Promise<User> {
    const linked = await this.store.identity(verified.provider, verified.subject);
    if (linked) {
      const owner = await this.store.userById(linked.userId);
      if (!owner) throw new Error(`Identity ${linked.id} has no account`);
      await this.store.touchIdentity(linked.id, verified.email, now.toISOString());
      return owner;
    }

    if (!verified.email) throw emailUnverified(verified.provider);
    const existing = await this.store.userByEmail(verified.email);
    if (existing) {
      const methods = await this.store.identitiesForUser(existing.id);
      // A concurrent first sign-in with this same identity created the account after the lookup above.
      if (methods.some((m) => m.provider === verified.provider && m.subject === verified.subject)) {
        return this.accountFor(verified, unclaimedDevice, now);
      }
      // An email proves ownership only when the provider is authoritative for it. Even then an account that has a
      // sign-in method is never joined, since whoever holds that method would keep access (account pre-hijacking).
      if (!verified.authoritative || methods.length > 0) throw accountExists(verified.provider, providersOf(methods));
      await this.attach(existing.id, verified, now, now);
      return existing;
    }

    const created: User = {
      id: randomUUID(),
      email: verified.email,
      learnerId: unclaimedDevice ?? randomUUID(),
      createdAt: now.toISOString(),
      lastLoginAt: null,
    };
    // Losing a race to a concurrent first sign-in with the same email or identity: apply the rules to what it created.
    if (!(await this.store.createUser(created, identityRecord(created.id, verified, now, now)))) {
      return this.accountFor(verified, unclaimedDevice, now);
    }
    this.log.log(`New account ${created.id}`);
    return created;
  }

  private async attach(userId: string, verified: VerifiedIdentity, lastLoginAt: Date | null, now: Date): Promise<void> {
    const holder = await this.store.linkIdentity(identityRecord(userId, verified, lastLoginAt, now));
    if (holder.userId !== userId) throw identityInUse(verified.provider);
  }

  private async mergeLearner(from: string, into: string) {
    await this.feedback.moveLearner(from, into);
    await this.interviews.moveLearner(from, into);
    await this.progress.moveLearner(from, into);
    await this.progress.deleteLearner(from);
    this.log.log(`Merged anonymous learner into account learner ${into}`);
  }
}

function normalized(verified: VerifiedIdentity): VerifiedIdentity {
  return { ...verified, email: verified.email?.trim().toLowerCase() || null };
}

function identityRecord(userId: string, verified: VerifiedIdentity, lastLoginAt: Date | null, now: Date): AuthIdentity {
  return {
    id: randomUUID(),
    userId,
    provider: verified.provider,
    subject: verified.subject,
    email: verified.email,
    createdAt: now.toISOString(),
    lastLoginAt: lastLoginAt?.toISOString() ?? null,
  };
}

const providersOf = (methods: AuthIdentity[]): Provider[] => [...new Set(methods.map((m) => m.provider))];
