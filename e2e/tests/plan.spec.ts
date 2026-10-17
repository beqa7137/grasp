import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { expect, section, synced, test } from './fixtures';

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

test('a learner sets an interview date, follows today’s list and the day strip, changes the time and clears the plan', async ({ page }) => {
  await page.goto('/today');
  const todayPage = page.locator('app-today');
  await todayPage.getByRole('button', { name: 'More options' }).click();
  await page.locator('ion-popover').getByRole('button', { name: 'Study plan' }).click();
  await expect(page).toHaveURL(/\/today\/plan$/);
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
  await expect(plan.getByRole('checkbox')).toHaveCount(0);
  await expect(
    plan.getByText('Rounds come from your loop (Coding ×2, System design, Behavioral). Change them in Your loop on Today or in Settings.'),
  ).toBeVisible();
  await plan.getByRole('radiogroup', { name: 'Starting point' }).getByRole('radio', { name: 'Rusty' }).click();
  await expect(plan.getByText('You have prepared before: units are a little shorter.')).toBeVisible();

  const saving = synced(page, 'plan.set');
  await plan.getByRole('button', { name: 'Save plan' }).click();
  await saving;
  const heading = plan.getByRole('heading', { name: /^20 days to \w{3} \d{1,2}$/, level: 1 });
  await expect(heading).toBeFocused();
  await expect(plan.getByRole('status')).toHaveText('Plan saved.');
  await expect(plan.getByText(/· 1 h a day · Starting point: Rusty$/)).toBeVisible();
  await expect(plan.locator('.title-row g-chip')).toHaveText(/^(On track|Tight)$/);
  await expect(
    plan.getByText(
      /At 1 h a day you cover everything by|At 1 h a day, this plan covers .* of your loop by|will not fit before your interview at 1 h a day/,
    ),
  ).toBeVisible();

  const today = plan.getByRole('region', { name: /^Today/ });
  await expect(today.getByRole('link', { name: 'Learn Arrays & Hashing' })).toBeVisible();
  await expect(today.getByRole('link', { name: /^Solve / })).toBeVisible();
  await expect(today.getByRole('link', { name: 'Review' })).toBeVisible();
  const days = plan.getByRole('radiogroup', { name: 'Your days' });
  await expect(days.getByRole('radio')).toHaveCount(21);
  await expect(days.getByRole('radio').first()).toHaveAttribute('aria-checked', 'true');
  await expect(days.getByRole('radio').last()).toHaveAccessibleName(/: Interview$/);
  await days.getByRole('radio').first().focus();
  await page.keyboard.press('ArrowRight');
  await expect(days.getByRole('radio').nth(1)).toHaveAttribute('aria-checked', 'true');
  await expect(
    plan
      .getByRole('region', { name: /^\w{3}, \w{3} \d{1,2} · about / })
      .getByRole('listitem')
      .first(),
  ).toBeVisible();
  await days.getByRole('radio').first().click();
  const rounds = plan.getByRole('region', { name: 'By round' });
  await expect(rounds).toContainText('Behavioral');
  await expect(rounds.getByRole('meter', { name: 'Coding share of the plan' })).toBeVisible();
  await expect(rounds).toContainText('50% of your loop');
  expect(await seriousViolations(page)).toEqual([]);

  await today.getByRole('link', { name: 'Learn Arrays & Hashing' }).click();
  await expect(page).toHaveURL(/\/coding\/patterns\/hashing$/);
  await page.goBack();
  await expect(heading).toBeVisible();

  await page.reload();
  await expect(heading).toBeVisible();

  await plan.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(plan.getByRole('heading', { name: 'Change your plan', level: 1 })).toBeFocused();
  await expect(plan.getByLabel('Interview date')).toHaveValue(await localDay(page, 20));
  await plan.getByRole('radiogroup', { name: 'Time a day' }).getByRole('radio', { name: '30 min', exact: true }).click();
  await plan.getByRole('button', { name: 'Save plan' }).click();
  await expect(plan.getByRole('status')).toHaveText('Plan updated.');
  await expect(plan.getByText(/· 30 min a day · Starting point: Rusty$/)).toBeVisible();

  await section(page, 'Today').click();
  await expect(todayPage.getByRole('heading', { level: 1 })).toHaveText(/^Mid-level loop \(assumed\) · .* · 20 days left · 30 min a day$/);
  await todayPage.getByRole('button', { name: 'More options' }).click();
  await page.locator('ion-popover').getByRole('button', { name: 'Study plan' }).click();

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
  await expect(plan.getByRole('heading', { name: /^20 days to /, level: 1 })).toBeFocused();
  await expect(plan.getByRole('status')).toHaveText('Plan restored.');
  await expect(plan.locator('.date')).toHaveText(dateLine);
  await expect(today.getByRole('link', { name: 'Learn Arrays & Hashing' })).toBeVisible();
});

test('a cleared plan stays cleared once its Undo has gone, and focus on Undo moves to the heading', async ({ page }) => {
  await page.clock.install();
  await page.goto('/today/plan');
  const plan = page.locator('app-plan');
  await plan.getByLabel('Interview date').fill(await localDay(page, 20));
  await plan.getByRole('button', { name: 'Save plan' }).click();
  await expect(plan.getByRole('heading', { name: /^20 days to /, level: 1 })).toBeVisible();

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
      await page.goto('/today/plan');
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
      await expect(plan.getByText(/· 30 min a day · Starting point: New$/)).toBeVisible();
      await expect(plan.locator('.title-row g-chip')).toHaveText('Review only');
      await expect(plan.getByRole('radiogroup', { name: 'Your days' }).getByRole('radio')).toHaveCount(2);
      expect(await seriousViolations(page)).toEqual([]);

      await plan.getByRole('button', { name: 'Edit', exact: true }).click();
      await plan.getByLabel('Interview date').fill(await localDay(page, 0));
      await plan.getByRole('button', { name: 'Save plan' }).click();
      await expect(plan.getByRole('heading', { name: 'Interview day', level: 1 })).toBeVisible();
      await expect(plan.getByText('Good luck today. A short review at most, then rest and trust what you have practiced.')).toBeVisible();
      await expect(plan.getByRole('region', { name: /^Today/ })).toHaveCount(0);
      await expect(plan.getByRole('region', { name: 'By round' })).toHaveCount(0);
      await expect(plan.getByRole('radiogroup', { name: 'Your days' })).toHaveCount(0);
      await expect(plan.getByText(/a day$/)).toHaveCount(0);
      expect(await seriousViolations(page)).toEqual([]);
    });
  });
}
