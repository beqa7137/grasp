import type { Page } from '@playwright/test';
import { expect, railShown, section, test, write } from './fixtures';

const EVENTS = 'CapacitorStorage.grasp.events';
const today = (page: Page) => page.locator('app-today');
/** Journey 4's phone bound is in Pixel 7 screens (REDESIGN.md 2.14), whatever the device. */
const PIXEL_7_HEIGHT = 839;

/**
 * A Mid-level loop three weeks out, two missed visualizer predictions of Binary Search, a mock round that flagged Heap,
 * and on this device a case study stopped at stage 3 and a code draft: Today then has readiness, Continue and Weak spots.
 */
async function seed(page: Page) {
  await page.addInitScript((key) => {
    if (localStorage.getItem(key)) return;
    const day = (offset: number) => {
      const d = new Date(Date.now() + offset * 86_400_000);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    };
    const at = new Date(Date.now() - 86_400_000).toISOString();
    let n = 0;
    const event = (body: object) => ({ id: `r14-seed-${++n}`, at, ...body });
    const events = [
      event({ type: 'target.set', target: { level: 'mid', rounds: { coding: 2, design: 1, behavioral: 1 } } }),
      event({
        type: 'plan.set',
        plan: { interviewDate: day(21), minutesPerDay: 45, rounds: ['coding', 'design', 'behavioral'], level: 'new' },
      }),
      ...[false, false, true].map((correct) =>
        event({ type: 'predict.answered', patternId: 'binary-search', algorithmId: 'binary-search', correct }),
      ),
      event({ type: 'interview.scored', sessionId: 'r14-session', track: 'coding', verdict: 'lean-no-hire', weakPatterns: ['heap'] }),
      event({ type: 'code.submitted', problemId: 'trapping-rain-water', language: 'python', passed: 2, total: 5 }),
    ];
    localStorage.setItem(key, JSON.stringify({ events, cursor: null }));
    localStorage.setItem('CapacitorStorage.grasp.case.url-shortener', JSON.stringify({ attempt: 'r14-attempt', reached: 2, stages: [] }));
    localStorage.setItem('CapacitorStorage.grasp.code.draft.two-sum.python', 'def two_sum(nums, target):\n    pass\n');
  }, EVENTS);
  await page.goto('/today');
  await page.waitForLoadState('networkidle');
}

test(
  'journey 4: Continue is on the first screen at 1280×720 and within 1.5 Pixel 7 screens on a phone',
  { tag: '@nav' },
  async ({ page }) => {
    await seed(page);
    const heading = today(page).getByRole('heading', { name: 'Continue', exact: true });
    await expect(heading).toBeVisible();
    const height = page.viewportSize()!.height;
    const box = (await heading.boundingBox())!;
    if (railShown(page)) expect(box.y + box.height, 'on the first screen').toBeLessThanOrEqual(height);
    else expect(box.y, 'within 1.5 Pixel 7 screens').toBeLessThanOrEqual(1.5 * PIXEL_7_HEIGHT);

    const list = today(page).getByRole('region', { name: 'Continue' });
    await expect(list.getByRole('link', { name: /^URL Shortener/ })).toContainText('stage 3 of 9');
    await expect(list.getByRole('link', { name: /^URL Shortener/ })).toContainText('on this device');
    await expect(list.getByRole('link', { name: /^Two Sum/ })).toContainText('code draft');
    await expect(list.getByRole('link', { name: /^Trapping Rain Water/ })).toContainText('best 2 of 5 tests');
    await expect(list.getByRole('link', { name: /^Trapping Rain Water/ })).not.toContainText('on this device');
    await list.getByRole('link', { name: /^URL Shortener/ }).click();
    await expect(page).toHaveURL(/\/design\/cases\/url-shortener\?resume=1$/);
    // The case opens at the stage it stopped at, not at its top.
    await expect(page.locator('app-case-study .stage h2').nth(2)).toBeFocused();
  },
);

test('journey 5: Weak spots drill in one tap, across the topics they name', { tag: '@nav' }, async ({ page }) => {
  await seed(page);
  const weak = today(page).getByRole('region', { name: 'Weak spots' });
  await expect(weak.getByRole('link', { name: /^Heap/ })).toContainText('Flagged in a mock round');
  await expect(weak.getByRole('link', { name: /^Binary Search/ })).toContainText('Missed 2 of 3 predictions');
  await weak.getByRole('link', { name: /^Drill these · \d+ cards$/ }).click();
  await expect(page).toHaveURL(/\/today\/drill\?topics=heap,binary-search$/);
  const drill = page.locator('app-drill');
  await expect(drill.getByRole('heading', { name: 'Weak spots', level: 1 })).toBeVisible();
  await expect(drill.getByText('Heap / Top-K, Binary Search')).toBeVisible();
  await expect(drill.getByText("Drill answers don't schedule reviews.")).toBeVisible();
  await expect(drill.locator('g-question-card')).toBeVisible();
});

test('journey 8: the readiness card opens Progress in one tap, whose arithmetic ends at the ring', { tag: '@nav' }, async ({ page }) => {
  await seed(page);
  const card = today(page).getByRole('region', { name: 'Loop readiness' });
  const ring = card.getByRole('meter', { name: 'Loop readiness' });
  await expect(ring).toBeVisible();
  const score = Number(await ring.getAttribute('aria-valuenow'));
  await expect(card.getByRole('meter', { name: 'Coding readiness' })).toBeVisible();
  await card.getByRole('link', { name: 'See your progress' }).click();
  await expect(page).toHaveURL(/\/today\/progress$/);

  const progress = page.locator('app-progress');
  await expect(progress.getByRole('heading', { name: 'Progress', level: 1 })).toBeVisible();
  await expect(progress.getByRole('meter', { name: 'Loop readiness' })).toHaveAttribute('aria-valuenow', String(score));
  await expect(progress.locator('.sum')).toHaveText(
    new RegExp(`^\\(2 × Coding \\d+ \\+ System design \\d+ \\+ Behavioral \\d+\\) / 4 = ${score}$`),
  );
  await expect(progress.getByRole('list', { name: 'Coding skills' }).getByRole('listitem')).toHaveCount(23);
  await expect(progress.getByRole('list', { name: 'Behavioral skills' }).getByRole('listitem')).toHaveCount(13);
  await expect(progress.getByText(/^\d+ required patterns: .* = \d+$/)).toBeVisible();
});

test('Progress is in the Today menu, and in the rail from 1024px', { tag: '@nav' }, async ({ page }) => {
  await page.goto('/today');
  await page.waitForLoadState('networkidle');
  if (railShown(page)) {
    await page.locator('app-rail').getByRole('link', { name: 'Progress' }).click();
  } else {
    await today(page).getByRole('button', { name: 'More options' }).click();
    await page.locator('ion-popover').getByRole('button', { name: 'Progress' }).click();
  }
  await expect(page).toHaveURL(/\/today\/progress$/);
  const progress = page.locator('app-progress');
  await expect(progress.getByRole('heading', { name: 'Progress', level: 1 })).toBeVisible();
  await expect(progress.getByText('Assuming a Mid-level loop')).toBeVisible();
  await expect(progress.getByText('Nothing unfinished.')).toBeAttached();
});

test('Settings opens with "Your loop", which edits the Target in place', async ({ page }) => {
  await seed(page);
  await page.goto('/today/settings');
  await page.waitForLoadState('networkidle');
  const settings = page.locator('app-settings');
  await expect(settings.getByRole('heading', { level: 2 }).first()).toHaveText('Your loop');
  await expect(settings.getByText(/^Mid-level loop · \w{3} \d{1,2} · \d+ days left · 45 min a day$/)).toBeVisible();
  await expect(settings.getByText('Rounds: Coding ×2, System design, Behavioral · Starting point: New')).toBeVisible();
  await settings.getByRole('button', { name: 'Edit your loop' }).focus();
  await page.keyboard.press('Enter');
  const card = settings.locator('app-loop-card');
  await expect(card.getByRole('button', { name: 'Early career' }), 'focus moves into the card it opened').toBeFocused();
  await page.keyboard.press('Tab');
  await expect(card.getByRole('button', { name: 'Mid-level' })).toBeFocused();
  await settings.locator('app-loop-card').getByRole('button', { name: 'Senior' }).click();
  await settings.locator('app-loop-card').getByRole('button', { name: 'Save' }).click();
  await expect(settings.getByText(/^Senior loop · /)).toBeFocused();
  await expect(settings.getByRole('status')).toHaveText('Loop updated.');
  await expect(settings.locator('app-loop-card')).toHaveCount(0);
});

test('a code draft written after Today loaded shows in Continue on the way back', async ({ page }) => {
  await seed(page);
  const list = today(page).getByRole('region', { name: 'Continue' });
  await expect(list.getByRole('link', { name: /^URL Shortener/ })).toBeVisible();
  await expect(list.getByRole('link', { name: /^Group Anagrams/ })).toHaveCount(0);
  // Inside the app, so Today stays alive in its tab, as it does for a learner.
  await section(page, 'Coding').click();
  await page.locator('app-hub a[href="/coding/problems"]').first().click();
  const library = page.locator('app-problem-library');
  await library.getByRole('searchbox', { name: 'Search problems' }).fill('Group Anagrams');
  await library.locator('a[href="/coding/problems/group-anagrams"]').click();
  await write(page, 'def group_anagrams(strs):\n    return []\n', 'Group Anagrams');
  await expect
    .poll(() =>
      page.evaluate(() => Object.keys(localStorage).some((k) => k.startsWith('CapacitorStorage.grasp.code.draft.group-anagrams.'))),
    )
    .toBe(true);
  // The workspace is a focus route with no tab bar on a phone, so back to the library first.
  await page.locator('app-code-workspace app-back').click();
  await expect(library).toBeVisible();
  await section(page, 'Today').click();
  await expect(page).toHaveURL(/\/today$/);
  await expect(list.getByRole('link', { name: /^Group Anagrams/ })).toContainText('code draft, on this device');
});

test('the weak-spot drill drills each topic once, says when there is nothing to drill, and needs topics', async ({ page }) => {
  const drill = page.locator('app-drill');
  await page.goto('/today/drill?topics=heap,heap');
  await expect(drill.getByRole('heading', { name: 'Weak spots', level: 1 })).toBeVisible();
  await expect(drill.locator('.head p.plan')).toHaveText('Heap / Top-K');
  await expect(drill.getByText("Drill answers don't schedule reviews.")).toBeVisible();
  await page.waitForLoadState('networkidle');
  await page.goto('/today/drill?topics=no-such-topic');
  await expect(drill.getByRole('heading', { name: 'Nothing to drill' })).toBeVisible();
  await expect(drill.getByText('All caught up')).toHaveCount(0);
  await drill.getByRole('link', { name: 'Back to Today' }).click();
  await expect(page).toHaveURL(/\/today$/);
  await page.waitForLoadState('networkidle');
  await page.goto('/today/drill');
  await expect(page).toHaveURL(/\/today\/review$/);
});

test.describe('east of UTC', () => {
  test.use({ timezoneId: 'Asia/Tbilisi' });

  test('the interview date reads as the day it is, on Today, the plan page and Settings', async ({ page }) => {
    await seed(page);
    const label = await page.evaluate(() =>
      new Date(Date.now() + 21 * 86_400_000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    );
    await expect(today(page).getByRole('heading', { level: 1 })).toHaveText(`Mid-level loop · ${label} · 21 days left · 45 min a day`);
    await page.goto('/today/plan');
    await expect(page.locator('app-plan').getByRole('heading', { level: 1 })).toHaveText(`21 days to ${label}`);
    await page.goto('/today/settings');
    await expect(page.locator('app-loop-settings').getByText(`Mid-level loop · ${label} · 21 days left · 45 min a day`)).toBeVisible();
  });
});
