import { Injectable } from '@nestjs/common';
import type { StoredEvent } from '@grasp/engine';
import type { LearnerEvent } from '../admin/cohort-metrics.js';
import type { FeedbackEntry } from '../feedback/feedback.types.js';
import type { InterviewSession } from '../interview/interview.types.js';
import { FeedbackStore, InterviewStore, ProgressStore, type AppendResult } from './stores.js';

@Injectable()
export class MemoryProgressStore extends ProgressStore {
  private readonly events = new Map<string, Map<string, StoredEvent>>();

  async append(learnerId: string, events: StoredEvent[]): Promise<AppendResult> {
    const log = this.events.get(learnerId) ?? new Map<string, StoredEvent>();
    this.events.set(learnerId, log);
    let accepted = 0;
    for (const e of events) {
      if (log.has(e.id)) continue;
      log.set(e.id, e);
      accepted++;
    }
    return { accepted, duplicates: events.length - accepted };
  }

  async list(learnerId: string): Promise<StoredEvent[]> {
    return [...(this.events.get(learnerId)?.values() ?? [])];
  }

  async all(): Promise<LearnerEvent[]> {
    return [...this.events].flatMap(([learnerId, log]) => [...log.values()].map((event) => ({ learnerId, event })));
  }

  async deleteLearner(learnerId: string): Promise<void> {
    this.events.delete(learnerId);
  }
}

@Injectable()
export class MemoryInterviewStore extends InterviewStore {
  private readonly sessions = new Map<string, InterviewSession>();

  async save(session: InterviewSession): Promise<void> {
    this.sessions.set(session.id, structuredClone(session));
  }

  async get(learnerId: string, id: string): Promise<InterviewSession | null> {
    const s = this.sessions.get(id);
    return s && s.learnerId === learnerId ? structuredClone(s) : null;
  }

  async recent(learnerId: string, limit: number): Promise<InterviewSession[]> {
    return [...this.sessions.values()]
      .filter((s) => s.learnerId === learnerId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit)
      .map((s) => structuredClone(s));
  }

  async all(): Promise<InterviewSession[]> {
    return [...this.sessions.values()].map((s) => structuredClone(s));
  }

  async deleteLearner(learnerId: string): Promise<void> {
    for (const [id, s] of this.sessions) if (s.learnerId === learnerId) this.sessions.delete(id);
  }
}

@Injectable()
export class MemoryFeedbackStore extends FeedbackStore {
  private readonly entries: FeedbackEntry[] = [];

  async add(entry: FeedbackEntry): Promise<void> {
    this.entries.push(structuredClone(entry));
  }

  async list(learnerId: string): Promise<FeedbackEntry[]> {
    return this.entries.filter((e) => e.learnerId === learnerId).map((e) => structuredClone(e));
  }

  async all(): Promise<FeedbackEntry[]> {
    return this.entries.map((e) => structuredClone(e));
  }

  async deleteLearner(learnerId: string): Promise<void> {
    for (let i = this.entries.length - 1; i >= 0; i--) if (this.entries[i].learnerId === learnerId) this.entries.splice(i, 1);
  }
}
