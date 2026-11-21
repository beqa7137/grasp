import AxeBuilder from '@axe-core/playwright';
import type { Locator, Page } from '@playwright/test';
import { SHARDING_EXPERIMENTS, renderExperiment } from '@grasp/engine';
import { expect, test } from './fixtures';

const SHOWN = SHARDING_EXPERIMENTS.map(renderExperiment);
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

const shownWidget = (page: Page) => page.locator('app-design-lesson:not(.ion-page-hidden) app-ring-widget');

async function open(page: Page) {
  await page.goto('/design/topics/sd-sharding');
  const widget = shownWidget(page);
  await widget.locator('svg.draw [data-id="k0"]').waitFor();
  const summary = widget.locator('svg.draw');
  // The default summary is drawn: the state below is the one the specs read.
  await expect(summary).toHaveAttribute('aria-label', /^A consistent-hash ring with 100 points a node puts the 200 keys on 4 nodes/);
  const height = () => widget.locator('g-stage .well').evaluate((w) => (w as HTMLElement).style.height);
  const stageText = () => widget.locator('svg.draw text').allTextContents();
  const answer = async (i: number, choice = SHOWN[i].answer) => {
    await widget.locator('.cards button').nth(i).click();
    await widget.locator('app-widget-check').getByRole('button', { name: SHOWN[i].choices[choice], exact: true }).click();
  };
  const nodes = (n: number) => widget.getByRole('radio', { name: new RegExp(`^${n} nodes`) });
  return { widget, summary, height, stageText, answer, nodes };
}

/**
 * Each number on a shown HTML surface (the notice, the simplifications, Describe, the dock, the toggles' hints) that a
 * line break parts from its unit.
 */
function unitSplits(widget: Locator) {
  return widget.evaluate((w) => {
    const out: string[] = [];
    const UNITS =
      /\(?(?:\d[\d,.]*|\b[A-Z]\b)(?: [+−×/] \(?(?:\d[\d,.]*|[A-Z])\)?)+\)?(?: (?:keys?|nodes?|points?|shards?)\b)?|\d[\d,.]*%? (?:[a-z]+ )?(?:keys?|nodes?|points?|shards?)\b|\bhash mod (?:\d+|N)\b|\d[\d,]* mod \d+ = \d+/g;
    for (const el of w.querySelectorAll('.notice, .simplify, .describe .said, app-experiment-dock .dock, .toggles small')) {
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

test('the sharding widget places 200 keys, and changes with every control', async ({ page }) => {
  const { widget, summary, height, nodes } = await open(page);
  const h = await height();
  await nodes(5).check();
  await expect(widget.locator('.notice')).toHaveText(
    'E joined, and 39 of the 200 keys moved. All 39 moved to E: 13 from A, 10 from B, 5 from C and 11 from D. An even share for E is 40 (200 / 5).',
  );
  await expect(summary).toHaveAttribute('aria-label', /E joined: 39 of the 200 keys moved\.$/);
  await expect(widget.locator('svg.draw .key.moved[data-id^="p"]')).toHaveCount(39);
  await expect(widget.getByRole('button', { name: 'Replay the last change' })).toBeEnabled();
  await widget.getByRole('radio', { name: 'hash mod N' }).check();
  await expect(summary).toHaveAttribute('aria-label', /^Placing by hash mod 5 puts the 200 keys on 5 nodes/);
  await expect(widget.getByRole('radio', { name: '10', exact: true })).toBeDisabled();
  await expect(widget.locator('.controls legend').nth(1)).toHaveText(/hash mod N has no ring/);
  await widget.getByRole('radio', { name: 'Consistent hashing' }).check();
  await widget.getByRole('radio', { name: '1', exact: true }).check();
  await expect(summary).toHaveAttribute('aria-label', /^A consistent-hash ring with 1 point a node/);
  await expect(widget.getByRole('checkbox', { name: 'Split the key' })).toBeDisabled();
  await widget.getByRole('checkbox', { name: /A hot key/ }).check();
  await expect(widget.getByRole('checkbox', { name: 'A hot key', exact: true })).toHaveAccessibleDescription('30% of the traffic');
  await expect(widget.getByRole('checkbox', { name: 'Split the key' })).toHaveAccessibleDescription('into 10 salted keys');
  await widget.getByRole('checkbox', { name: 'Split the key' }).check();
  await expect(summary).toHaveAttribute('aria-label', /The hot key is split into 10 keys of 3% each/);
  const down = widget.getByRole('checkbox', { name: 'Busiest node down', exact: true });
  await expect(down).toHaveAccessibleDescription(/^[A-E] would fail: its keys must move$/);
  await down.check();
  await expect(down).toHaveAccessibleDescription(/^[A-E] is down: its keys moved$/);
  await expect(widget.locator('svg.draw [data-id="verdict-label"]')).toHaveText(/^LAST CHANGE · [A-E] WENT DOWN$/);
  expect(await height()).toBe(h);
});

test('the sharding widget runs from the keyboard alone', async ({ page }) => {
  const { widget, summary } = await open(page);
  await widget.getByRole('radio', { name: 'Consistent hashing' }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(widget.getByRole('radio', { name: 'hash mod N' })).toBeChecked();
  // The points wait under hash mod N once zoneless Angular draws it; a Tab before that stops on them.
  await expect(widget.getByRole('radio', { name: '100', exact: true })).toBeDisabled();
  await page.keyboard.press('Tab');
  await expect(widget.getByRole('radio', { name: /^4 nodes/ })).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(summary).toHaveAttribute('aria-label', /E joined: 166 of the 200 keys moved\.$/);
  await page.keyboard.press('Tab');
  await expect(widget.getByRole('checkbox', { name: /A hot key/ })).toBeFocused();
  await page.keyboard.press('Space');
  // Split is disabled until zoneless Angular draws the hot key on; a Tab before that skips it.
  await expect(widget.getByRole('checkbox', { name: 'Split the key' })).toBeEnabled();
  await page.keyboard.press('Tab');
  await expect(widget.getByRole('checkbox', { name: 'Split the key' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(widget.getByRole('checkbox', { name: /Busiest node down/ })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(widget.getByRole('button', { name: 'Replay the last change' })).toBeFocused();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Tab');
  await expect(widget.getByRole('button', { name: 'Describe' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(widget.locator('.describe g-data-table tbody tr')).toHaveCount(5);
});

test('a change from the keyboard on the one-column layout keeps the focused control in view', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'one browser sets every width');
  for (const size of [
    { width: 600, height: 800 },
    { width: 412, height: 915 },
  ]) {
    await page.setViewportSize(size);
    const { widget, summary } = await open(page);
    await widget.locator('.controls').evaluate((el) => el.scrollIntoView({ block: 'start' }));
    /** After the change is drawn and the scroll that follows it has run, the focused control is between the header and the foot. */
    const focusInView = async (what: string) => {
      await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(done, 400)))));
      const out = await page.evaluate(() => {
        const box = (document.activeElement!.closest('label') ?? document.activeElement!).getBoundingClientRect();
        const head = document.querySelector('app-design-lesson:not(.ion-page-hidden) ion-header')!.getBoundingClientRect().bottom;
        const bar = document.querySelector('ion-tab-bar')?.getBoundingClientRect();
        const foot = bar?.height ? bar.top : innerHeight;
        return box.top < head || box.bottom > foot
          ? [`the focused control at ${box.top} to ${box.bottom}, the view ${head} to ${foot}`]
          : [];
      });
      expect(out, `${size.width} × ${size.height}, ${what}`).toEqual([]);
    };
    await widget.getByRole('radio', { name: 'Consistent hashing' }).focus();
    await page.keyboard.press('ArrowRight');
    await expect(summary).toHaveAttribute('aria-label', /^Placing by hash mod 4/);
    await focusInView('hash mod N');
    await page.keyboard.press('ArrowLeft');
    await expect(widget.getByRole('radio', { name: '100', exact: true })).toBeEnabled();
    await focusInView('Consistent hashing');
    await page.keyboard.press('Tab');
    await page.keyboard.press('ArrowLeft');
    await expect(summary).toHaveAttribute('aria-label', /^A consistent-hash ring with 10 points a node/);
    await focusInView('10 points');
    await page.keyboard.press('Tab');
    await page.keyboard.press('ArrowRight');
    await expect(summary).toHaveAttribute('aria-label', /E joined/);
    await focusInView('5 nodes');
  }
});

test('each sharding experiment sets up in one tap, asks without giving its answer away, then reveals it', async ({ page }) => {
  const { widget, height, stageText, answer } = await open(page);
  const h = await height();
  const hidden: Record<string, string[]> = {
    'mod-join': ['166 of', '83%', '+47'],
    'ring-join': ['39 of', '+39', 'E holds it'],
    'one-point': ['107', '55.1%'],
    'lost-node': ['180', '+107', 'C holds it'],
    'hot-key': ['42.3%', '19.2%'],
  };
  for (const [i, e] of SHOWN.entries()) {
    if (e.goal) continue;
    await widget.locator('.cards button').nth(i).click();
    const check = widget.locator('app-widget-check');
    await expect(check.locator('legend')).toHaveText(e.ask);
    await expect(widget.getByRole('button', { name: 'Replay the last change, after your answer' })).toBeDisabled();
    await expect(widget.getByRole('button', { name: 'Describe' })).toBeDisabled();
    await expect(widget.getByRole('radio', { name: 'hash mod N' })).toBeDisabled();
    await expect(widget.locator('#ring-down-hint')).toHaveText(/^The busiest node (would fail|is down)$/);
    const words = (await stageText()).join(' | ');
    for (const giveaway of hidden[e.id]) expect(words, `${e.id}: "${giveaway}"`).not.toContain(giveaway);
    await answer(i);
    await expect(check.locator('.explain')).toHaveText(e.reveal);
    for (const region of e.focus) await expect(widget.locator(`[data-focus="${region}"]`)).toHaveClass(/focused/);
    const dashed = await widget
      .locator('svg.draw *')
      .evaluateAll((els) =>
        els
          .filter((el) => getComputedStyle(el).visibility !== 'hidden' && getComputedStyle(el).strokeDasharray !== 'none')
          .map((el) => el.getAttribute('class') ?? el.tagName),
      );
    expect(dashed, `${e.id}: only a hidden box is dashed`).toEqual(dashed.filter((c) => c.includes('hidden-box')));
    expect(await height(), e.id).toBe(h);
  }
  await expect(widget.locator('.cards .done')).toHaveCount(5);
});

test('the sharding challenge is met only by a ring of 5 nodes, 100 points each, with the hot key split', async ({ page }) => {
  const { widget, nodes } = await open(page);
  await widget.locator('.cards button').last().click();
  const checks = widget.locator('.checks li');
  await expect(checks).toHaveText([
    '·the busiest shard left carries 59.8% of the traffic, needs under 30%: not yet',
    '·the failure moved 161 keys, needs fewer than 50: not yet',
    '✓the cluster has 4 nodes, needs fewer than 6: met',
  ]);
  await widget.getByRole('radio', { name: 'Consistent hashing' }).check();
  await widget.getByRole('radio', { name: '100', exact: true }).check();
  await nodes(5).check();
  await widget.getByRole('checkbox', { name: 'Split the key' }).check();
  await expect(widget.locator('.status')).toHaveText('Goal met:');
  await expect(widget.locator('.reveal')).toHaveText(SHOWN.at(-1)!.reveal);
  await widget.getByRole('radio', { name: '10', exact: true }).check();
  await expect(widget.locator('.status')).toHaveText('You met it; now:');
});

test('the controls keep one height whichever placement is chosen, and break no aside or count, at 280 to 1280 px', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'viewport widths are a desktop question');
  const { widget } = await open(page);
  // A legend's aside is one phrase: drawn as one box, never broken across lines.
  const brokenAsides = () =>
    widget
      .locator('.control-label .why')
      .evaluateAll((els) =>
        els.filter((el) => [...el.getClientRects()].filter((r) => r.width > 0).length !== 1).map((el) => el.textContent),
      );
  // Each legend's words, the hidden aside's too, end inside its fieldset: phrases that never break still break apart.
  const pastTheColumn = () =>
    widget.locator('.control-label').evaluateAll((legends) =>
      legends.flatMap((legend) => {
        const set = legend.closest('fieldset')!;
        const style = getComputedStyle(set);
        const right = set.getBoundingClientRect().right - parseFloat(style.paddingRight) - parseFloat(style.borderRightWidth);
        const words = document.createRange();
        words.selectNodeContents(legend);
        return [words, ...legend.querySelectorAll('.why')]
          .filter((r) => r.getBoundingClientRect().right > right + 0.5)
          .map(
            (r) =>
              `"${(r instanceof Element ? r.textContent : r.toString())!.trim()}" ends at ${r.getBoundingClientRect().right}, its column at ${right}`,
          );
      }),
    );
  for (const width of [280, 290, 300, 320, 360, 393, 412, 800, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    const heights: number[] = [];
    for (const scheme of ['hash mod N', 'Consistent hashing']) {
      await widget.getByRole('radio', { name: scheme }).check();
      // The fieldsets only: at container wide the notice under them says the new placement in its own words. Read in
      // one frame, since a change scrolls the piles into view on the one-column layout.
      heights.push(
        await widget.evaluate(
          (w) =>
            w.querySelector('.conditions-control')!.getBoundingClientRect().bottom -
            w.querySelector('.placement-control')!.getBoundingClientRect().top,
        ),
      );
      expect(await brokenAsides(), `${width}px, ${scheme}`).toEqual([]);
      expect(await pastTheColumn(), `${width}px, ${scheme}`).toEqual([]);
    }
    expect(heights[0], `${width}px`).toBe(heights[1]);
    await widget.getByRole('checkbox', { name: 'A hot key', exact: true }).check();
    expect(await unitSplits(widget), `${width}px, the hot key on`).toEqual([]);
    await widget.getByRole('checkbox', { name: 'A hot key', exact: true }).uncheck();
  }
});

test("while its chunk loads, the placeholder holds the widget's height within 3 px at phone widths", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'one browser sets every width');
  test.slow();
  const chunk = new Promise<string>((found) =>
    page.on('response', async (response) => {
      if (response.url().endsWith('.js') && (await response.text().catch(() => '')).includes('app-ring-widget')) found(response.url());
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
  for (const width of [320, 360, 375, 390, 393, 402, 412, 430]) {
    gate = new Promise<void>((done) => (unblock = done));
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/design/topics/sd-sharding');
    const lazy = page.locator('app-design-lesson:not(.ion-page-hidden) app-lazy-widget');
    await expect(lazy).toHaveCount(1);
    await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
    const held = await lazy.evaluate((el) => parseFloat(el.style.minHeight));
    unblock();
    const widget = shownWidget(page);
    await widget.locator('svg.draw [data-id="k0"]').waitFor();
    await page.waitForTimeout(200);
    const drawn = await widget.evaluate((el) => el.getBoundingClientRect().height);
    if (!(Math.abs(drawn - held) <= 3)) off.push(`${width}px: held ${held}, drawn ${drawn}`);
  }
  expect(off).toEqual([]);
});

test('the sharding panel breaks out at container wide, and stacks the controls over the stage below it', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'container widths are a desktop question');
  const { widget } = await open(page);
  const box = async (selector: string) => (await widget.locator(selector).first().boundingBox())!;
  expect((await box('.controls')).x).toBeGreaterThanOrEqual((await box('.ring-stage')).x + (await box('.ring-stage')).width);
  for (const width of [800, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await expect.poll(async () => (await box('.controls')).x).toBeLessThan((await box('.ring-stage')).x + 10);
    const [toggles, stage] = [await box('.toggles'), await box('.ring-stage')];
    expect(toggles.y + toggles.height, `${width}px: the controls over the stage`).toBeLessThanOrEqual(stage.y);
  }
});

test('Describe scrolls inside its own box at 320, 412, 1280 and 1440px: the page never scrolls sideways', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'one browser sets every width');
  for (const width of [320, 412, 1280, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    const { widget, nodes } = await open(page);
    await nodes(6).check();
    await widget.getByRole('button', { name: 'Describe' }).click();
    const table = widget.locator('.describe g-data-table');
    await expect(table.locator('tbody tr')).toHaveCount(6);
    const { scrollW, boxW } = await table.evaluate((t) => ({ scrollW: t.scrollWidth, boxW: t.clientWidth }));
    expect(scrollW, `${width}px: the widest rows fit`).toBeLessThanOrEqual(boxW);
    const rights = await widget.evaluate((w) =>
      ['.ring-stage', '.controls', '.describe g-data-table'].map((s) => w.querySelector(s)!.getBoundingClientRect().right),
    );
    for (const right of rights) expect(right, `${width}px`).toBeLessThanOrEqual(width);
    expect(await page.evaluate(() => document.documentElement.scrollWidth), `${width}px`).toBeLessThanOrEqual(width);
  }
});

test('no line parts a number from its unit in the notice, Describe or the dock, at 320 to 430 px and on desktop', async ({
  page,
}, testInfo) => {
  test.slow();
  const desktop = testInfo.project.name === 'desktop';
  for (const width of desktop ? [320, 360, 390, 412, 430, 1280] : [320, 390, 430]) {
    await page.setViewportSize({ width, height: 900 });
    const { widget, answer, nodes } = await open(page);
    const out: string[] = [];
    const look = async (what: string) => out.push(...(await unitSplits(widget)).map((x) => `${width}px ${what}: ${x}`));
    for (const n of [3, 5, 6]) {
      await nodes(n).check();
      await look(`${n} nodes`);
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
  test.describe(`the sharding widget in ${theme}`, () => {
    test.use({ theme, contextOptions: { reducedMotion: 'reduce' } });

    test('passes axe at rest, asking and revealed', async ({ page }) => {
      const { widget, answer } = await open(page);
      const scan = async () => {
        const { violations } = await new AxeBuilder({ page }).include('app-ring-widget').analyze();
        return violations
          .filter((v) => v.impact === 'serious' || v.impact === 'critical')
          .map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(', ')}`);
      };
      expect(await scan()).toEqual([]);
      await widget.locator('.cards button').nth(at('ring-join')).click();
      expect(await scan()).toEqual([]);
      await answer(at('ring-join'));
      await expect(widget.locator('app-widget-check .explain')).toHaveText(SHOWN[at('ring-join')].reveal);
      expect(await scan()).toEqual([]);
    });
  });

test.describe('the sharding widget under Reduced motion', () => {
  test.use({ motionOff: false, reducedMotion: 'reduce' });
  test.beforeEach(({ page }) => page.addInitScript(countAnimate));

  test('runs no animation through a change and an experiment, and draws the end state with its story', async ({ page }) => {
    const { widget, answer, nodes } = await open(page);
    await page.evaluate(() => (window.animateCalls = 0));
    await nodes(5).check();
    await expect(widget.locator('.notice')).toHaveText(/^E joined, and 39 of the 200 keys moved\./);
    await expect(widget.locator('svg.draw .key.moved[data-id^="k"]')).toHaveCount(39);
    await expect(widget.locator('svg.draw .fly, svg.draw .sweep')).toHaveCount(0);
    await answer(at('mod-join'));
    await expect(widget.locator('app-widget-check .explain')).toHaveText(SHOWN[at('mod-join')].reveal);
    await expect(widget.locator('.notice')).toHaveText(/^E joined, and 166 of the 200 keys moved\./);
    expect(await page.evaluate(() => window.animateCalls)).toBe(0);
  });
});

test.describe('the sharding widget with motion', () => {
  test.use({ motionOff: false, reducedMotion: 'no-preference' });

  test('plays a change on one clock, keys in flight between piles, and Stop draws the end state', async ({ page }) => {
    const { widget, nodes } = await open(page);
    await nodes(5).check();
    await expect(widget.getByRole('button', { name: 'Stop the replay' })).toBeVisible();
    await expect(widget.locator('svg.draw .sweep')).toHaveCount(1, { timeout: 3_000 });
    await expect.poll(() => widget.locator('svg.draw .fly').count(), { timeout: 4_000 }).toBeGreaterThan(0);
    await widget.getByRole('button', { name: 'Stop the replay' }).click();
    await expect(widget.locator('svg.draw .fly, svg.draw .sweep')).toHaveCount(0);
    await expect(widget.locator('svg.draw .key.moved[data-id^="p"]')).toHaveCount(39);
    await widget.getByRole('button', { name: 'Replay the last change' }).click();
    await expect(widget.locator('.notice')).toHaveText(/^E joined, and 39 of the 200 keys moved\./, { timeout: 8_000 });
  });

  test('locks the settings while an answer plays, keeps its counts hidden, then reveals them', async ({ page }) => {
    const { widget, answer, stageText } = await open(page);
    await answer(at('mod-join'), 0);
    await expect(widget.getByRole('radio', { name: 'Consistent hashing' })).toBeDisabled();
    await expect(widget.locator('svg.draw .hidden-box')).toHaveCount(1);
    expect((await stageText()).join(' | ')).not.toContain('166 of');
    await expect(widget.locator('app-widget-check .explain')).toHaveText(SHOWN[at('mod-join')].reveal, { timeout: 12_000 });
    await expect(widget.getByRole('radio', { name: 'Consistent hashing' })).toBeEnabled();
    expect((await stageText()).join(' | ')).toContain('166 of 200 keys moved');
  });
});

for (const reducedMotion of ['no-preference', 'reduce'] as const)
  test.describe(`the sharding widget on a phone, ${reducedMotion === 'reduce' ? 'with Reduced motion' : 'with motion'}`, () => {
    test.use({ motionOff: false, reducedMotion });

    for (const size of [
      { width: 320, height: 568 },
      { width: 393, height: 659 },
    ])
      test(`brings the whole ring and the piles into view after each change from the controls on a ${size.width} × ${size.height} phone`, async ({
        page,
        hasTouch,
      }) => {
        test.slow();
        const motion = reducedMotion === 'no-preference';
        await page.setViewportSize(size);
        const { widget } = await open(page);
        // The visible label is what a learner touches: a tap on a phone, where WebKit focuses the radio as it scrolls.
        const press = async (input: Locator) => {
          const label = widget.locator('label.segment').filter({ has: input });
          await widget.locator('.controls').evaluate((el) => el.scrollIntoView({ block: 'start' }));
          await (hasTouch ? label.tap() : label.click());
        };
        const outOfView = () =>
          widget.evaluate((w) => {
            const letters = Math.max(
              ...[...w.querySelectorAll('svg.draw [data-id^="bin-name-"]')].map((t) => t.getBoundingClientRect().bottom),
            );
            const ringTop = Math.min(...[...w.querySelectorAll('svg.draw [data-id^="k"]')].map((t) => t.getBoundingClientRect().top));
            const bar = document.querySelector('ion-tab-bar')?.getBoundingClientRect();
            const head = document.querySelector('ion-header')?.getBoundingClientRect().bottom ?? 0;
            const foot = bar?.height ? bar.top : innerHeight;
            return [
              ...(letters > foot ? [`the pile letters end at ${letters}, the view at ${foot}`] : []),
              ...(ringTop < head ? [`the ring's top at ${ringTop}, the view's at ${head}`] : []),
            ];
          });
        /** A change that plays is in view while its keys move; every change is in view once it is drawn. */
        const inView = async (what: string, plays = true) => {
          const moving = widget.locator('.notice').filter({ hasText: 'The keys that change node are moving.' });
          if (plays && motion) await expect(moving).toHaveCount(1);
          await expect.poll(outOfView, { message: `in view after ${what}`, timeout: 3_000 }).toEqual([]);
          if (plays && motion) await expect(moving).toHaveCount(0, { timeout: 15_000 });
        };
        const radio = (name: string | RegExp) => page.getByRole('radio', { name, exact: typeof name === 'string' });
        const box = (name: string) => page.getByRole('checkbox', { name, exact: true });
        await press(radio(/^5 nodes/));
        await inView('5 nodes');
        await press(radio('10'));
        await inView('10 points');
        await press(radio('100'));
        await inView('100 points');
        await press(radio(/^6 nodes/));
        await inView('6 nodes');
        await press(box('A hot key'));
        await inView('the hot key', false);
        await press(box('Busiest node down'));
        await inView('the busiest node down');
        // With six nodes the split makes E the busiest, so it is E that is down: a new failure, which plays.
        await press(box('Split the key'));
        await inView('the split');
        await expect(widget.locator('.notice')).toHaveText(/, so E is the one down instead of A\. E went down/);
        await press(radio('hash mod N'));
        await inView('hash mod N', false);
      });

    for (const size of [
      { width: 320, height: 568 },
      { width: 393, height: 659 },
    ])
      test(`keeps the challenge's goal line in view as each change brings the piles in, on a ${size.width} × ${size.height} phone`, async ({
        page,
        hasTouch,
      }) => {
        test.slow();
        await page.setViewportSize(size);
        const { widget } = await open(page);
        await widget.locator('.cards button').last().click();
        const goal = widget.locator('.goal-mini');
        await expect(goal).toHaveText(/^1 of 3 met: busiest shard not yet/);
        // Below the header and above the foot, with the piles brought in as far as that allows: the scroll stops only
        // where the goal line reaches the header.
        const outOfView = () =>
          widget.evaluate((w) => {
            const line = w.querySelector('.goal-mini')!.getBoundingClientRect();
            const letters = Math.max(
              ...[...w.querySelectorAll('svg.draw [data-id^="bin-name-"]')].map((t) => t.getBoundingClientRect().bottom),
            );
            const head = document.querySelector('app-design-lesson:not(.ion-page-hidden) ion-header')!.getBoundingClientRect().bottom;
            const bar = document.querySelector('ion-tab-bar')?.getBoundingClientRect();
            const foot = bar?.height ? bar.top : innerHeight;
            return [
              ...(line.top < head || line.bottom > foot
                ? [`the goal line at ${line.top} to ${line.bottom}, the view ${head} to ${foot}`]
                : []),
              ...(letters > foot && line.top > head + 12
                ? [`the pile letters end at ${letters} below ${foot}, the goal line at ${line.top}`]
                : []),
            ];
          });
        const press = async (name: string | RegExp, role: 'radio' | 'checkbox' = 'radio') => {
          const label = widget.locator('label.segment').filter({ has: page.getByRole(role, { name, exact: typeof name === 'string' }) });
          await label.evaluate((el) => el.scrollIntoView({ block: 'center' }));
          await (hasTouch ? label.tap() : label.click());
          // A smooth scroll passes through views that would pass; the check waits for the one it ends on.
          await page.waitForTimeout(800);
          await expect.poll(outOfView, { message: `in view after ${name}`, timeout: 15_000 }).toEqual([]);
        };
        await press('Consistent hashing');
        await press('100');
        await press(/^5 nodes/);
        await press('Split the key', 'checkbox');
        await expect(goal).toHaveText(/^3 of 3 met/);
        await expect.poll(outOfView, { timeout: 15_000 }).toEqual([]);
      });
  });
