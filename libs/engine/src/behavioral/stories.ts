import { COMPETENCY_CATALOG } from './catalog.js';
import type { Rehearsal } from './rehearsal.js';
import { reviewStar, type StarDraft } from './star-check.js';

/** One real experience, written once and told for every competency it answers. */
export interface Story {
  id: string;
  title: string;
  competencyIds: string[];
  draft: StarDraft;
  rehearsal?: Rehearsal;
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

export const storyTitle = (story: Story) => story.title.trim() || 'Untitled story';

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
