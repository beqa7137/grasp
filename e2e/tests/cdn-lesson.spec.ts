import AxeBuilder from '@axe-core/playwright';
import type { Locator, Page } from '@playwright/test';
import { CDN_EXPERIMENTS, renderExperiment } from '@grasp/engine';
import { expect, test } from './fixtures';

const SHOWN = CDN_EXPERIMENTS.map(renderExperiment);
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

const shownWidget = (page: Page) => page.locator('app-design-lesson:not(.ion-page-hidden) app-cdn-widget');

async function open(page: Page) {
  await page.goto('/design/topics/sd-cdn');
  const widget = shownWidget(page);
  const summary = widget.locator('svg.draw');
  // Read the widget only once it is drawn: its summary names the setting.
  await expect(summary).toHaveAttribute('aria-label', /^A CDN with 20 locations serves 10,000 requests a second/);
  await widget.locator('.cdn-stage').scrollIntoViewIfNeeded();
  const height = () => widget.locator('g-stage .well').evaluate((w) => (w as HTMLElement).style.height);
  const stageText = async () => (await widget.locator('svg.draw text').allTextContents()).join(' | ');
  const answer = async (i: number, choice = SHOWN[i].answer) => {
    await widget.locator('.cards button').nth(i).click();
    await widget.locator('app-widget-check').getByRole('button', { name: SHOWN[i].choices[choice], exact: true }).click();
  };
  return { widget, summary, height, stageText, answer };
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
        .matchAll(/\d[\d,.]*(?:%|\/s)? (?:ms|minutes?|seconds?|hours?|locations?|URLs|times|a second)\b|\(\?utm_source=…\)/g)) {
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

test('the CDN widget draws where requests are answered, and changes with every control', async ({ page }) => {
  const { widget, summary, height, stageText } = await open(page);
  await expect(summary).toHaveAttribute('aria-label', /69\.2% are answered at the edge in 10 ms, and 3,080\/s reach the origin/);
  expect(await stageText()).toContain('3,080/s reach the origin');
  await expect(widget.locator('svg.draw [data-id="watched"]')).toHaveCount(1);
  const h = await height();
  await widget.getByRole('radio', { name: '100', exact: true }).check();
  await expect(summary).toHaveAttribute('aria-label', /4,390\/s reach the origin/);
  expect(await stageText()).toContain('It was 3,080/s.');
  await widget.getByRole('checkbox', { name: 'Origin shield' }).check();
  await expect(summary).toHaveAttribute('aria-label', /34\.8% by the shield in 34\.5 ms, and 913\/s reach the origin/);
  await widget.getByRole('radio', { name: '100,000/s' }).check();
  await widget.getByRole('radio', { name: '1 h' }).check();
  await widget.getByRole('radio', { name: '+ utm_source' }).check();
  await expect(summary).toHaveAttribute('aria-label', /A tracking parameter gives each image 10 URLs/);
  await expect(widget.getByRole('button', { name: 'Play 5 hours at the outlined location' })).toBeEnabled();
  expect(await height()).toBe(h);
});

test('the CDN widget runs from the keyboard alone', async ({ page }) => {
  const { widget, summary } = await open(page);
  await widget.getByRole('radio', { name: '10,000/s' }).focus();
  await page.keyboard.press('ArrowLeft');
  await expect(widget.getByRole('radio', { name: '1,000/s' })).toBeChecked();
  await page.keyboard.press('Tab');
  await expect(widget.getByRole('radio', { name: '20', exact: true })).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(summary).toHaveAttribute('aria-label', /^A CDN with 100 locations serves 1,000 requests/);
  await page.keyboard.press('Tab');
  await expect(widget.getByRole('radio', { name: '1 min' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(widget.getByRole('radio', { name: 'Path only' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(widget.getByRole('button', { name: 'Play 5 minutes at the outlined location' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(widget.locator('.notice')).toHaveText(/^In this sample of 5 minutes/);
  await page.keyboard.press('Tab');
  await expect(widget.getByRole('checkbox', { name: 'Origin shield' })).toBeFocused();
  await page.keyboard.press('Space');
  await expect(widget.getByRole('checkbox', { name: 'Origin shield' })).toBeChecked();
  await expect(summary).toHaveAttribute('aria-label', /an origin shield sits between the locations and the origin/);
  await widget.getByRole('button', { name: 'Describe' }).focus();
  await page.keyboard.press('Enter');
  await expect(widget.locator('.describe g-data-table tbody tr')).toHaveCount(4);
  await expect(widget.locator('.describe g-data-table tr[aria-current="true"]')).toHaveCount(1);
});

test('each CDN experiment sets up in one tap, asks without giving its answer away, then reveals it', async ({ page }) => {
  const { widget, height, stageText, answer } = await open(page);
  const h = await height();
  const hidden: Record<string, string[]> = {
    'which-objects': ['12,400th', '12,407th', '33.2%', '83.2%'],
    'more-locations': ['4,390', '56.1%', '57.2 ms', '496th'],
    'origin-shield': ['913/s', '34.8%', '28.6 ms', '48,635th'],
    'more-traffic': ['13,400', '86.6%', '24,814th'],
    'tracking-parameter': ['2,520', '50.4%', '24.4%'],
  };
  for (const [i, e] of SHOWN.entries()) {
    if (e.goal) continue;
    await widget.locator('.cards button').nth(i).click();
    const check = widget.locator('app-widget-check');
    await expect(check.locator('legend')).toHaveText(e.ask);
    await expect(widget.getByRole('button', { name: 'Play the timeline, after your answer' })).toBeDisabled();
    await expect(widget.getByRole('button', { name: 'Describe' })).toBeDisabled();
    await expect(widget.getByRole('radio', { name: '5 min' })).toBeDisabled();
    await expect(widget.getByRole('checkbox', { name: 'Origin shield' })).toBeDisabled();
    await expect(widget.locator('.notice')).toHaveText('Play and every setting wait for your answer.');
    const words = await stageText();
    for (const giveaway of hidden[e.id]) expect(words, `${e.id}: "${giveaway}"`).not.toContain(giveaway);
    await answer(i);
    await expect(check.locator('.explain')).toHaveText(e.reveal);
    for (const region of e.focus) await expect(widget.locator(`[data-focus="${region}"]`)).toHaveClass(/focused/);
    expect(await height(), e.id).toBe(h);
  }
  await expect(widget.locator('.cards .done')).toHaveCount(5);
});

test('the CDN challenge is met only at 100 locations, a 5-minute TTL and the shield', async ({ page }) => {
  const { widget } = await open(page);
  await widget.locator('.cards button').last().click();
  const checks = widget.locator('.checks li');
  await expect(widget.locator('.status')).toHaveText('Your goal:');
  await expect(checks).toHaveText([
    '·the origin takes 3,080/s, under 500/s: not yet',
    '·the mean response is 46.9 ms, under 18 ms: not yet',
    '✓each cache keeps a copy for 1 minute, at most 5 minutes: met',
  ]);
  await widget.getByRole('radio', { name: '5 min' }).check();
  await widget.getByRole('checkbox', { name: 'Origin shield' }).check();
  await expect(widget.locator('.status')).toHaveText('Not yet:');
  await expect(checks.nth(1)).toHaveText('·the mean response is 18.8 ms, under 18 ms: not yet');
  await widget.getByRole('radio', { name: '100', exact: true }).check();
  await expect(widget.locator('.status')).toHaveText('Goal met:');
  await expect(widget.locator('.reveal')).toHaveText(SHOWN.at(-1)!.reveal);
  await widget.getByRole('radio', { name: '1 h' }).check();
  await expect(widget.locator('.status')).toHaveText('Not yet:');
  await widget.getByRole('radio', { name: '5 min' }).check();
  await widget.getByRole('radio', { name: '100,000/s' }).check();
  await expect(widget.locator('.status')).toHaveText('Not yet:');
  await expect(checks.nth(3)).toHaveText('·traffic stays 10,000/s and the cache key the path only: not yet');
});

test('Describe fits its box at 320, 412, 1280 and 1440px, and the page never scrolls sideways', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'one browser sets every width');
  for (const width of [320, 412, 1280, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    const { widget } = await open(page);
    await widget.getByRole('button', { name: 'Describe' }).click();
    const table = widget.locator('.describe g-data-table');
    await expect(table.locator('tbody tr')).toHaveCount(4);
    const { scrollW, boxW, scrollH, boxH } = await table.evaluate((t) => ({
      scrollW: t.scrollWidth,
      boxW: t.clientWidth,
      scrollH: t.scrollHeight,
      boxH: t.clientHeight,
    }));
    expect(scrollW, `${width}px: the widest rows fit`).toBeLessThanOrEqual(boxW);
    expect(scrollH, `${width}px: four rows need no scrolling`).toBeLessThanOrEqual(boxH + 1);
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
      ['.cdn-stage', '.controls', '.describe g-data-table'].map((s) => w.querySelector(s)!.getBoundingClientRect().right),
    );
    for (const right of rights) expect(right, `${width}px`).toBeLessThanOrEqual(width);
    expect(await page.evaluate(() => document.documentElement.scrollWidth), `${width}px`).toBeLessThanOrEqual(width);
  }
});

test('the controls are 44px targets apart, their words inside their boxes, at 320px and on desktop', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'one browser sets every width');
  for (const width of [320, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    const { widget } = await open(page);
    const boxes = await widget.evaluate((w) =>
      [...w.querySelectorAll('g-stage .play, g-stage label.switch, .controls label.segment')].map((e) => {
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
    // Text drawn on the stage: none under a control.
    const under = await widget.evaluate((w) => {
      const hits = [...w.querySelectorAll('g-stage .play, g-stage label.switch')].map((e) => e.getBoundingClientRect());
      return [...w.querySelectorAll('svg.draw text')]
        .filter((t) => {
          const r = t.getBoundingClientRect();
          return hits.some((h) => r.left < h.right && h.left < r.right && r.top < h.bottom && h.top < r.bottom);
        })
        .map((t) => t.textContent);
    });
    expect(under, `${width}px`).toEqual([]);
  }
});

test('no line parts a number from its unit in the notice, the notes, Describe or the dock, at 320 to 430 px and on desktop', async ({
  page,
}, testInfo) => {
  test.slow();
  const desktop = testInfo.project.name === 'desktop';
  for (const width of desktop ? [320, 360, 390, 412, 1280] : [320, 402]) {
    await page.setViewportSize({ width, height: 900 });
    const { widget, answer } = await open(page);
    const out: string[] = [];
    const look = async (what: string) => out.push(...(await unitSplits(widget)).map((x) => `${width}px ${what}: ${x}`));
    if (width >= 1280)
      for (const pops of ['1', '5', '100'])
        for (const ttl of ['5 s', '1 h']) {
          await widget.getByRole('radio', { name: pops, exact: true }).check();
          await widget.getByRole('radio', { name: ttl }).check();
          await look(`${pops} locations ${ttl} notice`);
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

test("while its chunk loads, the placeholder holds the widget's height within 3 px at phone widths", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'one browser sets every width');
  test.slow();
  const chunk = new Promise<string>((found) =>
    page.on('response', async (response) => {
      if (response.url().endsWith('.js') && (await response.text().catch(() => '')).includes('app-cdn-widget')) found(response.url());
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
  for (const width of [320, 360, 375, 390, 412, 430, 800, 1280]) {
    gate = new Promise<void>((done) => (unblock = done));
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/design/topics/sd-cdn');
    const lazy = page.locator('app-design-lesson:not(.ion-page-hidden) app-lazy-widget');
    await expect(lazy).toHaveCount(1);
    await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
    const held = await lazy.evaluate((el) => parseFloat(el.style.minHeight));
    unblock();
    const widget = shownWidget(page);
    await widget.locator('svg.draw [data-id="watched"]').waitFor();
    await page.waitForTimeout(200);
    const drawn = await widget.evaluate((el) => el.getBoundingClientRect().height);
    if (!(Math.abs(drawn - held) <= 3)) off.push(`${width}px: held ${held}, drawn ${drawn}`);
  }
  expect(off).toEqual([]);
});

for (const theme of ['light', 'dark'] as const)
  test.describe(`the CDN widget in ${theme}`, () => {
    test.use({ theme, contextOptions: { reducedMotion: 'reduce' } });

    test('passes axe at rest, asking and revealed', async ({ page }) => {
      const { widget, answer } = await open(page);
      const scan = async () => {
        const { violations } = await new AxeBuilder({ page }).include('app-cdn-widget').analyze();
        return violations
          .filter((v) => v.impact === 'serious' || v.impact === 'critical')
          .map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(', ')}`);
      };
      expect(await scan()).toEqual([]);
      await widget.locator('.cards button').nth(at('origin-shield')).click();
      expect(await scan()).toEqual([]);
      await answer(at('origin-shield'));
      await expect(widget.locator('app-widget-check .explain')).toHaveText(SHOWN[at('origin-shield')].reveal);
      expect(await scan()).toEqual([]);
    });
  });

test.describe('the CDN widget under Reduced motion', () => {
  test.use({ motionOff: false, reducedMotion: 'reduce' });
  test.beforeEach(({ page }) => page.addInitScript(countAnimate));

  test('runs no animation through a play and an experiment, and writes what the play showed under the stage', async ({ page }) => {
    const { widget, answer, stageText } = await open(page);
    await page.evaluate(() => (window.animateCalls = 0));
    await widget.getByRole('button', { name: 'Play 5 minutes at the outlined location' }).click();
    await expect(widget.locator('.caption')).toHaveText(/^In this sample of 5 minutes at the outlined location, #1 missed/);
    await expect(widget.locator('.notice')).toHaveText(/^In this sample of 5 minutes/);
    expect(await stageText()).toContain('Played below the picture: motion is reduced.');
    await answer(at('more-locations'));
    await expect(widget.locator('app-widget-check .explain')).toHaveText(SHOWN[at('more-locations')].reveal);
    await expect(widget.locator('.notice')).toHaveText(/^With 100 locations, a 1-minute TTL and no shield, 56\.1%/);
    await expect(widget.locator('svg.draw circle.particle')).toHaveCount(0);
    expect(await page.evaluate(() => window.animateCalls)).toBe(0);
  });
});

test.describe('the CDN widget with motion', () => {
  test.use({ motionOff: false, reducedMotion: 'no-preference' });

  test('plays the timeline on one clock with one moving particle, and Stop ends it at its rest state', async ({ page }) => {
    const { widget, stageText } = await open(page);
    await widget.getByRole('button', { name: 'Play 5 minutes at the outlined location' }).click();
    await expect(widget.getByRole('button', { name: 'Stop the timeline' })).toBeVisible();
    await expect(widget.locator('.notice')).toHaveText('Playing 5 minutes at the outlined location.');
    await expect(widget.locator('svg.draw rect.lit').first()).toBeAttached();
    // A vertical hairline has no width, so it is counted rather than checked for visibility.
    await expect(widget.locator('svg.draw line.playhead')).toHaveCount(3);
    await expect(widget.locator('svg.draw g.sample')).toHaveAttribute('clip-path', 'url(#cdn-clock)');
    expect(await widget.locator('svg.draw circle.particle').count()).toBeLessThanOrEqual(1);
    await widget.getByRole('button', { name: 'Stop the timeline' }).click();
    await expect(widget.locator('svg.draw line.playhead')).toHaveCount(0);
    await expect(widget.locator('.notice')).toHaveText(/^With 20 locations, a 1-minute TTL and no shield/);
    expect((await stageText()).replace(/ \| /g, ' ')).toContain('Play runs these 5 minutes at the outlined location in 6 seconds.');
    await widget.getByRole('button', { name: 'Play 5 minutes at the outlined location' }).click();
    await expect(widget.getByRole('button', { name: 'Play 5 minutes at the outlined location' })).toBeVisible({ timeout: 14_000 });
  });

  test('locks the settings while an answer plays, keeps it hidden, then reveals it', async ({ page }) => {
    const { widget, answer, stageText } = await open(page);
    const e = at('more-traffic');
    await answer(e, 0);
    await expect(widget.getByRole('radio', { name: '5 min' })).toBeDisabled();
    await expect(widget.locator('.notice')).toHaveText(/^Your answer is in: the timeline plays the new setting/);
    await expect(widget.getByRole('button', { name: 'The timeline plays your answer' })).toBeDisabled();
    expect(await stageText()).not.toContain('13,400');
    await expect(widget.locator('app-widget-check .explain')).toHaveText(SHOWN[e].reveal, { timeout: 14_000 });
    await expect(widget.getByRole('radio', { name: '5 min' })).toBeEnabled();
    expect(await stageText()).toContain('13,400/s reach the origin');
  });

  test('on a phone, brings the timeline into view before its answer plays', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const { widget, answer } = await open(page);
    const e = at('origin-shield');
    await answer(e);
    await expect(widget.locator('button.play')).toBeInViewport();
    await expect(widget.locator('app-widget-check .explain')).toHaveText(SHOWN[e].reveal, { timeout: 14_000 });
  });
});
