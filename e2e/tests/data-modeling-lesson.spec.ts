import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { FEED_EXPERIMENTS, renderExperiment } from '@grasp/engine';
import { expect, test } from './fixtures';

const SHOWN = FEED_EXPERIMENTS.map(renderExperiment);
const at = (id: string) => SHOWN.findIndex((e) => e.id === id);

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

const shownWidget = (page: Page) => page.locator('app-design-lesson:not(.ion-page-hidden) app-feed-model-widget');

async function open(page: Page) {
  await page.goto('/design/topics/sd-data-modeling');
  const widget = shownWidget(page);
  await widget.locator('app-feed-traffic svg').waitFor();
  await widget.locator('.page-stage').scrollIntoViewIfNeeded();
  const wait = widget.locator('.page-stage .head').first();
  const heights = () => widget.locator('g-stage .well').evaluateAll((wells) => wells.map((w) => (w as HTMLElement).style.height));
  const answer = async (i: number) => {
    const e = SHOWN[i];
    await widget.locator('.cards button').nth(i).click();
    await widget.locator('app-widget-check').getByRole('button', { name: e.choices[e.answer], exact: true }).click();
  };
  return { widget, wait, heights, answer };
}

test('the data modeling widget draws each read as its round trips, with the same rows read', async ({ page }) => {
  const { widget, wait } = await open(page);
  await expect(wait).toHaveText('21ms page wait');
  await expect(widget.locator('.sql')).toHaveText(['1 × posts LIMIT 20', '20 × authors WHERE id = ?']);
  await expect(widget.locator('.mag')).toBeVisible();
  await widget.getByRole('radio', { name: 'Batched IN' }).check();
  await expect(wait).toHaveText('2ms page wait');
  await expect(widget.locator('.trip.ghost')).toHaveCount(1);
  await expect(widget.locator('.page-stage text.small').first()).toHaveText('N+1 was');
  await widget.getByRole('radio', { name: 'Join' }).check();
  await expect(wait).toHaveText('1ms page wait');
  // One line on a wide stage; a phone breaks it, with short table names, over two.
  await expect(widget.locator('.sql').first()).toContainText(/^1 × posts (p )?JOIN authors/);
  await expect(widget.locator('.sql').last()).toContainText(/ON (authors\.id = posts|a\.id = p)\.author_id$/);
  await expect(widget.locator('.page-stage .head').nth(1)).toHaveText('40rows read a page');
  await widget.getByRole('radio', { name: /another region/ }).check();
  await expect(wait).toHaveText('30ms page wait');
  await widget.getByRole('radio', { name: 'N+1' }).check();
  await expect(wait).toHaveText('630ms page wait');
  await expect(widget.locator('.page-stage .chevron')).toBeVisible();
});

test('denormalizing reads one table and makes a rename rewrite every copy, scrubbed by the rewrite playhead', async ({ page }) => {
  const { widget, heights } = await open(page);
  const before = await heights();
  await widget.getByRole('radio', { name: 'Denormalized', exact: true }).check();
  await expect(widget.getByRole('radio', { name: 'Join' })).toBeDisabled();
  await expect(widget.locator('.note')).toHaveText('Nothing to look up: the name is in each post.');
  await expect(widget.locator('.page-stage .head').nth(1)).toHaveText('20rows read a page');
  await expect(widget.locator('app-feed-write .head')).toHaveText('501rows · old name 100 ms');
  await widget.getByRole('button', { name: 'Rename Ada' }).click();
  const playhead = widget.getByRole('slider', { name: 'Copy rewrite' });
  await expect(playhead).toHaveAttribute('aria-valuetext', 'copy rewrite 50% done, 250 of 500 copies rewritten');
  await expect(widget.locator('.old-tag, .clock')).toHaveCount(1);
  await playhead.focus();
  await page.keyboard.press('End');
  await expect(playhead).toHaveAttribute('aria-valuetext', 'copy rewrite 100% done, 500 of 500 copies rewritten');
  await expect(widget.locator('.old-tag, .clock')).toHaveCount(0);
  expect(await heights()).toEqual(before);
});

test('the data modeling widget runs from the keyboard alone: schema, read, places and every handle', async ({ page }) => {
  const { widget, wait } = await open(page);
  await widget.getByRole('radio', { name: 'Normalized', exact: true }).focus();
  await page.keyboard.press('Tab');
  await expect(widget.getByRole('radio', { name: 'N+1' })).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(widget.getByRole('radio', { name: 'Batched IN' })).toBeChecked();
  await expect(wait).toHaveText('2ms page wait');
  await page.keyboard.press('Tab');
  await expect(widget.getByRole('button', { name: 'Load a page' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(widget.getByRole('radio', { name: /same zone/ })).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(wait).toHaveText('4ms page wait');
  await page.keyboard.press('Tab');
  const posts = widget.getByRole('slider', { name: 'Posts a page' });
  await expect(posts).toBeFocused();
  await page.keyboard.press('End');
  await expect(posts).toHaveAttribute('aria-valuetext', '100 posts a page');
  for (const name of ['Rename Ada']) {
    await page.keyboard.press('Tab');
    await expect(widget.getByRole('button', { name })).toBeFocused();
  }
  await page.keyboard.press('Tab');
  await expect(widget.getByRole('slider', { name: 'Ada’s posts' })).toBeFocused();
  await page.keyboard.press('Home');
  await expect(widget.getByRole('slider', { name: 'Ada’s posts' })).toHaveAttribute('aria-valuetext', '10 posts by Ada');
  await page.keyboard.press('Tab');
  const pages = widget.getByRole('slider', { name: 'Pages a second' });
  await expect(pages).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(pages).toHaveAttribute('aria-valuetext', '10,000 pages a second');
  await page.keyboard.press('Tab');
  await expect(widget.getByRole('slider', { name: 'Renames a second' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(widget.getByRole('button', { name: 'Table' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(widget.locator('app-feed-traffic g-data-table')).toBeVisible();
});

test('each data modeling experiment sets up in one tap, asks without giving the answer away, then reveals it', async ({ page }) => {
  const { widget, heights } = await open(page);
  const before = await heights();
  for (const [i, e] of SHOWN.entries()) {
    if (e.goal) continue;
    await widget.locator('.cards button').nth(i).click();
    const check = widget.locator('app-widget-check');
    await expect(check.locator('legend')).toHaveText(e.ask);
    await expect(widget.getByRole('button', { name: 'Describe' })).toBeDisabled();
    if (e.id === 'read-heavy') await expect(widget.locator('app-feed-traffic .line.dashed')).toHaveCount(0);
    if (e.id === 'old-name') await expect(widget.locator('app-feed-write .head')).toHaveText('100,001rows · old name ?');
    await check.getByRole('button', { name: e.choices[e.answer], exact: true }).click();
    await expect(check.locator('.explain')).toHaveText(e.reveal);
    for (const region of e.focus) await expect(widget.locator(`[data-focus="${region}"]`)).toHaveClass(/focused/);
    expect(await heights()).toEqual(before);
  }
  await expect(widget.locator('.cards .done')).toHaveCount(4);
});

test('the data modeling challenge is met only by denormalizing, with the page and traffic kept', async ({ page }) => {
  const { widget } = await open(page);
  await widget.locator('.cards button').last().click();
  await expect(widget.locator('.status')).toHaveText('N+1 · 42 ms ✗ · fresh ✓ · 400,001 rows/s ✗');
  await widget.getByRole('radio', { name: 'Join' }).check();
  await expect(widget.locator('.status')).toHaveText('The join · 2 ms ✓ · fresh ✓ · 400,001 rows/s ✗');
  await widget.getByRole('radio', { name: 'Denormalized', exact: true }).check();
  await expect(widget.locator('.status')).toHaveText('Goal met: Denormalized · 2 ms ✓ · old name 100 ms ✓ · 200,501 rows/s ✓');
  await expect(widget.locator('.reveal')).toHaveText(SHOWN.at(-1)!.reveal);
});

test('the data modeling panel breaks out of the reading column at container wide, and stacks in reading order below', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'container widths are a desktop question');
  const { widget } = await open(page);
  const reading = (await page.locator('app-design-lesson:not(.ion-page-hidden) section.panel').first().boundingBox())!;
  const panel = (await page.locator('app-design-lesson:not(.ion-page-hidden) #try').boundingBox())!;
  expect(panel.width).toBeGreaterThan(reading.width + 100);
  const stage = (await widget.locator('.page-stage').boundingBox())!;
  const controls = (await widget.locator('.controls').boundingBox())!;
  expect(controls.x).toBeGreaterThanOrEqual(stage.x + stage.width);
  await page.setViewportSize({ width: 800, height: 900 });
  const box = async (selector: string) => (await widget.locator(selector).first().boundingBox())!;
  await expect.poll(async () => (await box('.controls')).x).toBeLessThan((await box('.page-stage')).x + 10);
  await widget.locator('.cards button').nth(at('read-heavy')).click();
  const [controlsBox, stageBox, dock, write, traffic, cards] = [
    await box('.controls'),
    await box('.page-stage'),
    await box('section.dock'),
    await box('app-feed-write'),
    await box('app-feed-traffic'),
    await box('.cards'),
  ];
  expect(stageBox.y).toBeGreaterThanOrEqual(controlsBox.y + controlsBox.height - 14);
  expect(dock.y).toBeGreaterThanOrEqual(stageBox.y + stageBox.height);
  expect(write.y).toBeGreaterThanOrEqual(dock.y + dock.height);
  expect(traffic.y).toBeGreaterThanOrEqual(write.y + write.height);
  expect(cards.y).toBeGreaterThanOrEqual(traffic.y + traffic.height);
});

test('Describe opens its table inside the widget at 320, 412 and 1280px: the page never scrolls sideways', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'one browser sets every width');
  for (const width of [320, 412, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    const { widget } = await open(page);
    await widget.getByRole('button', { name: 'Describe' }).click();
    await expect(widget.locator('.describe g-data-table')).toBeVisible();
    const boxes = await page.evaluate(() =>
      ['.page-stage', '.controls', 'app-feed-traffic', '.describe g-data-table'].map(
        (s) => document.querySelector(`app-feed-model-widget ${s}`)!.getBoundingClientRect().right,
      ),
    );
    for (const right of boxes) expect(right, `${width}px`).toBeLessThanOrEqual(width);
    expect(await page.evaluate(() => document.documentElement.scrollWidth), `${width}px`).toBeLessThanOrEqual(width);
  }
});

test('the data modeling widget fits a 320px screen without sideways scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  const { widget } = await open(page);
  await widget.getByRole('radio', { name: 'Denormalized', exact: true }).check();
  const right = await page.evaluate(() =>
    Math.max(...[...document.querySelectorAll('app-feed-model-widget g-stage')].map((s) => s.getBoundingClientRect().right)),
  );
  expect(right).toBeLessThanOrEqual(320);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
});

for (const theme of ['light', 'dark'] as const)
  test.describe(`the data modeling widget in ${theme}`, () => {
    test.use({ theme, contextOptions: { reducedMotion: 'reduce' } });

    test('passes axe asking, revealed and mid-rename', async ({ page }) => {
      const { widget, answer } = await open(page);
      const scan = async () => {
        const { violations } = await new AxeBuilder({ page }).include('app-feed-model-widget').analyze();
        return violations
          .filter((v) => v.impact === 'serious' || v.impact === 'critical')
          .map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(', ')}`);
      };
      await widget.locator('.cards button').nth(at('read-heavy')).click();
      expect(await scan()).toEqual([]);
      await answer(at('read-heavy'));
      await expect(widget.locator('app-widget-check .explain')).toHaveText(SHOWN[at('read-heavy')].reveal);
      expect(await scan()).toEqual([]);
      await widget.getByRole('button', { name: 'Rename Ada' }).click();
      expect(await scan()).toEqual([]);
    });
  });

test.describe('the data modeling widget under Reduced motion', () => {
  test.use({ motionOff: false, reducedMotion: 'reduce' });
  test.beforeEach(({ page }) => page.addInitScript(countAnimate));

  test('runs no animation through a load, a rename and an experiment, and every number stays on the drawing', async ({
    page,
  }, testInfo) => {
    const { widget, answer } = await open(page);
    await page.evaluate(() => (window.animateCalls = 0));
    await widget.getByRole('button', { name: 'Load a page' }).click();
    await expect(widget.locator('.notice')).toHaveText('Page loaded: 21 queries one after another, 21 ms.');
    await widget.getByRole('radio', { name: 'Denormalized', exact: true }).check();
    await widget.getByRole('button', { name: 'Rename Ada' }).click();
    await expect(widget.getByRole('slider', { name: 'Copy rewrite' })).toHaveAttribute('aria-valuenow', '50');
    // The old name struck beside the new needs the room of a wide authors card.
    if (testInfo.project.name === 'desktop') await expect(widget.locator('.struck')).toHaveText('Ada');
    await answer(at('old-name'));
    await expect(widget.locator('app-widget-check .explain')).toHaveText(SHOWN[at('old-name')].reveal);
    await expect(widget.locator('.particle')).toHaveCount(0);
    expect(await page.evaluate(() => window.animateCalls)).toBe(0);
  });
});

test.describe('the data modeling widget with motion', () => {
  test.use({ motionOff: false, reducedMotion: 'no-preference' });
  test.beforeEach(({ page }) => page.addInitScript(countAnimate));

  test('replays a page load trip by trip, then a rename to every copy, with at most 60 dots', async ({ page }) => {
    const { widget } = await open(page);
    await widget.getByRole('button', { name: 'Load a page' }).click();
    await expect(widget.locator('.page-stage text.small', { hasText: /^trip \d+ of 21$/ })).toBeVisible();
    await expect(widget.locator('.page-stage text.small', { hasText: 'shown 150× slower' })).toBeVisible();
    await expect(widget.locator('.notice')).toHaveText('Page loaded: 21 queries one after another, 21 ms.', { timeout: 8_000 });
    await widget.getByRole('radio', { name: 'Denormalized', exact: true }).check();
    await widget.getByRole('button', { name: 'Rename Ada' }).click();
    expect(await widget.locator('.particle:not([visibility])').count()).toBeLessThanOrEqual(60);
    await expect(widget.locator('.notice')).toHaveText('The copy rewrite finished: every copy says Ada K.', { timeout: 8_000 });
    expect(await page.evaluate(() => window.animateCalls)).toBeGreaterThan(0);
  });

  test('reveals a rename experiment on a phone, where the rename stage is the one in view', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const { widget } = await open(page);
    const e = at('old-name');
    await widget.locator('.cards button').nth(e).click();
    await widget.locator('app-widget-check').getByRole('button', { name: SHOWN[e].choices[SHOWN[e].answer], exact: true }).click();
    await expect(widget.locator('app-widget-check .explain')).toHaveText(SHOWN[e].reveal, { timeout: 10_000 });
    await expect(widget.locator('app-feed-write')).toBeInViewport();
  });

  test('locks the settings while an answer plays, then reveals', async ({ page }) => {
    const { widget } = await open(page);
    const e = at('trips-not-rows');
    await widget.locator('.cards button').nth(e).click();
    await widget.locator('app-widget-check').getByRole('button', { name: SHOWN[e].choices[SHOWN[e].answer], exact: true }).click();
    await expect(widget.getByRole('radio', { name: 'Join' })).toBeDisabled();
    await expect(widget.locator('app-widget-check .explain')).toHaveText(SHOWN[e].reveal, { timeout: 8_000 });
    await expect(widget.getByRole('radio', { name: 'Join' })).toBeEnabled();
  });
});
