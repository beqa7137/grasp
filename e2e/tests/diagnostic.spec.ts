import { PATTERN_CATALOG } from '@grasp/engine';
import { expect, synced, test } from './fixtures';

const QUESTIONS = PATTERN_CATALOG.length;

test('a new learner takes the placement check, reviews start with the patterns they missed, and a retake starts over', async ({ page }) => {
  await page.goto('/learn');
  await page.getByRole('link', { name: 'Take the placement check' }).click();
  await expect(page).toHaveURL(/\/diagnostic$/);
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

  const spotted = page.locator('.group', { hasText: 'You already spot these' }).locator('.chip');
  const strong = (await spotted.allTextContents()).map((name) => name.trim());

  await page.getByRole('link', { name: /Start your first review/ }).click();
  await expect(page.getByRole('heading', { name: "Today's review" })).toBeVisible();
  await page.locator('g-question-card .choice').first().click();
  const firstPattern = (await page.locator('g-question-card .reveal a').textContent())!.replace(/^Review | →$/g, '').trim();
  expect(strong, 'the first new card comes from a pattern the check found weak').not.toContain(firstPattern);

  await page.getByRole('tab', { name: 'Learn' }).click();
  const learn = page.locator('app-learn');
  await expect(learn.getByRole('heading', { name: 'Build intuition, not a problem count.' })).toBeVisible();
  await expect(learn.getByText('Find your starting point')).toBeHidden();
  await learn.getByRole('link', { name: 'Settings' }).click();
  await page.locator('app-settings').getByRole('link', { name: 'Retake' }).click();
  await expect(diagnostic.getByRole('button', { name: /^Start/ })).toBeVisible();
});

test('the invitation can be set aside, and the check is still one tap away in Settings', { tag: '@smoke' }, async ({ page }) => {
  await page.goto('/learn');
  const invitation = page.locator('app-learn').getByRole('heading', { name: 'Find your starting point' });
  await expect(invitation).toBeVisible();
  await page.getByRole('button', { name: 'Not now' }).click();
  await expect(invitation).toBeHidden();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Build intuition, not a problem count.' })).toBeVisible();
  await expect(invitation).toBeHidden();

  await page.goto('/settings');
  await page.getByRole('link', { name: 'Take it' }).click();
  await expect(page).toHaveURL(/\/diagnostic$/);
  await expect(page.locator('app-diagnostic').getByRole('heading', { name: 'Find your starting point' })).toBeVisible();
});

test('number keys only answer the page in view, not a review left open in another tab', async ({ page }) => {
  await page.goto('/drill');
  const review = page.locator('app-drill');
  await expect(review.locator('g-question-card .choice:enabled').first()).toBeVisible();

  await page.getByRole('tab', { name: 'Learn' }).click();
  await page.getByRole('link', { name: 'Take the placement check' }).click();
  const diagnostic = page.locator('app-diagnostic');
  await diagnostic.getByRole('button', { name: /^Start/ }).click();
  await expect(diagnostic.getByText(`1/${QUESTIONS}`, { exact: true })).toBeVisible();
  await page.keyboard.press('1');
  await expect(diagnostic.getByText(`2/${QUESTIONS}`, { exact: true })).toBeVisible();

  await page.getByRole('tab', { name: 'Review' }).click();
  await expect(review.locator('g-question-card .choice:enabled').first()).toBeVisible();
  await expect(review.locator('g-question-card .reveal')).toHaveCount(0);
  await page.keyboard.press('1');
  await expect(review.locator('g-question-card .reveal')).toHaveCount(1);
  await expect(diagnostic.getByText(`2/${QUESTIONS}`, { exact: true })).toBeAttached();
});
