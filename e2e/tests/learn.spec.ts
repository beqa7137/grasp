import { expect, test } from './fixtures';

test.describe('first visit', () => {
  test.use({ pilotNoticeSeen: false });

  test('welcomes pilot testers once, then shows the daily loop', { tag: '@smoke' }, async ({ page }) => {
    await page.goto('/');
    const welcome = page.getByRole('heading', { name: 'Welcome to the Grasp pilot' });
    await expect(welcome).toBeVisible();
    await page.getByRole('button', { name: "Got it, let's start" }).click();
    await expect(welcome).toBeHidden();
    await expect(page).toHaveURL(/\/learn$/);
    await expect(page.getByRole('heading', { name: 'Build intuition, not a problem count.' })).toBeVisible();

    await page.reload();
    await expect(page.getByRole('heading', { name: 'Build intuition, not a problem count.' })).toBeVisible();
    await expect(welcome).toBeHidden();
  });
});

test('a pattern page teaches the cue and template and links to practice', { tag: '@smoke' }, async ({ page }) => {
  await page.goto('/learn');
  await page
    .getByRole('link', { name: /Arrays & Hashing/ })
    .first()
    .click();
  await expect(page.getByRole('heading', { name: 'Arrays & Hashing', level: 1 })).toBeVisible();
  await expect(page.getByRole('heading', { name: /Cues/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Template' })).toBeVisible();

  await page.getByRole('link', { name: 'Code: Two Sum' }).click();
  await expect(page).toHaveURL(/\/code\/two-sum$/);
  await expect(page.getByRole('heading', { name: 'Two Sum', level: 1 })).toBeVisible();
});

test('deep links load directly, and unknown paths land on Learn', { tag: '@smoke' }, async ({ page }) => {
  await page.goto('/visualize/binary-search');
  await expect(page.getByRole('heading', { name: 'Binary Search', level: 1 })).toBeVisible();
  await page.goto('/no-such-page');
  await expect(page).toHaveURL(/\/learn$/);
});
