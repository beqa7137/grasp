import { Injectable, inject, signal } from '@angular/core';
import { Preferences } from '@capacitor/preferences';
import { debriefLoop, type InterviewTrack, type LoopPick, type LoopRoundCard, type Seniority } from '@grasp/engine';
import { ApiError, ApiService } from '../../core/api.service';
import { LearnerService } from '../../core/learner.service';
import { mockLoopKey } from '../../core/local-drafts';
import { ProgressService } from '../../core/progress.service';
import type { InterviewMode, InterviewSession } from './interview.types';

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
  /** The bar the behavioral round is scored at. */
  level: Seniority;
  createdAt: string;
  rounds: MockLoopRound[];
  completedAt: string | null;
}

export interface MockLoopSnapshot {
  loop: MockLoop | null;
  sessions: Record<string, InterviewSession>;
  /** Rounds whose session is gone (erased, or never reached the account), which start again. */
  missing: InterviewTrack[];
}

export const loopCard = (s: InterviewSession): LoopRoundCard => ({
  track: s.track,
  sessionId: s.id,
  problemId: s.problem.id,
  patternIds: s.problem.patternIds,
  competencyId: s.problem.competencyId,
  mode: s.scorecard!.mode,
  verdict: s.scorecard!.verdict,
  dimensions: s.scorecard!.dimensions,
  weakPatterns: s.scorecard!.weakPatterns,
});

const isLoop = (value: unknown): value is MockLoop =>
  typeof value === 'object' && value !== null && Array.isArray((value as MockLoop).rounds) && typeof (value as MockLoop).id === 'string';

@Injectable({ providedIn: 'root' })
export class MockLoopService {
  private readonly api = inject(ApiService);
  private readonly progress = inject(ProgressService);
  private readonly learner = inject(LearnerService);
  private readonly current = signal<MockLoop | null>(null);
  /** Bumped by every write, so a slower read does not put back a record that changed meanwhile. */
  private version = 0;
  readonly loop = this.current.asReadonly();

  async load(): Promise<MockLoop | null> {
    const version = this.version;
    const key = this.key();
    let loop: MockLoop | null = null;
    try {
      const { value } = await Preferences.get({ key });
      const parsed: unknown = value ? JSON.parse(value) : null;
      loop = isLoop(parsed) ? { ...parsed, level: parsed.level ?? 'mid' } : null;
    } catch {
      loop = null;
    }
    if (version !== this.version || key !== this.key()) return this.current();
    this.current.set(loop);
    return loop;
  }

  /**
   * Reads each round's session, starts again a round whose session is gone, and records the loop's completion as soon
   * as every round is scored, wherever the learner is when that happens.
   */
  async refresh(): Promise<MockLoopSnapshot> {
    const loop = await this.load();
    if (!loop) return { loop: null, sessions: {}, missing: [] };
    const found = await Promise.all(
      loop.rounds.map((r) =>
        r.sessionId
          ? this.api.get<InterviewSession>(`/interview/sessions/${r.sessionId}`).catch((e: unknown) => {
              if (e instanceof ApiError && e.status === 404) return null;
              throw e;
            })
          : Promise.resolve(undefined),
      ),
    );
    const sessions = Object.fromEntries(found.flatMap((s) => (s ? [[s.id, s]] : [])));
    const missing = loop.rounds.filter((_, i) => found[i] === null).map((r) => r.track);
    const kept = missing.length
      ? await this.update((l) => ({ ...l, rounds: l.rounds.map((r, i) => (found[i] === null ? { ...r, sessionId: null } : r)) }))
      : loop;
    if (kept) await this.complete(kept, sessions);
    return { loop: this.current(), sessions, missing };
  }

  start(mode: InterviewMode, level: Seniority, picks: readonly LoopPick[]): Promise<MockLoop> {
    return this.save({
      id: crypto.randomUUID(),
      mode,
      level,
      createdAt: new Date().toISOString(),
      rounds: picks.map((p) => ({ ...p, sessionId: null })),
      completedAt: null,
    });
  }

  async update(change: (loop: MockLoop) => MockLoop): Promise<MockLoop | null> {
    const loop = this.current();
    return loop ? this.save(change(loop)) : null;
  }

  async discard(): Promise<void> {
    this.version++;
    this.current.set(null);
    await Preferences.remove({ key: this.key() });
  }

  /** Where a session sits in the current loop, if it is one of its rounds. */
  roundOf(sessionId: string): { index: number; total: number } | null {
    const rounds = this.current()?.rounds ?? [];
    const index = rounds.findIndex((r) => r.sessionId === sessionId);
    return index < 0 ? null : { index, total: rounds.length };
  }

  /** Recorded first and marked after, so a record that did not happen is tried again; the event id keeps it single. */
  private async complete(loop: MockLoop, sessions: Record<string, InterviewSession>) {
    if (loop.completedAt || !loop.rounds.length) return;
    const scored = loop.rounds.map((r) => (r.sessionId ? sessions[r.sessionId] : undefined));
    if (!scored.every((s) => s?.scorecard && s.scoredAt)) return;
    const rounds = scored as InterviewSession[];
    const at = rounds
      .map((s) => s.scoredAt!)
      .sort((a, b) => Date.parse(a) - Date.parse(b))
      .at(-1)!;
    await this.progress.record({
      id: `mock-${loop.id}`,
      at,
      type: 'mock.completed',
      loopId: loop.id,
      verdict: debriefLoop(rounds.map(loopCard)).verdict,
      rounds: rounds.map((s) => ({ track: s.track, sessionId: s.id, verdict: s.scorecard!.verdict, at: s.scoredAt! })),
    });
    await this.update((l) => (l.id === loop.id ? { ...l, completedAt: at } : l));
  }

  private async save(loop: MockLoop): Promise<MockLoop> {
    this.version++;
    this.current.set(loop);
    await Preferences.set({ key: this.key(), value: JSON.stringify(loop) });
    return loop;
  }

  private key() {
    return mockLoopKey(this.learner.id());
  }
}
