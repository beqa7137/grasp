import AxeBuilder from '@axe-core/playwright';
import type { Locator, Page } from '@playwright/test';
import { ID_EXPERIMENTS, renderExperiment } from '@grasp/engine';
import { expect, test } from './fixtures';

const SHOWN = ID_EXPERIMENTS.map(renderExperiment);
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

const shownWidget = (page: Page) => page.locator('app-design-lesson:not(.ion-page-hidden) app-ids-widget');
const PLAY = 'Play the mint: 8 ms of three generators';

async function open(page: Page) {
  await page.goto('/design/topics/sd-ids');
  const widget = shownWidget(page);
  const summary = widget.locator('svg.draw');
  // Read the widget only once it is drawn: its summary names the layout.
  await expect(summary).toHaveAttribute(
    'aria-label',
    /^The 64 bits are 1 sign bit, 41 timestamp bits, 10 generator bits and 12 sequence bits\./,
  );
  await widget.locator('.ids-stage').scrollIntoViewIfNeeded();
  const height = () => widget.locator('g-stage .well').evaluate((w) => (w as HTMLElement).style.height);
  const stageText = async () =>
    (await widget.locator('svg.draw text').allTextContents()).map((t) => t.replace(/\s+/g, ' ').trim()).join(' | ');
  const figure = (id: string) => widget.locator(`svg.draw [data-id="${id}"]`);
  const answer = async (i: number, choice = SHOWN[i].answer) => {
    await widget.locator('.cards button').nth(i).click();
    await widget.locator('app-widget-check').getByRole('button', { name: SHOWN[i].choices[choice], exact: true }).click();
  };
  return { widget, summary, height, stageText, figure, answer };
}

/** Each number on a shown HTML surface of the widget that a line break parts from its unit. */
function unitSplits(widget: Locator) {
  return widget.evaluate((w) => {
    const out: string[] = [];
    const UNITS =
      /\b1 in [\d,.]+(?: (?:thousand|million|billion|trillion))?|\d[\d,.]* (?:ms|years?|bits?|ids|generators?|ticks?|requests|thousand|million|billion|trillion)\b|\(need [\d,]+(?: years)?\)|\bnumber \d\b|\d+ (?:January|February|March|April|May|June|July|August|September|October|November|December) \d{4}|\d[\d.]* × 10[⁰¹²³⁴⁵⁶⁷⁸⁹⁻]+|\d[\d.]*%/g;
    for (const el of w.querySelectorAll('.notice, .caption, .describe .said, .describe .note, app-experiment-dock .dock, .panel')) {
      if (el.getBoundingClientRect().width < 2) continue;
      const nodes: Text[] = [];
      const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      while (walk.nextNode()) nodes.push(walk.currentNode as Text);
      if (!nodes.length) continue;
      const point = (i: number, end: boolean): [Text, number] => {
        let k = i;
        for (const n of nodes) {
          if (end ? k <= n.data.length : k < n.data.length) return [n, k];
          k -= n.data.length;
        }
        return [nodes[nodes.length - 1], nodes[nodes.length - 1].data.length];
      };
      for (const m of nodes
        .map((n) => n.data)
        .join('')
        .matchAll(UNITS)) {
        const range = document.createRange();
        range.setStart(...point(m.index, false));
        range.setEnd(...point(m.index + m[0].length, true));
        const tops = [...range.getClientRects()].filter((r) => r.width > 0).map((r) => r.top);
        if (Math.max(...tops) - Math.min(...tops) > 6) out.push(`"${m[0]}" in "${el.textContent!.replace(/\s+/g, ' ').trim()}"`);
      }
    }
    return out;
  });
}

test('the ids widget draws one id bit by bit, and changes with every control', async ({ page }) => {
  const { widget, summary, height, stageText, figure } = await open(page);
  const words = await stageText();
  for (const w of ['made by G2 at 2.9 ms', 'id 118,682,025,992,396,801', '2⁴¹ ticks × 1 ms = 69.7 years', 'lasts 69.7 years'])
    expect(words).toContain(w);
  await expect(figure('life-marker')).toHaveCount(1);
  const h = await height();
  await widget.getByRole('button', { name: 'One generator bit more' }).click();
  await expect(widget.locator('.notice')).toHaveText(
    'The layout now has 11 generator bits and 12 sequence bits: 2,048 generators, 4,096,000 ids a second each; the timestamp keeps 40 bits and lasts 34.8 years.',
  );
  await expect(figure('ghost-tick')).toHaveCount(1);
  expect(await stageText()).toContain('was 69.7 years with 41 bits: one bit fewer halves it');
  await widget.getByRole('button', { name: 'One sequence bit fewer' }).click();
  await expect(summary).toHaveAttribute('aria-label', /11 generator bits and 11 sequence bits/);
  await widget.getByRole('radio', { name: '10 ms' }).check();
  await expect(summary).toHaveAttribute('aria-label', /counts 10 ms ticks/);
  await widget.getByRole('radio', { name: '1970' }).check();
  await expect(summary).toHaveAttribute('aria-label', /from 1 January 1970/);
  await widget.getByRole('radio', { name: '5,000 at once' }).check();
  await expect(summary).toHaveAttribute('aria-label', /G0's burst of 5,000 requests/);
  await widget.getByRole('radio', { name: "G1's clock steps back" }).check();
  await expect(widget.locator('.notice')).toHaveText(/G1's clock steps back 2 ms at 5\.5 ms, and G1 checks its clock against its last timestamp\./);
  await widget.getByRole('checkbox', { name: /^Check the clock against the last timestamp/ }).uncheck();
  await expect(widget.locator('.notice')).toHaveText(/Two ids repeat: G1 trusted its clock when it stepped back 2 ms/);
  await widget.getByRole('radio', { name: 'G2 given number 1' }).check();
  await expect(widget.locator('.notice')).toHaveText(/G2 was handed G1's number, 1\./);
  await widget.getByRole('radio', { name: '64 random bits' }).check();
  await expect(widget.locator('.notice')).toHaveText(/64-bit/);
  await widget.getByRole('slider', { name: 'Ids made' }).fill('12');
  await expect(widget.locator('.notice')).toHaveText(/trillion/);
  expect(await height()).toBe(h);
});

test('the ids widget steps the inspected id with Older and Newer', async ({ page }) => {
  const { widget, stageText } = await open(page);
  await widget.getByRole('button', { name: 'Newer id' }).click();
  await expect(widget.locator('.notice')).toHaveText(/^Newer id: G1's, sequence 0\./);
  expect(await stageText()).toContain('made by G1 at 3.1 ms');
  await widget.getByRole('button', { name: 'Older id' }).click();
  await expect(widget.locator('.notice')).toHaveText(/^Older id: G2's/);
});

test('the ids widget runs from the keyboard alone', async ({ page }) => {
  const { widget, summary } = await open(page);
  await widget.getByRole('button', { name: 'One generator bit more' }).focus();
  await page.keyboard.press('Enter');
  await expect(summary).toHaveAttribute('aria-label', /11 generator bits/);
  await widget.getByRole('radio', { name: '1 ms' }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(widget.getByRole('radio', { name: '10 ms' })).toBeChecked();
  await widget.getByRole('radio', { name: 'Nothing' }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(widget.getByRole('radio', { name: "G2's clock ahead" })).toBeChecked();
  await page.keyboard.press('Tab');
  await expect(widget.getByRole('checkbox', { name: /^Check the clock against the last timestamp/ })).toBeFocused();
  await page.keyboard.press('Space');
  await expect(widget.getByRole('checkbox', { name: /^Check the clock against the last timestamp/ })).not.toBeChecked();
  await widget.getByRole('slider', { name: 'Ids made' }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(widget.locator('.notice')).toHaveText(/ten billion|10¹⁰/);
  await widget.getByRole('button', { name: PLAY }).focus();
  await page.keyboard.press('Enter');
  await expect(widget.locator('.caption')).toHaveText(/^Reduced motion: the mint is drawn at its end\./);
  await widget.getByRole('button', { name: 'Describe' }).focus();
  await page.keyboard.press('Enter');
  await expect(widget.locator('.describe g-data-table tbody tr')).toHaveCount(20);
});

test('each ids experiment sets up in one tap, asks without giving its answer away, then reveals it', async ({ page }) => {
  const { widget, height, stageText, answer } = await open(page);
  const h = await height();
  const hidden: Record<string, string[]> = {
    'one-bit': ['34.8', '3 November 2060', 'halves'],
    burst: ['3.95 ms', '904', 'full ticks'],
    order: ['sorts first', 'made 0.7 ms later'],
    'clock-back': ['same id', 'made twice'],
    birthday: ['2.7%', '0.027'],
  };
  for (const [i, e] of SHOWN.entries()) {
    if (e.goal) continue;
    await widget.locator('.cards button').nth(i).click();
    const check = widget.locator('app-widget-check');
    await expect(check.locator('legend')).toHaveText(e.ask);
    await expect(widget.locator('.notice')).toHaveText(new RegExp(`^${e.title}`));
    await expect(widget.getByRole('button', { name: 'Describe' })).toBeDisabled();
    await expect(widget.getByRole('button', { name: 'One generator bit more' })).toBeDisabled();
    await expect(widget.getByRole('button', { name: 'Play the mint, after your answer' })).toBeDisabled();
    const words = await stageText();
    for (const giveaway of hidden[e.id]) expect(words, `${e.id}: "${giveaway}"`).not.toContain(giveaway);
    await answer(i);
    await expect(check.locator('.explain')).toHaveText(e.reveal);
    for (const region of e.focus) await expect(widget.locator(`[data-focus="${region}"]`)).toHaveClass(/focused/);
    await expect(widget.getByRole('button', { name: 'Describe' })).toBeEnabled();
    expect(await height(), e.id).toBe(h);
  }
  await expect(widget.locator('.cards .done')).toHaveCount(5);
});

test('the ids challenge is met only at 10 generator bits and 10 sequence bits on a 1 ms tick', async ({ page }) => {
  const { widget } = await open(page);
  await widget.locator('.cards button').last().click();
  const checks = widget.locator('.checks li');
  await expect(checks).toHaveText([
    '✓1,024 generators (need 1,000)',
    '✓4,096,000 ids a second each (need 1,000,000)',
    '·lasts 68.8 years from today (need 200 years)',
  ]);
  const fewer = widget.getByRole('button', { name: 'One sequence bit fewer' });
  await fewer.click();
  await expect(checks.nth(2)).toHaveText('·lasts 138.5 years from today (need 200 years)');
  await fewer.click();
  await expect(widget.locator('.status')).toHaveText('Goal met:');
  await expect(widget.locator('.notice')).toHaveText(/^Goal met\. /);
  await expect(widget.locator('.reveal')).toHaveText(SHOWN.at(-1)!.reveal);
  await fewer.click();
  await expect(widget.locator('.status')).toHaveText('You met it; now:');
});

test('Describe fits its box at 320, 412, 1280 and 1440px, and the page never scrolls sideways', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'one browser sets every width');
  for (const width of [320, 412, 1280, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    const { widget } = await open(page);
    await widget.getByRole('button', { name: 'Describe' }).click();
    const table = widget.locator('.describe g-data-table');
    await expect(table.locator('tbody tr')).toHaveCount(20);
    const { scrollW, boxW } = await table.evaluate((t) => ({ scrollW: t.scrollWidth, boxW: t.clientWidth }));
    expect(scrollW, `${width}px: the widest rows fit`).toBeLessThanOrEqual(boxW + 1);
    const right = await table.evaluate((t) => t.getBoundingClientRect().right);
    expect(right, `${width}px`).toBeLessThanOrEqual(width);
    expect(await page.evaluate(() => document.documentElement.scrollWidth), `${width}px`).toBeLessThanOrEqual(width);
  }
});

test('the on-stage controls are 44px targets apart at 320px and on desktop', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'one browser sets every width');
  for (const width of [320, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    const { widget } = await open(page);
    const boxes = await widget.evaluate((w) =>
      [...w.querySelectorAll('g-stage .play, g-stage .nav, g-stage label.segment, g-stage .stepper button')].map((e) => {
        const b = e.getBoundingClientRect();
        return { x0: b.left, x1: b.right, y0: b.top, y1: b.bottom };
      }),
    );
    for (const [i, a] of boxes.entries()) {
      expect(a.x1 - a.x0, `${width}px target ${i}`).toBeGreaterThanOrEqual(43.5);
      expect(a.y1 - a.y0, `${width}px target ${i}`).toBeGreaterThanOrEqual(43.5);
      for (const b of boxes.slice(i + 1))
        expect(Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) <= 0 || Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0) <= 0, `${width}px`).toBe(
          true,
        );
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth), `${width}px`).toBeLessThanOrEqual(width);
  }
});

test('no line parts a number from its unit in the notice, the controls, Describe or the dock, at 320 to 430 px and on desktop', async ({
  page,
}, testInfo) => {
  test.slow();
  const desktop = testInfo.project.name === 'desktop';
  for (const width of desktop ? [320, 375, 412, 430, 1280] : [320, 402]) {
    await page.setViewportSize({ width, height: 900 });
    const { widget, answer } = await open(page);
    const out: string[] = [];
    const look = async (what: string) => out.push(...(await unitSplits(widget)).map((x) => `${width}px ${what}: ${x}`));
    await widget.getByRole('radio', { name: "G1's clock steps back" }).check();
    await look('step back notice');
    await widget.getByRole('radio', { name: '5,000 at once' }).check();
    await look('burst notice');
    await widget.getByRole('button', { name: 'Describe' }).click();
    await look('Describe');
    for (const [i, e] of SHOWN.entries()) {
      await widget.locator('.cards button').nth(i).click();
      await look(`${e.id} asking`);
      if (e.goal) continue;
      await answer(i, (e.answer + 1) % e.choices.length);
      await expect(widget.locator('app-widget-check .explain')).toHaveText(e.reveal);
      await look(`${e.id} revealed`);
    }
    expect(out).toEqual([]);
  }
});

test("while its chunk loads, the placeholder holds the widget's height within 3 px at phone widths", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'one browser sets every width');
  test.slow();
  const chunk = new Promise<string>((found) =>
    page.on('response', async (response) => {
      if (response.url().endsWith('.js') && (await response.text().catch(() => '')).includes('app-ids-widget')) found(response.url());
    }),
  );
  await open(page);
  let unblock = () => {};
  let gate = Promise.resolve();
  // Routing also turns off the HTTP cache, so every load asks for the widget's chunk again.
  await page.route(await chunk, async (route) => {
    await gate;
    await route.continue();
  });
  const off: string[] = [];
  for (const width of [320, 360, 375, 390, 412, 430]) {
    gate = new Promise<void>((done) => (unblock = done));
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/design/topics/sd-ids');
    const lazy = page.locator('app-design-lesson:not(.ion-page-hidden) app-lazy-widget');
    await expect(lazy).toHaveCount(1);
    await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
    const held = await lazy.evaluate((el) => parseFloat(el.style.minHeight));
    unblock();
    const widget = shownWidget(page);
    await widget.locator('svg.draw [data-id="life-marker"]').waitFor();
    await page.waitForTimeout(200);
    const drawn = await widget.evaluate((el) => el.getBoundingClientRect().height);
    if (!(Math.abs(drawn - held) <= 3)) off.push(`${width}px: held ${held}, drawn ${drawn}`);
  }
  expect(off).toEqual([]);
});

for (const theme of ['light', 'dark'] as const)
  test.describe(`the ids widget in ${theme}`, () => {
    test.use({ theme, contextOptions: { reducedMotion: 'reduce' } });

    test('passes axe at rest, asking and revealed', async ({ page }) => {
      const { widget, answer } = await open(page);
      const scan = async () => {
        const { violations } = await new AxeBuilder({ page }).include('app-ids-widget').analyze();
        return violations
          .filter((v) => v.impact === 'serious' || v.impact === 'critical')
          .map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(', ')}`);
      };
      expect(await scan()).toEqual([]);
      await widget.locator('.cards button').nth(at('clock-back')).click();
      expect(await scan()).toEqual([]);
      await answer(at('clock-back'));
      await expect(widget.locator('app-widget-check .explain')).toHaveText(SHOWN[at('clock-back')].reveal);
      expect(await scan()).toEqual([]);
    });
  });

test.describe('the ids widget under Reduced motion', () => {
  test.use({ motionOff: false, reducedMotion: 'reduce' });
  test.beforeEach(({ page }) => page.addInitScript(countAnimate));

  test('runs no animation through a play and an experiment, and writes the mint under the stage', async ({ page }) => {
    const { widget, answer, figure } = await open(page);
    await page.evaluate(() => (window.animateCalls = 0));
    await widget.getByRole('button', { name: PLAY }).click();
    await expect(widget.locator('.caption')).toHaveText(/^Reduced motion: the mint is drawn at its end\. Three generators made 20 ids/);
    await expect(widget.locator('.notice')).toHaveText(/^Reduced motion: the mint is drawn at its end\./);
    await answer(at('burst'));
    await expect(widget.locator('app-widget-check .explain')).toHaveText(SHOWN[at('burst')].reveal);
    await expect(figure('burst-bracket')).toHaveCount(1);
    await expect(widget.locator('svg.draw .now-line')).toHaveCount(0);
    expect(await page.evaluate(() => window.animateCalls)).toBe(0);
  });
});

test.describe('the ids widget with motion', () => {
  test.use({ motionOff: false, reducedMotion: 'no-preference' });

  test('plays the mint on one clock, with a now line, and Stop ends it at its end', async ({ page }) => {
    const { widget } = await open(page);
    await widget.getByRole('button', { name: PLAY }).click();
    await expect(widget.locator('.notice')).toHaveText('Playing the mint: 8 ms of the clock, slowed down.');
    await expect(widget.locator('svg.draw .now-line')).toHaveCount(1);
    await expect.poll(() => widget.locator('svg.draw [data-id^="dot-g"]').count()).toBeLessThan(20);
    await widget.getByRole('button', { name: 'Stop the mint' }).click();
    await expect(widget.getByRole('button', { name: PLAY })).toBeVisible();
    await expect(widget.locator('.notice')).toHaveText(/^Stopped: the mint is drawn at its end\. Three generators made 20 ids/);
    await expect(widget.locator('svg.draw [data-id^="dot-g"]')).toHaveCount(20);
    await widget.getByRole('button', { name: PLAY }).click();
    await expect(widget.locator('.notice')).toHaveText(/^Three generators made 20 ids/, { timeout: 14_000 });
    await expect(widget.locator('svg.draw [data-id^="dot-g"]')).toHaveCount(20);
  });

  test('locks the settings while an answer plays, keeps it hidden, then reveals it', async ({ page }) => {
    const { widget, answer, stageText } = await open(page);
    const e = at('clock-back');
    await answer(e, 1);
    await expect(widget.locator('.notice')).toHaveText('Playing your guess.');
    await expect(widget.getByRole('button', { name: 'One generator bit more' })).toBeDisabled();
    expect(await stageText()).not.toContain('made twice');
    await expect(widget.locator('app-widget-check .explain')).toHaveText(SHOWN[e].reveal, { timeout: 14_000 });
    await expect(widget.getByRole('button', { name: 'One generator bit more' })).toBeEnabled();
    expect(await stageText()).toContain('same id as above');
  });

  test('on a phone, brings G0 into view before the burst plays', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const { widget, answer } = await open(page);
    const e = at('burst');
    await answer(e);
    await expect(widget.locator('[data-id="lane-line-0"], [data-focus="laneG0"]').first()).toBeInViewport();
    await expect(widget.locator('app-widget-check .explain')).toHaveText(SHOWN[e].reveal, { timeout: 14_000 });
  });
});
