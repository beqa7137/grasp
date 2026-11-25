import AxeBuilder from '@axe-core/playwright';
import type { Locator, Page } from '@playwright/test';
import { RECOVERY_EXPERIMENTS, formatRecoveryTime, recoveryScenario, renderExperiment } from '@grasp/engine';
import { expect, test } from './fixtures';

const SHOWN = RECOVERY_EXPERIMENTS.map(renderExperiment);
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

const shownWidget = (page: Page) => page.locator('app-design-lesson:not(.ion-page-hidden) app-recovery-widget');

async function open(page: Page) {
  await page.goto('/design/topics/sd-recovery');
  const widget = shownWidget(page);
  const summary = widget.locator('svg.draw');
  // Read the widget only once it is drawn: its summary names the setting.
  await expect(summary).toHaveAttribute('aria-label', /^A timeline of one disaster and four recovery plans/);
  await widget.locator('.recovery-stage').scrollIntoViewIfNeeded();
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
        .matchAll(/\d[\d,.]*(?:×| (?:s|min|h|GB\/min|GB|TB)\b)/g)) {
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

test('the recovery widget draws one disaster and four plans, and changes with every control', async ({ page }) => {
  const { widget, summary, height, figure } = await open(page);
  await expect(summary).toHaveAttribute('aria-label', /After it, serving again: full backups in 3\.3 h; point-in-time recovery in 5\.7 h/);
  // A ledger wraps over several lines on a phone: read them all.
  await expect
    .poll(async () => (await widget.locator('svg.draw [data-id^="b-pitr-ledger"]').allTextContents()).join(' '))
    .toBe('restore: 200 min; replay 24 h of log at 10×: 144 min; 344 min in all');
  const h = await height();
  await widget.getByRole('radio', { name: '10 s', exact: true }).check();
  await expect(figure('a-pitr-value')).toHaveText('loses 10 s · was 1 min');
  await widget.getByRole('radio', { name: '6 h', exact: true }).check();
  await expect(figure('b-pitr-value')).toHaveText(/^back in 3\.9 h · was 5\.7 h$/);
  await widget.getByRole('radio', { name: '50 GB/min', exact: true }).check();
  await widget.getByRole('radio', { name: /^20×/ }).check();
  await widget.getByRole('radio', { name: 'Sync', exact: true }).check();
  await expect(figure('a-standby-value')).toHaveText(/^(loses )?nothing · was 5 s$/);
  await widget.getByRole('radio', { name: '10 TB', exact: true }).check();
  await expect(summary).toHaveAttribute('aria-label', /for a 10 TB database/);
  await widget.getByRole('radio', { name: 'Table dropped', exact: true }).check();
  await expect(figure('b-standby-value')).toHaveText('never');
  await expect(figure('a-standby-value')).toHaveText('cannot bring it back');
  expect(await height()).toBe(h);
});

test('the recovery widget runs from the keyboard alone', async ({ page }) => {
  const { widget, summary } = await open(page);
  await widget.getByRole('radio', { name: 'Disks lost' }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(widget.getByRole('radio', { name: 'Table dropped' })).toBeChecked();
  await page.keyboard.press('Tab');
  await expect(widget.getByRole('radio', { name: '2 TB' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(widget.getByRole('button', { name: 'Play the disaster and the recovery' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(widget.getByRole('radio', { name: '24 h' })).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(widget.getByRole('radio', { name: '6 h' })).toBeChecked();
  await page.keyboard.press('Tab');
  await expect(widget.getByRole('radio', { name: '1 min' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(widget.getByRole('radio', { name: 'Async' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(widget.getByRole('radio', { name: '10 GB/min' })).toBeFocused();
  await page.keyboard.press('ArrowRight');
  const pitr = formatRecoveryTime(recoveryScenario({ disaster: 1, base: 6, restore: 25 }).plans.pitr.rtoMin);
  await expect(summary).toHaveAttribute('aria-label', new RegExp(`point-in-time recovery in ${pitr.replace('.', '\\.')};`));
  await page.keyboard.press('Tab');
  await expect(widget.getByRole('radio', { name: /^10×/ })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(widget.getByRole('button', { name: 'Describe' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(widget.locator('.describe g-data-table tbody tr')).toHaveCount(8);
  await expect(widget.locator('.describe g-data-table tr[aria-current="true"]')).toHaveCount(4);
});

test('each recovery experiment sets up in one tap, asks without giving its answer away, then reveals it', async ({ page }) => {
  const { widget, height, stageText, answer } = await open(page);
  const h = await height();
  const hidden: Record<string, string[]> = {
    'replica-drop': ['cannot', 'never', 'the drop too'],
    'pitr-time': ['4.5 h', '272 min', '72 min'],
    archive: [],
    growth: [],
    delayed: ['13 min', 'waits in its log', 'pause it'],
  };
  for (const [i, e] of SHOWN.entries()) {
    if (e.goal) continue;
    await widget.locator('.cards button').nth(i).click();
    const check = widget.locator('app-widget-check');
    await expect(check.locator('legend')).toHaveText(e.ask);
    await expect(widget.getByRole('button', { name: /after your answer$/ })).toHaveCount(1);
    await expect(widget.getByRole('button', { name: 'Describe' })).toBeDisabled();
    await expect(widget.getByRole('radio', { name: '6 h', exact: true })).toBeDisabled();
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

test('the recovery challenge is met only at 50 GB/min, a full backup every 6 h and replay at 20×', async ({ page }) => {
  const { widget } = await open(page);
  await widget.locator('.cards button').last().click();
  const checks = widget.locator('.checks li');
  await expect(checks).toHaveText([
    '✓point-in-time recovery loses at most 1 min (now up to 1 min): met',
    '·point-in-time recovery serves again within 1 h (now 5.7 h): not yet',
    '✓no more than one full backup every 6 h (now every 24 h): met',
  ]);
  await widget.getByRole('radio', { name: '50 GB/min', exact: true }).check();
  await widget.getByRole('radio', { name: '1 h', exact: true }).check();
  await expect(checks.nth(2)).toHaveText('·no more than one full backup every 6 h (now every 1 h): not yet');
  await widget.getByRole('radio', { name: '6 h', exact: true }).check();
  await widget.getByRole('radio', { name: /^20×/ }).check();
  await expect(widget.locator('.status')).toHaveText('Goal met:');
  await expect(widget.locator('.reveal')).toHaveText(SHOWN.at(-1)!.reveal);
  await widget.getByRole('radio', { name: /^10×/ }).check();
  await expect(widget.locator('.status')).toHaveText('You met it; now:');
});

test('Describe fits its box at 320, 412, 1280 and 1440px, and the page never scrolls sideways', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'one browser sets every width');
  for (const width of [320, 412, 1280, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    const { widget } = await open(page);
    await widget.getByRole('button', { name: 'Describe' }).click();
    const table = widget.locator('.describe g-data-table');
    await expect(table.locator('tbody tr')).toHaveCount(8);
    const { scrollW, boxW } = await table.evaluate((t) => ({ scrollW: t.scrollWidth, boxW: t.clientWidth }));
    expect(scrollW, `${width}px: the widest rows fit`).toBeLessThanOrEqual(boxW);
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
      ['.recovery-stage', '.controls', '.describe g-data-table'].map((s) => w.querySelector(s)!.getBoundingClientRect().right),
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
      for (const disaster of ['Disks lost', 'Table dropped'])
        for (const size of ['500 GB', '2 TB', '10 TB']) {
          await widget.getByRole('radio', { name: disaster, exact: true }).check();
          await widget.getByRole('radio', { name: size, exact: true }).check();
          await look(`${disaster} ${size} notice`);
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
  test.describe(`the recovery widget in ${theme}`, () => {
    test.use({ theme, contextOptions: { reducedMotion: 'reduce' } });

    test('passes axe at rest, asking and revealed', async ({ page }) => {
      const { widget, answer } = await open(page);
      const scan = async () => {
        const { violations } = await new AxeBuilder({ page }).include('app-recovery-widget').analyze();
        return violations
          .filter((v) => v.impact === 'serious' || v.impact === 'critical')
          .map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(', ')}`);
      };
      expect(await scan()).toEqual([]);
      await widget.locator('.cards button').nth(at('replica-drop')).click();
      expect(await scan()).toEqual([]);
      await answer(at('replica-drop'));
      await expect(widget.locator('app-widget-check .explain')).toHaveText(SHOWN[at('replica-drop')].reveal);
      expect(await scan()).toEqual([]);
    });
  });

test.describe('the recovery widget under Reduced motion', () => {
  test.use({ motionOff: false, reducedMotion: 'reduce' });
  test.beforeEach(({ page }) => page.addInitScript(countAnimate));

  test('runs no animation through a play and an experiment, and writes what the play did under the stage', async ({ page }) => {
    const { widget, answer, figure } = await open(page);
    await page.evaluate(() => (window.animateCalls = 0));
    await widget.getByRole('button', { name: 'Play the disaster and the recovery' }).click();
    await expect(widget.locator('.caption')).toHaveText(/^The disks of this 2 TB database fail just before the next full backup/);
    await expect(widget.locator('.notice')).toHaveText(/^The disks of this 2 TB database fail/);
    await expect(figure('step')).toHaveText('Written below the picture.');
    await answer(at('pitr-time'));
    await expect(widget.locator('app-widget-check .explain')).toHaveText(SHOWN[at('pitr-time')].reveal);
    await expect(widget.locator('.notice')).toHaveText(/^With 10 TB and the disks lost, full backups lose up to 6 h/);
    await expect(widget.locator('svg.draw .playhead')).toHaveCount(0);
    expect(await page.evaluate(() => window.animateCalls)).toBe(0);
  });
});

test.describe('the recovery widget with motion', () => {
  test.use({ motionOff: false, reducedMotion: 'no-preference' });
  test.beforeEach(({ page }) => page.addInitScript(countAnimate));

  test('plays the disaster on one clock, and Stop ends it at its rest state', async ({ page }) => {
    const { widget, figure } = await open(page);
    await widget.getByRole('button', { name: 'Play the disaster and the recovery' }).click();
    await expect(widget.getByRole('button', { name: 'Stop the disaster and the recovery' })).toBeVisible();
    await expect(figure('step')).toHaveText(/^The day before|^The disks fail/);
    await expect(figure('playhead-full')).toHaveCount(1, { timeout: 10_000 });
    await widget.getByRole('button', { name: 'Stop the disaster and the recovery' }).click();
    await expect(figure('step')).toHaveText(/^Each plan is judged/);
    await expect(figure('b-pitr-value')).toHaveText('back in 5.7 h');
    await widget.getByRole('button', { name: 'Play the disaster and the recovery' }).click();
    await expect(widget.locator('.notice')).toHaveText('Point-in-time recovery serves last, 5.7 h after the disaster.', {
      timeout: 14_000,
    });
  });

  test('locks the settings while an answer plays, keeps it hidden, then reveals it', async ({ page }) => {
    const { widget, answer, stageText } = await open(page);
    const e = at('growth');
    await answer(e, 1);
    await expect(widget.getByRole('radio', { name: '6 h', exact: true })).toBeDisabled();
    expect((await stageText()).join(' | ')).not.toContain('19.1 h');
    await expect(widget.locator('app-widget-check .explain')).toHaveText(SHOWN[e].reveal, { timeout: 14_000 });
    await expect(widget.getByRole('radio', { name: '6 h', exact: true })).toBeEnabled();
    expect((await stageText()).join(' | ')).toContain('19.1 h');
  });

  test('on a laptop, the recovery plays in view with its narration, for a free play and for an answer', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'two columns need a laptop screen');
    await page.setViewportSize({ width: 1280, height: 800 });
    const { widget, answer, figure } = await open(page);
    const top = () => widget.locator('.recovery-stage').evaluate((e) => e.scrollIntoView({ block: 'start' }));
    /** Block B wholly on screen and the notice at least partly, both under the header. */
    const inView = () =>
      widget.evaluate((w) => {
        const header = w.closest('ion-content')!.previousElementSibling!.getBoundingClientRect().bottom;
        const b = w.querySelector('.block-b')!.getBoundingClientRect();
        const n = w.querySelector('.notice')!.getBoundingClientRect();
        return b.top >= header - 1 && b.bottom <= innerHeight + 1 && n.bottom > header && n.top < innerHeight;
      });
    await top();
    await widget.getByRole('button', { name: 'Play the disaster and the recovery' }).click();
    await expect(figure('playhead-full')).toHaveCount(1, { timeout: 10_000 });
    await expect.poll(inView, { timeout: 4_000 }).toBe(true);
    await expect(widget.locator('.notice')).toHaveText('Point-in-time recovery serves last, 5.7 h after the disaster.', {
      timeout: 14_000,
    });
    expect(await inView()).toBe(true);
    await top();
    await answer(at('pitr-time'));
    await expect(figure('playhead-full')).toHaveCount(1, { timeout: 10_000 });
    await expect.poll(inView, { timeout: 4_000 }).toBe(true);
    await expect(widget.locator('app-widget-check .explain')).toHaveText(SHOWN[at('pitr-time')].reveal, { timeout: 14_000 });
    await expect(widget.locator('app-widget-check .explain')).toBeInViewport();
  });

  test('on a phone, brings the block an answer is about into view before it plays', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const { widget, answer } = await open(page);
    const e = at('delayed');
    await answer(e);
    await expect(widget.locator('.block-a')).toBeInViewport();
    await expect(widget.locator('app-widget-check .explain')).toHaveText(SHOWN[e].reveal, { timeout: 14_000 });
  });
});
