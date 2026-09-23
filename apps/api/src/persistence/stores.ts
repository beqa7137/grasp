import type { StoredEvent } from '@grasp/engine';
import type { LearnerEvent } from '../admin/cohort-metrics.js';
import type { LoginCode, RefreshTokenRecord, User } from '../auth/auth.types.js';
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
  abstract addCode(code: LoginCode): Promise<void>;
  abstract countCodesSince(email: string, since: string): Promise<number>;
  /** Newest code for the email that has not been used yet. */
  abstract latestCode(email: string): Promise<LoginCode | null>;
  abstract updateCode(id: string, patch: Partial<Pick<LoginCode, 'attempts' | 'consumedAt'>>): Promise<void>;

  abstract userByEmail(email: string): Promise<User | null>;
  abstract userById(id: string): Promise<User | null>;
  abstract userByLearner(learnerId: string): Promise<User | null>;
  abstract createUser(user: User): Promise<void>;
  abstract touchLogin(userId: string, at: string): Promise<void>;
  /** Removes the account attached to a learner, with its tokens. */
  abstract deleteByLearner(learnerId: string): Promise<void>;

  abstract addRefreshToken(token: RefreshTokenRecord): Promise<void>;
  abstract refreshTokenByHash(tokenHash: string): Promise<RefreshTokenRecord | null>;
  abstract markRotated(id: string, at: string): Promise<void>;
  abstract revokeFamily(familyId: string, at: string): Promise<void>;
}
