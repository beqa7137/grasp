import AxeBuilder from '@axe-core/playwright';
import type { Locator, Page } from '@playwright/test';
import { DURABILITY_EXPERIMENTS, renderExperiment } from '@grasp/engine';
import { expect, test } from './fixtures';

const SHOWN = DURABILITY_EXPERIMENTS.map(renderExperiment);
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

const shownWidget = (page: Page) => page.locator('app-design-lesson:not(.ion-page-hidden) app-durability-widget');

async function open(page: Page) {
  await page.goto('/design/topics/sd-durability');
  const widget = shownWidget(page);
  const summary = widget.locator('svg.draw');
  // Read the widget only once it is drawn: its summary names the setting.
  await expect(summary).toHaveAttribute('aria-label', /^One object stored as /);
  await widget.locator('.durability-stage').scrollIntoViewIfNeeded();
  const height = () => widget.locator('g-stage .well').evaluate((w) => (w as HTMLElement).style.height);
  const stageText = () => widget.locator('svg.draw text').allTextContents();
  const figure = (id: string) => widget.locator(`svg.draw [data-id="${id}"]`);
  const answer = async (i: number, choice = SHOWN[i].answer) => {
    await widget.locator('.cards button').nth(i).click();
    await widget.locator('app-widget-check').getByRole('button', { name: SHOWN[i].choices[choice], exact: true }).click();
  };
  const radio = (name: string) => widget.getByRole('radio', { name, exact: true });
  return { widget, summary, height, stageText, figure, answer, radio };
}

/** Each number on a shown HTML surface of the widget that a line break parts from its unit. */
function unitSplits(widget: Locator) {
  return widget.evaluate((w) => {
    const out: string[] = [];
    for (const el of w.querySelectorAll('.notice, .readout, .model-note, .describe .said, app-experiment-dock .dock')) {
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
        .matchAll(
          /\d[\d,.]*%? (?:h|TB|PB|MB|Gb\/s|nines|years|a year)\b|\b1 in \d[\d,.]*(?: (?:million|billion|trillion))?|\d+ \+ \d+|1 every \d[\d,.]*(?: million)? years/g,
        )) {
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

test('the durability widget draws one object on its disks, one repair and the model, and changes with every control', async ({ page }) => {
  const { widget, summary, height, figure, radio } = await open(page);
  await expect(summary).toHaveAttribute('aria-label', /The model gives 9\.7 nines, a yearly loss chance of 1 in 5\.6 billion/);
  await expect(figure('stored-words')).toHaveText('stored: 3 × 1 = 3×');
  await expect(figure('head-val-2')).toHaveText('9.7');
  await expect(figure('disk-free-name')).toHaveText('→c3');
  const h = await height();
  await radio('6 + 3 erasure coding').check();
  await expect(figure('head-val-2')).toHaveText('11.8');
  await expect(figure('stored-words')).toHaveText('stored: 9 × 1/6 = 1.5×');
  await expect(figure('ghost-words')).toHaveText('before 9.7');
  await radio('168 h, a week').check();
  await expect(figure('row-window1-value')).toHaveText('× 1 in 2,600 (was 1 in 18,000)');
  await radio('10% of disks fail a year').check();
  await widget.getByRole('radio', { name: /^One rack: every \w+ in one rack$/ }).check();
  await expect(summary).toHaveAttribute('aria-label', /all in one rack/);
  await expect(widget.locator('.model-note')).toContainText('Here every piece shares one rack');
  await radio('10 + 4 erasure coding').check();
  await expect(widget.getByRole('group', { name: 'Repair time' })).toHaveAccessibleDescription(
    'Time to full redundancy: detect and rebuild',
  );
  expect(await height()).toBe(h);
});

test('the durability widget runs from the keyboard alone', async ({ page }) => {
  const { widget, summary, radio } = await open(page);
  await radio('3 copies').focus();
  await page.keyboard.press('ArrowRight');
  await expect(radio('6 + 3 erasure coding')).toBeChecked();
  await page.keyboard.press('Tab');
  await expect(radio('2% of disks fail a year')).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(summary).toHaveAttribute('aria-label', /at 5% a year/);
  await page.keyboard.press('Tab');
  await expect(radio('24 h')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(radio('A rack each: every piece in its own rack')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(widget.getByRole('button', { name: 'Play a repair' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(widget.locator('.notice')).toHaveText(/^d3 fails, and its 24 h repair starts/);
  await page.keyboard.press('Tab');
  await expect(widget.getByRole('button', { name: /^Stage a loss/ })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(widget.getByRole('button', { name: /^Stage a loss/ })).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Tab');
  await expect(widget.getByRole('button', { name: 'Describe' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(widget.locator('.describe g-data-table tbody tr')).toHaveCount(6);
});

test('each durability experiment sets up in one tap, asks without giving its answer away, then reveals it', async ({ page }) => {
  const { widget, height, stageText, answer, radio } = await open(page);
  const h = await height();
  const hidden: Record<string, string[]> = {
    half: ['11.8', '110×'],
    window: ['1 in 18,000', '49×', '8.1'],
    reads: ['200 TB'],
    batch: ['7.9', '× 715'],
    rack: ['3.0 nines'],
  };
  for (const [i, e] of SHOWN.entries()) {
    if (e.goal) continue;
    await widget.locator('.cards button').nth(i).click();
    const check = widget.locator('app-widget-check');
    await expect(check.locator('legend')).toHaveText(e.ask);
    await expect(widget.getByRole('button', { name: /after your answer$/ })).toHaveCount(2);
    await expect(widget.getByRole('button', { name: 'Describe' })).toBeDisabled();
    await expect(radio('1 h')).toBeDisabled();
    await expect(widget.locator('.notice')).toHaveText('Play, Stage a loss and the settings wait for your answer.');
    const words = (await stageText()).join(' | ');
    for (const giveaway of hidden[e.id]) expect(words, `${e.id}: "${giveaway}"`).not.toContain(giveaway);
    await answer(i);
    await expect(check.locator('.explain')).toHaveText(e.reveal);
    for (const region of e.focus) await expect(widget.locator(`[data-focus~="${region}"]`)).toHaveClass(/focused/);
    expect(await height(), e.id).toBe(h);
  }
  await expect(widget.locator('.cards .done')).toHaveCount(5);
});

test('the durability challenge is met only at 10 + 4 in separate racks with 72 h repairs', async ({ page }) => {
  const { widget, radio } = await open(page);
  await widget.locator('.cards button').last().click();
  const checks = widget.locator('.checks li');
  await expect(checks).toHaveText([
    '·on average 3 a year among a billion, fewer than 1 every 10 years: not yet',
    '·stored at 3×, at most 1.5×: not yet',
    '✓a rebuild reads 1.9 Gb/s, under 10 Gb/s: met',
  ]);
  await expect(radio('2% of disks fail a year')).toBeDisabled();
  await radio('10 + 4 erasure coding').check();
  await expect(checks.nth(2)).toHaveText('·a rebuild reads 19 Gb/s, under 10 Gb/s: not yet');
  await radio('72 h').check();
  await expect(widget.locator('.status')).toHaveText('Goal met:');
  await expect(widget.locator('.reveal')).toHaveText(SHOWN.at(-1)!.reveal);
  await radio('168 h, a week').check();
  await expect(widget.locator('.status')).toHaveText('You met it; now:');
});

test('Describe fits its box at 320, 412, 1280 and 1440px, and the page never scrolls sideways', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'one browser sets every width');
  for (const width of [320, 412, 1280, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    const { widget, radio } = await open(page);
    await radio('10 + 4 erasure coding').check();
    await widget.getByRole('radio', { name: /^One rack: every \w+ in one rack$/ }).check();
    await widget.getByRole('button', { name: 'Describe' }).click();
    const table = widget.locator('.describe g-data-table');
    await expect(table.locator('tbody tr')).toHaveCount(8);
    const { scrollW, boxW } = await table.evaluate((t) => ({ scrollW: t.scrollWidth, boxW: t.clientWidth }));
    expect(scrollW, `${width}px: the widest rows fit`).toBeLessThanOrEqual(boxW);
    const split = await table.evaluate(
      (t) =>
        [...t.querySelectorAll('td')].filter((cell) => {
          const r = document.createRange();
          r.selectNodeContents(cell);
          return new Set([...r.getClientRects()].map((x) => Math.round(x.top))).size > 1;
        }).length,
    );
    expect(split, `${width}px`).toBe(0);
    const rights = await widget.evaluate((w) =>
      ['.durability-stage', '.controls', '.describe g-data-table'].map((s) => w.querySelector(s)!.getBoundingClientRect().right),
    );
    for (const right of rights) expect(right, `${width}px`).toBeLessThanOrEqual(width);
    expect(await page.evaluate(() => document.documentElement.scrollWidth), `${width}px`).toBeLessThanOrEqual(width);
  }
});

test('every control is a 44px target with its words inside its box, at 320px and on desktop', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'one browser sets every width');
  for (const width of [320, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    const { widget } = await open(page);
    const boxes = await widget.evaluate((w) =>
      [...w.querySelectorAll('g-stage .play, g-stage .pill, .controls label.segment')].map((e) => {
        const b = e.getBoundingClientRect();
        const span = e.querySelector('span');
        const s = span?.getBoundingClientRect();
        return {
          x0: b.left,
          x1: b.right,
          y0: b.top,
          y1: b.bottom,
          over: !!span && (span.scrollWidth > span.clientWidth + 1 || span.scrollHeight > span.clientHeight + 1),
          inset: s && span!.textContent ? Math.min(...[...span!.getClientRects()].map((r) => r.left - b.left)) : 99,
        };
      }),
    );
    for (const [i, a] of boxes.entries()) {
      expect(a.x1 - a.x0, `${width}px target ${i}`).toBeGreaterThanOrEqual(43.5);
      expect(a.y1 - a.y0, `${width}px target ${i}`).toBeGreaterThanOrEqual(43.5);
      expect(a.over, `${width}px target ${i}'s words`).toBe(false);
      for (const b of boxes.slice(i + 1))
        expect(Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) <= 0 || Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0) <= 0, `${width}px`).toBe(
          true,
        );
    }
  }
});

test('no line parts a number from its unit in the notice, the readout, the note, Describe or the dock', async ({ page }, testInfo) => {
  test.slow();
  const desktop = testInfo.project.name === 'desktop';
  for (const width of desktop ? [320, 375, 412, 430, 1280] : [320, 402]) {
    await page.setViewportSize({ width, height: 900 });
    const { widget, answer, radio } = await open(page);
    const out: string[] = [];
    const look = async (what: string) => out.push(...(await unitSplits(widget)).map((x) => `${width}px ${what}: ${x}`));
    for (const scheme of ['2 copies', '6 + 3 erasure coding', '10 + 4 erasure coding'])
      for (const repair of ['1 h', '168 h, a week']) {
        await radio(scheme).check();
        await radio(repair).check();
        await look(`${scheme} ${repair}`);
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
  test.describe(`the durability widget in ${theme}`, () => {
    test.use({ theme, contextOptions: { reducedMotion: 'reduce' } });

    test('passes axe at rest, asking and revealed', async ({ page }) => {
      const { widget, answer } = await open(page);
      const scan = async () => {
        const { violations } = await new AxeBuilder({ page }).include('app-durability-widget').analyze();
        return violations
          .filter((v) => v.impact === 'serious' || v.impact === 'critical')
          .map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(', ')}`);
      };
      expect(await scan()).toEqual([]);
      await widget.locator('.cards button').nth(at('reads')).click();
      expect(await scan()).toEqual([]);
      await answer(at('reads'));
      await expect(widget.locator('app-widget-check .explain')).toHaveText(SHOWN[at('reads')].reveal);
      expect(await scan()).toEqual([]);
    });
  });

test.describe('the durability widget under Reduced motion', () => {
  test.use({ motionOff: false, reducedMotion: 'reduce' });
  test.beforeEach(({ page }) => page.addInitScript(countAnimate));

  test('steps a repair through its three moments, says each, and runs no animation through an experiment', async ({ page }) => {
    const { widget, answer, figure } = await open(page);
    await page.evaluate(() => (window.animateCalls = 0));
    const play = widget.locator('button.play');
    await play.click();
    await expect(widget.locator('.notice')).toHaveText(/^c3 fails, and its 24 h repair starts/);
    await expect(play).toHaveAttribute('aria-label', 'Next moment, 2 of 3');
    await play.click();
    await expect(widget.locator('.notice')).toHaveText(/^c3 is being rebuilt on a free disk/);
    await expect(play).toHaveAttribute('aria-label', 'Next moment, 3 of 3');
    await play.click();
    await expect(widget.locator('.notice')).toHaveText(/^c3 is rebuilt on a free disk in 24 h/);
    await expect(figure('disk-free-name')).toHaveText('→c3');
    await answer(at('half'));
    await expect(widget.locator('app-widget-check .explain')).toHaveText(SHOWN[at('half')].reveal);
    await expect(widget.locator('svg.draw circle.read-dot')).toHaveCount(0);
    expect(await page.evaluate(() => window.animateCalls)).toBe(0);
  });
});

test.describe('the durability widget with motion', () => {
  test.use({ motionOff: false, reducedMotion: 'no-preference' });

  test('plays a repair on one clock with one read dot a source, and Stop ends it at its rest state', async ({ page }) => {
    const { widget, figure, radio } = await open(page);
    await radio('6 + 3 erasure coding').check();
    await widget.getByRole('button', { name: 'Play a repair' }).click();
    await expect(widget.getByRole('button', { name: 'Repairing, press to stop' })).toBeVisible();
    await expect(widget.locator('svg.draw circle.read-dot')).toHaveCount(6);
    await expect(figure('head-val-2')).toHaveText('…');
    await widget.getByRole('button', { name: 'Repairing, press to stop' }).click();
    await expect(figure('head-val-2')).toHaveText('11.8');
    await expect(widget.locator('svg.draw circle.read-dot')).toHaveCount(0);
    await widget.getByRole('button', { name: /^Stage a loss/ }).click();
    await expect(figure('staged-tag-words')).toHaveText('STAGED, NOT SAMPLED');
    await expect(widget.locator('.notice')).toHaveText(/^Staged, not sampled: d3 fails, and before its 24 h repair ends/, {
      timeout: 14_000,
    });
  });

  test('locks the settings while an answer plays, keeps it hidden, then reveals it', async ({ page }) => {
    const { widget, answer, stageText, radio } = await open(page);
    const e = at('window');
    await answer(e, 0);
    await expect(radio('1 h')).toBeDisabled();
    expect((await stageText()).join(' | ')).not.toContain('8.1');
    await expect(widget.locator('app-widget-check .explain')).toHaveText(SHOWN[e].reveal, { timeout: 14_000 });
    await expect(radio('1 h')).toBeEnabled();
    expect((await stageText()).join(' | ')).toContain('8.1 nines');
  });

  test('on a phone, brings the disks into view before the answer plays there', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const { widget, answer, figure } = await open(page);
    const e = at('half');
    await answer(e);
    await expect(figure('disk-free')).toBeInViewport();
    await expect(widget.locator('app-widget-check .explain')).toHaveText(SHOWN[e].reveal, { timeout: 14_000 });
  });
});
