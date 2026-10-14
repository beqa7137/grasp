import type { Page } from '@playwright/test';
import { LB_EXPERIMENTS, renderExperiment } from '@grasp/engine';
import { expect, test } from './fixtures';

const SHOWN = LB_EXPERIMENTS.map(renderExperiment);
const SLOW = SHOWN.findIndex((e) => e.id === 'one-slow-server');
const GOAL = SHOWN.findIndex((e) => e.goal);

declare global {
  interface Window {
    animateCalls?: number;
    longTasks?: number[];
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

const shownWidget = (page: Page) => page.locator('app-design-lesson:not(.ion-page-hidden) app-balancer-widget');

async function open(page: Page) {
  await page.goto('/design/topics/sd-load-balancing');
  const widget = shownWidget(page);
  await widget.locator('svg.fleet').waitFor();
  await widget.locator('g-stage.fleet-stage').scrollIntoViewIfNeeded();
  // The worker's first answers: the run, the sweep and the experiments.
  await expect(widget.locator('.value.big')).toHaveText('82 ms');
  await expect(widget.locator('g-chart-frame.chart text.end')).toHaveCount(4);
  const slider = (name: string) => widget.getByRole('slider', { name, exact: true });
  const stageHeight = async () => (await widget.locator('g-stage.fleet-stage').boundingBox())!.height;
  const answer = async (i: number) => {
    const e = SHOWN[i];
    await widget.locator('.cards button').nth(i).click();
    await widget.locator('app-widget-check').getByRole('button', { name: e.choices[e.answer], exact: true }).click();
  };
  return { widget, slider, stageHeight, answer };
}

test('the load balancing widget draws the fleet: handles on the picture set the slow server, fleet size and load', async ({ page }) => {
  const { widget, slider } = await open(page);
  const lanes = widget.locator('canvas.lanes');
  await expect(lanes).toHaveAttribute('data-servers', '10');

  await slider('Slow server').focus();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await expect(slider('Slow server')).toHaveAttribute('aria-valuetext', 'S1 is 5 times slower than the others');
  await expect(widget.locator('.value.big')).toHaveText('64.7 s');
  await expect(widget.locator('.count').first()).toHaveText('1,379');
  await expect(widget.locator('rect.share')).toHaveClass(/bad/);

  await widget.getByRole('radio', { name: 'Least connections' }).check();
  await expect(widget.locator('.value.big')).toHaveText('81 ms');
  await expect(widget.locator('rect.share')).not.toHaveClass(/bad/);

  const rack = slider('Servers');
  await rack.scrollIntoViewIfNeeded();
  const box = (await rack.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 50, { steps: 6 });
  await page.mouse.up();
  await expect(rack).toHaveAttribute('aria-valuenow', '20');
  await expect(lanes).toHaveAttribute('data-servers', '20');

  await slider('Load on the chart').focus();
  await page.keyboard.press('End');
  await expect(slider('Load')).toHaveAttribute('aria-valuenow', '95');
  await expect(widget.locator('.caption', { hasText: 'load' }).first()).toContainText('95% load');
});

test('each load balancing experiment sets up in one tap, asks, then reveals the model numbers and marks where to look', async ({
  page,
}) => {
  const { widget, slider, stageHeight } = await open(page);
  const height = await stageHeight();
  for (const [i, e] of SHOWN.entries()) {
    if (e.goal) continue;
    await widget.locator('.cards button').nth(i).click();
    await expect(slider('Load')).toHaveAttribute('aria-valuenow', String(e.setup['load']));
    await expect(slider('Slow server')).toHaveAttribute('aria-valuenow', String(e.setup['slowdown']));
    const check = widget.locator('app-widget-check');
    await expect(check.locator('legend')).toHaveText(e.ask);
    await check.getByRole('button', { name: e.choices[e.answer], exact: true }).click();
    await expect(check.locator('.explain')).toHaveText(e.reveal);
    await expect(check.getByRole('img', { name: 'your answer, correct' })).toBeVisible();
    for (const region of e.focus) await expect(widget.locator(`[data-focus="${region}"]`)).toHaveClass(/focused/);
    expect(await stageHeight()).toBe(height);
  }
  await expect(widget.locator('.cards .done')).toHaveCount(SHOWN.length - 1);
});

test('the load balancing challenge is met by least connections, and only with the slow server kept', async ({ page }) => {
  const { widget, slider } = await open(page);
  await widget.locator('.cards button').nth(GOAL).click();
  await expect(widget.locator('.status')).toHaveText('Now p99 64.7 s; the goal is under 100 ms.');
  await slider('Slow server').focus();
  await page.keyboard.press('Home');
  await expect(widget.locator('.status')).toHaveText('Now p99 82 ms, but the goal keeps S1 5× slower, 10 servers and 70% load.');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await widget.getByRole('radio', { name: 'Least connections' }).check();
  await expect(widget.locator('.status')).toHaveText('Goal met: p99 81 ms, under 100 ms.');
  await expect(widget.locator('.reveal')).toHaveText(SHOWN[GOAL].reveal);
});

test('the load balancing panel breaks out of the reading column at container wide, and stacks at medium', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'container widths are a desktop question');
  const { widget } = await open(page);
  // The panel before it, "Why it matters", keeps the reading column.
  const reading = (await page.locator('app-design-lesson:not(.ion-page-hidden) section.panel').first().boundingBox())!;
  const panel = (await page.locator('app-design-lesson:not(.ion-page-hidden) #try').boundingBox())!;
  expect(panel.width).toBeGreaterThan(reading.width + 100);
  const fleet = (await widget.locator('g-stage.fleet-stage').boundingBox())!;
  const controls = (await widget.locator('.controls').boundingBox())!;
  expect(controls.x).toBeGreaterThanOrEqual(fleet.x + fleet.width);
  // The charts sit right under the fleet, and stay there while an experiment's question takes room on the right.
  const chartsTop = async () =>
    (await widget.locator('app-balancer-charts').boundingBox())!.y - (await widget.locator('g-stage.fleet-stage').boundingBox())!.y;
  expect(await chartsTop()).toBeLessThanOrEqual(fleet.height + 32);
  const before = await chartsTop();
  await widget.locator('.cards button').nth(SLOW).click();
  await expect(widget.locator('app-widget-check legend')).toBeVisible();
  expect(await chartsTop()).toBe(before);

  // Medium: a content box of 640 to 899px. (With a rail, 1024px with it expanded is one; today's 1024px has none.)
  await page.setViewportSize({ width: 800, height: 900 });
  await expect
    .poll(async () => (await page.locator('app-design-lesson:not(.ion-page-hidden) #try').boundingBox())!.width)
    .toBeLessThanOrEqual(reading.width + 1);
  // Stacked, in reading order: the fleet, the controls that change it, the experiment's question, then the charts.
  const box = async (selector: string) => (await widget.locator(selector).boundingBox())!;
  const [above, stacked, dock, charts] = [
    await box('g-stage.fleet-stage'),
    await box('.controls'),
    await box('app-experiment-dock'),
    await box('app-balancer-charts'),
  ];
  expect(stacked.y).toBeGreaterThanOrEqual(above.y + above.height);
  expect(dock.y).toBeGreaterThanOrEqual(stacked.y + stacked.height);
  expect(charts.y).toBeGreaterThanOrEqual(dock.y + dock.height);
});

test('the load balancing widget fits a 320px screen without sideways scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  const { widget } = await open(page);
  const overflow = await page.evaluate(() => {
    const stage = document.querySelector('app-balancer-widget app-balancer-charts g-stage')!.getBoundingClientRect();
    return { right: stage.right, page: document.documentElement.scrollWidth };
  });
  expect(overflow.right).toBeLessThanOrEqual(320);
  expect(overflow.page).toBeLessThanOrEqual(320);
  await expect(widget.locator('.value.big')).toBeVisible();
});

test.describe('the load balancing widget under Reduced motion', () => {
  test.use({ motionOff: false, reducedMotion: 'reduce' });
  test.beforeEach(({ page }) => page.addInitScript(countAnimate));

  test('runs no animation through a replay, the picks and an experiment, and still reveals', async ({ page }) => {
    const { widget, answer } = await open(page);
    await page.evaluate(() => (window.animateCalls = 0));
    await widget.getByRole('button', { name: 'Replay' }).click();
    await expect(widget.locator('.notice')).toHaveText('Back at the start: drag the time handle under the fleet to watch the queues grow.');
    await widget.getByRole('button', { name: 'Watch it choose' }).click();
    await expect(widget.locator('.notice')).toContainText('Request 1 of 12');
    await widget.getByRole('button', { name: 'Next pick' }).click();
    await expect(widget.locator('.notice')).toContainText('Request 2 of 12');
    await answer(SLOW);
    await expect(widget.locator('app-widget-check .explain')).toHaveText(SHOWN[SLOW].reveal);
    await expect(widget.locator('[data-focus="slow"]')).toHaveClass(/focused/);
    await expect(widget.locator('canvas.lanes')).toHaveAttribute('data-dots', '0');
    expect(await page.evaluate(() => window.animateCalls)).toBe(0);
  });
});

test.describe('the load balancing widget with motion', () => {
  test.use({ motionOff: false, reducedMotion: 'no-preference' });
  test.beforeEach(({ page }) => page.addInitScript(countAnimate));

  const liveDots = async (page: Page) => Number(await shownWidget(page).locator('canvas.lanes').getAttribute('data-dots'));

  test('sends request dots in the policy order while in view, and a replay grows the queues from the start', async ({ page }) => {
    const { widget, slider, stageHeight } = await open(page);
    const height = await stageHeight();
    await expect.poll(() => liveDots(page)).toBeGreaterThan(2);
    await widget.getByRole('button', { name: 'Replay' }).click();
    await expect.poll(async () => Number(await slider('Time in the run').getAttribute('aria-valuenow'))).toBeLessThan(30);
    await expect(slider('Time in the run')).toHaveAttribute('aria-valuenow', '60', { timeout: 20_000 });
    expect(await stageHeight()).toBe(height);
    expect(await liveDots(page)).toBeLessThanOrEqual(12);
  });

  test('an answer locks the settings while it plays, and an interrupted play still reveals', async ({ page }) => {
    const { widget, slider, answer } = await open(page);
    await answer(SLOW);
    await expect(slider('Slow server')).toHaveAttribute('aria-disabled', 'true');
    await expect(widget.getByRole('radio', { name: 'Random', exact: true })).toBeDisabled();
    await expect(widget.locator('app-widget-check .explain')).toHaveText(SHOWN[SLOW].reveal);
    await expect(slider('Slow server')).not.toHaveAttribute('aria-disabled', 'true');

    await widget.locator('.cards button').nth(SLOW).click();
    await widget.locator('app-widget-check').getByRole('button', { name: SHOWN[SLOW].choices[0], exact: true }).click();
    await expect(widget.locator('app-widget-check .explain')).toHaveText('Watch the picture: the answer plays out on it.');
    await slider('Time in the run').focus();
    await page.keyboard.press('Home');
    await expect(widget.locator('app-widget-check .explain')).toHaveText(SHOWN[SLOW].reveal);
  });

  test('brings the stage into view when an answer starts playing on a phone', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === 'desktop', 'the desktop stage and dock fit one view');
    const { widget, answer } = await open(page);
    const stage = widget.locator('g-stage.fleet-stage');
    const topInView = () =>
      stage.evaluate((el) => {
        const box = el.getBoundingClientRect();
        return box.top >= 0 && box.top < 140;
      });
    await widget.locator('.cards button').nth(SLOW).scrollIntoViewIfNeeded();
    expect(await topInView()).toBe(false);
    await answer(SLOW);
    await expect.poll(topInView).toBe(true);
  });

  test('brings the question into view when a card is tapped on a phone, the stage once it is answered', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === 'desktop', 'the desktop stage and dock fit one view');
    const { widget } = await open(page);
    const card = widget.locator('.cards button').nth(SLOW);
    await card.scrollIntoViewIfNeeded();
    await card.click();
    const question = widget.locator('app-widget-check legend');
    await expect(question).toHaveText(SHOWN[SLOW].ask);
    await expect(question).toBeInViewport();
    await widget.locator('app-widget-check').getByRole('button', { name: SHOWN[SLOW].choices[SHOWN[SLOW].answer], exact: true }).click();
    await expect(widget.locator('g-stage.fleet-stage')).toBeInViewport();
  });

  test('keeps its dots in the drawing after a tab switch away and back', async ({ page }) => {
    const { widget } = await open(page);
    await expect.poll(() => liveDots(page)).toBeGreaterThan(0);
    await page.getByRole('tab', { name: 'Today' }).click();
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
    await page.getByRole('tab', { name: 'Design' }).click();
    await expect(shownWidget(page).locator('svg.fleet')).toBeVisible();
    await expect.poll(() => liveDots(page)).toBeGreaterThan(2);
    expect(await widget.locator('canvas.lanes').count()).toBe(1);
  });
});

test(
  'runs its simulations off the main thread: no long task while the fleet changes on a throttled phone',
  { tag: '@perf' },
  async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'phone', 'CPU throttling is a Chromium protocol, measured on the phone profile');
    const { widget } = await open(page);
    // Once idle, the app preloads the other tabs' pages; the claim is about the fleet's changes, so it waits that out.
    await page.waitForLoadState('networkidle');
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    await page.evaluate(() => {
      window.longTasks = [];
      new PerformanceObserver((list) => window.longTasks!.push(...list.getEntries().map((e) => e.duration))).observe({ type: 'longtask' });
    });
    // Plain selectors while throttled: a role query computes names across the page on its main thread, which would be
    // Playwright's long task, not the widget's. By keyboard, too: a click adds Playwright's own hit-target checks.
    const handle = (name: string) => widget.locator(`g-handle[aria-label="${name}"]`);
    await handle('Slow server').focus();
    for (const k of ['ArrowRight', 'ArrowRight', 'End']) {
      await page.keyboard.press(k);
      await page.waitForTimeout(400);
    }
    await handle('Servers').focus();
    await page.keyboard.press('End');
    await page.waitForTimeout(600);
    const twoChoices = widget.locator('label.segment', { hasText: 'Two random choices' }).locator('input');
    await twoChoices.focus();
    await page.keyboard.press('Space');
    await expect(twoChoices).toBeChecked();
    await page.waitForTimeout(1_500);
    const tasks = await page.evaluate(() => window.longTasks!);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    expect(tasks.filter((d) => d > 50)).toEqual([]);
  },
);
