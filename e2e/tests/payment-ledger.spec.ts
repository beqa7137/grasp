import AxeBuilder from '@axe-core/playwright';
import type { Locator, Page } from '@playwright/test';
import { expect, synced, test } from './fixtures';

test.use({ contextOptions: { reducedMotion: 'reduce' } });

async function seriousViolations(page: Page): Promise<string[]> {
  const { violations } = await new AxeBuilder({ page })
    .include('app-case-study')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'])
    .analyze();
  return violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(', ')}`);
}

/** Opens every point of the stage and moves on to the next one. */
async function finishStage(stage: Locator, next: string | RegExp) {
  await stage.getByRole('button', { name: 'Show the model answer' }).click();
  await stage.getByRole('button', { name: 'Show all' }).click();
  await stage.getByRole('button', { name: next }).click();
}

async function decide(stage: Locator, option: RegExp, mark: 'your answer, correct' | 'your answer, wrong') {
  await stage.locator('fieldset').first().getByRole('button', { name: option }).click();
  await expect(stage.getByRole('img', { name: mark }).first()).toBeVisible();
}

async function estimate(stage: Locator, guess: string, shown: string) {
  await stage.getByRole('textbox').fill(guess);
  await stage.getByRole('button', { name: 'Check', exact: true }).click();
  await expect(stage.getByRole('status').filter({ hasText: shown })).toContainText('Spot on.');
}

const readout = (widget: Locator, name: string) => widget.locator('.readouts div').filter({ hasText: name }).locator('dd');

for (const theme of ['dark', 'light'] as const) {
  test.describe(`in the ${theme} theme`, () => {
    test.use({ theme });

    test('the payment ledger case runs its retry, hot account and reconciliation models and finishes into reviews', async ({ page }) => {
      // Thirteen stages and three models in one walk take up to a minute on the WebKit iPhone.
      test.slow();
      await page.goto('/design/cases');
      await page.getByRole('link', { name: /^Payment Ledger/ }).click();
      await expect(page.getByRole('heading', { name: 'Payment Ledger', level: 1 })).toBeVisible();
      const stages = page.locator('li.stage');

      await decide(stages.nth(0), /^An error it can retry/, 'your answer, correct');
      await finishStage(stages.nth(0), 'Next: Estimate the write load');
      await estimate(stages.nth(1), '18.5k', '18,519 postings/s');
      await finishStage(stages.nth(1), 'Next: Estimate the storage');
      await estimate(stages.nth(2), '30', '29 TB');
      await finishStage(stages.nth(2), 'Next: Model money as double entry');
      await decide(stages.nth(3), /^A balance column per account/, 'your answer, wrong');
      await finishStage(stages.nth(3), 'Next: Make posting idempotent');

      const api = stages.nth(4);
      await expect(api.locator('app-retry-widget')).toHaveCount(0);
      await decide(api, /^The request carries an idempotency key/, 'your answer, correct');
      const retries = api.locator('app-retry-widget');
      await expect(api.getByRole('heading', { name: 'Try it: retries with and without idempotency keys' })).toBeVisible();
      await retries.getByRole('button', { name: 'Posted twice' }).click();
      const answered = retries.getByRole('group', { name: 'Predict: how many capture entries does the ledger post?' });
      await expect(answered).toBeFocused();
      await expect(answered.getByRole('img', { name: 'your answer, correct' })).toBeVisible();
      await expect(retries.locator('.steps li')).toHaveCount(2);
      expect(await seriousViolations(page)).toEqual([]);

      const keys = retries.getByRole('radiogroup', { name: 'Idempotency key' });
      await keys.getByRole('radio', { name: 'No key' }).focus();
      await page.keyboard.press('End');
      await expect(keys.getByRole('radio', { name: 'One key per payment' })).toHaveAttribute('aria-checked', 'true');
      await retries.getByRole('button', { name: 'Posted once' }).click();
      await expect(retries.getByRole('img', { name: 'your answer, correct' })).toBeVisible();
      await expect(retries.getByText(/returns the stored entry, posting nothing/)).toBeVisible();
      await retries.getByRole('button', { name: 'Lost every time' }).click();
      await retries.getByRole('button', { name: 'Posted 4 times' }).click();
      await expect(retries.getByRole('img', { name: 'your answer, wrong' })).toBeVisible();
      await expect(retries.getByText(/gave up after 4 attempts/)).toBeVisible();
      await finishStage(api, 'Next: Put it together');

      await finishStage(stages.nth(5), 'Next: Post an entry atomically');
      await decide(stages.nth(6), /SERIALIZABLE/, 'your answer, wrong');
      await finishStage(stages.nth(6), 'Next: Cool down hot accounts');

      const hot = stages.nth(7);
      await expect(hot.locator('app-hot-account-widget')).toHaveCount(0);
      await estimate(hot, '17', '17 sub-accounts');
      const widget = hot.locator('app-hot-account-widget');
      await expect(readout(widget, 'Capacity')).toHaveText('200/s');
      await expect(readout(widget, 'Committed')).toHaveCount(0);
      const rows = widget.getByRole('slider', { name: /^Sub-accounts/ });
      await rows.focus();
      for (let i = 0; i < 15; i++) await page.keyboard.press('ArrowRight');
      await expect(rows).toHaveAttribute('aria-valuetext', '16 sub-accounts');
      await expect(readout(widget, 'Capacity')).toHaveText('3,200/s');
      await widget.locator('fieldset button').first().click();
      await expect(readout(widget, 'Busy')).toHaveText('72%');
      await expect(readout(widget, 'Wait per posting')).toHaveText('11 ms');
      const right = (await widget.locator('li.right span').first().textContent())!.trim();
      await widget.getByRole('button', { name: 'Apply the change' }).click();
      const last = widget.getByRole('group', { name: 'Your last prediction' });
      await expect(last).toBeFocused();
      await expect(last).toContainText('Applied: Predict: if you split the account into 32 sub-accounts');
      await widget.locator('fieldset button').first().click();
      await expect(last).toHaveCount(0);
      await expect(readout(widget, 'Committed')).toHaveText(right.replace(' postings/s', '/s'));
      expect(await seriousViolations(page)).toEqual([]);
      await finishStage(hot, 'Next: Shard the ledger');

      await decide(stages.nth(8), /^The account owner/, 'your answer, correct');
      await finishStage(stages.nth(8), 'Next: Read balances and statements fast');
      await estimate(stages.nth(9), '72M', '72,000,000 postings');
      await finishStage(stages.nth(9), 'Next: Stay consistent across services');
      await decide(stages.nth(10), /^Each service commits its change with an outbox row/, 'your answer, correct');
      await finishStage(stages.nth(10), 'Next: Reconcile with processors and banks');

      const recon = stages.nth(11);
      await decide(recon, /^Post the first capture now/, 'your answer, correct');
      const day = recon.locator('app-reconcile-widget');
      const orders = day.locator('app-widget-check');
      await expect(orders).toHaveCount(5);
      for (let i = 0; i < 5; i++) await orders.nth(i).getByRole('button', { name: 'Nothing: it matches' }).click();
      await expect(day.getByRole('status')).toContainText('2 of 5 right.');
      expect(await seriousViolations(page)).toEqual([]);
      await day.getByRole('button', { name: 'Another day' }).click();
      await expect(day.getByText(/^\s*Day 2\./)).toBeFocused();
      await expect(day.getByRole('status')).toHaveText('');
      await finishStage(recon, 'Next: Operate and audit it');

      const sync = synced(page, 'case.completed');
      await finishStage(stages.nth(12), 'Finish the case');
      await expect(page.getByText('Decisions as recommended: 5 of 7. Estimates within 2x: 4 of 4.')).toBeVisible();
      await sync;
      expect(await seriousViolations(page)).toEqual([]);
    });
  });
}
