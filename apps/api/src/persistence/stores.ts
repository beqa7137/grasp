import type { StoredEvent } from '@grasp/engine';
import type { LearnerEvent } from '../admin/cohort-metrics.js';
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
}

export abstract class InterviewStore {
  abstract save(session: InterviewSession): Promise<void>;
  abstract get(learnerId: string, id: string): Promise<InterviewSession | null>;
  abstract recent(learnerId: string, limit: number): Promise<InterviewSession[]>;
  abstract all(): Promise<InterviewSession[]>;
  abstract deleteLearner(learnerId: string): Promise<void>;
}

export abstract class FeedbackStore {
  abstract add(entry: FeedbackEntry): Promise<void>;
  abstract list(learnerId: string): Promise<FeedbackEntry[]>;
  abstract all(): Promise<FeedbackEntry[]>;
  abstract deleteLearner(learnerId: string): Promise<void>;
}
