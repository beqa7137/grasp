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

/** Answers the widget's prediction with `choice`, and checks it was the right one. */
async function predict(widget: Locator, choice: string) {
  await widget.locator('app-widget-check fieldset').getByRole('button', { name: choice, exact: true }).click();
  await expect(widget.locator('app-widget-check').getByRole('img', { name: 'your answer, correct' })).toBeVisible();
}

const readout = (widget: Locator, name: string) => widget.locator('.readouts div').filter({ hasText: name }).locator('dd');

for (const theme of ['dark', 'light'] as const) {
  test.describe(`in the ${theme} theme`, () => {
    test.use({ theme });

    test('the feature flag case runs its bucketing and propagation models and finishes into reviews', async ({ page }) => {
      // Fourteen stages and two models in one walk take up to a minute on the WebKit iPhone.
      test.slow();
      await page.goto('/design/cases');
      await page.getByRole('link', { name: /^Feature Flag Service/ }).click();
      await expect(page.getByRole('heading', { name: 'Feature Flag Service', level: 1 })).toBeVisible();
      const stages = page.locator('li.stage');

      await decide(stages.nth(0), /^Answer at once from the last ruleset/, 'your answer, correct');
      await finishStage(stages.nth(0), 'Next: Estimate the evaluations');
      await estimate(stages.nth(1), '5M', '5,000,000 evaluations/s');
      await finishStage(stages.nth(1), 'Next: Estimate naive polling');
      await estimate(stages.nth(2), '650', '667 MB/s');
      await finishStage(stages.nth(2), 'Next: Model flags, rules and segments');
      await decide(stages.nth(3), /^One flag definition/, 'your answer, correct');
      await finishStage(stages.nth(3), 'Next: Evaluate in process');
      await decide(stages.nth(4), /^Call the flag service's evaluate endpoint/, 'your answer, wrong');
      await finishStage(stages.nth(4), 'Next: Put it together');
      await finishStage(stages.nth(5), 'Next: Bucket users consistently');

      const bucketing = stages.nth(6);
      await expect(bucketing.locator('app-bucketing-widget')).toHaveCount(0);
      await decide(bucketing, /^Hash the flag's salt together with the user id/, 'your answer, correct');
      await expect(bucketing.getByRole('heading', { name: 'Try it: bucket 1,000 users into a rollout' })).toBeVisible();
      const users = bucketing.locator('app-bucketing-widget');
      await expect(readout(users, 'In new-checkout')).toHaveText('105');
      await expect(readout(users, 'Also in search-ranking')).toHaveCount(0);
      await expect(users.getByRole('img', { name: '105 of 1,000 users in new-checkout at 10%' })).toBeVisible();
      await predict(users, '58 users');
      await expect(users.getByRole('group', { name: /^Predict: search-ranking already serves 50%/ })).toBeFocused();
      await expect(readout(users, 'Also in search-ranking')).toHaveText('58');
      expect(await seriousViolations(page)).toEqual([]);

      const stagesGroup = users.getByRole('radiogroup', { name: 'Rollout of new-checkout' });
      await stagesGroup.getByRole('radio', { name: '10%' }).focus();
      await page.keyboard.press('ArrowRight');
      await expect(stagesGroup.getByRole('radio', { name: '25%' })).toHaveAttribute('aria-checked', 'true');
      await expect(users.getByText(/new-checkout moves from 10% to 25%/)).toBeVisible();
      await predict(users, '105 users');
      await expect(readout(users, 'Stayed')).toHaveText('105');
      await expect(readout(users, 'Left')).toHaveText('0');
      await expect(readout(users, 'Joined')).toHaveText('141');
      await users.getByRole('button', { name: 'Change the salt' }).click();
      await predict(users, '68 users');
      await expect(users.getByText(/this run kept 68/)).toBeVisible();
      await users.getByRole('radio', { name: 'Random on each request' }).click();
      await predict(users, '779 users');
      await expect(readout(users, 'Saw both versions')).toHaveText('779');
      expect(await seriousViolations(page)).toEqual([]);
      await finishStage(bucketing, 'Next: Propagate changes in seconds');

      const propagation = stages.nth(7);
      await decide(propagation, /^Each SDK holds a server-sent events stream/, 'your answer, correct');
      const fleet = propagation.locator('app-propagation-widget');
      await expect(propagation.getByRole('heading', { name: 'Try it: get a flag change to every SDK' })).toBeVisible();
      await expect(fleet.locator('.readouts')).toHaveCount(0);
      await predict(fleet, '667 requests/s');
      await expect(readout(fleet, 'Leaving the service')).toHaveText('667 MB/s');
      await expect(readout(fleet, 'Last instance has it')).toHaveText('31 s');

      const delivery = fleet.getByRole('radiogroup', { name: 'Delivery' });
      await delivery.getByRole('radio', { name: 'Poll' }).focus();
      await page.keyboard.press('Home');
      await expect(delivery.getByRole('radio', { name: 'Stream (server-sent events)' })).toHaveAttribute('aria-checked', 'true');
      await expect(fleet.getByRole('checkbox')).toHaveCount(0);
      await expect(fleet.locator('.readouts')).toHaveCount(0);
      await predict(fleet, '0.7 s');
      await expect(readout(fleet, 'Stream servers')).toHaveText('2');
      const instances = fleet.getByRole('slider', { name: /^SDK instances/ });
      await instances.focus();
      await page.keyboard.press('ArrowRight');
      await expect(instances).toHaveAttribute('aria-valuetext', '21,000 instances');
      await expect(readout(fleet, 'Stream servers')).toHaveText('3');
      await expect(fleet.locator('app-widget-check fieldset')).toHaveCount(0);
      await expect(fleet.getByRole('status')).toContainText(
        'Streaming to 21,000 instances, 2 changes a minute. Last instance has a change after 0.7 s',
      );
      expect(await seriousViolations(page)).toEqual([]);
      await finishStage(propagation, 'Next: Keep a request consistent');

      await decide(stages.nth(8), /^Evaluate the flag once where the request enters/, 'your answer, correct');
      await finishStage(stages.nth(8), 'Next: Roll out safely');
      await decide(stages.nth(9), /^Staged percentages/, 'your answer, correct');
      await finishStage(stages.nth(9), 'Next: Govern environments and teams');
      await decide(stages.nth(10), /^Role-based permissions/, 'your answer, correct');
      await finishStage(stages.nth(10), 'Next: Pay down flag debt');
      await decide(stages.nth(11), /^Each flag has an owner/, 'your answer, correct');
      await finishStage(stages.nth(11), 'Next: Plan for failure');
      await decide(stages.nth(12), /^Restore the flag's previous version/, 'your answer, correct');
      await finishStage(stages.nth(12), 'Next: Operate it');

      const sync = synced(page, 'case.completed');
      await finishStage(stages.nth(13), 'Finish the case');
      await expect(page.getByText('Decisions as recommended: 9 of 10. Estimates within 2x: 2 of 2.')).toBeVisible();
      await sync;
      expect(await seriousViolations(page)).toEqual([]);
    });
  });
}

test.describe('on a 320 px screen', () => {
  test.use({ viewport: { width: 320, height: 700 } });

  test('the bucketing grid and its legend fit without scrolling sideways', async ({ page }) => {
    const stages = Array.from({ length: 7 }, (_, i) =>
      i === 1 ? { guess: '5M' } : i === 2 ? { guess: '667' } : [0, 3, 4, 6].includes(i) ? { chosen: 0 } : {},
    );
    await page.addInitScript(
      (draft) => localStorage.setItem('CapacitorStorage.grasp.case.feature-flags', draft),
      JSON.stringify({ attempt: 'e2e-320', reached: 6, stages }),
    );
    await page.goto('/design/cases/feature-flags');
    const widget = page.locator('app-bucketing-widget');
    await widget.locator('app-widget-check fieldset button').first().click();
    await expect(widget.locator('.legend-list li')).toHaveCount(4);
    for (const part of [widget.locator('.grid'), widget, widget.locator('.legend-list')]) {
      const { scroll, client } = await part.evaluate((el) => ({ scroll: el.scrollWidth, client: el.clientWidth }));
      expect(scroll).toBeLessThanOrEqual(client);
    }
    const grid = await widget.locator('.grid').boundingBox();
    const box = await widget.boundingBox();
    expect(grid!.x + grid!.width).toBeLessThanOrEqual(box!.x + box!.width);
  });
});
