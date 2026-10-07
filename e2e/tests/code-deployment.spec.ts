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

const readout = (widget: Locator, name: string) =>
  widget
    .locator('.readouts div')
    .filter({ has: widget.page().getByText(name, { exact: true }) })
    .locator('dd');

for (const theme of ['dark', 'light'] as const) {
  test.describe(`in the ${theme} theme`, () => {
    test.use({ theme });

    test('the deployment case runs its distribution and rollout models and finishes into reviews', async ({ page }) => {
      // Fifteen stages and two models in one walk take over a minute on the WebKit iPhone.
      test.slow();
      await page.goto('/design/cases');
      await page.getByRole('link', { name: /^Code Deployment System/ }).click();
      await expect(page.getByRole('heading', { name: 'Code Deployment System', level: 1 })).toBeVisible();
      const stages = page.locator('li.stage');

      await decide(stages.nth(0), /^A bad release is caught while it runs on a small, known slice/, 'your answer, correct');
      await finishStage(stages.nth(0), 'Next: Estimate the deploy rate');
      await estimate(stages.nth(1), '1k', '1,000 deploys/hour');
      await finishStage(stages.nth(1), 'Next: Estimate the artifact fan-out');
      await estimate(stages.nth(2), '133', '133 minutes');
      await finishStage(stages.nth(2), 'Next: Design the deploy API');
      await decide(stages.nth(3), /^A release: the service, the artifact's digest/, 'your answer, correct');
      await finishStage(stages.nth(3), 'Next: Model deployments and locks');
      await decide(stages.nth(4), /^A global lock/, 'your answer, wrong');
      await finishStage(stages.nth(4), 'Next: Put it together');
      await finishStage(stages.nth(5), 'Next: Build once, sign and keep');
      await decide(stages.nth(6), /^The artifact built once by a hermetic build/, 'your answer, correct');
      await finishStage(stages.nth(6), 'Next: Get the artifact to every server');

      const shipStage = stages.nth(7);
      await expect(shipStage.locator('app-artifact-distribution-widget')).toHaveCount(0);
      await decide(shipStage, /^A cache in each region fetches it from the origin once/, 'your answer, correct');
      await expect(shipStage.getByRole('heading', { name: 'Try it: get a release to every server' })).toBeVisible();
      const ship = shipStage.locator('app-artifact-distribution-widget');
      await expect(readout(ship, 'Each host gets')).toHaveText('500 MB');
      await expect(readout(ship, 'Every host has it')).toHaveCount(0);
      await expect(ship.locator('.tiers')).toHaveCount(0);
      await predict(ship, '13 min 20 s');
      await expect(ship.getByRole('group', { name: /^Predict: a 500 MB artifact goes to 20,000 hosts/ })).toBeFocused();
      await expect(readout(ship, 'Every host has it')).toHaveText('13 min 20 s');
      await expect(readout(ship, 'Leaves the origin')).toHaveText('2.5 GB');
      await expect(ship.getByRole('img', { name: /the bottleneck is the regional caches' links$/ })).toBeVisible();
      expect(await seriousViolations(page)).toEqual([]);

      const caches = ship.getByRole('slider', { name: /^Regional caches/ });
      await caches.focus();
      await page.keyboard.press('ArrowLeft');
      await expect(caches).toHaveAttribute('aria-valuetext', '2 caches');
      await expect(readout(ship, 'Every host has it')).toHaveText('33 min 20 s');
      await expect(ship.locator('app-widget-check fieldset')).toHaveCount(0);
      await expect(ship.getByRole('status')).toHaveText(
        "500 megabytes to 20,000 hosts, origin 10 gigabits a second, 2 caches, each host on its own. Every host has it in 33 min 20 s; 1 GB leaves the origin; the bottleneck is the regional caches' links.",
      );
      const download = ship.getByRole('radiogroup', { name: 'How hosts download' });
      await download.getByRole('radio', { name: 'Each on its own' }).focus();
      await page.keyboard.press('ArrowRight');
      await expect(download.getByRole('radio', { name: 'Peer to peer' })).toHaveAttribute('aria-checked', 'true');
      await expect(readout(ship, 'Every host has it')).toHaveCount(0);
      await predict(ship, '4 s');
      await expect(readout(ship, 'Every host has it')).toHaveText('4 s');
      await expect(readout(ship, 'Leaves the origin')).toHaveText('1 GB');
      expect(await seriousViolations(page)).toEqual([]);
      await finishStage(shipStage, 'Next: Roll out in waves');

      const rollStage = stages.nth(8);
      await decide(rollStage, /^The canary is compared automatically with a baseline/, 'your answer, correct');
      await expect(rollStage.locator('app-rollout-plan-widget')).toHaveCount(0);
      await estimate(rollStage, '225', '225 minutes');
      await expect(rollStage.getByRole('heading', { name: 'Try it: roll a bad build out in waves' })).toBeVisible();
      const roll = rollStage.locator('app-rollout-plan-widget');
      await expect(roll.locator('.plan')).toHaveText('Canary 20, then 495, 495, 495, 495 hosts; 100 at a time.');
      await expect(roll.locator('.readouts')).toHaveCount(0);
      await predict(roll, '20 hosts');
      await expect(readout(roll, 'Rollout takes')).toHaveText('3 h 45 min');
      await expect(readout(roll, 'Bad build reached')).toHaveText('20 hosts, 1%');
      await expect(roll.getByRole('img', { name: /^Hosts on the new build over 3 h 45 min/ })).toBeVisible();
      expect(await seriousViolations(page)).toEqual([]);

      const detect = roll.getByRole('slider', { name: /^Analysis flags a bad build after/ });
      await detect.focus();
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('ArrowRight');
      await expect(detect).toHaveAttribute('aria-valuetext', '45 minutes');
      await expect(readout(roll, 'Bad build reached')).toHaveText('320 hosts, 16%');
      await expect(roll.getByRole('status')).toHaveText(
        '2,000 hosts, a 1% canary, 4 equal waves, bakes of 30 minutes, 5% at a time, 5 minutes a batch, alarm after 45 minutes. Done in 3 h 45 min; the bad build reaches 320 hosts, 16%, before the alarm.',
      );
      const shape = roll.getByRole('radiogroup', { name: 'How the hosts after the canary are split' });
      await shape.getByRole('radio', { name: 'Equal waves' }).focus();
      await page.keyboard.press('ArrowRight');
      await expect(shape.getByRole('radio', { name: 'Each wave doubles' })).toHaveAttribute('aria-checked', 'true');
      await expect(roll.locator('.readouts')).toHaveCount(0);
      await predict(roll, '3 h 55 min');
      await expect(readout(roll, 'Rollout takes')).toHaveText('3 h 55 min');
      await expect(readout(roll, 'Bad build reached')).toHaveText('152 hosts, 7.6%');
      expect(await seriousViolations(page)).toEqual([]);
      await finishStage(rollStage, 'Next: Judge health and roll back automatically');

      await decide(stages.nth(9), /^Compare its metrics/, 'your answer, correct');
      await finishStage(stages.nth(9), 'Next: Drive hosts by desired state');
      await decide(stages.nth(10), /^Keep running whatever release each has/, 'your answer, correct');
      await finishStage(stages.nth(10), 'Next: Change the schema separately');
      await decide(stages.nth(11), /^Expand and contract/, 'your answer, correct');
      await finishStage(stages.nth(11), 'Next: Separate config, flags and code');
      await decide(stages.nth(12), /^Turn the flag off/, 'your answer, correct');
      await finishStage(stages.nth(12), 'Next: Plan for failure');
      await decide(stages.nth(13), /^Agents check every artifact/, 'your answer, correct');
      await finishStage(stages.nth(13), 'Next: Operate it');

      const sync = synced(page, 'case.completed');
      await finishStage(stages.nth(14), 'Finish the case');
      await expect(page.getByText('Decisions as recommended: 10 of 11. Estimates within 2x: 3 of 3.')).toBeVisible();
      await sync;
      expect(await seriousViolations(page)).toEqual([]);
    });
  });
}

test.describe('on a 320 px screen', () => {
  test.use({ viewport: { width: 320, height: 700 } });

  for (const [reached, selector, drawing] of [
    [7, 'app-artifact-distribution-widget', '.tiers'],
    [8, 'app-rollout-plan-widget', 'svg.chart'],
  ] as const) {
    test(`the ${selector} drawing, legend and readouts fit without scrolling sideways`, async ({ page }) => {
      const decided = [0, 3, 4, 6, 7, 8];
      const guesses: Record<number, string> = { 1: '1k', 2: '133', 8: '225' };
      const stages = Array.from({ length: reached + 1 }, (_, i) => ({
        ...(i in guesses ? { guess: guesses[i] } : {}),
        ...(decided.includes(i) ? { chosen: 0 } : {}),
      }));
      await page.addInitScript(
        (draft) => localStorage.setItem('CapacitorStorage.grasp.case.code-deployment', draft),
        JSON.stringify({ attempt: `e2e-320-${reached}`, reached, stages }),
      );
      await page.goto('/design/cases/code-deployment');
      const widget = page.locator(selector);
      await widget.locator('app-widget-check fieldset button').first().click();
      await expect(widget.locator('.readouts div').nth(2)).toBeVisible();
      for (const part of [widget.locator(drawing), widget, widget.locator('.legend-list'), widget.locator('.readouts')]) {
        const { scroll, client } = await part.evaluate((el) => ({ scroll: el.scrollWidth, client: el.clientWidth }));
        expect(scroll).toBeLessThanOrEqual(client);
      }
      const shown = await widget.locator(drawing).boundingBox();
      const box = await widget.boundingBox();
      expect(shown!.x + shown!.width).toBeLessThanOrEqual(box!.x + box!.width);
    });
  }
});
