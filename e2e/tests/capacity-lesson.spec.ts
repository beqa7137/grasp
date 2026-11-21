import AxeBuilder from '@axe-core/playwright';
import type { Locator, Page } from '@playwright/test';
import { CAPACITY_EXPERIMENTS, renderExperiment } from '@grasp/engine';
import { expect, test } from './fixtures';

const SHOWN = CAPACITY_EXPERIMENTS.map(renderExperiment);
const at = (id: string) => SHOWN.findIndex((e) => e.id === id);
const DEFAULT =
  'Of 8,000 requests a second, 6,000 are served and 2,000 shed. The app servers are the bottleneck, full at 6,000 a second. The load balancers are at 80%; the database primary is at 15%; the read replicas are at 82.5% each.';

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

const shownWidget = (page: Page) => page.locator('app-design-lesson:not(.ion-page-hidden) app-capacity-widget');

async function open(page: Page) {
  await page.goto('/design/topics/sd-capacity');
  const widget = shownWidget(page);
  const summary = widget.locator('svg.draw');
  // Zoneless Angular draws the setting before anything is read: its summary is there first.
  await expect(summary).toHaveAttribute('aria-label', /requests a second/);
  await widget.locator('.capacity-stage').scrollIntoViewIfNeeded();
  const height = () => widget.locator('g-stage .well').evaluate((w) => (w as HTMLElement).style.height);
  const stageText = () => widget.locator('svg.draw text').allTextContents();
  const traffic = widget.getByRole('slider', { name: 'Traffic, requests a second' });
  const step = (name: string) => widget.getByRole('button', { name, exact: true });
  const condition = (name: RegExp) => widget.getByRole('checkbox', { name });
  const answer = async (i: number, choice = SHOWN[i].answer) => {
    await widget.locator('.cards button').nth(i).click();
    await widget.locator('app-widget-check').getByRole('button', { name: SHOWN[i].choices[choice], exact: true }).click();
  };
  return { widget, summary, height, stageText, traffic, step, condition, answer };
}

/** Each number on a shown HTML surface of the widget that a line break parts from its unit or the thing it counts. */
function unitSplits(widget: Locator) {
  return widget.evaluate((w) => {
    const out: string[] = [];
    for (const el of w.querySelectorAll(
      '.notice, .caption, .foot, .describe .said, .describe .note, .toggles, app-experiment-dock .dock',
    )) {
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
          /\d[\d,.]*(?: [/×÷=+] \d[\d,.]*)*(?: (?:ms|s|queries\/s|requests\/s|a second|requests|queries|writes|reads|read|replicas|app|load|machines|workers|nodes)\b|\/s\b)|\d[\d,.]*(?: [/×÷=+] \d[\d,.]*)+/g,
        )) {
        const range = document.createRange();
        range.setStart(...point(m.index, false));
        range.setEnd(...point(m.index + m[0].length, true));
        const tops = [...range.getClientRects()].filter((r) => r.width > 0).map((r) => r.top);
        if (Math.max(...tops) - Math.min(...tops) > 6)
          out.push(`"${m[0]}" in "${el.textContent!.replace(/\s+/g, ' ').trim().slice(0, 80)}"`);
      }
    }
    return out;
  });
}

test('the capacity widget draws the tiers from the model, and changes with every control', async ({ page }) => {
  const { widget, summary, height, traffic, step, condition, stageText } = await open(page);
  await expect(summary).toHaveAttribute('aria-label', DEFAULT);
  expect((await stageText()).join(' | ')).toContain('Full · 2,000/s shed, the bottleneck');
  const h = await height();
  await step('More app servers').click();
  await expect(summary).toHaveAttribute('aria-label', /The read replicas are the bottleneck, full at 7,273 a second\./);
  await expect(widget.locator('svg.draw text', { hasText: 'limit was 6,000/s' })).toHaveCount(1);
  await traffic.focus();
  await page.keyboard.press('ArrowRight');
  await expect(traffic).toHaveAttribute('aria-valuetext', '10,000 requests a second');
  await step('More read replicas').click();
  await step('A smaller database machine').click();
  await expect(step('A smaller database machine')).toBeDisabled();
  // A press that takes a stepper to its end keeps the focus on it.
  await step('A bigger database machine').focus();
  await page.keyboard.press('Enter');
  await expect(step('A bigger database machine')).toBeFocused();
  await expect(step('A bigger database machine')).toHaveAttribute('aria-disabled', 'true');
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Enter');
  await expect(step('A smaller database machine')).toBeFocused();
  await expect(step('A smaller database machine')).toBeDisabled();
  await expect(step('More app servers')).toHaveAccessibleDescription(/^App servers: 5, each 1,500 a second; limit 7,500 a second\.$/);
  await expect(condition(/Cache reads/)).toHaveAccessibleDescription('90% hit');
  await condition(/Cache reads/).check();
  await condition(/Zone A down/).check();
  await expect(summary).toHaveAttribute('aria-label', /Zone A is down\.$/);
  await condition(/Slow queries/).check();
  await expect(summary).toHaveAttribute('aria-label', /The app servers are the bottleneck, full at 600 a second\./);
  expect(await height()).toBe(h);
});

test('the capacity widget runs from the keyboard alone', async ({ page }) => {
  const { widget, summary, traffic } = await open(page);
  await widget.getByRole('checkbox', { name: /Cache reads/ }).focus();
  await page.keyboard.press('Space');
  await expect(summary).toHaveAttribute('aria-label', /^Of 8,000 requests a second, 6,000 are served/);
  await page.keyboard.press('Tab');
  await expect(widget.getByRole('checkbox', { name: /Zone A down/ })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(widget.getByRole('checkbox', { name: /Slow queries/ })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(widget.getByRole('button', { name: /^Ramp the traffic up to [\d,]+ requests a second$/ })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(widget.locator('.notice')).toHaveText(/^Play stepped the traffic from 1,000 to 8,000 requests a second\./);
  await page.keyboard.press('Tab');
  await expect(traffic).toBeFocused();
  await page.keyboard.press('End');
  await expect(traffic).toHaveAttribute('aria-valuetext', '20,000 requests a second');
  await page.keyboard.press('Tab');
  await expect(widget.getByRole('button', { name: 'Fewer load balancers' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(widget.getByRole('button', { name: 'More load balancers' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(widget.locator('.notice')).toHaveText(/^Load balancers: now 3\. Of 20,000 requests a second, /);
  // A stepper at its end stays in the tab order, announced as unavailable.
  for (const name of [
    'Fewer app servers',
    'More app servers',
    'A smaller database machine',
    'A bigger database machine',
    'Fewer read replicas',
    'More read replicas',
  ]) {
    await page.keyboard.press('Tab');
    await expect(widget.getByRole('button', { name })).toBeFocused();
  }
  await page.keyboard.press('Tab');
  await expect(widget.getByRole('button', { name: 'Describe' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(widget.locator('.describe g-data-table tbody tr')).toHaveCount(5);
});

test('each capacity experiment sets up in one tap, asks without giving its answer away, then reveals it', async ({ page }) => {
  const { widget, height, stageText, answer } = await open(page);
  const h = await height();
  const hidden: Record<string, string[]> = {
    tenfold: ['÷ 2 queries', '= 4,000 requests', 'bottleneck'],
    cache: ['21,053', '0.38'],
    replay: ['61.3%', '32,653', 'replayed'],
    zone: ['111.1%', 'Full', '9,000/s'],
    slow: ['200/s', '13.3%', 'would need'],
  };
  for (const [i, e] of SHOWN.entries()) {
    if (e.goal) continue;
    await widget.locator('.cards button').nth(i).click();
    const check = widget.locator('app-widget-check');
    await expect(check.locator('legend')).toHaveText(e.ask);
    await expect(widget.getByRole('button', { name: 'Ramp the traffic, after your answer' })).toBeDisabled();
    await expect(widget.getByRole('button', { name: 'Describe' })).toBeDisabled();
    await expect(widget.getByRole('slider', { name: /^Traffic/ })).toHaveAttribute('aria-disabled', 'true');
    await expect(widget.locator('.notice')).toHaveText('Play and the settings this question is about wait for your answer.');
    const words = (await stageText()).join(' | ');
    for (const giveaway of hidden[e.id]) expect(words, `${e.id}: "${giveaway}"`).not.toContain(giveaway);
    await answer(i);
    await expect(check.locator('.explain')).toHaveText(e.reveal);
    for (const region of e.focus) await expect(widget.locator(`[data-focus="${region}"]`)).toHaveClass(/focused/);
    expect(await height(), e.id).toBe(h);
  }
  await expect(widget.locator('.cards .done')).toHaveCount(5);
});

test('the capacity challenge is met only by its one fleet of 29 machines', async ({ page }) => {
  const { widget, step, condition } = await open(page);
  await widget.locator('.cards button').last().click();
  const checks = widget.locator('.checks li');
  await expect(checks.nth(1)).toHaveText('·headroom: the busiest tier is full, so none: not yet');
  await expect(widget.locator('svg.draw [data-id^="zonetick-"]').first()).toBeAttached();
  for (let i = 0; i < 4; i++) await step('More load balancers').click();
  for (let i = 0; i < 9; i++) await step('More app servers').click();
  await step('A bigger database machine').click();
  for (let i = 0; i < 2; i++) await step('More read replicas').click();
  await condition(/Cache reads/).check();
  await expect(widget.locator('.status')).toHaveText('Goal met:');
  await expect(checks).toHaveText([
    '✓served: all 16,000/s: met',
    '✓headroom: the busiest tier 62.7% busy leaves 37.3%, at least 30%: met',
    '✓zone A lost: nothing shed: met',
    "✓machines: 29, the cache's 3 nodes among them, at most 29: met",
  ]);
  await expect(widget.locator('.reveal')).toHaveText(SHOWN.at(-1)!.reveal);
  await step('Fewer app servers').click();
  await expect(widget.locator('.status')).toHaveText('You met it; now:');
  await expect(checks.nth(2)).toHaveText('·zone A lost: it held 6 of 16 app servers; the 10 left shed 1,000/s: not yet');
});

test('the capacity panel breaks out at container wide, and keeps the stage where it is over all eight conditions', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'container widths are a desktop question');
  const { widget } = await open(page);
  const box = async (selector: string) => (await widget.locator(selector).first().boundingBox())!;
  expect((await box('.controls')).x).toBeGreaterThanOrEqual((await box('.capacity-stage')).x + (await box('.capacity-stage')).width);
  for (const width of [320, 390, 412]) {
    await page.setViewportSize({ width, height: 900 });
    await expect.poll(async () => (await box('.controls')).x).toBeLessThan((await box('.capacity-stage')).x + 10);
    const tops = new Set<number>();
    for (let k = 0; k < 8; k++) {
      for (const [i, name] of [/Cache reads/, /Zone A down/, /Slow queries/].entries())
        await widget.getByRole('checkbox', { name }).setChecked(!!(k & (1 << i)));
      const [toggles, stage] = [await box('.toggles'), await box('.capacity-stage')];
      expect(toggles.y + toggles.height, `${width}px`).toBeLessThanOrEqual(stage.y);
      tops.add(Math.round(stage.y - toggles.y));
    }
    expect([...tops], `${width}px: the stage's top over the conditions`).toHaveLength(1);
  }
});

test('Describe fits or scrolls inside its own box at 320, 390, 412, 1280 and 1440 px: the page never scrolls sideways', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'one browser sets every width');
  for (const width of [320, 390, 412, 1280, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    const { widget, condition } = await open(page);
    await condition(/Zone A down/).check();
    await condition(/Cache reads/).check();
    await widget.getByRole('button', { name: 'Describe' }).click();
    const table = widget.locator('.describe g-data-table');
    await expect(table.locator('tbody tr')).toHaveCount(5);
    const { scrollW, boxW } = await table.evaluate((t) => ({ scrollW: t.scrollWidth, boxW: t.clientWidth }));
    expect(scrollW, `${width}px: the widest rows fit`).toBeLessThanOrEqual(boxW);
    await expect(table.locator('thead th').first()).toHaveText('Tier');
    await expect(table.locator('thead th')).toHaveCount(width < 1000 ? 5 : 6);
    expect(await page.evaluate(() => document.documentElement.scrollWidth), `${width}px`).toBeLessThanOrEqual(width);
  }
});

test('no line parts a number from its unit or the thing it counts in the notice, the caption, Describe or the dock', async ({
  page,
}, testInfo) => {
  test.slow();
  const desktop = testInfo.project.name === 'desktop';
  for (const width of desktop ? [320, 375, 390, 412, 1280] : [320, 402]) {
    await page.setViewportSize({ width, height: 900 });
    const { widget, answer, traffic, condition } = await open(page);
    const out: string[] = [];
    const look = async (what: string) => out.push(...(await unitSplits(widget)).map((x) => `${width}px ${what}: ${x}`));
    await look('at rest');
    await condition(/Slow queries/).check();
    await traffic.focus();
    await page.keyboard.press('End');
    await widget.getByRole('button', { name: /^Ramp the traffic up to [\d,]+ requests a second$/ }).click();
    await expect(widget.locator('.notice')).toHaveText(/^Play stepped the traffic/);
    await look('the ramp');
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
  test.describe(`the capacity widget in ${theme}`, () => {
    test.use({ theme, contextOptions: { reducedMotion: 'reduce' } });

    test('passes axe at rest, asking, revealed and in the challenge', async ({ page }) => {
      const { widget, answer } = await open(page);
      const scan = async () => {
        const { violations } = await new AxeBuilder({ page }).include('app-capacity-widget').analyze();
        return violations
          .filter((v) => v.impact === 'serious' || v.impact === 'critical')
          .map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(', ')}`);
      };
      expect(await scan()).toEqual([]);
      await widget.locator('.cards button').nth(at('zone')).click();
      expect(await scan()).toEqual([]);
      await answer(at('zone'));
      await expect(widget.locator('app-widget-check .explain')).toHaveText(SHOWN[at('zone')].reveal);
      expect(await scan()).toEqual([]);
      await widget.locator('.cards button').last().click();
      expect(await scan()).toEqual([]);
    });
  });

test.describe('the capacity widget under Reduced motion', () => {
  test.use({ motionOff: false, reducedMotion: 'reduce' });
  test.beforeEach(({ page }) => page.addInitScript(countAnimate));

  test('runs no animation through a play and an experiment, and says what the ramp did', async ({ page }) => {
    const { widget, answer } = await open(page);
    await page.evaluate(() => (window.animateCalls = 0));
    await widget.getByRole('button', { name: /^Ramp the traffic up to [\d,]+ requests a second$/ }).click();
    const story =
      'Play stepped the traffic from 1,000 to 8,000 requests a second. At 7,000, the app servers began to shed first; at 8,000, 6,000 a second are served and 2,000 shed.';
    await expect(widget.locator('.notice')).toHaveText(story);
    await expect(widget.locator('svg.draw [data-id="ring"]')).toHaveCount(1);
    await answer(at('tenfold'));
    await expect(widget.locator('app-widget-check .explain')).toHaveText(SHOWN[at('tenfold')].reveal);
    await expect(widget.locator('.particle')).toHaveCount(0);
    expect(await page.evaluate(() => window.animateCalls)).toBe(0);
  });
});

test.describe('the capacity widget with motion', () => {
  test.use({ motionOff: false, reducedMotion: 'no-preference' });
  test.beforeEach(({ page }) => page.addInitScript(countAnimate));

  test('ramps the traffic on one clock with at most 60 dots, and Stop ends it at the setting', async ({ page }) => {
    const { widget, traffic } = await open(page);
    await widget.getByRole('button', { name: /^Ramp the traffic up to [\d,]+ requests a second$/ }).click();
    await expect(widget.getByRole('button', { name: 'Stop the ramp' })).toBeVisible();
    await page.waitForTimeout(1_200);
    expect(await widget.locator('.particle:not([visibility])').count()).toBeLessThanOrEqual(60);
    expect(await page.evaluate(() => window.animateCalls)).toBeGreaterThan(0);
    await widget.getByRole('button', { name: 'Stop the ramp' }).click();
    await expect(traffic).toHaveAttribute('aria-valuetext', '8,000 requests a second');
    await expect(widget.locator('svg.draw')).toHaveAttribute('aria-label', DEFAULT);
    await widget.getByRole('button', { name: /^Ramp the traffic up to [\d,]+ requests a second$/ }).click();
    await expect(widget.locator('.notice')).toHaveText(/^Play stepped the traffic from 1,000 to 8,000/, { timeout: 12_000 });
  });

  test('keeps the answer hidden while it plays and brings its regions into view, on a phone too', async ({ page }, testInfo) => {
    const phone = testInfo.project.name !== 'desktop';
    const { widget, answer, stageText } = await open(page);
    for (const id of ['tenfold', 'cache', 'slow']) {
      const e = at(id);
      await answer(e, (SHOWN[e].answer + 1) % SHOWN[e].choices.length);
      await expect(widget.getByRole('button', { name: 'Ramp the traffic, after your answer' })).toBeDisabled();
      if (phone) await expect(widget.locator('.anchor')).toBeInViewport();
      expect((await stageText()).join(' | ')).not.toContain(id === 'cache' ? '21,053' : id === 'slow' ? '13.3%' : '÷ 2 queries');
      await expect(widget.locator('app-widget-check .explain')).toHaveText(SHOWN[e].reveal, { timeout: 15_000 });
      if (phone) {
        await widget.getByRole('button', { name: 'See it on the picture' }).click();
        for (const region of SHOWN[e].focus.slice(0, 1)) await expect(widget.locator(`[data-focus="${region}"]`)).toBeInViewport();
      }
    }
  });
});
