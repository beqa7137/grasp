import type { StoredEvent } from '@grasp/engine';
import type { LearnerEvent } from '../admin/cohort-metrics.js';
import type { AuthIdentity, OneTimePurpose, OneTimeRecord, Provider, RefreshTokenRecord, User } from '../auth/auth.types.js';
import type { FeedbackEntry } from '../feedback/feedback.types.js';
import type { InterviewSession } from '../interview/interview.types.js';

export interface AppendResult {
  accepted: number;
  duplicates: number;
}

export abstract class ProgressStore {
  abstract append(learnerId: string, events: StoredEvent[]): Promise<AppendResult>;
  abstract list(learnerId: string): Promise<StoredEvent[]>;
  abstract all(): Promise<LearnerEvent[]>;
  abstract deleteLearner(learnerId: string): Promise<void>;
  /** Re-homes every event of `from` under `to`; safe to repeat if interrupted. */
  abstract moveLearner(from: string, to: string): Promise<void>;
}

export abstract class InterviewStore {
  abstract save(session: InterviewSession): Promise<void>;
  abstract get(learnerId: string, id: string): Promise<InterviewSession | null>;
  abstract recent(learnerId: string, limit: number): Promise<InterviewSession[]>;
  abstract all(): Promise<InterviewSession[]>;
  abstract deleteLearner(learnerId: string): Promise<void>;
  abstract moveLearner(from: string, to: string): Promise<void>;
}

export abstract class FeedbackStore {
  abstract add(entry: FeedbackEntry): Promise<void>;
  abstract list(learnerId: string): Promise<FeedbackEntry[]>;
  abstract all(): Promise<FeedbackEntry[]>;
  abstract deleteLearner(learnerId: string): Promise<void>;
  abstract moveLearner(from: string, to: string): Promise<void>;
}

export abstract class AuthStore {
  abstract userByEmail(email: string): Promise<User | null>;
  abstract userById(id: string): Promise<User | null>;
  abstract userByLearner(learnerId: string): Promise<User | null>;
  /**
   * Stores the account and its first sign-in method together, atomically. False, and nothing stored, when an
   * account with this email exists or that provider account is already linked. Without `identity`, the account
   * has no sign-in method, like those the earlier email-code sign-in created.
   */
  abstract createUser(user: User, identity?: AuthIdentity): Promise<boolean>;
  abstract touchLogin(userId: string, at: string): Promise<void>;
  /** Removes the account attached to a learner, with its tokens and linked identities. */
  abstract deleteByLearner(learnerId: string): Promise<void>;

  abstract identity(provider: Provider, subject: string): Promise<AuthIdentity | null>;
  /** Stores the link unless that provider account is already linked; returns the link that holds either way. */
  abstract linkIdentity(identity: AuthIdentity): Promise<AuthIdentity>;
  /** Records a sign-in; a null email keeps the last verified one. */
  abstract touchIdentity(id: string, email: string | null, at: string): Promise<void>;
  /** Oldest first. */
  abstract identitiesForUser(userId: string): Promise<AuthIdentity[]>;

  abstract addOneTime(record: OneTimeRecord): Promise<void>;
  /** Marks an unused, unexpired value as used and returns it, atomically; null when unknown, expired or already used. */
  abstract consumeOneTime(hash: string, purpose: OneTimePurpose, at: string): Promise<OneTimeRecord | null>;
  /** Deletes expired one-time values; returns how many went. */
  abstract sweepExpired(): Promise<number>;

  abstract addRefreshToken(token: RefreshTokenRecord): Promise<void>;
  abstract refreshTokenByHash(tokenHash: string): Promise<RefreshTokenRecord | null>;
  abstract markRotated(id: string, at: string): Promise<void>;
  abstract revokeFamily(familyId: string, at: string): Promise<void>;
}

export interface WindowTotal {
  total: number;
  /** Milliseconds until the current window ends and the total starts again from zero. */
  resetsInMs: number;
}

/**
 * State that every API instance must agree on. Windows are fixed and aligned to the Unix epoch, so a
 * one-day window is exactly a UTC day. With Postgres behind it, any number of instances can share it.
 */
export abstract class CoordinationStore {
  /** Adds `amount` to the current window's total and returns the new total. */
  abstract add(key: string, windowMs: number, amount: number, retainMs?: number): Promise<WindowTotal>;
  /** Adds one only while the total is below `limit`; null once the limit is reached. */
  abstract take(key: string, windowMs: number, limit: number): Promise<WindowTotal | null>;
  abstract read(key: string, windowMs: number): Promise<number>;
  /** True if `holder` now holds `key` for `ttlMs`; an expired lease can be taken over. */
  abstract acquireLease(key: string, holder: string, ttlMs: number): Promise<boolean>;
  abstract releaseLease(key: string, holder: string): Promise<void>;
  /** Deletes expired windows and leases; returns how many rows went. */
  abstract sweep(): Promise<number>;
}
