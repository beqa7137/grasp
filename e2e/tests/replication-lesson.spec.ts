import type { Page } from '@playwright/test';
import { REPLICA_EXPERIMENTS, renderExperiment } from '@grasp/engine';
import { expect, test } from './fixtures';

const SHOWN = REPLICA_EXPERIMENTS.map(renderExperiment);
const SOON = SHOWN.findIndex((e) => e.id === 'too-soon');
const GOAL = SHOWN.findIndex((e) => e.goal);

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

const shownWidget = (page: Page) => page.locator('app-design-lesson:not(.ion-page-hidden) app-replica-widget');

async function open(page: Page) {
  await page.goto('/design/topics/sd-replication');
  const widget = shownWidget(page);
  await widget.locator('g-timeline svg[role="img"]').waitFor();
  await widget.locator('g-stage').scrollIntoViewIfNeeded();
  const slider = (name: string) => widget.getByRole('slider', { name, exact: true });
  const stageHeight = async () => (await widget.locator('g-stage').boundingBox())!.height;
  return { widget, slider, stageHeight };
}

/** Every label on the timeline, as boxes on the page. */
const labelBoxes = (page: Page) =>
  shownWidget(page)
    .locator('g-timeline')
    .evaluate((el) =>
      [...el.querySelectorAll('.event-label, .lane-label')].map((t) => {
        const r = t.getBoundingClientRect();
        return { text: t.textContent!.trim(), left: r.left, right: r.right, top: r.top, bottom: r.bottom };
      }),
    );

test('the replication timeline numbers the write, the replica applying it and the read, and its handles move them', async ({ page }) => {
  const { widget, slider } = await open(page);
  await expect(widget.locator('.event .num')).toHaveText(['1', '2', '3', '4']);
  await expect(widget.locator('.value')).toHaveText('the old value');
  await slider('Your read').focus();
  for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowRight');
  await expect(slider('Your read')).toHaveAttribute('aria-valuetext', 'You read 800 ms after writing');
  await expect(widget.locator('.value')).toHaveText('the new value');

  await widget.getByRole('checkbox', { name: /Pin to the primary/ }).check();
  await expect(slider('End of the pin to the primary')).toHaveAttribute('aria-valuenow', '1000');
  await slider('Replica applies the write').focus();
  await page.keyboard.press('End');
  await expect(widget.locator('.value')).toHaveText('the new value');
  await slider('Your read').focus();
  for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowRight');
  await expect(widget.locator('.value')).toHaveText('the old value');
  await expect(widget.locator('g-timeline .legend li')).toContainText(['a read here is stale']);
});

test('no two labels on the replication timeline print over each other, and none leaves the stage ("writread")', async ({ page }) => {
  const { widget, slider } = await open(page);
  const stage = (await widget.locator('g-stage').boundingBox())!;
  for (const steps of [3, 2, 1]) {
    await slider('Your read').focus();
    for (let i = 0; i < steps; i++) await page.keyboard.press('ArrowLeft');
    const boxes = await labelBoxes(page);
    for (const [i, a] of boxes.entries()) {
      expect(a.left, a.text).toBeGreaterThanOrEqual(stage.x);
      expect(a.right, a.text).toBeLessThanOrEqual(stage.x + stage.width);
      for (const b of boxes.slice(i + 1)) {
        const overlap = a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1;
        expect(overlap, `${a.text} / ${b.text}`).toBe(false);
      }
    }
  }
  await expect(slider('Your read')).toHaveAttribute('aria-valuenow', '0');
});

test('two moments at the same time on a lane draw side by side, with the arrows meeting each', async ({ page }) => {
  const { widget, slider } = await open(page);
  await slider('Your read').focus();
  // The read at 800 ms lands on the replica just as it applies the write.
  for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowRight');
  await expect(slider('Your read')).toHaveAttribute('aria-valuenow', '800');
  const circles = await widget.locator('.event circle:not(.back)').evaluateAll((all) =>
    all.map((c) => {
      const r = c.getBoundingClientRect();
      return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
    }),
  );
  for (const [i, a] of circles.entries())
    for (const b of circles.slice(i + 1))
      expect(a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1).toBe(false);
});

test('each replication experiment sets up in one tap, hides the answer while you guess, then reveals it', async ({ page }) => {
  const { widget, stageHeight } = await open(page);
  const height = await stageHeight();
  for (const [i, e] of SHOWN.entries()) {
    if (e.goal) continue;
    await widget.locator('.cards button').nth(i).click();
    await expect(widget.locator('.value')).toHaveText('?');
    // When the replica applies the write would give the answer away until the play shows it.
    await expect(widget.locator('.event .num')).not.toContainText(['2']);
    await expect(widget.locator('circle.mark')).toHaveCount(0);
    const check = widget.locator('app-widget-check');
    await expect(check.locator('legend')).toHaveText(e.ask);
    await check.getByRole('button', { name: e.choices[e.answer], exact: true }).click();
    await expect(check.locator('.explain')).toHaveText(e.reveal);
    await expect(widget.locator('.value')).not.toHaveText('?');
    for (const region of e.focus) await expect(widget.locator(`[data-focus="${region}"]`)).toHaveClass(/focused/);
    expect(await stageHeight()).toBe(height);
  }
  await expect(widget.locator('.cards .done')).toHaveCount(SHOWN.length - 1);
});

test('the replication challenge is met once the pin outlasts the lag', async ({ page }) => {
  const { widget, slider } = await open(page);
  await widget.locator('.cards button').nth(GOAL).click();
  await expect(widget.locator('.status')).toHaveText('Your reads are stale for 1 s after the pin; the goal is never.');
  await slider('End of the pin to the primary').focus();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await expect(widget.locator('.status')).toHaveText('Goal met: none of your reads can be stale, with a pin of 2 s.');
  await expect(widget.locator('.reveal')).toHaveText(SHOWN[GOAL].reveal);
});

test('the replication widget fits a 320px screen without sideways scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await open(page);
  const overflow = await page.evaluate(() => ({
    right: document.querySelector('app-replica-widget g-stage')!.getBoundingClientRect().right,
    page: document.documentElement.scrollWidth,
  }));
  expect(overflow.right).toBeLessThanOrEqual(320);
  expect(overflow.page).toBeLessThanOrEqual(320);
});

test.describe('the replication widget under Reduced motion', () => {
  test.use({ motionOff: false, reducedMotion: 'reduce' });
  test.beforeEach(({ page }) => page.addInitScript(countAnimate));

  test('plays nothing and still reveals', async ({ page }) => {
    const { widget } = await open(page);
    await page.evaluate(() => (window.animateCalls = 0));
    await widget.getByRole('button', { name: 'Play it' }).click();
    await expect(widget.locator('.notice')).toHaveText('With motion off the picture already shows the whole 3 s after the write.');
    await widget.locator('.cards button').nth(SOON).click();
    await widget.locator('app-widget-check').getByRole('button', { name: SHOWN[SOON].choices[SHOWN[SOON].answer], exact: true }).click();
    await expect(widget.locator('app-widget-check .explain')).toHaveText(SHOWN[SOON].reveal);
    await expect(widget.locator('[data-focus="read"]')).toHaveClass(/focused/);
    expect(await page.evaluate(() => window.animateCalls)).toBe(0);
  });
});

test.describe('the replication widget with motion', () => {
  test.use({ motionOff: false, reducedMotion: 'no-preference' });

  test('plays the 3 s after the write with the read answered when it happens, and a dragged handle ends the play', async ({ page }) => {
    const { widget, slider, stageHeight } = await open(page);
    const height = await stageHeight();
    await widget.locator('.cards button').nth(SOON).click();
    await widget.locator('app-widget-check').getByRole('button', { name: SHOWN[SOON].choices[1], exact: true }).click();
    await expect(widget.locator('app-widget-check .explain')).toHaveText('Watch the picture: the answer plays out on it.');
    await expect(widget.locator('line.now')).toHaveCount(1);
    await expect(widget.locator('app-widget-check .explain')).toHaveText(SHOWN[SOON].reveal, { timeout: 8_000 });
    await expect(widget.locator('line.now')).toHaveCount(0);
    expect(await stageHeight()).toBe(height);

    await widget.getByRole('button', { name: 'Play it' }).click();
    await expect(widget.locator('line.now')).toHaveCount(1);
    await slider('Your read').focus();
    await page.keyboard.press('ArrowRight');
    await expect(widget.locator('line.now')).toHaveCount(0);
    await expect(widget.locator('.event .num')).toHaveText(['1', '2', '3', '4']);
  });
});
