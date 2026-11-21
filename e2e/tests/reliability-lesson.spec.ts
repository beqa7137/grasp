import AxeBuilder from '@axe-core/playwright';
import type { Locator, Page } from '@playwright/test';
import { RELIABILITY_EXPERIMENTS, renderExperiment } from '@grasp/engine';
import { expect, test } from './fixtures';

const SHOWN = RELIABILITY_EXPERIMENTS.map(renderExperiment);
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

const shownWidget = (page: Page) => page.locator('app-design-lesson:not(.ion-page-hidden) app-reliability-widget');

async function open(page: Page) {
  await page.goto('/design/topics/sd-reliability');
  const widget = shownWidget(page);
  await widget.locator('svg.draw .capline').waitFor({ state: 'attached' });
  await widget.locator('.reliability-stage').scrollIntoViewIfNeeded();
  const summary = widget.locator('svg.draw');
  const height = () => widget.locator('g-stage .well').evaluate((w) => (w as HTMLElement).style.height);
  const stageText = async () => (await widget.locator('svg.draw text').allTextContents()).join(' ');
  const answer = async (i: number, choice = SHOWN[i].answer) => {
    await widget.locator('.cards button').nth(i).click();
    await widget.locator('app-widget-check').getByRole('button', { name: SHOWN[i].choices[choice], exact: true }).click();
  };
  return { widget, summary, height, stageText, answer };
}

/** Each number on a shown HTML surface of the widget that a line break parts from its unit, or a copy or week from its number. */
function unitSplits(widget: Locator) {
  return widget.evaluate((w) => {
    const out: string[] = [];
    for (const el of w.querySelectorAll('.notice, .readout, .standing, .describe .said, app-experiment-dock .dock')) {
      if (el.getBoundingClientRect().width < 2) continue;
      const nodes: Text[] = [];
      const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      while (walk.nextNode()) nodes.push(walk.currentNode as Text);
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
        .matchAll(/(?:\d[\d,.]* × )?\d[\d,.]* (?:s|min|h|d)\b|\b(?:Week|DB|LB|App|Recs) \d+\b/g)) {
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

test('the reliability widget draws the chain and its year over the exact model, and changes with every control', async ({ page }) => {
  const { widget, summary, height, stageText } = await open(page);
  await expect(summary).toHaveAttribute(
    'aria-label',
    /^A request crosses 2 load balancers, 3 app servers, 1 database and 1 recommendations service/,
  );
  await expect(summary).toHaveAttribute(
    'aria-label',
    /By the model the request is 99\.8% available: down 17\.5 h a year, 86 min in 30 days\./,
  );
  expect(await stageText()).toContain('In this simulated year the request failed 17 times, 17 h in all: each for 1 h.');
  const h = await height();
  await widget.getByRole('button', { name: 'More databases' }).click();
  await expect(widget.locator('output[aria-label="Database: 2 copies"]')).toBeVisible();
  await expect(summary).toHaveAttribute('aria-label', /By the model the request is 99\.89% available: down 8\.8 h a year/);
  await widget.getByRole('checkbox', { name: /^Recs optional/ }).check();
  await widget.getByRole('checkbox', { name: /^Shared failures/ }).check();
  await widget.getByRole('checkbox', { name: /^Failover 5 min/ }).check();
  await expect(summary).toHaveAttribute('aria-label', /down 4\.6 h a year/);
  await expect.poll(stageText).toContain('A pair is down 92 min a year, 32 s on paper');
  await widget.getByRole('button', { name: 'Fewer load balancers' }).click();
  await expect(widget.getByRole('button', { name: 'Fewer load balancers' })).toBeDisabled();
  expect(await height()).toBe(h);
});

test('the reliability widget runs from the keyboard alone', async ({ page }) => {
  const { widget, summary } = await open(page);
  await widget.getByRole('button', { name: 'Fewer app servers' }).focus();
  await page.keyboard.press('Enter');
  await expect(widget.locator('output[aria-label="App servers: 2 copies"]')).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(widget.getByRole('button', { name: 'More app servers' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(widget.locator('output[aria-label="App servers: 3 copies"]')).toBeVisible();
  await widget.getByRole('checkbox', { name: /^Shared failures/ }).focus();
  await page.keyboard.press('Space');
  await expect(summary).toHaveAttribute('aria-label', /1 in 10 of a copy’s outages is shared/);
  const play = widget.locator('button.play:not(.step)');
  await play.focus();
  await page.keyboard.press('ArrowRight');
  await expect(widget.locator('.notice')).toHaveText(/^Week \d+:/);
  await page.keyboard.press('ArrowLeft');
  await expect(widget.locator('.notice')).toHaveText(/^Week \d+:/);
  await widget.getByRole('button', { name: 'Describe' }).focus();
  await page.keyboard.press('Enter');
  await expect(widget.locator('.describe g-data-table tbody tr')).toHaveCount(5);
});

test('each reliability experiment sets up in one tap, asks without giving its answer away, then reveals it', async ({ page }) => {
  const { widget, height, stageText, answer } = await open(page);
  const h = await height();
  const hidden: Record<string, string[]> = {
    series: ['35 h', '99.6%', '35 times'],
    parallel: ['99.9999%', 'both down', 'Both at once'],
    weakest: ['Weakest link:', 'capped', 'has no other copy'],
    shared: ['2.6 h', 'shared failure takes'],
    failover: ['26 times', '27 times', '2.2 h'],
  };
  for (const [i, e] of SHOWN.entries()) {
    if (e.goal) continue;
    await widget.locator('.cards button').nth(i).click();
    const check = widget.locator('app-widget-check');
    await expect(check.locator('legend')).toHaveText(e.ask);
    await expect(widget.getByRole('button', { name: 'Play the year, after your answer' })).toBeDisabled();
    await expect(widget.getByRole('button', { name: 'Describe' })).toBeDisabled();
    await expect(widget.getByRole('button', { name: 'More databases' })).toBeDisabled();
    const words = await stageText();
    for (const giveaway of hidden[e.id]) expect(words, `${e.id}: "${giveaway}"`).not.toContain(giveaway);
    await answer(i);
    await expect(check.locator('.explain')).toHaveText(e.reveal);
    for (const region of e.focus)
      await expect(widget.locator(`[data-focus="${e.id === 'failover' ? 'timeline' : region}"]`)).toHaveClass(/focused/);
    expect(await height(), e.id).toBe(h);
  }
  await expect(widget.locator('.cards .done')).toHaveCount(5);
});

test('the reliability challenge is met only with pairs of the hard parts and recommendations optional', async ({ page }) => {
  const { widget } = await open(page);
  await widget.locator('.cards button').last().click();
  const checks = widget.locator('.checks li');
  await expect(checks).toHaveText(['·the request down 20.6 h a year, under 8.76 h: not yet', '✓7 copies in all, no more than 7: met']);
  await expect(widget.getByRole('checkbox', { name: /^Shared failures/ })).toBeDisabled();
  await widget.getByRole('button', { name: 'Fewer app servers' }).click();
  await widget.getByRole('button', { name: 'More databases' }).click();
  await widget.getByRole('checkbox', { name: /^Recs optional/ }).check();
  await expect(widget.locator('.status')).toHaveText('Goal met:');
  await expect(checks.first()).toHaveText('✓the request down 4.6 h a year, under 8.76 h: met');
  await expect(widget.locator('.reveal')).toHaveText(SHOWN.at(-1)!.reveal);
  await widget.getByRole('button', { name: 'More app servers' }).click();
  await expect(widget.locator('.status')).toHaveText('You met it; now:');
});

test('the reliability panel breaks out at container wide, and stacks the controls over the stage below it', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'container widths are a desktop question');
  const { widget } = await open(page);
  const box = async (selector: string) => (await widget.locator(selector).first().boundingBox())!;
  expect((await box('.controls')).x).toBeGreaterThanOrEqual((await box('.reliability-stage')).x + (await box('.reliability-stage')).width);
  for (const width of [800, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await expect.poll(async () => (await box('.controls')).x).toBeLessThan((await box('.reliability-stage')).x + 10);
    const [toggles, stage] = [await box('.toggles3'), await box('.reliability-stage')];
    expect(toggles.y + toggles.height, `${width}px: the controls over the stage`).toBeLessThanOrEqual(stage.y);
    await expect(widget.locator('.readout')).toBeVisible();
  }
});

test('a checked toggle’s glyph keeps clear of its name, at 320, 360 and 412px', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'one browser sets every width');
  for (const width of [320, 360, 412]) {
    await page.setViewportSize({ width, height: 900 });
    const { widget } = await open(page);
    for (const name of [/^Recs optional/, /^Shared failures/, /^Failover 5 min/]) await widget.getByRole('checkbox', { name }).check();
    const gaps = await widget.evaluate((w) =>
      [...w.querySelectorAll<HTMLElement>('.toggles3 input:checked + span')].map((span) => {
        const s = getComputedStyle(span);
        const g = getComputedStyle(span, '::after');
        const r = span.getBoundingClientRect();
        const gw = parseFloat(g.width) + parseFloat(g.borderLeftWidth);
        const gh = parseFloat(g.height) + parseFloat(g.borderBottomWidth);
        // The glyph is rotated 45 degrees about its center: its bounds are a square of (w + h) / sqrt 2.
        const side = (gw + gh) / Math.SQRT2;
        const cx = r.right - parseFloat(s.borderRightWidth) - parseFloat(g.right) - gw / 2;
        const cy = r.top + parseFloat(s.borderTopWidth) + parseFloat(g.top) + gh / 2;
        const range = document.createRange();
        range.selectNodeContents(span.firstChild!);
        const t = range.getBoundingClientRect();
        return Math.max(t.left - (cx + side / 2), cx - side / 2 - t.right, t.top - (cy + side / 2), cy - side / 2 - t.bottom);
      }),
    );
    expect(gaps, `${width}px`).toHaveLength(3);
    for (const gap of gaps) expect(gap, `${width}px`).toBeGreaterThanOrEqual(1);
  }
});

test('Describe scrolls inside its own box at 320, 412, 1280 and 1440px: the page never scrolls sideways', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'one browser sets every width');
  for (const width of [320, 412, 1280, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    const { widget } = await open(page);
    await widget.getByRole('checkbox', { name: /^Shared failures/ }).check();
    await widget.getByRole('button', { name: 'Describe' }).click();
    const table = widget.locator('.describe g-data-table');
    await expect(table.locator('tbody tr')).toHaveCount(5);
    const { scrollW, boxW } = await table.evaluate((t) => ({ scrollW: t.scrollWidth, boxW: t.clientWidth }));
    expect(scrollW, `${width}px: the widest rows fit`).toBeLessThanOrEqual(boxW);
    const rights = await widget.evaluate((w) =>
      ['.reliability-stage', '.controls', '.describe g-data-table'].map((s) => w.querySelector(s)!.getBoundingClientRect().right),
    );
    for (const right of rights) expect(right, `${width}px`).toBeLessThanOrEqual(width);
    expect(await page.evaluate(() => document.documentElement.scrollWidth), `${width}px`).toBeLessThanOrEqual(width);
  }
});

test('no line parts a number from its unit, or a name from its number, in the notice, the readout, Describe or the dock', async ({
  page,
}, testInfo) => {
  test.slow();
  const desktop = testInfo.project.name === 'desktop';
  for (const width of desktop ? [320, 360, 375, 390, 412, 430, 1280] : [320, 390, 430]) {
    await page.setViewportSize({ width, height: 900 });
    const { widget, answer } = await open(page);
    const out: string[] = [];
    const look = async (what: string) => out.push(...(await unitSplits(widget)).map((x) => `${width}px ${what}: ${x}`));
    await look('rest');
    for (const name of [/^Shared failures/, /^Failover 5 min/]) {
      await widget.getByRole('checkbox', { name }).check();
      await look('a condition');
    }
    await widget.locator('button.play:not(.step)').focus();
    for (let k = 0; k < 4; k++) {
      await page.keyboard.press('ArrowRight');
      await look(`moment ${k}`);
    }
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

for (const theme of ['light', 'dark'] as const)
  test.describe(`the reliability widget in ${theme}`, () => {
    test.use({ theme, contextOptions: { reducedMotion: 'reduce' } });

    test('passes axe at rest, asking and revealed', async ({ page }) => {
      const { widget, answer } = await open(page);
      const scan = async () => {
        const { violations } = await new AxeBuilder({ page }).include('app-reliability-widget').analyze();
        return violations
          .filter((v) => v.impact === 'serious' || v.impact === 'critical')
          .map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(', ')}`);
      };
      expect(await scan()).toEqual([]);
      await widget.locator('.cards button').nth(at('shared')).click();
      expect(await scan()).toEqual([]);
      await answer(at('shared'));
      await expect(widget.locator('app-widget-check .explain')).toHaveText(SHOWN[at('shared')].reveal);
      expect(await scan()).toEqual([]);
    });
  });

test.describe('the reliability widget under Reduced motion', () => {
  test.use({ motionOff: false, reducedMotion: 'reduce' });
  test.beforeEach(({ page }) => page.addInitScript(countAnimate));

  test('runs no animation: Play steps through the moments, and an answer reveals at once on its hold', async ({ page }) => {
    const { widget, answer, stageText } = await open(page);
    await page.evaluate(() => (window.animateCalls = 0));
    const play = widget.locator('button.play:not(.step)');
    await expect(play).toHaveAttribute('aria-label', 'Next moment, 2 of 3');
    await play.click();
    await expect(widget.locator('.notice')).toHaveText(/^Week 11: LB 1 is down for 1 h\./);
    await expect(play).toHaveAttribute('aria-label', 'Next moment, 3 of 3');
    await play.click();
    await expect(widget.locator('.notice')).toHaveText(/^Week 14: the database is down for 1 h/);
    await expect(play).toHaveAttribute('aria-label', 'Next moment, 1 of 3');
    await play.click();
    await expect(widget.locator('.notice')).toHaveText(
      'Week 3: the recommendations service is down for 1 h and has no other copy, so the request fails.',
    );
    await answer(at('parallel'));
    await expect(widget.locator('app-widget-check .explain')).toHaveText(SHOWN[at('parallel')].reveal);
    await expect.poll(stageText).toContain('If both were down at once: their overlap, magnified, is 0.1% of 8.76 h = 32 s a year.');
    expect(await page.evaluate(() => window.animateCalls)).toBe(0);
  });
});

test.describe('the reliability widget with motion', () => {
  test.use({ motionOff: false, reducedMotion: 'no-preference' });
  test.beforeEach(({ page }) => page.addInitScript(countAnimate));

  test('plays the year on one clock, Stop ends it, and a full play ends on the rest moment', async ({ page }) => {
    const { widget } = await open(page);
    await widget.getByRole('button', { name: 'Play the year' }).click();
    await expect(widget.getByRole('button', { name: 'Stop the year' })).toBeVisible();
    await expect(widget.locator('svg.draw [data-id="playhead"]')).toHaveCount(1);
    let last = 0;
    for (let i = 0; i < 6; i++) {
      const clip = Number(await widget.locator('clipPath rect').getAttribute('width'));
      expect(clip).toBeGreaterThanOrEqual(last);
      last = clip;
      await page.waitForTimeout(200);
    }
    await widget.getByRole('button', { name: 'Stop the year' }).click();
    await expect(widget.locator('svg.draw [data-id="playhead"]')).toHaveCount(0);
    await widget.getByRole('button', { name: 'Play the year' }).click();
    await expect(widget.locator('.notice')).toHaveText(/^In this simulated year the request failed 17 times/, { timeout: 15_000 });
    expect(await page.evaluate(() => window.animateCalls)).toBeGreaterThan(0);
  });

  test('locks the settings while an answer plays, keeps it hidden, then reveals it', async ({ page }) => {
    const { widget, answer, stageText } = await open(page);
    await answer(at('shared'), 0);
    await expect(widget.getByRole('button', { name: 'More databases' })).toBeDisabled();
    expect(await stageText()).not.toContain('2.6 h');
    await expect(widget.locator('app-widget-check .explain')).toHaveText(SHOWN[at('shared')].reveal, { timeout: 15_000 });
    await expect(widget.getByRole('button', { name: 'Fewer databases' })).toBeEnabled();
    await expect.poll(stageText).toContain('2.6 h');
  });

  test('reveals an experiment on a phone with the stage in view, and its first focus outline too', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const { widget, answer } = await open(page);
    await answer(at('failover'));
    await expect(widget.locator('.reliability-stage')).toBeInViewport();
    await expect(widget.locator('app-widget-check .explain')).toHaveText(SHOWN[at('failover')].reveal, { timeout: 15_000 });
    await expect(widget.locator('.focused .focus-outline').first()).toBeInViewport({ ratio: 0.1 });
  });
});
