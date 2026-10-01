import type { StoredEvent } from '@grasp/engine';
import type { AuthIdentity, OneTimePurpose, OneTimeRecord, Provider, RefreshTokenRecord, User } from '../auth/auth.types.js';
import type { FeedbackEntry } from '../feedback/feedback.types.js';
import type { InterviewSession } from '../interview/interview.types.js';
import type { AccessClaims } from '../auth/tokens.js';

export interface AppendResult {
  accepted: number;
  duplicates: number;
}

export interface ReceivedEvents {
  events: StoredEvent[];
  latest: string | null;
}

export abstract class ProgressStore {
  abstract append(learnerId: string, events: StoredEvent[]): Promise<AppendResult>;
  abstract list(learnerId: string): Promise<StoredEvent[]>;
  abstract listReceivedAfter(learnerId: string, after: Date | null): Promise<ReceivedEvents>;
  abstract deleteLearner(learnerId: string): Promise<void>;
}

export abstract class InterviewStore {
  abstract save(session: InterviewSession): Promise<void>;
  abstract completeScore(candidate: InterviewSession): Promise<InterviewSession>;
  abstract get(learnerId: string, id: string): Promise<InterviewSession | null>;
  abstract recent(learnerId: string, limit: number): Promise<InterviewSession[]>;
  abstract deleteLearner(learnerId: string): Promise<void>;
}

export interface FeedbackCursor {
  createdAt: string;
  id: string;
}

export abstract class FeedbackStore {
  abstract add(entry: FeedbackEntry): Promise<void>;
  abstract list(learnerId: string): Promise<FeedbackEntry[]>;
  /** Newest first, by time then ID, from just after `before`, so paging never repeats or skips an entry. */
  abstract page(limit: number, before: FeedbackCursor | null): Promise<FeedbackEntry[]>;
  abstract deleteLearner(learnerId: string): Promise<void>;
}

/**
 * A refresh racing its token's expiry, or a server clock behind the database's, still finds its session; an expired
 * token is refused either way, so keeping it a day longer changes nothing else.
 */
export const TOKEN_SWEEP_GRACE_MS = 24 * 3_600_000;

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
  /**
   * Deletes expired one-time values, refresh tokens a day past expiry and the session families they leave without a
   * live token; returns how many rows went.
   */
  abstract sweepExpired(): Promise<number>;

  /** False when the account vanished before the session could start. */
  abstract createFamily(userId: string, familyId: string, at: string): Promise<boolean>;
  /** Verifies the session and its account for every bearer request. */
  abstract activeFamily(userId: string, learnerId: string, familyId: string): Promise<boolean>;
  /** False when logout or account deletion won the race against issuance. */
  abstract addRefreshToken(token: RefreshTokenRecord): Promise<boolean>;
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
  /** Null when the account or session was revoked; a denied call does not increment the counter. */
  abstract addForSession(key: string, windowMs: number, amount: number, claims: AccessClaims): Promise<WindowTotal | null>;
  /** Adds one only while the total is below `limit`; null once the limit is reached. */
  abstract take(key: string, windowMs: number, limit: number): Promise<WindowTotal | null>;
  abstract read(key: string, windowMs: number): Promise<number>;
  /** True if `holder` now holds `key` for `ttlMs`; an expired lease can be taken over. */
  abstract acquireLease(key: string, holder: string, ttlMs: number): Promise<boolean>;
  abstract releaseLease(key: string, holder: string): Promise<void>;
  /** Deletes expired windows and leases; returns how many rows went. */
  abstract sweep(): Promise<number>;
}
