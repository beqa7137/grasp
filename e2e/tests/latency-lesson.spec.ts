import AxeBuilder from '@axe-core/playwright';
import type { Locator, Page } from '@playwright/test';
import { LATENCY_EXPERIMENTS, renderExperiment } from '@grasp/engine';
import { expect, test } from './fixtures';

const SHOWN = LATENCY_EXPERIMENTS.map(renderExperiment);
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

const shownWidget = (page: Page) => page.locator('app-design-lesson:not(.ion-page-hidden) app-latency-widget');

async function open(page: Page) {
  await page.goto('/design/topics/sd-latency');
  const widget = shownWidget(page);
  await widget.locator('svg.draw .curve.p99').waitFor();
  await widget.locator('.latency-stage').scrollIntoViewIfNeeded();
  const summary = widget.locator('svg.draw');
  const height = () => widget.locator('g-stage .well').evaluate((w) => (w as HTMLElement).style.height);
  const stageText = () => widget.locator('svg.draw text').allTextContents();
  const load = widget.getByRole('slider', { name: 'Load, how busy the servers run' });
  const answer = async (i: number, choice = SHOWN[i].answer) => {
    await widget.locator('.cards button').nth(i).click();
    await widget.locator('app-widget-check').getByRole('button', { name: SHOWN[i].choices[choice], exact: true }).click();
  };
  return { widget, summary, height, stageText, load, answer };
}

/** Each number on a shown HTML surface of the widget (the notice, the caption, Describe, the dock) that a line break parts from its unit. */
function unitSplits(widget: Locator) {
  return widget.evaluate((w) => {
    const out: string[] = [];
    for (const el of w.querySelectorAll('.notice, .caption, .describe .said, app-experiment-dock .dock')) {
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
        .matchAll(/(?:\bp\d{2,3} )?\d[\d,.]* (?:ms|s)\b/g)) {
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

test('the latency widget draws a sample over the exact model, and changes with every control', async ({ page }) => {
  const { widget, summary, height, load, stageText } = await open(page);
  await expect(summary).toHaveAttribute(
    'aria-label',
    'One server, 70% busy, requests taking 10 ms on average. The model gives p50 23 ms, p99 154 ms and a mean of 33 ms, of which 23 ms is waiting.',
  );
  expect((await stageText()).join(' | ')).toMatch(/(Queue at its longest|Longest) · 10 waiting at 301 ms/);
  const h = await height();
  await load.focus();
  await page.keyboard.press('ArrowRight');
  await expect(load).toHaveAttribute('aria-valuetext', '75% busy, 75 requests a second');
  await widget.getByRole('radio', { name: '4', exact: true }).check();
  await expect(widget.getByRole('radio', { name: 'A queue each' })).toBeEnabled();
  await widget.getByRole('radio', { name: 'A queue each' }).check();
  await expect(summary).toHaveAttribute('aria-label', /^4 servers with a queue each, 75% busy with all up/);
  await expect(widget.getByRole('checkbox', { name: 'Steady work', exact: true })).toHaveAccessibleDescription('10 ms each');
  await expect(widget.getByRole('checkbox', { name: 'A server down', exact: true })).toHaveAccessibleDescription('its traffic moves');
  await widget.getByRole('checkbox', { name: /Steady work/ }).check();
  await expect(summary).toHaveAttribute('aria-label', /every request taking exactly 10 ms\./);
  await widget.getByRole('checkbox', { name: /A server down/ }).check();
  await expect(summary).toHaveAttribute('aria-label', /There is no steady state: 300\/s arrive, exactly what the servers left can serve/);
  await expect(load).toHaveAttribute('aria-valuetext', '75% busy with all 4 up, 300 requests a second');
  await widget.getByRole('radio', { name: '1', exact: true }).check();
  await expect(widget.getByRole('radio', { name: 'One queue' })).toBeDisabled();
  await expect(widget.getByRole('checkbox', { name: /A server down/ })).toBeDisabled();
  await expect(widget.locator('.controls legend').nth(1)).toHaveText(/Queue\s*· one server has one queue/);
  expect(await height()).toBe(h);
});

test('the latency widget runs from the keyboard alone', async ({ page }) => {
  const { widget, summary, load } = await open(page);
  await widget.getByRole('radio', { name: '1', exact: true }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(widget.getByRole('radio', { name: '2', exact: true })).toBeChecked();
  await page.keyboard.press('Tab');
  await expect(widget.getByRole('radio', { name: 'One queue' })).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(widget.getByRole('radio', { name: 'A queue each' })).toBeChecked();
  await page.keyboard.press('Tab');
  await expect(widget.getByRole('checkbox', { name: /Steady work/ })).toBeFocused();
  await page.keyboard.press('Space');
  await page.keyboard.press('Tab');
  await expect(widget.getByRole('checkbox', { name: /A server down/ })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(widget.getByRole('button', { name: 'Play the sample' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(widget.locator('.caption')).toHaveText(/^In this sample, \d+ requests arrived in the last 400 ms\./);
  await page.keyboard.press('Tab');
  await expect(load).toBeFocused();
  await page.keyboard.press('End');
  await expect(load).toHaveAttribute('aria-valuetext', '98% busy, 196 requests a second');
  await page.keyboard.press('Home');
  await expect(summary).toHaveAttribute(
    'aria-label',
    /^2 servers with a queue each, 10% busy with all up, every request taking exactly 10 ms\./,
  );
  await page.keyboard.press('Tab');
  await expect(widget.getByRole('button', { name: 'Describe' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(widget.locator('.describe g-data-table tbody tr')).toHaveCount(14);
  await expect(widget.locator('.describe g-data-table tr.active')).toContainText('10%');
});

test('each latency experiment sets up in one tap, asks without giving its answer away, then reveals it', async ({ page }) => {
  const { widget, height, stageText, answer } = await open(page);
  const h = await height();
  const hidden: Record<string, string[]> = {
    'idle-yet-waiting': ['10 ms waiting', 'of requests wait', 'longest', 'first in line'],
    knee: ['461 ms', '90 ms waiting'],
    pool: ['7.46', '69 ms', '59.6%'],
    steady: ['45 ms', '229 ms'],
    'lose-one': ['No steady state', 'of capacity', '120%'],
  };
  for (const [i, e] of SHOWN.entries()) {
    if (e.goal) continue;
    await widget.locator('.cards button').nth(i).click();
    const check = widget.locator('app-widget-check');
    await expect(check.locator('legend')).toHaveText(e.ask);
    await expect(widget.getByRole('button', { name: 'Play the sample, after your answer' })).toBeDisabled();
    await expect(widget.getByRole('button', { name: 'Describe' })).toBeDisabled();
    await expect(widget.getByRole('slider', { name: /^Load/ })).toHaveAttribute('aria-disabled', 'true');
    const words = (await stageText()).join(' | ');
    for (const giveaway of hidden[e.id]) expect(words, `${e.id}: "${giveaway}"`).not.toContain(giveaway);
    await answer(i);
    await expect(check.locator('.explain')).toHaveText(e.reveal);
    for (const region of e.focus) await expect(widget.locator(`[data-focus="${region}"]`)).toHaveClass(/focused/);
    expect(await height(), e.id).toBe(h);
  }
  await expect(widget.locator('.cards .done')).toHaveCount(5);
});

test('the latency challenge is met only with 4 servers sharing one queue at 60%', async ({ page }) => {
  const { widget, load } = await open(page);
  await widget.locator('.cards button').last().click();
  const checks = widget.locator('.checks li');
  await expect(checks).toHaveText([
    '·p99 with one server down: grows without bound, needs under 100 ms: not yet',
    '✓the fleet at 60% busy with all up, at least 60%: met',
  ]);
  await widget.getByRole('radio', { name: '4', exact: true }).check();
  await expect(checks.first()).toHaveText('·p99 with one server down: 230 ms, under 100 ms: not yet');
  await widget.getByRole('radio', { name: 'One queue' }).check();
  await expect(widget.locator('.status')).toHaveText('Goal met:');
  await expect(widget.locator('.reveal')).toHaveText(SHOWN.at(-1)!.reveal);
  await load.focus();
  await page.keyboard.press('ArrowRight');
  await expect(widget.locator('.status')).toHaveText('You met it; now:');
  await expect(checks.first()).toHaveText('·p99 with one server down: 121 ms, under 100 ms: not yet');
});

test('the latency panel breaks out at container wide, and stacks the controls over the stage below it', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'container widths are a desktop question');
  const { widget } = await open(page);
  const box = async (selector: string) => (await widget.locator(selector).first().boundingBox())!;
  const reading = (await page.locator('app-design-lesson:not(.ion-page-hidden) section.panel').first().boundingBox())!;
  const panel = (await page.locator('app-design-lesson:not(.ion-page-hidden) #try').boundingBox())!;
  expect(panel.width).toBeGreaterThan(reading.width + 100);
  expect((await box('.controls')).x).toBeGreaterThanOrEqual((await box('.latency-stage')).x + (await box('.latency-stage')).width);
  for (const width of [800, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await expect.poll(async () => (await box('.controls')).x).toBeLessThan((await box('.latency-stage')).x + 10);
    const [servers, stage] = [await box('fieldset.servers-control'), await box('.latency-stage')];
    expect(servers.y + servers.height, `${width}px`).toBeLessThanOrEqual(stage.y);
    const conditions = await box('.toggles');
    expect(conditions.y + conditions.height, `${width}px: the controls over the stage`).toBeLessThanOrEqual(stage.y);
  }
  await widget.locator('.cards button').nth(at('pool')).click();
  const [stage, dock, cards] = [await box('.latency-stage'), await box('section.dock'), await box('.cards')];
  expect(dock.y).toBeGreaterThanOrEqual(stage.y + stage.height);
  expect(cards.y).toBeGreaterThanOrEqual(dock.y + dock.height);
});

test('Describe scrolls inside its own box at 320, 412, 1280 and 1440px: the page never scrolls sideways', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'one browser sets every width');
  for (const width of [320, 412, 1280, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    const { widget } = await open(page);
    await widget.getByRole('radio', { name: '3', exact: true }).check();
    await widget.getByRole('checkbox', { name: /A server down/ }).check();
    await widget.getByRole('button', { name: 'Describe' }).click();
    const table = widget.locator('.describe g-data-table');
    await expect(table.locator('tbody tr')).toHaveCount(14);
    const { scrollW, boxW, scrollH, boxH } = await table.evaluate((t) => ({
      scrollW: t.scrollWidth,
      boxW: t.clientWidth,
      scrollH: t.scrollHeight,
      boxH: t.clientHeight,
    }));
    expect(scrollW, `${width}px: the widest rows fit`).toBeLessThanOrEqual(boxW);
    expect(scrollH, `${width}px: the box scrolls`).toBeGreaterThan(boxH);
    const rights = await widget.evaluate((w) =>
      ['.latency-stage', '.controls', '.describe g-data-table'].map((s) => w.querySelector(s)!.getBoundingClientRect().right),
    );
    for (const right of rights) expect(right, `${width}px`).toBeLessThanOrEqual(width);
    expect(await page.evaluate(() => document.documentElement.scrollWidth), `${width}px`).toBeLessThanOrEqual(width);
  }
});

test('no line parts a number from its unit in the notice, the caption, Describe or the dock, at 320 to 430 px and on desktop', async ({
  page,
}, testInfo) => {
  test.slow();
  const desktop = testInfo.project.name === 'desktop';
  for (const width of desktop ? [320, 360, 375, 390, 402, 412, 430, 1280] : [320, 375, 402, 430]) {
    await page.setViewportSize({ width, height: 900 });
    const { widget, load, answer } = await open(page);
    const out: string[] = [];
    const look = async (what: string) => out.push(...(await unitSplits(widget)).map((x) => `${width}px ${what}: ${x}`));
    // The notice shows beside the stage only at container wide: there every setting's sentence is checked.
    if (width >= 1280)
      for (const servers of ['1', '2', '3', '4'])
        for (const queue of servers === '1' ? ['One queue'] : ['One queue', 'A queue each'])
          for (const down of servers === '1' ? [false] : [false, true]) {
            await widget.getByRole('radio', { name: servers, exact: true }).check();
            if (servers !== '1') await widget.getByRole('radio', { name: queue }).check();
            if (servers !== '1') await widget.getByRole('checkbox', { name: /A server down/ }).setChecked(down);
            await load.focus();
            await page.keyboard.press('Home');
            for (let k = 0; k < 14; k++) {
              await look(`${servers} ${queue} ${down ? 'down ' : ''}notice`);
              await page.keyboard.press('ArrowRight');
            }
          }
    await widget.getByRole('radio', { name: '3', exact: true }).check();
    await widget.getByRole('radio', { name: 'One queue' }).check();
    await widget.getByRole('checkbox', { name: /A server down/ }).setChecked(true);
    await load.focus();
    await page.keyboard.press('Home');
    for (let k = 0; k < 7; k++) await page.keyboard.press('ArrowRight');
    await widget.getByRole('button', { name: 'Play the sample' }).click();
    await expect(widget.locator('.caption')).toHaveText(/arrived in the first 8 s\./);
    await look('caption');
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
    await widget.getByRole('radio', { name: '4', exact: true }).check();
    await widget.getByRole('radio', { name: 'One queue' }).check();
    await expect(widget.locator('.status')).toHaveText('Goal met:');
    await look('the challenge met');
    expect(out).toEqual([]);
  }
});

for (const theme of ['light', 'dark'] as const)
  test.describe(`the latency widget in ${theme}`, () => {
    test.use({ theme, contextOptions: { reducedMotion: 'reduce' } });

    test('passes axe at rest, asking and revealed', async ({ page }) => {
      const { widget, answer } = await open(page);
      const scan = async () => {
        const { violations } = await new AxeBuilder({ page }).include('app-latency-widget').analyze();
        return violations
          .filter((v) => v.impact === 'serious' || v.impact === 'critical')
          .map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(', ')}`);
      };
      expect(await scan()).toEqual([]);
      await widget.locator('.cards button').nth(at('pool')).click();
      expect(await scan()).toEqual([]);
      await answer(at('pool'));
      await expect(widget.locator('app-widget-check .explain')).toHaveText(SHOWN[at('pool')].reveal);
      expect(await scan()).toEqual([]);
    });
  });

test.describe('the latency widget under Reduced motion', () => {
  test.use({ motionOff: false, reducedMotion: 'reduce' });
  test.beforeEach(({ page }) => page.addInitScript(countAnimate));

  test('runs no animation through a play and an experiment, and says what the sample did in a caption', async ({ page }) => {
    const { widget, answer } = await open(page);
    await page.evaluate(() => (window.animateCalls = 0));
    await widget.getByRole('button', { name: 'Play the sample' }).click();
    const story =
      'In this sample, 31 requests arrived in the last 400 ms. The line grew to 10 waiting at 301 ms; 3 were waiting at the end.';
    await expect(widget.locator('.caption')).toHaveText(story);
    await expect(widget.locator('.notice')).toHaveText(story);
    await answer(at('knee'));
    await expect(widget.locator('app-widget-check .explain')).toHaveText(SHOWN[at('knee')].reveal);
    await expect(widget.locator('.notice')).toHaveText('One server, 90% busy: p99 461 ms, p50 69 ms, 90% of requests wait.');
    await expect(widget.locator('.particle')).toHaveCount(0);
    expect(await page.evaluate(() => window.animateCalls)).toBe(0);
  });
});

test.describe('the latency widget with motion', () => {
  test.use({ motionOff: false, reducedMotion: 'no-preference' });
  test.beforeEach(({ page }) => page.addInitScript(countAnimate));

  test('plays the sample on one clock with at most 60 dots, Stop ends it, and the band returns to its moment', async ({ page }) => {
    const { widget } = await open(page);
    await widget.getByRole('button', { name: 'Play the sample' }).click();
    await expect(widget.getByRole('button', { name: 'Stop the sample' })).toBeVisible();
    await expect(widget.locator('svg.draw [data-id="rate-note"]')).toHaveText(/^(playing )?25× slower$/);
    await expect(widget.locator('svg.draw .playhead')).toHaveCount(1);
    await page.waitForTimeout(2_000);
    expect(await widget.locator('.particle:not([visibility])').count()).toBeLessThanOrEqual(60);
    // Amber means waiting: the solid amber dots, in the band and in flight, are the label's count at every frame.
    for (let i = 0; i < 6; i++) {
      const frame = await widget.evaluate((w) => {
        const fill = (e: Element) => getComputedStyle(e).fill;
        const wait = fill(w.querySelector('svg.draw .key-dot.wait')!);
        const solid = [...w.querySelectorAll('svg.draw g.band circle, svg.draw .dots .particle:not([visibility]) circle')].filter(
          (c) => fill(c) === wait,
        ).length;
        const label =
          [...w.querySelectorAll('svg.draw g.band text')].map((t) => t.textContent ?? '').find((t) => /waiting now/.test(t)) ?? '';
        return { solid, label, chip: !!w.querySelector('svg.draw g.band .chip') };
      });
      const n = /nobody/.test(frame.label) ? 0 : Number(frame.label.match(/(\d+) waiting now/)?.[1]);
      if (!frame.chip) expect(frame.solid, frame.label).toBe(n);
      await page.waitForTimeout(250);
    }
    expect(await page.evaluate(() => window.animateCalls)).toBeGreaterThan(0);
    await widget.getByRole('button', { name: 'Stop the sample' }).click();
    await expect(widget.locator('svg.draw .playhead')).toHaveCount(0);
    await expect(widget.locator('svg.draw text', { hasText: /(Queue at its longest|Longest) · 10 waiting at 301 ms/ })).toHaveCount(1);
    await widget.getByRole('button', { name: 'Play the sample' }).click();
    await expect(widget.locator('.notice')).toHaveText(/^In this sample, 31 requests arrived/, { timeout: 14_000 });
  });

  test('locks the settings while an answer plays, keeps it hidden, then reveals it', async ({ page }) => {
    const { widget, answer, stageText } = await open(page);
    const e = at('knee');
    await answer(e, 0);
    await expect(widget.getByRole('radio', { name: '4', exact: true })).toBeDisabled();
    await expect(widget.locator('svg.draw [data-id="rate-note"]')).toHaveText(/^(playing )?25× slower$/);
    expect((await stageText()).join(' | ')).not.toContain('461 ms');
    await expect(widget.locator('app-widget-check .explain')).toHaveText(SHOWN[e].reveal, { timeout: 12_000 });
    await expect(widget.getByRole('radio', { name: '4', exact: true })).toBeEnabled();
    expect((await stageText()).join(' | ')).toContain('461 ms');
  });

  test('reveals an experiment on a phone with the stage in view', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const { widget, answer } = await open(page);
    const e = at('pool');
    await answer(e);
    await expect(widget.locator('.latency-stage')).toBeInViewport();
    await expect(widget.locator('app-widget-check .explain')).toHaveText(SHOWN[e].reveal, { timeout: 12_000 });
  });
});
