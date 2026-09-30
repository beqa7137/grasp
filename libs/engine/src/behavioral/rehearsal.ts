import { COMPETENCIES } from './competencies.js';
import { isEmptyDraft } from './star-check.js';
import { nextChange, type Story } from './stories.js';
import type { BehavioralQuestion } from './types.js';

const DAY_MS = 86_400_000;
const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();

/** Days until the next telling after each good one; a telling that needs work starts the ladder again tomorrow. */
export const REHEARSAL_DAYS = [1, 3, 7, 14, 30] as const;

export interface Rehearsal {
  step: number;
  told: number;
  due: string;
}

/** A story can be rehearsed once it has a tag to draw questions from and something written to tell. */
export const isRehearsable = (story: Story) => story.competencyIds.length > 0 && !isEmptyDraft(story.draft);

/** Competency id to when an interview flagged it as weak, as the progress state's `behavioral` slice holds it. */
export type FlaggedCompetencies = Readonly<Record<string, { weakSince: string | null }>>;

// Both grades schedule the next telling REHEARSAL_DAYS[step] days out, so the last telling is recoverable from the due date.
const lastToldAt = (rehearsal: Rehearsal) => new Date(rehearsal.due).getTime() - REHEARSAL_DAYS[rehearsal.step] * DAY_MS;

const flaggedSinceTold = (story: Story, rehearsal: Rehearsal, flagged: FlaggedCompetencies) =>
  story.competencyIds.some((id) => {
    const since = flagged[id]?.weakSince;
    return since != null && Date.parse(since) > lastToldAt(rehearsal);
  });

/** Due on its ladder, or sooner when an interview has flagged one of its competencies since it was last told. */
export const isDue = (story: Story, now: Date, flagged: FlaggedCompetencies = {}) =>
  isRehearsable(story) &&
  (!story.rehearsal || new Date(story.rehearsal.due).getTime() <= now.getTime() || flaggedSinceTold(story, story.rehearsal, flagged));

export function dueStories(stories: readonly Story[], now: Date, flagged: FlaggedCompetencies = {}): Story[] {
  const since = (s: Story) => (s.rehearsal ? new Date(s.rehearsal.due).getTime() : 0);
  return stories.filter((s) => isDue(s, now, flagged)).sort((a, b) => since(a) - since(b));
}

/** Each telling asks a different question from the story's competencies, so it is practised as a reusable answer. */
export function rehearsalQuestion(story: Story): BehavioralQuestion | undefined {
  const questions = COMPETENCIES.filter((c) => story.competencyIds.includes(c.id)).flatMap((c) => c.questions);
  return questions.length ? questions[(story.rehearsal?.told ?? 0) % questions.length] : undefined;
}

export function rehearse(story: Story, toldWell: boolean, now: Date): Story {
  const told = (story.rehearsal?.told ?? 0) + 1;
  const step = toldWell ? Math.min((story.rehearsal?.step ?? -1) + 1, REHEARSAL_DAYS.length - 1) : 0;
  const days = toldWell ? REHEARSAL_DAYS[step] : 1;
  return {
    ...story,
    rehearsal: { step, told, due: new Date(now.getTime() + days * DAY_MS).toISOString() },
    updatedAt: nextChange(story, now),
  };
}

export function whenNext(story: Story, now: Date, flagged: FlaggedCompetencies = {}): string {
  if (isDue(story, now, flagged)) return 'now';
  if (!story.competencyIds.length) return 'once it has a competency';
  if (!story.rehearsal) return 'once some of it is written';
  const days = Math.round((startOfDay(new Date(story.rehearsal.due)) - startOfDay(now)) / DAY_MS);
  return days < 1 ? 'later today' : days === 1 ? 'tomorrow' : `in ${days} days`;
}
