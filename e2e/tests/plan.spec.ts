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

  const date = plan.getByLabel('Interview date');
  await plan.getByRole('button', { name: 'Save plan' }).click();
  await expect(plan.getByRole('alert')).toHaveText('Choose an interview date from today to a year from now.');
  await expect(date).toBeFocused();
  await expect(date).toHaveAttribute('aria-invalid', 'true');
  await expect(date).toHaveAccessibleDescription(/If your rounds are on different days, choose the first\. Choose an interview date/);
  const firstAlert = await plan.getByRole('alert').elementHandle();
  await plan.getByRole('button', { name: 'Save plan' }).click();
  await expect(plan.getByRole('alert')).toHaveText('Choose an interview date from today to a year from now.');
  expect(await plan.getByRole('alert').evaluate((el, first) => el !== first, firstAlert), 'a repeated error is announced again').toBe(true);

  await plan.getByLabel('Interview date').fill(await localDay(page, 20));
  const minutes = plan.getByRole('radiogroup', { name: 'Time a day' });
  await minutes.getByRole('radio', { name: '30 min', exact: true }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(minutes.getByRole('radio', { name: '45 min', exact: true })).toHaveAttribute('aria-checked', 'true');
  await page.keyboard.press('ArrowRight');
  await expect(minutes.getByRole('radio', { name: '1 h', exact: true })).toBeFocused();
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

  const dateLine = (await plan.locator('.date').textContent())!;
  const confirm = page.getByRole('alertdialog', { name: 'Clear your plan?' });
  await plan.getByRole('button', { name: 'Clear plan' }).focus();
  await page.keyboard.press('Enter');
  await expect(confirm).toContainText('Your progress stays.');
  await confirm.getByRole('button', { name: 'Cancel' }).click();
  await expect(confirm).toBeHidden();
  await expect(plan.getByRole('button', { name: 'Clear plan' })).toBeFocused();
  await expect(plan.locator('.date')).toHaveText(dateLine);

  const clearing = synced(page, 'plan.set');
  await plan.getByRole('button', { name: 'Clear plan' }).click();
  await confirm.getByRole('button', { name: 'Clear plan' }).click();
  await clearing;
  await expect(plan.getByRole('heading', { name: 'Plan to your interview', level: 1 })).toBeFocused();
  await expect(plan.getByRole('status')).toHaveText('Plan cleared. You can undo for 8 seconds.');

  const restoring = synced(page, 'plan.set');
  await plan.getByRole('button', { name: 'Undo' }).click();
  await restoring;
  await expect(plan.getByRole('heading', { name: 'Interview in 20 days', level: 1 })).toBeFocused();
  await expect(plan.getByRole('status')).toHaveText('Plan restored.');
  await expect(plan.locator('.date')).toHaveText(dateLine);
  await expect(today.getByRole('link', { name: 'A story for Ownership' })).toBeVisible();
  await expect(today.getByRole('link', { name: /^Learn / })).toHaveCount(0);
});

test('a cleared plan stays cleared once its Undo has gone, and focus on Undo moves to the heading', async ({ page }) => {
  await page.clock.install();
  await page.goto('/plan');
  const plan = page.locator('app-plan');
  await plan.getByLabel('Interview date').fill(await localDay(page, 20));
  await plan.getByRole('button', { name: 'Save plan' }).click();
  await expect(plan.getByRole('heading', { name: 'Interview in 20 days', level: 1 })).toBeVisible();

  const clearing = synced(page, 'plan.set');
  await plan.getByRole('button', { name: 'Clear plan' }).click();
  await page.getByRole('alertdialog', { name: 'Clear your plan?' }).getByRole('button', { name: 'Clear plan' }).click();
  const undo = plan.getByRole('button', { name: 'Undo' });
  await expect(undo).toBeVisible();
  await clearing;
  await undo.focus();
  await page.clock.fastForward(8_000);
  await expect(undo).toBeHidden();
  await expect(plan.getByRole('heading', { name: 'Plan to your interview', level: 1 })).toBeFocused();

  await page.reload();
  await expect(plan.getByRole('heading', { name: 'Plan to your interview', level: 1 })).toBeVisible();
});

for (const theme of ['dark', 'light'] as const) {
  test.describe(`in the ${theme} theme`, () => {
    test.use({ theme });

    test('an interview tomorrow asks only for a light review today, and the day itself only for rest', async ({ page }) => {
      await page.goto('/plan');
      const plan = page.locator('app-plan');
      await expect(plan.getByRole('heading', { name: 'Plan to your interview' })).toBeVisible();
      expect(await seriousViolations(page)).toEqual([]);

      await plan.getByLabel('Interview date').fill(await localDay(page, 1));
      await plan.getByRole('button', { name: 'Save plan' }).click();
      await expect(plan.getByRole('heading', { name: 'Interview tomorrow', level: 1 })).toBeVisible();
      await expect(plan.getByText(/will not fit/)).toHaveCount(0);
      await expect(plan.getByText(/would not all fit/)).toHaveCount(0);
      await expect(plan.getByText('Tomorrow is the day. Keep today light: a short review, then rest.')).toBeVisible();
      await expect(
        plan
          .getByRole('region', { name: /^Today/ })
          .getByText('Review only today, so you arrive rested. Leave anything new for after the interview.'),
      ).toBeVisible();
      await expect(plan.getByText(/· 30 min a day$/)).toBeVisible();
      await expect(plan.getByRole('region', { name: 'Coming up' })).toHaveCount(0);
      expect(await seriousViolations(page)).toEqual([]);

      await plan.getByRole('button', { name: 'Change plan' }).click();
      await plan.getByLabel('Interview date').fill(await localDay(page, 0));
      await plan.getByRole('button', { name: 'Save plan' }).click();
      await expect(plan.getByRole('heading', { name: 'Interview day', level: 1 })).toBeVisible();
      await expect(plan.getByText('Good luck today. A short review at most, then rest and trust what you have practised.')).toBeVisible();
      await expect(plan.getByRole('region', { name: /^Today/ })).toHaveCount(0);
      await expect(plan.getByRole('region', { name: 'Still to learn' })).toHaveCount(0);
      await expect(plan.getByText(/a day$/)).toHaveCount(0);
      expect(await seriousViolations(page)).toEqual([]);
    });
  });
}
