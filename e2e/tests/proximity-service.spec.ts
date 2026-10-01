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

    test('the proximity case runs its cell and quadtree models and finishes into reviews', async ({ page }) => {
      // Fourteen stages and two models in one walk take up to a minute on the WebKit iPhone.
      test.slow();
      await page.goto('/design');
      await page.getByRole('link', { name: /^Proximity Service/ }).click();
      await expect(page.getByRole('heading', { name: 'Proximity Service', level: 1 })).toBeVisible();
      const stages = page.locator('li.stage');

      await decide(stages.nth(0), /^The business page shows the edit as soon as it is saved/, 'your answer, correct');
      await finishStage(stages.nth(0), 'Next: Estimate the search load');
      await estimate(stages.nth(1), '17k', '17,361 searches/s');
      await finishStage(stages.nth(1), 'Next: Estimate storage and the index');
      await estimate(stages.nth(2), '200', '200 GB');
      await finishStage(stages.nth(2), 'Next: Design the API');
      await decide(stages.nth(3), /^A page token from the first response/, 'your answer, correct');
      await finishStage(stages.nth(3), 'Next: Choose a spatial index');
      await decide(stages.nth(4), /^A B-tree on \(latitude, longitude\)/, 'your answer, wrong');
      await finishStage(stages.nth(4), 'Next: Put it together');
      await finishStage(stages.nth(5), 'Next: Search geohash cells and their neighbours');

      const cellsStage = stages.nth(6);
      await expect(cellsStage.locator('app-cells-widget')).toHaveCount(0);
      await decide(cellsStage, /^The user's cell and its 8 neighbours, at a precision/, 'your answer, correct');
      await expect(cellsStage.getByRole('heading', { name: 'Try it: search geohash cells around a user' })).toBeVisible();
      const cells = cellsStage.locator('app-cells-widget');
      await expect(readout(cells, 'Within the radius')).toHaveText('40');
      await expect(readout(cells, 'Found')).toHaveCount(0);
      await expect(
        cells.getByRole('img', { name: "Map of the user's cell at precision 6, with a 0.5 km circle holding 40 places" }),
      ).toBeVisible();
      await predict(cells, '14 places');
      await expect(cells.getByRole('group', { name: /^Predict: 40 places lie within 0.5 km/ })).toBeFocused();
      await expect(readout(cells, 'Found')).toHaveText('14');
      await expect(readout(cells, 'Missed')).toHaveText('26');
      expect(await seriousViolations(page)).toEqual([]);

      const precision = cells.getByRole('radiogroup', { name: 'Geohash precision' });
      await precision.getByRole('radio', { name: '6' }).focus();
      await page.keyboard.press('ArrowRight');
      await expect(precision.getByRole('radio', { name: '7' })).toHaveAttribute('aria-checked', 'true');
      await expect(readout(cells, 'Found')).toHaveCount(0);
      await predict(cells, '3 places');
      await cells.getByRole('radio', { name: 'The cell and its 8 neighbours' }).click();
      await expect(cells.getByText(/How many of the 40 places does it miss\?/)).toBeVisible();
      await predict(cells, '30 places');
      await expect(readout(cells, 'Missed')).toHaveText('30');
      const radius = cells.getByRole('slider', { name: /^Radius/ });
      await radius.focus();
      await page.keyboard.press('ArrowLeft');
      await expect(radius).toHaveAttribute('aria-valuetext', '400 metres');
      await expect(readout(cells, 'Missed')).toHaveText('14');
      await expect(cells.locator('app-widget-check fieldset')).toHaveCount(0);
      await expect(cells.getByRole('status')).toContainText(
        'Precision 7, the cell and its 8 neighbours, 0.4 km: 24 places within the radius. It reads 10 places, finds 10 and misses 14.',
      );
      expect(await seriousViolations(page)).toEqual([]);
      await finishStage(cellsStage, 'Next: Adapt to density with a quadtree');

      const treeStage = stages.nth(7);
      await decide(treeStage, /^An in-memory quadtree/, 'your answer, correct');
      await expect(treeStage.getByRole('heading', { name: 'Try it: build a quadtree over 10,000 places' })).toBeVisible();
      const tree = treeStage.locator('app-quadtree-widget');
      await expect(tree.locator('.readouts')).toHaveCount(0);
      await predict(tree, '7 levels');
      await expect(readout(tree, 'Nodes')).toHaveText('353');
      await expect(readout(tree, 'Memory at 200 million')).toHaveText('6.9 GB');
      const capacity = tree.getByRole('slider', { name: /^Most places a leaf holds/ });
      await capacity.focus();
      await page.keyboard.press('ArrowLeft');
      await expect(capacity).toHaveAttribute('aria-valuetext', '95 places a leaf');
      await expect(readout(tree, 'Nodes')).toHaveText('365');
      await expect(tree.locator('app-widget-check fieldset')).toHaveCount(0);
      const pattern = tree.getByRole('radiogroup', { name: 'Where the places are' });
      await pattern.getByRole('radio', { name: 'One city' }).focus();
      await page.keyboard.press('ArrowRight');
      await expect(pattern.getByRole('radio', { name: 'Three cities' })).toHaveAttribute('aria-checked', 'true');
      await expect(tree.locator('.readouts')).toHaveCount(0);
      await predict(tree, '7 levels');
      await expect(readout(tree, 'Nodes')).toHaveText('345');
      await expect(tree.getByRole('status')).toContainText(
        '10,000 places around three cities, at most 95 a leaf. 7 levels deep, 345 nodes',
      );
      expect(await seriousViolations(page)).toEqual([]);
      await finishStage(treeStage, 'Next: Filter, rank and page the candidates');

      await decide(stages.nth(8), /^Compute each one's haversine distance/, 'your answer, correct');
      await finishStage(stages.nth(8), 'Next: Scale the reads');
      await decide(stages.nth(9), /^A full copy of the index on every search server/, 'your answer, correct');
      await finishStage(stages.nth(9), 'Next: Update the index');
      await decide(stages.nth(10), /^Build a new versioned snapshot nightly/, 'your answer, correct');
      await finishStage(stages.nth(10), 'Next: Handle sparse places, the edges of the map and moving users');
      await decide(stages.nth(11), /^Search the 9 cells at a precision for a small default radius/, 'your answer, correct');
      await finishStage(stages.nth(11), 'Next: Plan for failure');
      await decide(stages.nth(12), /^Validate it before shipping/, 'your answer, correct');
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

  for (const [reached, selector] of [
    [6, 'app-cells-widget'],
    [7, 'app-quadtree-widget'],
  ] as const) {
    test(`the ${selector} map, legend and readouts fit without scrolling sideways`, async ({ page }) => {
      const stages = Array.from({ length: reached + 1 }, (_, i) =>
        i === 1 ? { guess: '17k' } : i === 2 ? { guess: '200' } : [0, 3, 4, 6, 7].includes(i) ? { chosen: 0 } : {},
      );
      await page.addInitScript(
        (draft) => localStorage.setItem('CapacitorStorage.grasp.case.proximity-service', draft),
        JSON.stringify({ attempt: `e2e-320-${reached}`, reached, stages }),
      );
      await page.goto('/design/case/proximity-service');
      const widget = page.locator(selector);
      await widget.locator('app-widget-check fieldset button').first().click();
      await expect(widget.locator('.readouts')).toBeVisible();
      for (const part of [widget.locator('svg.map'), widget, widget.locator('.legend-list'), widget.locator('.readouts')]) {
        const { scroll, client } = await part.evaluate((el) => ({ scroll: el.scrollWidth, client: el.clientWidth }));
        expect(scroll).toBeLessThanOrEqual(client);
      }
      const map = await widget.locator('svg.map').boundingBox();
      const box = await widget.boundingBox();
      expect(map!.x + map!.width).toBeLessThanOrEqual(box!.x + box!.width);
    });
  }
});
