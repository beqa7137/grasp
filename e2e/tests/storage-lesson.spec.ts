import AxeBuilder from '@axe-core/playwright';
import type { Locator, Page } from '@playwright/test';
import { STORAGE_EXPERIMENTS, renderExperiment } from '@grasp/engine';
import { expect, test } from './fixtures';

const SHOWN = STORAGE_EXPERIMENTS.map(renderExperiment);
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

const shownWidget = (page: Page) => page.locator('app-design-lesson:not(.ion-page-hidden) app-storage-widget');

async function open(page: Page) {
  await page.goto('/design/topics/sd-storage');
  const widget = shownWidget(page);
  const summary = widget.locator('svg.draw');
  // Read the widget only once it is drawn: its summary names the setting.
  await expect(summary).toHaveAttribute('aria-label', /^A B-tree and an LSM tree each hold/);
  await widget.locator('.storage-stage').scrollIntoViewIfNeeded();
  const height = () => widget.locator('g-stage .well').evaluate((w) => (w as HTMLElement).style.height);
  const stageText = () => widget.locator('svg.draw text').allTextContents();
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
    for (const el of w.querySelectorAll('.notice, .caption, .model-note, .describe .said, .describe .note, app-experiment-dock .dock')) {
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
        .matchAll(/\d[\d,.]* (?:bytes|B|KB|MB\/s|MB|GB|levels?|runs?|disk reads?)\b|"[^"\s]+(?: [^"\s]+){0,2}"/g)) {
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

test('the storage widget draws one write through both engines, and changes with every control', async ({ page }) => {
  const { widget, summary, height, figure } = await open(page);
  await expect(summary).toHaveAttribute(
    'aria-label',
    /An update writes its whole page and a log record, 4,196 bytes for 100 bytes: 42× the data\./,
  );
  await expect(figure('bt-ledger')).toHaveText('4,096 B + 100 B = 4,196 B written');
  await expect(figure('lsm-total')).toHaveText('24× the data');
  const h = await height();
  await widget.getByRole('radio', { name: '16 KB' }).check();
  await expect(figure('write-btree')).toHaveText(/^165× .* · was 42×$/);
  await widget.getByRole('radio', { name: '4', exact: true }).check();
  await expect(figure('lsm-total')).toHaveText('17× the data');
  await widget.getByRole('radio', { name: '1,000 GB' }).check();
  await widget.getByRole('radio', { name: '1,000 B' }).check();
  await expect(summary).toHaveAttribute('aria-label', /hold 1,000 GB of data in records of 1,000 bytes/);
  await widget.getByRole('radio', { name: 'A lookup' }).check();
  await expect(summary).toHaveAttribute('aria-label', /the stage follows one lookup through both/);
  await expect(widget.getByRole('checkbox', { name: 'Bloom filters' })).toHaveAccessibleDescription('1.3 GB of memory');
  await widget.getByRole('checkbox', { name: 'Bloom filters' }).uncheck();
  await expect(widget.getByRole('checkbox', { name: 'Bloom filters' })).toHaveAccessibleDescription('off: no filter memory');
  await expect(figure('lsm-total')).toHaveText('8 disk reads');
  await expect(widget.getByRole('button', { name: 'Play the lookup through the LSM tree' })).toBeEnabled();
  expect(await height()).toBe(h);
});

test('the storage widget runs from the keyboard alone', async ({ page }) => {
  const { widget, summary } = await open(page);
  await widget.getByRole('radio', { name: 'A write' }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(widget.getByRole('radio', { name: 'A lookup' })).toBeChecked();
  await page.keyboard.press('Tab');
  await expect(widget.getByRole('radio', { name: '100 GB' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(widget.getByRole('radio', { name: '100 B' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(widget.getByRole('button', { name: 'Play the lookup through the B-tree' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(widget.getByRole('radio', { name: '4 KB' })).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(widget.getByRole('radio', { name: '8 KB' })).toBeChecked();
  await page.keyboard.press('Tab');
  await expect(widget.getByRole('button', { name: 'Play the lookup through the LSM tree' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(widget.locator('.notice')).toHaveText(/^The lookup checks the memtable/);
  await page.keyboard.press('Tab');
  await expect(widget.getByRole('radio', { name: '10', exact: true })).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await expect(summary).toHaveAttribute('aria-label', /LSM tree, size ratio 5, bloom filters on/);
  await page.keyboard.press('Tab');
  await expect(widget.getByRole('checkbox', { name: 'Bloom filters' })).toBeFocused();
  await page.keyboard.press('Space');
  await expect(widget.getByRole('checkbox', { name: 'Bloom filters' })).not.toBeChecked();
  await page.keyboard.press('Tab');
  await expect(widget.getByRole('button', { name: 'Describe' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(widget.locator('.describe g-data-table tbody tr')).toHaveCount(7);
  await expect(widget.locator('.describe g-data-table tr[aria-current="true"]')).toHaveCount(2);
});

test('each storage experiment sets up in one tap, asks without giving its answer away, then reveals it', async ({ page }) => {
  const { widget, height, stageText, answer } = await open(page);
  const h = await height();
  const hidden: Record<string, string[]> = {
    'page-rewrite': ['8,292', '82.9×', 'written back', '8,092 B'],
    'lsm-rewrites': ['10.5', '33.5×', 'Merge k'],
    'record-size': ['5.1×'],
    'no-filters': ['5 runs', '4 say'],
    'more-data': ['29.5×'],
  };
  for (const [i, e] of SHOWN.entries()) {
    if (e.goal) continue;
    await widget.locator('.cards button').nth(i).click();
    const check = widget.locator('app-widget-check');
    await expect(check.locator('legend')).toHaveText(e.ask);
    await expect(widget.getByRole('button', { name: /after your answer$/ })).toHaveCount(2);
    await expect(widget.getByRole('button', { name: 'Describe' })).toBeDisabled();
    await expect(widget.getByRole('radio', { name: '8 KB' })).toBeDisabled();
    await expect(widget.locator('.notice')).toHaveText('Play and every setting wait for your answer.');
    const words = (await stageText()).join(' | ');
    for (const giveaway of hidden[e.id]) expect(words, `${e.id}: "${giveaway}"`).not.toContain(giveaway);
    await answer(i);
    await expect(check.locator('.explain')).toHaveText(e.reveal);
    for (const region of e.focus) await expect(widget.locator(`[data-focus="${region}"]`)).toHaveClass(/focused/);
    expect(await height(), e.id).toBe(h);
  }
  await expect(widget.locator('.cards .done')).toHaveCount(5);
});

test('the storage challenge is met only at 100 GB and ratio 5 with the filters off', async ({ page }) => {
  const { widget } = await open(page);
  await widget.locator('.cards button').last().click();
  const checks = widget.locator('.checks li');
  await expect(checks).toHaveText([
    '·the LSM tree writes 33.5× the data, under 20×: not yet',
    '✓a lookup costs 4 disk reads, under 7: met',
    '✓the data is 100 GB, at least 100 GB: met',
  ]);
  await widget.getByRole('radio', { name: '4', exact: true }).check();
  await expect(checks.nth(1)).toHaveText('·a lookup costs 7 disk reads, under 7: not yet');
  await widget.getByRole('radio', { name: '5', exact: true }).check();
  await expect(widget.locator('.status')).toHaveText('Goal met:');
  await expect(widget.locator('.reveal')).toHaveText(SHOWN.at(-1)!.reveal);
  await widget.getByRole('radio', { name: '10', exact: true }).check();
  await expect(widget.locator('.status')).toHaveText('You met it; now:');
});

test('Describe fits its box at 320, 412, 1280 and 1440px, and the page never scrolls sideways', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'one browser sets every width');
  for (const width of [320, 412, 1280, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    const { widget } = await open(page);
    await widget.getByRole('button', { name: 'Describe' }).click();
    const table = widget.locator('.describe g-data-table');
    await expect(table.locator('tbody tr')).toHaveCount(7);
    const { scrollW, boxW, scrollH, boxH } = await table.evaluate((t) => ({
      scrollW: t.scrollWidth,
      boxW: t.clientWidth,
      scrollH: t.scrollHeight,
      boxH: t.clientHeight,
    }));
    expect(scrollW, `${width}px: the widest rows fit`).toBeLessThanOrEqual(boxW);
    expect(scrollH, `${width}px: seven rows need no scrolling`).toBeLessThanOrEqual(boxH + 1);
    // No kept run renders on two lines: a row's name may wrap after its comma, never inside "4 KB" or "ratio 10".
    const split = await table.evaluate(
      (t) =>
        [...t.querySelectorAll('td, .row-head .keep')].filter((cell) => {
          const r = document.createRange();
          r.selectNodeContents(cell);
          return new Set([...r.getClientRects()].map((x) => Math.round(x.top))).size > 1;
        }).length,
    );
    expect(split, `${width}px`).toBe(0);
    const rights = await widget.evaluate((w) =>
      ['.storage-stage', '.controls', '.describe g-data-table'].map((s) => w.querySelector(s)!.getBoundingClientRect().right),
    );
    for (const right of rights) expect(right, `${width}px`).toBeLessThanOrEqual(width);
    expect(await page.evaluate(() => document.documentElement.scrollWidth), `${width}px`).toBeLessThanOrEqual(width);
  }
});

test('the on-stage controls are 44px targets apart, their words inside their boxes, at 320px and on desktop', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'one browser sets every width');
  for (const width of [320, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    const { widget } = await open(page);
    const boxes = await widget.evaluate((w) =>
      [...w.querySelectorAll('g-stage .play, g-stage label.segment')].map((e) => {
        const b = e.getBoundingClientRect();
        const span = e.querySelector('span');
        return {
          x0: b.left,
          x1: b.right,
          y0: b.top,
          y1: b.bottom,
          over: !!span && (span.scrollWidth > span.clientWidth + 1 || span.scrollHeight > span.clientHeight + 1),
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

test('no line parts a number from its unit in the notice, the note, Describe or the dock, at 320 to 430 px and on desktop', async ({
  page,
}, testInfo) => {
  test.slow();
  const desktop = testInfo.project.name === 'desktop';
  for (const width of desktop ? [320, 375, 412, 430, 1280] : [320, 402]) {
    await page.setViewportSize({ width, height: 900 });
    const { widget, answer } = await open(page);
    const out: string[] = [];
    const look = async (what: string) => out.push(...(await unitSplits(widget)).map((x) => `${width}px ${what}: ${x}`));
    if (width >= 1280)
      for (const ratio of ['4', '5', '10', '20'])
        for (const data of ['10 GB', '100 GB', '1,000 GB']) {
          await widget.getByRole('radio', { name: ratio, exact: true }).check();
          await widget.getByRole('radio', { name: data }).check();
          await look(`ratio ${ratio} ${data} notice`);
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
  test.describe(`the storage widget in ${theme}`, () => {
    test.use({ theme, contextOptions: { reducedMotion: 'reduce' } });

    test('passes axe at rest, asking and revealed', async ({ page }) => {
      const { widget, answer } = await open(page);
      const scan = async () => {
        const { violations } = await new AxeBuilder({ page }).include('app-storage-widget').analyze();
        return violations
          .filter((v) => v.impact === 'serious' || v.impact === 'critical')
          .map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(', ')}`);
      };
      expect(await scan()).toEqual([]);
      await widget.locator('.cards button').nth(at('no-filters')).click();
      expect(await scan()).toEqual([]);
      await answer(at('no-filters'));
      await expect(widget.locator('app-widget-check .explain')).toHaveText(SHOWN[at('no-filters')].reveal);
      expect(await scan()).toEqual([]);
    });
  });

test.describe('the storage widget under Reduced motion', () => {
  test.use({ motionOff: false, reducedMotion: 'reduce' });
  test.beforeEach(({ page }) => page.addInitScript(countAnimate));

  test('runs no animation through a play and an experiment, and writes what the play did under the stage', async ({ page }) => {
    const { widget, answer, figure } = await open(page);
    await page.evaluate(() => (window.animateCalls = 0));
    await widget.getByRole('button', { name: 'Play the write through the LSM tree' }).click();
    await expect(widget.locator('.caption')).toHaveText(/^The write is appended to the log and kept in the memtable/);
    await expect(widget.locator('.notice')).toHaveText(/^The write is appended to the log and kept in the memtable/);
    await expect(figure('step-lsm')).toHaveText('written below the picture');
    await answer(at('page-rewrite'));
    await expect(widget.locator('app-widget-check .explain')).toHaveText(SHOWN[at('page-rewrite')].reveal);
    await expect(widget.locator('.notice')).toHaveText(/^The B-tree, with 8 KB pages, writes 82\.9× the data/);
    await expect(widget.locator('svg.draw circle.key')).toHaveCount(0);
    expect(await page.evaluate(() => window.animateCalls)).toBe(0);
  });
});

test.describe('the storage widget with motion', () => {
  test.use({ motionOff: false, reducedMotion: 'no-preference' });
  test.beforeEach(({ page }) => page.addInitScript(countAnimate));

  test('plays a write on one clock with one moving key, and Stop ends it at its rest state', async ({ page }) => {
    const { widget, figure } = await open(page);
    await widget.getByRole('button', { name: 'Play the write through the B-tree' }).click();
    await expect(widget.getByRole('button', { name: 'Stop the write through the B-tree' })).toBeVisible();
    await expect(figure('step-btree')).not.toHaveText('sorted pages, updated in place');
    expect(await widget.locator('svg.draw circle.key').count()).toBeLessThanOrEqual(1);
    await widget.getByRole('button', { name: 'Stop the write through the B-tree' }).click();
    await expect(figure('step-btree')).toHaveText('sorted pages, updated in place');
    await expect(figure('bt-total')).toHaveText('42× the data');
    await widget.getByRole('button', { name: 'Play the write through the LSM tree' }).click();
    await expect(widget.locator('.notice')).toHaveText(/^The write is appended to the log/, { timeout: 14_000 });
  });

  test('locks the settings while an answer plays, keeps it hidden, then reveals it', async ({ page }) => {
    const { widget, answer, stageText } = await open(page);
    const e = at('more-data');
    await answer(e, 1);
    await expect(widget.getByRole('radio', { name: '8 KB' })).toBeDisabled();
    expect((await stageText()).join(' | ')).not.toContain('29.5×');
    await expect(widget.locator('app-widget-check .explain')).toHaveText(SHOWN[e].reveal, { timeout: 14_000 });
    await expect(widget.getByRole('radio', { name: '8 KB' })).toBeEnabled();
    expect((await stageText()).join(' | ')).toContain('29.5×');
  });

  test('on a phone, brings the LSM tree into view before its answer plays', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const { widget, answer } = await open(page);
    const e = at('lsm-rewrites');
    await answer(e);
    await expect(widget.locator('button.play[data-engine="lsm"]')).toBeInViewport();
    await expect(widget.locator('app-widget-check .explain')).toHaveText(SHOWN[e].reveal, { timeout: 14_000 });
  });
});
