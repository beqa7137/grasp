import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { expect, synced, test } from './fixtures';

test.use({ contextOptions: { reducedMotion: 'reduce' } });

/** A calendar day this many days from today, where the browser lives. */
const localDay = (page: Page, days: number) =>
  page.evaluate((n) => {
    const d = new Date();
    d.setDate(d.getDate() + n);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }, days);

async function seriousViolations(page: Page): Promise<string[]> {
  const { violations } = await new AxeBuilder({ page })
    .include('app-plan')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'])
    .analyze();
  return violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(', ')}`);
}

test('a learner sets an interview date, follows today’s list, changes the rounds and clears the plan', async ({ page }) => {
  await page.goto('/learn');
  const learn = page.locator('app-learn');
  await learn.getByRole('link', { name: /Study plan.*Set your date/ }).click();
  await expect(page).toHaveURL(/\/plan$/);
  const plan = page.locator('app-plan');
  await expect(plan.getByRole('heading', { name: 'Plan to your interview', level: 1 })).toBeVisible();

  await plan.getByRole('button', { name: 'Save plan' }).click();
  await expect(plan.getByRole('alert')).toHaveText('Choose an interview date from today to a year from now.');

  await plan.getByLabel('Interview date').fill(await localDay(page, 20));
  const minutes = plan.getByRole('radiogroup', { name: 'Time a day' });
  await minutes.getByRole('radio', { name: '30 min' }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(minutes.getByRole('radio', { name: '45 min' })).toHaveAttribute('aria-checked', 'true');
  await page.keyboard.press('ArrowRight');
  await expect(minutes.getByRole('radio', { name: '1 h' })).toBeFocused();
  for (const round of ['Coding', 'System design', 'Behavioral']) await plan.getByRole('checkbox', { name: round }).uncheck();
  await plan.getByRole('button', { name: 'Save plan' }).click();
  await expect(plan.getByRole('alert')).toHaveText('Choose at least one round.');
  for (const round of ['Coding', 'System design', 'Behavioral']) await plan.getByRole('checkbox', { name: round }).check();
  await plan.getByRole('radiogroup', { name: 'Where you are starting' }).getByRole('radio', { name: 'Rusty' }).click();
  await expect(plan.getByText('You have prepared before: units are a little shorter.')).toBeVisible();

  const saving = synced(page, 'plan.set');
  await plan.getByRole('button', { name: 'Save plan' }).click();
  await saving;
  const heading = plan.getByRole('heading', { name: 'Interview in 20 days', level: 1 });
  await expect(heading).toBeFocused();
  await expect(plan.getByRole('status')).toHaveText('Plan saved.');
  await expect(plan.getByText(/1 h a day$/)).toBeVisible();
  await expect(plan.getByText(/^At 1 h a day you cover everything by|will not fit before your interview at 1 h a day/)).toBeVisible();

  const today = plan.getByRole('region', { name: /^Today/ });
  await expect(today.getByRole('link', { name: 'Learn Arrays & Hashing' })).toBeVisible();
  await expect(today.getByRole('link', { name: 'Solve Two Sum' })).toBeVisible();
  await expect(today.getByRole('link', { name: 'URL Shortener case study' })).toBeVisible();
  await expect(today.getByRole('link', { name: 'Review' })).toBeVisible();
  await expect(plan.getByRole('region', { name: 'Coming up' }).getByRole('listitem').first()).toBeVisible();
  await expect(plan.getByRole('region', { name: 'Still to learn' })).toContainText('Behavioral');
  expect(await seriousViolations(page)).toEqual([]);

  await today.getByRole('link', { name: 'Learn Arrays & Hashing' }).click();
  await expect(page).toHaveURL(/\/learn\/pattern\/hashing$/);
  await page.goBack();
  await expect(heading).toBeVisible();

  await page.reload();
  await expect(heading).toBeVisible();

  await plan.getByRole('button', { name: 'Change plan' }).click();
  await expect(plan.getByRole('heading', { name: 'Change your plan', level: 1 })).toBeFocused();
  await expect(plan.getByLabel('Interview date')).toHaveValue(await localDay(page, 20));
  await plan.getByRole('checkbox', { name: 'Coding' }).uncheck();
  await plan.getByRole('checkbox', { name: 'System design' }).uncheck();
  await plan.getByRole('button', { name: 'Save plan' }).click();
  await expect(plan.getByRole('status')).toHaveText('Plan updated.');
  await expect(today.getByRole('link', { name: 'A story for Ownership' })).toBeVisible();
  await expect(today.getByRole('link', { name: /^Learn / })).toHaveCount(0);

  await page.getByRole('tab', { name: 'Learn' }).click();
  await expect(learn.getByRole('link', { name: /Study plan.*Interview in 20 days/ })).toBeVisible();
  await learn.getByRole('link', { name: /Study plan/ }).click();

  const clearing = synced(page, 'plan.set');
  await plan.getByRole('button', { name: 'Clear plan' }).click();
  await clearing;
  await expect(plan.getByRole('heading', { name: 'Plan to your interview', level: 1 })).toBeFocused();
  await expect(plan.getByRole('status')).toHaveText('Plan cleared.');
});

for (const theme of ['dark', 'light'] as const) {
  test.describe(`in the ${theme} theme`, () => {
    test.use({ theme });

    test('an interview tomorrow says what will not fit, kindly, and the day itself asks only for rest', async ({ page }) => {
      await page.goto('/plan');
      const plan = page.locator('app-plan');
      await expect(plan.getByRole('heading', { name: 'Plan to your interview' })).toBeVisible();
      expect(await seriousViolations(page)).toEqual([]);

      await plan.getByLabel('Interview date').fill(await localDay(page, 1));
      await plan.getByRole('button', { name: 'Save plan' }).click();
      await expect(plan.getByRole('heading', { name: 'Interview tomorrow', level: 1 })).toBeVisible();
      await expect(
        plan.getByText(/items will not fit before your interview at 30 min a day, so the plan starts with what matters most\./),
      ).toBeVisible();
      await expect(plan.getByRole('region', { name: 'Coming up' })).toHaveCount(0);
      expect(await seriousViolations(page)).toEqual([]);

      await plan.getByRole('button', { name: 'Change plan' }).click();
      await plan.getByLabel('Interview date').fill(await localDay(page, 0));
      await plan.getByRole('button', { name: 'Save plan' }).click();
      await expect(plan.getByRole('heading', { name: 'Interview day', level: 1 })).toBeVisible();
      await expect(plan.getByText('Good luck today. A short review at most, then rest: the work is already done.')).toBeVisible();
      await expect(plan.getByRole('region', { name: /^Today/ })).toHaveCount(0);
      expect(await seriousViolations(page)).toEqual([]);
    });
  });
}
