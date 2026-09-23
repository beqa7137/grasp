import type { StoredEvent } from '@grasp/engine';
import type { InterviewSession } from '../interview/interview.types.js';

export interface AppendResult {
  accepted: number;
  duplicates: number;
}

export abstract class ProgressStore {
  abstract append(learnerId: string, events: StoredEvent[]): Promise<AppendResult>;
  abstract list(learnerId: string): Promise<StoredEvent[]>;
}

export abstract class InterviewStore {
  abstract save(session: InterviewSession): Promise<void>;
  abstract get(learnerId: string, id: string): Promise<InterviewSession | null>;
  abstract recent(learnerId: string, limit: number): Promise<InterviewSession[]>;
}
