import type { Page } from '@playwright/test';
import { CACHE_EXPERIMENTS, renderExperiment } from '@grasp/engine';
import { expect, test } from './fixtures';

const SHOWN = CACHE_EXPERIMENTS.map(renderExperiment);
const STORM = SHOWN.findIndex((e) => e.id === 'miss-storm');
const NINE = SHOWN.findIndex((e) => e.id === 'each-nine');

declare global {
  interface Window {
    animateCalls?: number;
  }
}

function countAnimate() {
  const animate = Element.prototype.animate;
  window.animateCalls = 0;
  Element.prototype.animate = function (this: Element, ...args: Parameters<typeof animate>) {
    window.animateCalls!++;
    return animate.apply(this, args);
  };
}

const shownWidget = (page: Page) => page.locator('app-design-lesson:not(.ion-page-hidden) app-cache-widget');

async function open(page: Page) {
  await page.goto('/design/topics/sd-caching');
  const widget = shownWidget(page);
  await widget.locator('svg.flow').waitFor();
  await widget.locator('g-stage').scrollIntoViewIfNeeded();
  const hit = widget.getByRole('slider', { name: 'Cache hit rate' });
  const capacity = widget.getByRole('slider', { name: 'Origin capacity' });
  const playhead = widget.getByRole('slider', { name: 'Time after the flush' });
  const misses = () => widget.locator('rect.cell.miss').count();
  const readouts = widget.locator('.value.readout');
  const legend = widget.locator('g-chart-frame .legend li');
  const stageHeight = async () => (await widget.locator('g-stage').boundingBox())!.height;
  const answer = async (i: number) => {
    const e = SHOWN[i];
    await widget.locator('.cards button').nth(i).click();
    await widget.locator('app-widget-check').getByRole('button', { name: e.choices[e.answer], exact: true }).click();
  };
  return { widget, hit, capacity, playhead, misses, readouts, legend, stageHeight, answer };
}

test('the caching widget draws the mechanism: the hit-rate and capacity handles move the waffle, p99 and the origin', async ({ page }) => {
  const { widget, hit, capacity, misses, readouts } = await open(page);
  await expect(readouts).toHaveText(['6 ms', '51 ms']);
  expect(await misses()).toBe(10);

  await hit.focus();
  await page.keyboard.press('ArrowLeft');
  await expect(hit).toHaveAttribute('aria-valuetext', '80% hits: 2,000/s go on to the origin');
  expect(await misses()).toBe(20);
  for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowRight');
  await expect(hit).toHaveAttribute('aria-valuetext', '99% hits: 100/s go on to the origin');
  await expect(readouts).toHaveText(['1.5 ms', '1 ms']);
  await expect(widget.locator('.p99-kind')).toHaveText('a hit');
  expect(await misses()).toBe(1);

  const box = (await hit.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x - 400, box.y + box.height / 2, { steps: 8 });
  await page.mouse.up();
  await expect(hit).toHaveAttribute('aria-valuenow', '50');
  await expect(readouts).toHaveText(['timing out', 'timing out']);
  await expect(widget.locator('.load-text')).toHaveText('5,000/s');

  await capacity.focus();
  await page.keyboard.press('End');
  await expect(capacity).toHaveAttribute('aria-valuetext', 'The origin answers up to 10,000/s');
  await expect(readouts).toHaveText(['26 ms', '51 ms']);
});

test('each caching experiment sets up in one tap, asks, then reveals the model numbers and marks where to look', async ({ page }) => {
  const { widget, hit, stageHeight } = await open(page);
  const height = await stageHeight();
  const latency = widget.getByRole('slider', { name: 'Origin latency' });
  for (const [i, e] of SHOWN.entries()) {
    if (e.goal) continue;
    await widget.locator('.cards button').nth(i).click();
    await expect(hit).toHaveAttribute('aria-valuenow', String(e.setup['hitRate']));
    await expect(latency).toHaveAttribute('aria-valuetext', `${e.setup['originMs']} ms`);
    const check = widget.locator('app-widget-check');
    await expect(check.locator('legend')).toHaveText(e.ask);
    await check.getByRole('button', { name: e.choices[e.answer], exact: true }).click();
    await expect(check.locator('.explain')).toHaveText(e.reveal);
    await expect(check.getByRole('img', { name: 'your answer, correct' })).toBeVisible();
    for (const region of e.focus) await expect(widget.locator(`[data-focus="${region}"]`)).toHaveClass(/focused/);
    expect(await stageHeight()).toBe(height);
  }
  await expect(widget.locator('.cards .done')).toHaveCount(5);
});

test('the caching challenge is met by dragging the hit rate until the mean is under the goal', async ({ page }) => {
  const { widget, hit } = await open(page);
  await widget.locator('.cards button').last().click();
  await expect(widget.locator('.status')).toHaveText('Mean now 21 ms; the goal is under 3 ms.');
  await hit.focus();
  for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowRight');
  await expect(widget.locator('.status')).toHaveText('Mean now 3 ms; the goal is under 3 ms.');
  await page.keyboard.press('ArrowRight');
  await expect(widget.locator('.status')).toHaveText('Goal met: mean 2 ms, under 3 ms.');
  await expect(widget.locator('.reveal')).toHaveText(SHOWN.at(-1)!.reveal);
});

test('a flush shows the storm over capacity, a change of setting returns to the warm steady state, and the playhead scrubs', async ({
  page,
}) => {
  const { widget, hit, playhead, readouts, legend, stageHeight } = await open(page);
  const height = await stageHeight();
  await widget.getByRole('button', { name: 'Flush the cache' }).click();
  await expect(legend).toHaveText(['origin load', 'hit rate', 'capacity', 'over capacity until 5.7 s', 'warm at 10.9 s']);
  await expect(widget.locator('.load-text')).toHaveText('10,000/s');
  await expect(widget.locator('.caption.bad tspan')).toHaveText(['5× the 2,000/s', 'it can answer']);
  await expect(readouts).toHaveText(['timing out', 'timing out']);
  await expect(hit).toHaveClass(/ghost/);
  await expect(hit).toHaveAttribute('aria-valuetext', 'Target 90% hits; now 0% while the cache refills');

  await hit.focus();
  await page.keyboard.press('ArrowRight');
  await expect(hit).toHaveAttribute('aria-valuetext', '95% hits: 500/s go on to the origin');
  await expect(hit).not.toHaveClass(/ghost/);
  await expect(widget.locator('.warm')).toHaveText('· warm again');
  await expect(legend).toContainText(['over capacity until 4.7 s, 18,000 timed out', 'warm at 10 s']);

  await playhead.focus();
  await page.keyboard.press('Home');
  await expect(readouts).toHaveText(['timing out', 'timing out']);
  await page.keyboard.press('End');
  await expect(playhead).toHaveAttribute('aria-valuetext', '20 s after the flush: 95% hits, origin 500/s');
  await expect(readouts).toHaveText(['3.5 ms', '51 ms']);
  expect(await stageHeight()).toBe(height);
});

test('the caching widget fits a 320px screen without sideways scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  const { widget } = await open(page);
  await widget.getByRole('button', { name: 'Flush the cache' }).click();
  const overflow = await page.evaluate(() => {
    const stage = document.querySelector('app-cache-widget g-stage')!.getBoundingClientRect();
    const svg = document.querySelector('app-cache-widget svg.flow')!.getBoundingClientRect();
    return { right: Math.max(stage.right, svg.right), page: document.documentElement.scrollWidth };
  });
  expect(overflow.right).toBeLessThanOrEqual(320);
  expect(overflow.page).toBeLessThanOrEqual(320);
});

test.describe('the caching widget under Reduced motion', () => {
  test.use({ motionOff: false, reducedMotion: 'reduce' });
  test.beforeEach(({ page }) => page.addInitScript(countAnimate));

  test('runs no animation through a flush and an experiment, and still labels the rates and reveals', async ({ page }) => {
    const { widget, playhead, answer } = await open(page);
    await page.evaluate(() => (window.animateCalls = 0));
    await widget.getByRole('button', { name: 'Flush the cache' }).click();
    await expect(playhead).toHaveAttribute('aria-valuenow', '0');
    await widget.getByRole('button', { name: 'Replay' }).click();
    await expect(widget.locator('.notice')).toHaveText('Back at the flush: drag the playhead under the chart to step through the refill.');
    await answer(STORM);
    await expect(widget.locator('app-widget-check .explain')).toHaveText(SHOWN[STORM].reveal);
    await expect(widget.locator('[data-focus="gauge"] .look')).toBeVisible();
    await expect(widget.locator('.load-text')).toHaveText('10,000/s');
    await expect(widget.locator('.particle')).toHaveCount(0);
    expect(await page.evaluate(() => window.animateCalls)).toBe(0);
  });
});

test.describe('the caching widget with motion', () => {
  test.use({ motionOff: false, reducedMotion: 'no-preference' });
  test.beforeEach(({ page }) => page.addInitScript(countAnimate));

  const liveDots = (page: Page) => shownWidget(page).locator('g.particles .particle:not([visibility])').count();

  test('flows request dots while in view, plays the flush to a warm cache, at the same stage height', async ({ page }) => {
    const { widget, playhead, stageHeight } = await open(page);
    const height = await stageHeight();
    await expect.poll(() => liveDots(page)).toBeGreaterThan(3);
    await widget.getByRole('button', { name: 'Flush the cache' }).click();
    await expect(widget.locator('g-chart-frame .legend')).toContainText(' timed out');
    expect(await stageHeight()).toBe(height);
    await expect(playhead).toHaveAttribute('aria-valuenow', '20', { timeout: 15_000 });
    await expect(widget.locator('.warm')).toHaveText('· warm again');
    expect(await liveDots(page)).toBeLessThanOrEqual(60);
  });

  test('Replay and Flush during a running flush, and Replay inside a flush experiment, play again from 0% hits', async ({ page }) => {
    const { widget, hit, playhead, answer } = await open(page);
    const refillsFromStart = async () => {
      await expect(hit).toHaveClass(/ghost/);
      await expect(widget.locator('.warm')).toHaveCount(0);
      expect(Number(await playhead.getAttribute('aria-valuenow'))).toBeLessThan(3);
    };
    await widget.getByRole('button', { name: 'Flush the cache' }).click();
    await expect.poll(async () => Number(await playhead.getAttribute('aria-valuenow'))).toBeGreaterThan(2);
    await widget.getByRole('button', { name: 'Replay' }).click();
    await refillsFromStart();
    await expect.poll(async () => Number(await playhead.getAttribute('aria-valuenow'))).toBeGreaterThan(2);
    await widget.getByRole('button', { name: 'Flush the cache' }).click();
    await refillsFromStart();
    await answer(STORM);
    await expect.poll(async () => Number(await playhead.getAttribute('aria-valuenow'))).toBeGreaterThan(2);
    await widget.getByRole('button', { name: 'Replay' }).click();
    await expect(widget.locator('app-widget-check .explain')).toHaveText(SHOWN[STORM].reveal);
    await refillsFromStart();
  });

  test('an answer locks the settings while it plays, and an interrupted play still reveals', async ({ page }) => {
    const { widget, hit, playhead, answer } = await open(page);
    await answer(NINE);
    await expect(widget.getByRole('button', { name: 'Flush the cache' })).toBeDisabled();
    await expect(hit).toHaveAttribute('aria-disabled', 'true');
    await expect(widget.locator('app-widget-check .explain')).toHaveText(SHOWN[NINE].reveal);
    await expect(widget.getByRole('button', { name: 'Flush the cache' })).toBeEnabled();

    await answer(STORM);
    await expect(widget.locator('app-widget-check .explain')).toHaveText('Watch the picture: the answer plays out on it.');
    await playhead.focus();
    await page.keyboard.press('End');
    await expect(widget.locator('app-widget-check .explain')).toHaveText(SHOWN[STORM].reveal);
    await expect(widget.locator('.cards .done')).toHaveCount(2);

    await widget.locator('.cards button').nth(STORM).click();
    await widget.locator('app-widget-check').getByRole('button', { name: SHOWN[STORM].choices[0], exact: true }).click();
    await widget.getByRole('button', { name: 'Replay' }).click();
    await expect(widget.locator('app-widget-check .explain')).toHaveText(SHOWN[STORM].reveal);
  });

  test('brings the stage into view when an answer or a flush starts playing on a phone', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === 'desktop', 'the desktop stage and dock fit one view');
    for (const viewport of [null, { width: 320, height: 700 }]) {
      if (viewport) await page.setViewportSize(viewport);
      const { widget, answer } = await open(page);
      const stage = widget.locator('g-stage');
      // A phone stage can be taller than the space between header and tab bar: in view means its top shows, under the
      // header, with most of the picture below it on screen.
      const inView = () =>
        stage.evaluate((el) => {
          const box = el.getBoundingClientRect();
          return box.top >= 0 && box.top < 140 && Math.min(box.bottom, window.innerHeight) - box.top > 0.8 * box.height;
        });
      await widget.locator('.cards button').nth(STORM).scrollIntoViewIfNeeded();
      expect(await inView()).toBe(false);
      await answer(STORM);
      await expect.poll(inView).toBe(true);
      await expect(widget.locator('app-widget-check .explain')).toHaveText('Watch the picture: the answer plays out on it.');
      await expect(widget.getByRole('button', { name: 'Flush the cache' })).toBeEnabled({ timeout: 15_000 });
      await widget.locator('.cards button').last().scrollIntoViewIfNeeded();
      await expect.poll(inView).toBe(false);
      await widget.getByRole('button', { name: 'Flush the cache' }).click();
      await expect.poll(inView).toBe(true);
    }
  });

  test('keeps its dots in the drawing after a tab switch away and back', async ({ page }) => {
    const { widget } = await open(page);
    await expect.poll(() => liveDots(page)).toBeGreaterThan(0);
    await page.getByRole('tab', { name: 'Today' }).click();
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
    await page.getByRole('tab', { name: 'Design' }).click();
    await expect(shownWidget(page).locator('svg.flow')).toBeVisible();
    await shownWidget(page).getByRole('button', { name: 'Flush the cache' }).click();
    await expect.poll(() => liveDots(page)).toBeGreaterThan(3);
    expect(await widget.locator('g.particles').count()).toBe(1);
  });
});
