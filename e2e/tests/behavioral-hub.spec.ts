import type { Locator, Page } from '@playwright/test';
import { examplesFor } from '@grasp/engine';
import { expect, section, shownPage, test } from './fixtures';

const EVENTS = 'CapacitorStorage.grasp.events';
const hubSegment = (page: Page, name: string) =>
  shownPage(page).getByRole('navigation', { name: 'Behavioral sections' }).getByRole('link', { name, exact: true });
const questionRows = (page: Page) => page.locator('app-question-library .rows a');
const results = (page: Page) => page.locator('app-question-library').getByRole('status');

/** A Senior loop, two stories (one due), two drafted answers and Conflict flagged by a mock round, as from a sync. */
async function seedSenior(page: Page) {
  await page.evaluate((key) => {
    const at = new Date(Date.now() - 86_400_000).toISOString();
    const events = [
      { id: 'hub-seed-1', at, type: 'target.set', target: { level: 'senior', rounds: { coding: 2, design: 2, behavioral: 1 } } },
      {
        id: 'hub-seed-2',
        at,
        type: 'interview.scored',
        sessionId: '00000000-0000-4000-8000-000000040000',
        track: 'behavioral',
        verdict: 'lean-no-hire',
        weakPatterns: [],
        competencyId: 'conflict',
        weakCompetencies: ['conflict'],
      },
    ];
    localStorage.setItem(key, JSON.stringify({ events, cursor: null }));
    const draft = { situation: 'Our nightly billing export failed silently.', task: '', action: '', result: '', reflection: '' };
    // A story with nothing written is not rehearsable, so only the first is due.
    const story = (id: string, competencyIds: string[], action: string) => ({
      id,
      title: id,
      competencyIds,
      draft: { situation: '', task: '', action, result: '', reflection: '' },
      updatedAt: at,
    });
    localStorage.setItem(
      'CapacitorStorage.grasp.behavioral.stories',
      JSON.stringify([
        story('The billing export', ['ownership', 'delivery'], 'I rotated the credential.'),
        story('Untold', ['conflict'], ''),
      ]),
    );
    for (const id of ['ownership-1', 'conflict-2'])
      localStorage.setItem(`CapacitorStorage.grasp.behavioral.draft.${id}`, JSON.stringify(draft));
  }, EVENTS);
  await page.reload();
}

test('journey 7: Behavioral, Questions, Conflict in three taps, and a deep link with a search', { tag: '@nav' }, async ({ page }) => {
  await page.goto('/today');
  await page.waitForLoadState('networkidle');
  await section(page, 'Behavioral').click();
  await expect(page.getByRole('heading', { name: 'Behavioral interviews', level: 1 })).toBeVisible();
  await hubSegment(page, 'Questions').click();
  await expect(page).toHaveURL(/\/behavioral\/questions$/);
  await expect(results(page)).toHaveText('91 questions');
  await page.getByRole('button', { name: /^Conflict & Disagreement 7$/ }).click();
  await expect(page).toHaveURL(/\/behavioral\/questions\?competency=conflict$/);
  await expect(results(page)).toHaveText('7 questions of 91');
  await expect(questionRows(page)).toHaveCount(7);
  await expect(page.getByRole('heading', { name: 'Conflict & Disagreement', level: 2 })).toBeVisible();
  await expect(hubSegment(page, 'Questions')).toHaveAttribute('aria-current', 'page');

  await page.goto('/behavioral/questions?competency=conflict&q=disagree');
  await expect(results(page)).toHaveText('4 questions of 91');
  await expect(page.getByRole('searchbox', { name: 'Search questions' })).toHaveValue('disagree');
  await expect(questionRows(page).first()).toHaveAttribute('href', '/behavioral/question/conflict-1');
  await page.getByRole('button', { name: 'Clear all' }).click();
  await expect(page).toHaveURL(/\/behavioral\/questions$/);
  await expect(questionRows(page)).toHaveCount(91);
  await expect(page.getByRole('searchbox', { name: 'Search questions' })).toBeFocused();

  await page.getByRole('searchbox', { name: 'Search questions' }).fill('disagree');
  await expect(page).toHaveURL(/\?q=disagree$/);
  await expect(results(page)).toHaveText('5 questions of 91');
});

test("a question's status follows its draft and its competency's stories", async ({ page }) => {
  await page.goto('/behavioral/question/conflict-1');
  await page.getByLabel('Situation', { exact: true }).fill('My teammate and I disagreed about offline support for the cart.');
  await page.goto('/behavioral/questions');
  await expect(page.locator('app-question-library .summary')).toHaveText('1 of 91 drafted on this device');
  await page.getByRole('button', { name: /^Drafted on this device 1$/ }).click();
  await expect(page).toHaveURL(/\?status=drafted$/);
  await expect(questionRows(page)).toHaveCount(1);
  await expect(questionRows(page).locator('[role="img"]')).toHaveAccessibleName('Drafted on this device');
  await page.getByRole('button', { name: /^Drafted on this device 1$/ }).click();
  await expect(page.getByRole('button', { name: /^Covered by a story 0$/ })).toHaveAttribute('aria-disabled', 'true');
});

test('the Competencies show what the learner has: states, counts, Flagged, Senior focus and what is due', async ({ page }) => {
  await page.goto('/behavioral');
  await seedSenior(page);
  await expect(page.locator('app-behavioral-list .summary')).toHaveText(
    '3 of 13 competencies have a story · 2 of 91 questions drafted on this device · 1 story due',
  );
  const row = (name: string) => page.locator('app-behavioral-list .rows a').filter({ hasText: name });
  await expect(row('Ownership')).toContainText('7 questions1 drafted1 story');
  await expect(row('Ownership').locator('g-skill-state')).toHaveAccessibleName('Learning');
  await expect(row('Conflict & Disagreement')).toContainText('Flagged');
  await expect(page.locator('app-behavioral-list .rows a').filter({ hasText: 'Senior focus' })).toHaveCount(5);
  await expect(row('Leadership & Mentoring')).toContainText('Senior focus');

  await page.getByRole('link', { name: /^Rehearse 1 story/ }).click();
  await expect(page).toHaveURL(/\/behavioral\/rehearse$/);
  await page.goto('/behavioral');
  await page.getByRole('link', { name: 'How to answer (STAR) →' }).click();
  await expect(page.getByRole('heading', { name: 'How to answer (STAR)', level: 1 })).toBeVisible();
  await expect(page.getByText('Build a bank of 8 to 10 stories')).toBeVisible();
  await expect(page.getByRole('link', { name: /^STAR drill: 3 questions with follow-ups/ })).toHaveAttribute('href', '/behavioral/drill');
});

test("a competency's questions are on its first screen, with a jump row that stays in view", { tag: '@nav' }, async ({ page }) => {
  await page.goto('/behavioral/influence');
  const competency = page.locator('app-competency');
  const questions = competency.getByRole('heading', { name: 'Questions to practice', level: 2 });
  await expect(questions).toBeInViewport({ ratio: 1 });
  await expect(competency.locator('.questions a').first()).toBeInViewport({ ratio: 1 });

  const jump = competency.getByRole('navigation', { name: 'On this page' });
  await expect(jump.getByRole('button')).toHaveText(['Questions (7)', 'Guide', 'Examples']);
  const toolbar = page.locator('app-competency ion-header').first();
  // After a jump the row sits under the toolbar, and the heading just under the row: not hidden by it, nor far below it.
  const landed = async (heading: Locator) => {
    await expect(heading).toBeFocused();
    await expect(jump).toBeInViewport({ ratio: 1 });
    await expect
      .poll(async () => {
        const [bar, row, title] = await Promise.all([toolbar.boundingBox(), jump.boundingBox(), heading.boundingBox()]);
        const gap = title!.y - (row!.y + row!.height);
        return row!.y >= bar!.y + bar!.height - 1 && gap >= 0 && gap <= 24;
      })
      .toBe(true);
  };
  await jump.getByRole('button', { name: 'Examples' }).click();
  await landed(competency.getByRole('heading', { name: 'See it done', level: 2 }));
  await jump.getByRole('button', { name: 'Guide' }).click();
  await landed(competency.getByRole('heading', { name: 'Guide', level: 2 }));
  await jump.getByRole('button', { name: 'Questions (7)' }).click();
  await landed(questions);
});

test("a competency starts at the Target's level, which a level picked there never changes", async ({ page }) => {
  await page.goto('/behavioral/leadership');
  const competency = page.locator('app-competency');
  await expect(competency.locator('.at-level')).toHaveText(
    `At your level (Mid-level, assumed): ${examplesFor('leadership')!.strong.find((s) => s.level === 'mid')!.lookFor}`,
  );
  await seedSenior(page);
  const senior = examplesFor('leadership')!.strong.find((s) => s.level === 'senior')!;
  await expect(competency.locator('.at-level')).toHaveText(`At your level (Senior): ${senior.lookFor}`);
  const levels = competency.getByRole('radiogroup', { name: 'Career stage' });
  await expect(levels.getByRole('radio', { name: 'Senior' })).toHaveAttribute('aria-checked', 'true');
  await levels.getByRole('radio', { name: 'Early career' }).click();
  await expect(levels.getByRole('radio', { name: 'Early career' })).toHaveAttribute('aria-checked', 'true');
  await expect(competency.locator('.at-level')).toContainText('At your level (Senior):');
  const events = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).events as { type: string }[], EVENTS);
  expect(events.filter((e) => e.type === 'target.set')).toHaveLength(1);
});
