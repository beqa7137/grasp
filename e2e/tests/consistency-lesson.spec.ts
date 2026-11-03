import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { QUORUM_EXPERIMENTS, renderExperiment } from '@grasp/engine';
import { expect, test } from './fixtures';

const SHOWN = QUORUM_EXPERIMENTS.map(renderExperiment);
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

const shownWidget = (page: Page) => page.locator('app-design-lesson:not(.ion-page-hidden) app-quorum-widget');

async function open(page: Page) {
  await page.goto('/design/topics/sd-consistency');
  const widget = shownWidget(page);
  await widget.locator('svg.draw').waitFor();
  await widget.locator('.quorum-stage').scrollIntoViewIfNeeded();
  const summary = widget.locator('svg.draw');
  const height = () => widget.locator('g-stage .well').evaluate((w) => (w as HTMLElement).style.height);
  const stageText = () => widget.locator('svg.draw text').allTextContents();
  const answer = async (i: number, choice = SHOWN[i].answer) => {
    await widget.locator('.cards button').nth(i).click();
    await widget.locator('app-widget-check').getByRole('button', { name: SHOWN[i].choices[choice], exact: true }).click();
  };
  return { widget, summary, height, stageText, answer };
}

test('the quorum widget draws one write and one read with the model numbers, and changes with every control', async ({ page }) => {
  const { widget, summary, height } = await open(page);
  await expect(summary).toHaveAttribute(
    'aria-label',
    '3 replicas, W QUORUM, R QUORUM. The write is acked in 4 ms by R1 and R2. returns v8 · fresh · 6 ms. 0 of 3 read sets can miss v8.',
  );
  const h3 = await height();
  const toolbar = widget.getByRole('toolbar', { name: 'Replicas' });
  await toolbar.getByRole('button', { name: 'R3, up. Activate to take it down.' }).click();
  await expect(toolbar.getByRole('button', { name: 'R3, down. Activate to make it stop mid-write.' })).toBeVisible();
  await expect(summary).toHaveAttribute('aria-label', /returns v8 · fresh · 40 ms\. 0 of 3 read sets can miss v8\.$/);
  await widget.getByRole('checkbox', { name: /R2 pauses/ }).check();
  await expect(summary).toHaveAttribute('aria-label', /The write is acked in 104 ms by R1 and R2\./);
  await widget.getByRole('checkbox', { name: /Sloppy quorum/ }).check();
  await expect(summary).toHaveAttribute('aria-label', /The write is acked in 3 ms by R1 and H1\./);
  await widget.getByRole('checkbox', { name: /Sloppy quorum/ }).uncheck();
  await widget.getByRole('checkbox', { name: /R2 pauses/ }).uncheck();
  const w = widget.getByRole('slider', { name: 'W, acks a write waits for' });
  await w.focus();
  await page.keyboard.press('End');
  await expect(w).toHaveAttribute('aria-valuetext', 'ALL, 3 of 3: survives 0 down, writes succeed 97.03%');
  await expect(widget.locator('svg.draw text', { hasText: 'refused:' })).toHaveCount(1);
  await widget.getByRole('radio', { name: '5 replicas' }).check();
  await expect(summary).toHaveAttribute('aria-label', /^5 replicas, W ALL, R QUORUM\./);
  await widget.getByRole('radio', { name: '3 replicas' }).check();
  expect(await height()).toBe(h3);
});

test('the quorum widget runs from the keyboard alone', async ({ page }) => {
  const { widget, summary } = await open(page);
  await widget.getByRole('radio', { name: '3 replicas' }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(widget.getByRole('radio', { name: '5 replicas' })).toBeChecked();
  await page.keyboard.press('Tab');
  await expect(widget.getByRole('checkbox', { name: /R3 pauses/ })).toBeFocused();
  await page.keyboard.press('Space');
  await page.keyboard.press('Tab');
  await expect(widget.getByRole('checkbox', { name: /Sloppy quorum/ })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(widget.getByRole('button', { name: 'Play the write, then the read' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(widget.locator('.notice')).toHaveText(/^Acked in \d+ ms by R1, R2 and R4\./);
  await page.keyboard.press('Tab');
  await expect(widget.getByRole('button', { name: /^R1, up/ })).toBeFocused();
  await page.keyboard.press('End');
  await expect(widget.getByRole('button', { name: /^R5, up/ })).toBeFocused();
  await expect(widget.locator('.hint')).toHaveText('Enter: take R5 down');
  await page.keyboard.press('Enter');
  await expect(widget.getByRole('button', { name: /^R5, down/ })).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await expect(widget.getByRole('button', { name: /^R4, up/ })).toBeFocused();
  await page.keyboard.press('Tab');
  const w = widget.getByRole('slider', { name: 'W, acks a write waits for' });
  await expect(w).toBeFocused();
  await page.keyboard.press('Home');
  await expect(w).toHaveAttribute('aria-valuetext', /^ONE, 1 of 5/);
  await page.keyboard.press('Tab');
  const r = widget.getByRole('slider', { name: 'R, answers a read waits for' });
  await expect(r).toBeFocused();
  await page.keyboard.press('End');
  await expect(r).toHaveAttribute('aria-valuetext', /^ALL, 5 of 5/);
  await expect(summary).toHaveAttribute('aria-label', /read fails · 4 reachable, 5 needed/);
  await page.keyboard.press('Tab');
  await expect(widget.getByRole('button', { name: 'Describe' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(widget.locator('.describe g-data-table tbody tr')).toHaveCount(5);
});

test('each quorum experiment sets up in one tap, asks without giving its answer away, then reveals it', async ({ page }) => {
  const { widget, height, stageText, answer } = await open(page);
  // The height depends only on the width and N: N 3 keeps the default's, and N 5 one of its own.
  const heights: Record<number, string> = { 3: await height() };
  const hidden: Record<string, string[]> = {
    'r-plus-w-equals-n': ['1 of 10', 'at 2 ms'],
    'all-one-down': ['refused', 'timed out', '97.03'],
    stall: ['acked in 40', 'acked 40', 'sent at 40', 'fresh'],
    'missed-write': ['repaired', 'repair', '6 ms'],
    sloppy: ['1 of 3', 'stale', 'R2 v7'],
  };
  for (const [i, e] of SHOWN.entries()) {
    if (e.goal) continue;
    await widget.locator('.cards button').nth(i).click();
    const check = widget.locator('app-widget-check');
    await expect(check.locator('legend')).toHaveText(e.ask);
    await expect(widget.getByRole('button', { name: 'Play the write, then the read, after your answer' })).toBeDisabled();
    await expect(widget.getByRole('button', { name: 'Describe' })).toBeDisabled();
    const words = (await stageText()).join(' | ');
    for (const giveaway of hidden[e.id]) expect(words, `${e.id}: "${giveaway}"`).not.toContain(giveaway);
    await answer(i);
    await expect(check.locator('.explain')).toHaveText(e.reveal);
    for (const region of e.focus) await expect(widget.locator(`[data-focus="${region}"]`)).toHaveClass(/focused/);
    heights[e.setup['n']] ??= await height();
    expect(await height(), e.id).toBe(heights[e.setup['n']]);
  }
  await expect(widget.locator('.cards .done')).toHaveCount(5);
});

test('the quorum challenge is met only at N 5, W 4, R 2 with R3 pausing', async ({ page }) => {
  const { widget } = await open(page);
  await widget.locator('.cards button').last().click();
  await expect(widget.locator('.status')).toHaveText(
    'No read set can miss v8: 0 of 3 can, met · reads 40 ms, under 5 ms: not yet · writes 40 ms, under 50 ms: met · writes survive 1 down, at least 1: met',
  );
  await widget.getByRole('radio', { name: '5 replicas' }).check();
  await expect(widget.locator('svg.draw')).toHaveAttribute('aria-label', /^5 replicas, W QUORUM, R QUORUM\./);
  const w = widget.getByRole('slider', { name: 'W, acks a write waits for' });
  await w.focus();
  await page.keyboard.press('ArrowRight');
  await expect(w).toHaveAttribute('aria-valuetext', /^4 of 5/);
  const r = widget.getByRole('slider', { name: 'R, answers a read waits for' });
  await r.focus();
  await page.keyboard.press('ArrowLeft');
  await expect(widget.locator('.status')).toHaveText(/Goal met: No read set can miss v8: 0 of 10 can, met · reads 3 ms, under 5 ms: met/);
  await expect(widget.locator('.reveal')).toHaveText(SHOWN.at(-1)!.reveal);
});

test('the quorum panel breaks out at container wide, and stacks the controls over the stage below it', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'container widths are a desktop question');
  const { widget } = await open(page);
  const box = async (selector: string) => (await widget.locator(selector).first().boundingBox())!;
  const reading = (await page.locator('app-design-lesson:not(.ion-page-hidden) section.panel').first().boundingBox())!;
  const panel = (await page.locator('app-design-lesson:not(.ion-page-hidden) #try').boundingBox())!;
  expect(panel.width).toBeGreaterThan(reading.width + 100);
  expect((await box('.controls')).x).toBeGreaterThanOrEqual((await box('.quorum-stage')).x + (await box('.quorum-stage')).width);
  for (const width of [800, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await expect.poll(async () => (await box('.controls')).x).toBeLessThan((await box('.quorum-stage')).x + 10);
    const [n, stage] = [await box('fieldset.n-control'), await box('.quorum-stage')];
    expect(n.y + n.height, `${width}px`).toBeLessThanOrEqual(stage.y);
  }
  await widget.locator('.cards button').nth(at('stall')).click();
  const [stage, dock, cards] = [await box('.quorum-stage'), await box('section.dock'), await box('.cards')];
  expect(dock.y).toBeGreaterThanOrEqual(stage.y + stage.height);
  expect(cards.y).toBeGreaterThanOrEqual(dock.y + dock.height);
});

test('Describe opens its table inside the widget at 320, 412 and 1280px: the page never scrolls sideways', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'one browser sets every width');
  for (const width of [320, 412, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    const { widget } = await open(page);
    await widget.getByRole('checkbox', { name: /Sloppy quorum/ }).check();
    await widget.getByRole('button', { name: /^R3, up/ }).click();
    await widget.getByRole('button', { name: 'Describe' }).click();
    await expect(widget.locator('.describe g-data-table tbody tr')).toHaveCount(4);
    const rights = await widget.evaluate((w) =>
      ['.quorum-stage', '.controls', '.describe g-data-table'].map((s) => w.querySelector(s)!.getBoundingClientRect().right),
    );
    for (const right of rights) expect(right, `${width}px`).toBeLessThanOrEqual(width);
    expect(await page.evaluate(() => document.documentElement.scrollWidth), `${width}px`).toBeLessThanOrEqual(width);
  }
});

for (const theme of ['light', 'dark'] as const)
  test.describe(`the quorum widget in ${theme}`, () => {
    test.use({ theme, contextOptions: { reducedMotion: 'reduce' } });

    test('passes axe at rest, asking and revealed', async ({ page }) => {
      const { widget, answer } = await open(page);
      const scan = async () => {
        const { violations } = await new AxeBuilder({ page }).include('app-quorum-widget').analyze();
        return violations
          .filter((v) => v.impact === 'serious' || v.impact === 'critical')
          .map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(', ')}`);
      };
      expect(await scan()).toEqual([]);
      await widget.locator('.cards button').nth(at('sloppy')).click();
      expect(await scan()).toEqual([]);
      await answer(at('sloppy'));
      await expect(widget.locator('app-widget-check .explain')).toHaveText(SHOWN[at('sloppy')].reveal);
      expect(await scan()).toEqual([]);
    });
  });

test.describe('the quorum widget under Reduced motion', () => {
  test.use({ motionOff: false, reducedMotion: 'reduce' });
  test.beforeEach(({ page }) => page.addInitScript(countAnimate));

  test('runs no animation through a play and an experiment, says what happened in order, and strikes the repaired v7', async ({
    page,
  }, testInfo) => {
    const { widget, answer } = await open(page);
    await page.evaluate(() => (window.animateCalls = 0));
    await widget.getByRole('button', { name: 'Play the write, then the read' }).click();
    await expect(widget.locator('.notice')).toHaveText(
      'Acked in 4 ms by R1 and R2. The read heard R3 (v7) and R2 (v8), repaired R3 and returned v8 in 6 ms.',
    );
    if (testInfo.project.name === 'desktop') await expect(widget.locator('.struck')).toHaveText('v7');
    await answer(at('missed-write'));
    await expect(widget.locator('app-widget-check .explain')).toHaveText(SHOWN[at('missed-write')].reveal);
    await expect(widget.locator('.particle')).toHaveCount(0);
    expect(await page.evaluate(() => window.animateCalls)).toBe(0);
  });
});

test.describe('the quorum widget with motion', () => {
  test.use({ motionOff: false, reducedMotion: 'no-preference' });
  test.beforeEach(({ page }) => page.addInitScript(countAnimate));

  test('plays the write, then the read, landing the pill last, with at most 60 dots', async ({ page }) => {
    const { widget } = await open(page);
    await widget.getByRole('button', { name: 'Play the write, then the read' }).click();
    await expect(widget.locator('svg.draw .pill')).toHaveCount(0);
    expect(await widget.locator('.particle:not([visibility])').count()).toBeLessThanOrEqual(60);
    await expect(widget.locator('.notice')).toHaveText(/^Acked in 4 ms by R1 and R2\./, { timeout: 10_000 });
    await expect(widget.locator('svg.draw .pill')).toHaveCount(1);
    expect(await page.evaluate(() => window.animateCalls)).toBeGreaterThan(0);
  });

  test('locks the settings while an answer plays, keeps it hidden, then reveals it', async ({ page }) => {
    const { widget, answer, stageText } = await open(page);
    const e = at('stall');
    await answer(e, 0);
    await expect(widget.getByRole('radio', { name: '5 replicas' })).toBeDisabled();
    expect((await stageText()).join(' | ')).not.toContain('acked in 40');
    await expect(widget.locator('app-widget-check .explain')).toHaveText(SHOWN[e].reveal, { timeout: 12_000 });
    await expect(widget.getByRole('radio', { name: '5 replicas' })).toBeEnabled();
    expect((await stageText()).join(' | ')).toContain('acked in 40 ms');
  });

  test('reveals an experiment on a phone with the stage in view', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const { widget, answer } = await open(page);
    const e = at('missed-write');
    await answer(e);
    await expect(widget.locator('.quorum-stage')).toBeInViewport();
    await expect(widget.locator('app-widget-check .explain')).toHaveText(SHOWN[e].reveal, { timeout: 12_000 });
  });
});
