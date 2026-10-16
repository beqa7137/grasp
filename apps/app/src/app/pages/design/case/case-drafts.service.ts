import { Injectable, effect, inject, signal, untracked } from '@angular/core';
import { Preferences } from '@capacitor/preferences';
import type { CaseStageAnswer } from '@grasp/engine';
import { CASE_DRAFT_PREFIX, draftKeys } from '../../../core/local-drafts';
import { ProgressService } from '../../../core/progress.service';

/** One run through a case on this device: the furthest stage open and what each stage answered. */
export interface CaseDraft {
  /** Names this run, so its completion event keeps one id however often it is recorded. */
  attempt: string;
  reached: number;
  stages: CaseStageAnswer[];
}

export const newCaseDraft = (): CaseDraft => ({ attempt: crypto.randomUUID(), reached: 0, stages: [] });

/** Case answers stay on this device like other drafts; only a finished case syncs, as a progress event. */
@Injectable({ providedIn: 'root' })
export class CaseDraftsService {
  private readonly saved = signal<ReadonlyMap<string, CaseDraft>>(new Map());
  /** Whether `load` has read this device's drafts once, so a list filtered by them can tell "none" from "not yet". */
  readonly loaded = signal(false);

  constructor() {
    const progress = inject(ProgressService);
    let seen = progress.cleared();
    effect(() => {
      if (progress.cleared() === seen) return;
      seen = progress.cleared();
      untracked(() => this.saved.set(new Map()));
    });
  }

  async load(): Promise<void> {
    const keys = await draftKeys(CASE_DRAFT_PREFIX);
    const values = await Promise.all(keys.map((key) => Preferences.get({ key })));
    const drafts = keys.flatMap((key, i) => {
      const draft = readCaseDraft(values[i].value);
      return draft ? [[key.slice(CASE_DRAFT_PREFIX.length), draft] as const] : [];
    });
    this.saved.set(new Map(drafts));
    this.loaded.set(true);
  }

  /** The draft as `load` or the latest change left it. */
  draft(caseId: string): CaseDraft | undefined {
    return this.saved().get(caseId);
  }

  async get(caseId: string): Promise<CaseDraft | null> {
    const { value } = await Preferences.get({ key: CASE_DRAFT_PREFIX + caseId });
    const draft = readCaseDraft(value);
    // A bare stage number gets a new attempt id on every read; saving it once keeps that run's option order.
    if (draft && typeof JSON.parse(value!) === 'number') await this.save(caseId, draft);
    return draft;
  }

  save(caseId: string, draft: CaseDraft): Promise<void> {
    this.remember(caseId, draft);
    return Preferences.set({ key: CASE_DRAFT_PREFIX + caseId, value: JSON.stringify(draft) });
  }

  remove(caseId: string): Promise<void> {
    this.remember(caseId, null);
    return Preferences.remove({ key: CASE_DRAFT_PREFIX + caseId });
  }

  private remember(caseId: string, draft: CaseDraft | null) {
    this.saved.update((saved) => {
      const next = new Map(saved);
      if (draft) next.set(caseId, draft);
      else next.delete(caseId);
      return next;
    });
  }
}

export function readCaseDraft(value: string | null): CaseDraft | null {
  let parsed: unknown;
  try {
    parsed = value === null ? null : JSON.parse(value);
  } catch {
    return null;
  }
  // Before every stage was saved, a case stored only its furthest stage, as a bare number.
  if (typeof parsed === 'number') return isCount(parsed) && parsed > 0 ? { ...newCaseDraft(), reached: parsed } : null;
  const draft = parsed as Partial<CaseDraft> | null;
  if (!draft || typeof draft.attempt !== 'string' || !/^[\w-]{1,40}$/.test(draft.attempt) || !isCount(draft.reached)) return null;
  return { attempt: draft.attempt, reached: draft.reached, stages: Array.isArray(draft.stages) ? draft.stages.map(readAnswer) : [] };
}

function readAnswer(value: unknown): CaseStageAnswer {
  const { chosen, guess, revealed } = (value ?? {}) as Record<string, unknown>;
  return {
    ...(isCount(chosen) ? { chosen } : {}),
    ...(typeof guess === 'string' ? { guess } : {}),
    ...(isCount(revealed) ? { revealed } : {}),
  };
}

const isCount = (value: unknown): value is number => Number.isInteger(value) && (value as number) >= 0;
