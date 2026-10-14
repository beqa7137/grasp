import { PATTERN_CATALOG } from '@grasp/engine';
import { expect, synced, test } from './fixtures';

const QUESTIONS = PATTERN_CATALOG.length;

test('a new learner takes the placement check, reviews start with the patterns they missed, and a retake starts over', async ({ page }) => {
  await page.goto('/today');
  await page.getByRole('button', { name: 'Mid-level' }).click();
  await page.getByRole('button', { name: '3 weeks' }).click();
  await page.getByRole('button', { name: 'Build my plan' }).click();
  await page.getByRole('link', { name: 'Take the placement' }).click();
  await expect(page).toHaveURL(/\/coding\/placement$/);
  const diagnostic = page.locator('app-diagnostic');
  await expect(diagnostic.getByRole('heading', { name: 'Find your starting point' })).toBeVisible();
  await diagnostic.getByRole('button', { name: /^Start/ }).click();

  const sync = synced(page, 'diagnostic.completed');
  for (let n = 1; n <= QUESTIONS; n++) {
    await expect(page.getByText(`${n}/${QUESTIONS}`, { exact: true })).toBeVisible();
    await expect(page.locator('g-question-card .reason')).toHaveText('Placement check');
    if (n % 4 === 0) await page.getByRole('button', { name: "I haven't learned this" }).click();
    else await page.locator('g-question-card .choice').first().click();
  }
  await expect(page.getByText('Your starting point', { exact: true })).toBeVisible();
  await sync;

  // The results are the skill map: each pattern's row carries its placement, and exactly one says Start here.
  const map = page.locator('app-diagnostic app-pattern-map');
  await expect(map.locator('a[g-entry-row]')).toHaveCount(QUESTIONS);
  await expect(map.getByText('Start here', { exact: true })).toHaveCount(1);
  const spotted = map
    .locator('a[g-entry-row]')
    .filter({ has: page.locator('g-skill-state[aria-label="Spotted"]') })
    .locator('.title');
  const strong = (await spotted.allTextContents()).map((name) => name.trim());
  expect(strong.length).toBeGreaterThan(0);

  await page.getByRole('link', { name: /Start your first review/ }).click();
  await expect(page.getByRole('heading', { name: "Today's review" })).toBeVisible();
  await page.locator('g-question-card .choice').first().click();
  const firstPattern = (await page.locator('g-question-card .reveal a').textContent())!.replace(/^Read the | lesson →$/g, '').trim();
  expect(strong, 'the first new card comes from a pattern the check found weak').not.toContain(firstPattern);

  await page.getByRole('tab', { name: /^Today/ }).click();
  const learn = page.locator('app-today');
  await expect(learn.getByRole('heading', { name: /^Mid-level loop · / })).toBeVisible();
  await expect(learn.getByText('Skip what you know')).toBeHidden();
  await learn.getByRole('link', { name: 'Settings' }).click();
  await page.locator('app-settings').getByRole('link', { name: 'Retake' }).click();
  await expect(diagnostic.getByRole('button', { name: /^Start/ })).toBeVisible();
});

test('the placement is offered once a loop with Coding is saved, can be set aside, and stays one tap away in Settings', async ({
  page,
}) => {
  await page.goto('/today');
  const today = page.locator('app-today');
  const offer = today.getByRole('heading', { name: 'Skip what you know' });
  await expect(today.getByRole('heading', { name: 'What is your loop?', level: 1 })).toBeVisible();
  await expect(offer).toHaveCount(0);
  await today.getByRole('button', { name: 'Senior' }).click();
  await today.getByRole('button', { name: 'No date yet' }).click();
  await today.getByRole('button', { name: 'Save my loop' }).click();
  await expect(offer).toBeVisible();
  await expect(today.getByRole('heading', { name: 'Senior loop · no date yet', level: 1 })).toBeFocused();
  await today.getByRole('button', { name: 'No thanks' }).click();
  await expect(offer).toHaveCount(0);
  await expect(today.getByRole('heading', { name: 'Senior loop · no date yet', level: 1 })).toBeFocused();
  await today.getByRole('button', { name: 'Edit' }).click();
  await today.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(offer).toHaveCount(0);
  await page.reload();
  await expect(today.getByRole('heading', { name: 'Senior loop · no date yet', level: 1 })).toBeVisible();
  await expect(offer).toHaveCount(0);

  await page.goto('/today/settings');
  await page.getByRole('link', { name: 'Take it' }).click();
  await expect(page).toHaveURL(/\/coding\/placement$/);
  await expect(page.locator('app-diagnostic').getByRole('heading', { name: 'Find your starting point' })).toBeVisible();
});

test('number keys only answer the page in view, not a review left open in another tab', { tag: '@nav' }, async ({ page }) => {
  await page.goto('/coding/placement');
  const diagnostic = page.locator('app-diagnostic');
  await diagnostic.getByRole('button', { name: /^Start/ }).click();
  await expect(diagnostic.getByText(`1/${QUESTIONS}`, { exact: true })).toBeVisible();
  await page.keyboard.press('1');
  await expect(diagnostic.getByText(`2/${QUESTIONS}`, { exact: true })).toBeVisible();

  await page.getByRole('tab', { name: /^Today/ }).click();
  await page
    .locator('app-today')
    .getByRole('link', { name: /^Review/ })
    .click();
  const review = page.locator('app-drill');
  await expect(review.locator('g-question-card .choice:enabled').first()).toBeVisible();
  await expect(review.locator('g-question-card .reveal')).toHaveCount(0);
  await page.keyboard.press('1');
  await expect(review.locator('g-question-card .reveal')).toHaveCount(1);
  await expect(diagnostic.getByText(`2/${QUESTIONS}`, { exact: true })).toBeAttached();
});
