import { COMPETENCY_CATALOG } from './catalog.js';
import type { Rehearsal } from './rehearsal.js';
import { EMPTY_STAR_DRAFT, reviewStar, type StarDraft } from './star-check.js';

/** One real experience, written once and told for every competency it answers. */
export interface Story {
  id: string;
  title: string;
  competencyIds: string[];
  draft: StarDraft;
  rehearsal?: Rehearsal;
  /** When the story last changed, on the clock of the device that changed it; the later change wins when devices sync. */
  updatedAt: string;
  /** When the story was first created; stories from before it was kept have none. */
  createdAt?: string;
  /** Stands in for a deleted story until the delete reaches the account, so a stale copy cannot bring it back. */
  deleted?: true;
}

export interface CompetencyCoverage {
  competencyId: string;
  name: string;
  storyIds: string[];
}

export interface BankReview {
  coverage: CompetencyCoverage[];
  covered: number;
  gaps: string[];
  advice: string[];
}

export const BANK_TARGET = { min: 8, max: 10 } as const;
const MAX_TAGS = 3;
/** What an account stores: `part` bounds each STAR part, generous for an answer told in three minutes. */
export const STORY_LIMITS = { stories: 100, title: 80, part: 4_000 } as const;

export const storyTitle = (story: Story) => story.title.trim() || 'Untitled story';

export const deletedStory = (id: string, updatedAt: string): Story => ({
  id,
  title: '',
  competencyIds: [],
  draft: { ...EMPTY_STAR_DRAFT },
  updatedAt,
  deleted: true,
});

// Stories saved before sync have no updatedAt, so any copy from another device is newer.
const changedAt = (story: Story) => Date.parse(story.updatedAt) || 0;

/** Per story, the later change wins; a tie keeps the remote copy, which the account already holds. */
export function mergeStories(local: readonly Story[], remote: readonly Story[]): Story[] {
  const merged = new Map(local.map((story) => [story.id, story]));
  for (const theirs of remote) {
    const ours = merged.get(theirs.id);
    if (!ours || changedAt(theirs) >= changedAt(ours)) merged.set(theirs.id, theirs);
  }
  return [...merged.values()];
}

export const isNewer = (story: Story, than: Story | undefined) => !than || changedAt(story) > changedAt(than);

/** When a change to `story` happens now: never at or before its last change, even on a device whose clock runs behind. */
export const nextChange = (story: Story | undefined, now: Date) =>
  new Date(Math.max(now.getTime(), story ? changedAt(story) + 1 : 0)).toISOString();

export function reviewBank(stories: readonly Story[]): BankReview {
  const coverage = COMPETENCY_CATALOG.map((c) => ({
    competencyId: c.id,
    name: c.name,
    storyIds: stories.filter((s) => s.competencyIds.includes(c.id)).map((s) => s.id),
  }));
  const gaps = coverage.filter((c) => c.storyIds.length === 0).map((c) => c.name);
  const advice: string[] = [];
  if (stories.length < BANK_TARGET.min) {
    advice.push(
      `Aim for ${BANK_TARGET.min} to ${BANK_TARGET.max} stories, so no single story has to answer everything. You have ${stories.length}.`,
    );
  }
  for (const story of stories) {
    if (story.competencyIds.length === 0) advice.push(`Tag "${storyTitle(story)}" with the competencies it answers.`);
    else if (story.competencyIds.length > MAX_TAGS)
      advice.push(
        `"${storyTitle(story)}" is tagged with ${story.competencyIds.length} competencies. Keep its best ${MAX_TAGS}: a stretch shows.`,
      );
    const toFix = reviewStar(story.draft).checks.filter((c) => !c.ok).length;
    if (toFix > 0) advice.push(`"${storyTitle(story)}" has ${toFix} ${toFix === 1 ? 'check' : 'checks'} to fix before you tell it.`);
  }
  return { coverage, covered: coverage.length - gaps.length, gaps, advice };
}
