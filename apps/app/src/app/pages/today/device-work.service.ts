import { Injectable, effect, inject, signal, untracked } from '@angular/core';
import {
  CASE_CATALOG,
  getCompetencySummary,
  getProblemSummary,
  minutesFor,
  type DeviceWork,
  type PlanLevel,
  type PlanRound,
  type ProgressState,
  type StarDraft,
} from '@grasp/engine';
import { Preferences } from '@capacitor/preferences';
import { CODE_DRAFT_PREFIX, STAR_DRAFT_PREFIX, draftKeys } from '../../core/local-drafts';
import { ProgressService } from '../../core/progress.service';
import { STAR_QUESTION_IDS } from '../behavioral/star-drafts.service';
import { CaseDraftsService } from '../design/case/case-drafts.service';
import { MockLoopService } from '../interview/mock-loop.service';
import { MOCK_LOOP_WORK_ID, caseWorkId, codeWorkId, starWorkId, workLink, workQuery } from './up-next-links';

/** One piece of unfinished work, as Continue lists it and Up next's rule 4 offers it. */
export interface WorkItem {
  id: string;
  /** Null for the mock loop, which spans the rounds. */
  round: PlanRound | null;
  /** "URL Shortener" */
  name: string;
  /** "stage 3 of 9" */
  detail: string;
  /** Up next's card: "Continue URL Shortener", "you stopped at stage 3 of 9". */
  card: { title: string; detail: string };
  minutes: number;
  link: string[];
  query: Record<string, string> | null;
  /** Kept only on this device (a draft), so another device never shows it. */
  device: boolean;
}

interface Drafts {
  /** Problems with code saved on this device, by any language. */
  code: string[];
  /** Behavioral questions whose STAR answer on this device still misses a part. */
  star: string[];
}

/**
 * Unfinished work in one place (REDESIGN.md 2.11): this device's case, code and STAR drafts and its mock loop, which never
 * sync, and attempted problems from the synced log. Continue lists it, and Up next's rule 4 reads the device's part.
 * Saved Lab designs are not read: the Lab saves a board as soon as it opens, so a stored one cannot tell work from a visit.
 */
@Injectable({ providedIn: 'root' })
export class DeviceWorkService {
  private readonly cases = inject(CaseDraftsService);
  private readonly loop = inject(MockLoopService);
  private readonly drafts = signal<Drafts>({ code: [], star: [] });
  /** False until this device's drafts have been read once. */
  readonly loaded = signal(false);

  constructor() {
    const progress = inject(ProgressService);
    let seen = progress.cleared();
    effect(() => {
      if (progress.cleared() === seen) return;
      seen = progress.cleared();
      untracked(() => {
        this.drafts.set({ code: [], star: [] });
        void this.load().catch(() => undefined);
      });
    });
  }

  async load(): Promise<void> {
    const [code, star] = await Promise.all([
      draftKeys(CODE_DRAFT_PREFIX),
      draftKeys(STAR_DRAFT_PREFIX),
      this.cases.load().catch(() => undefined),
      this.loop.load().catch(() => null),
    ]);
    const problems = code.map((key) => key.slice(CODE_DRAFT_PREFIX.length, key.lastIndexOf('.')));
    const questions = star.map((key) => key.slice(STAR_DRAFT_PREFIX.length)).filter((id) => STAR_QUESTION_IDS.has(id));
    const answers = await Promise.all(questions.map((id) => Preferences.get({ key: STAR_DRAFT_PREFIX + id })));
    this.drafts.set({
      code: [...new Set(problems)],
      star: questions.filter((_, i) => unfinishedAnswer(answers[i].value)),
    });
    this.loaded.set(true);
  }

  /** Every unfinished piece, device work first (the mock loop, case studies, code, then answers), then attempted problems. */
  items(state: ProgressState, pace: PlanLevel = 'new'): WorkItem[] {
    return [...this.deviceItems(state, pace), ...attempted(state)];
  }

  /** What rule 4 offers: this device's drafts in a round, newest kind first. */
  upNextWork(state: ProgressState, pace: PlanLevel = 'new'): DeviceWork[] {
    return this.deviceItems(state, pace).flatMap((w) =>
      w.round ? [{ id: w.id, round: w.round, title: w.card.title, detail: w.card.detail, minutes: w.minutes }] : [],
    );
  }

  private deviceItems(state: ProgressState, pace: PlanLevel): WorkItem[] {
    const item = (w: Omit<WorkItem, 'link' | 'query' | 'device'>): WorkItem => ({
      ...w,
      link: workLink(w.id),
      query: workQuery(w.id),
      device: true,
    });
    const loop = this.loop.loop();
    const loops =
      loop && !loop.completedAt && loop.rounds.length
        ? [
            item({
              id: MOCK_LOOP_WORK_ID,
              round: null,
              name: 'Mock loop',
              detail: loopDetail(loop.rounds.filter((r) => r.sessionId).length, loop.rounds.length),
              card: { title: 'Continue your mock loop', detail: '' },
              minutes: 0,
            }),
          ]
        : [];
    const cases = CASE_CATALOG.flatMap((c) => {
      const draft = this.cases.draft(c.id);
      if (!draft || draft.reached < 1 || state.cases[c.id]) return [];
      const stage = Math.min(draft.reached + 1, c.stages);
      return [
        item({
          id: caseWorkId(c.id),
          round: 'design',
          name: c.title,
          detail: `stage ${stage} of ${c.stages}`,
          card: { title: `Continue ${c.title}`, detail: `you stopped at stage ${stage} of ${c.stages}` },
          minutes: minutesFor({ kind: 'case', stages: c.stages - stage + 1 }, pace),
        }),
      ];
    });
    const { code, star } = this.drafts();
    const codes = code.flatMap((id) => {
      const problem = getProblemSummary(id);
      const record = state.coding[id];
      if (!problem || record?.solvedAt || record?.attempts) return [];
      return [
        item({
          id: codeWorkId(id),
          round: 'coding',
          name: problem.title,
          detail: 'code draft',
          card: { title: `Continue ${problem.title}`, detail: 'your code draft is waiting' },
          minutes: minutesFor({ kind: 'problem', difficulty: problem.difficulty }, pace),
        }),
      ];
    });
    const answers = star.flatMap((id) => {
      const competency = getCompetencySummary(id.slice(0, id.lastIndexOf('-')));
      if (!competency) return [];
      return [
        item({
          id: starWorkId(id),
          round: 'behavioral',
          name: competency.name,
          detail: 'answer draft',
          card: { title: `Finish your ${competency.name} answer`, detail: 'your STAR draft is waiting' },
          minutes: minutesFor({ kind: 'questionDraft' }, pace),
        }),
      ];
    });
    return [...loops, ...cases, ...codes, ...answers];
  }
}

const loopDetail = (started: number, rounds: number) =>
  started ? `${started} of ${rounds} rounds started` : `${rounds} ${rounds === 1 ? 'round' : 'rounds'}, not started`;

/** A saved answer stays saved once written, so it is work to continue only while a STAR part is still empty. */
function unfinishedAnswer(value: string | null): boolean {
  try {
    const draft = value ? (JSON.parse(value) as Partial<StarDraft>) : {};
    return (['situation', 'task', 'action', 'result'] as const).some((part) => !draft[part]?.trim());
  } catch {
    return false;
  }
}

/** Problems tried and not yet solved, latest first: synced, so every device shows them. */
function attempted(state: ProgressState): WorkItem[] {
  return Object.entries(state.coding)
    .filter(([, r]) => r.attempts > 0 && !r.solvedAt)
    .sort((a, b) => b[1].lastAt.localeCompare(a[1].lastAt))
    .flatMap(([id, r]) => {
      const problem = getProblemSummary(id);
      if (!problem) return [];
      return [
        {
          id: `problem:${id}`,
          round: 'coding' as const,
          name: problem.title,
          detail: `best ${r.bestPassed} of ${r.total} tests`,
          card: { title: `Continue ${problem.title}`, detail: '' },
          minutes: minutesFor({ kind: 'problem', difficulty: problem.difficulty }),
          link: ['/coding/problems', id],
          query: null,
          device: false,
        },
      ];
    });
}
