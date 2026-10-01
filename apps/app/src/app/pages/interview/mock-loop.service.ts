import { Injectable, inject, signal } from '@angular/core';
import { Preferences } from '@capacitor/preferences';
import type { LoopPick } from '@grasp/engine';
import { LearnerService } from '../../core/learner.service';
import { MOCK_LOOP_PREFIX } from '../../core/local-drafts';
import type { InterviewMode } from './interview.types';

export interface MockLoopRound extends LoopPick {
  sessionId: string | null;
}

/**
 * A mock loop links ordinary interview sessions, one a round, so the server knows nothing of it. The record stays on the
 * device, per learner, until a new loop starts; its debrief reaches progress as one `mock.completed` event.
 */
export interface MockLoop {
  id: string;
  mode: InterviewMode;
  createdAt: string;
  rounds: MockLoopRound[];
  completedAt: string | null;
}

@Injectable({ providedIn: 'root' })
export class MockLoopService {
  private readonly learner = inject(LearnerService);
  private readonly current = signal<MockLoop | null>(null);
  readonly loop = this.current.asReadonly();

  async load(): Promise<MockLoop | null> {
    const { value } = await Preferences.get({ key: this.key() });
    const loop = value ? (JSON.parse(value) as MockLoop) : null;
    this.current.set(loop);
    return loop;
  }

  start(mode: InterviewMode, picks: readonly LoopPick[]): Promise<MockLoop> {
    return this.save({
      id: crypto.randomUUID(),
      mode,
      createdAt: new Date().toISOString(),
      rounds: picks.map((p) => ({ ...p, sessionId: null })),
      completedAt: null,
    });
  }

  update(change: (loop: MockLoop) => MockLoop): Promise<MockLoop | null> {
    const loop = this.current();
    return loop ? this.save(change(loop)) : Promise.resolve(null);
  }

  async discard(): Promise<void> {
    this.current.set(null);
    await Preferences.remove({ key: this.key() });
  }

  /** Where a session sits in the current loop, if it is one of its rounds. */
  roundOf(sessionId: string): { index: number; total: number } | null {
    const rounds = this.current()?.rounds ?? [];
    const index = rounds.findIndex((r) => r.sessionId === sessionId);
    return index < 0 ? null : { index, total: rounds.length };
  }

  private async save(loop: MockLoop): Promise<MockLoop> {
    this.current.set(loop);
    await Preferences.set({ key: this.key(), value: JSON.stringify(loop) });
    return loop;
  }

  private key() {
    return MOCK_LOOP_PREFIX + this.learner.id();
  }
}
