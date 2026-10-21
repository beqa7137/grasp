import AxeBuilder from '@axe-core/playwright';
import type { Locator, Page } from '@playwright/test';
import {
  expect,
  JS_DIAMETER,
  JS_ISLANDS,
  recordedEvents,
  seek,
  seekTimeline,
  showPane,
  startMockRound,
  stepToCheckpoint,
  test,
  trace,
} from './fixtures';

// These specs answer checkpoints from the list; picks.spec.ts covers answering on the picture.
test.use({ checkpoints: 'list' });

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];
const BLOCKING = new Set(['serious', 'critical']);

// A half-faded element fails the contrast check, so animations run at no length and scans wait for them to end.
test.use({ contextOptions: { reducedMotion: 'reduce' } });

/** Waits for every finite animation to end, including Ionic's, which run inside its components' shadow roots. */
async function animationsDone(page: Page) {
  await page.waitForFunction(() => {
    const roots: (Document | ShadowRoot)[] = [document];
    for (let i = 0; i < roots.length; i++) for (const el of roots[i].querySelectorAll('*')) if (el.shadowRoot) roots.push(el.shadowRoot);
    return roots
      .flatMap((root) => root.getAnimations())
      .every((a) => a.playState !== 'running' || a.effect?.getTiming().iterations === Infinity);
  });
}

/** Serious and critical violations, one line per rule with the elements that break it. */
async function blockingViolations(page: Page, { contrastOnly = false } = {}): Promise<string[]> {
  await animationsDone(page);
  const axe = new AxeBuilder({ page });
  const { violations } = await (contrastOnly ? axe.withRules(['color-contrast']) : axe.withTags(TAGS)).analyze();
  return violations
    .filter((v) => BLOCKING.has(v.impact ?? ''))
    .map((v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
}

/** Moves the timeline part of the way through and waits for the grid to show a cell in `state`. */
async function seekGrid(page: Page, fraction: number, state: string) {
  const max = Number(await page.locator('app-player input[type="range"]').getAttribute('max'));
  await seekTimeline(page, Math.round(max * fraction));
  await expect(page.locator(`g-grid-view .cell[data-state="${state}"]`).first()).toBeVisible();
}

/** A hub page has rendered its segment. */
const hubShown = (page: Page) => expect(page.locator('app-hub h1')).toBeVisible();

const PAGES: { name: string; path: string; ready: (page: Page) => Promise<unknown> }[] = [
  { name: 'Today', path: '/today', ready: (page) => expect(page.getByRole('heading', { level: 1 })).toBeVisible() },
  { name: 'the Coding hub with its skill map', path: '/coding', ready: hubShown },
  { name: 'the problem library', path: '/coding/problems', ready: hubShown },
  { name: 'the Design hub with its topics', path: '/design', ready: hubShown },
  { name: 'the case studies', path: '/design/cases', ready: hubShown },
  { name: 'the Behavioral hub', path: '/behavioral', ready: hubShown },
  { name: 'the story bank', path: '/behavioral/stories', ready: hubShown },
  { name: 'the behavioral questions', path: '/behavioral/questions?competency=conflict', ready: hubShown },
  {
    name: 'the STAR guide',
    path: '/behavioral/guide',
    ready: (page) => expect(page.getByRole('heading', { name: 'How to answer (STAR)', level: 1 })).toBeVisible(),
  },
  {
    name: 'a pattern page',
    path: '/coding/patterns/binary-search',
    ready: (page) => expect(page.getByRole('heading', { name: 'Binary Search', level: 1 })).toBeVisible(),
  },
  {
    name: "a pattern's problems",
    path: '/coding/patterns/binary-search/problems',
    ready: (page) => expect(page.getByRole('heading', { name: 'Problems', level: 2 })).toBeVisible(),
  },
  {
    name: 'the hint ladder, open to its last rung',
    path: '/coding/problems/search-rotated-array',
    ready: async (page) => {
      await page.getByRole('button', { name: 'Which pattern?' }).click();
      await page.getByRole('button', { name: 'Which words give it away?' }).click();
      await page.getByRole('button', { name: 'Show the template' }).click();
      await expect(page.getByRole('link', { name: 'Watch it: Binary Search →' })).toBeVisible();
    },
  },
  {
    name: 'the LCS visualizer and its table',
    path: '/coding/visualizers/lcs',
    ready: (page) => expect(page.getByRole('table')).toBeVisible(),
  },
  { name: 'a visualizer checkpoint', path: '/coding/visualizers/binary-search', ready: (page) => stepToCheckpoint(page) },
  {
    name: 'the grid search with cells in its queue',
    path: '/coding/visualizers/grid-bfs',
    ready: (page) => seekGrid(page, 0.5, 'frontier'),
  },
  { name: 'the grid search on its shortest path', path: '/coding/visualizers/grid-bfs', ready: (page) => seekGrid(page, 1, 'path') },
  {
    name: 'a visualizer with an array too long for its width, which scrolls sideways',
    path: '/coding/visualizers/binary-search',
    ready: async (page) => {
      await page.locator('app-player .input').getByRole('button', { name: 'Edit' }).click();
      const numbers = Array.from({ length: 24 }, (_, i) => -999 + i).join(', ');
      await page.getByRole('textbox', { name: /^Sorted numbers/ }).fill(numbers);
      await page.getByRole('button', { name: 'Run with this input' }).click();
      await expect(page.getByRole('region', { name: 'Array' })).toBeVisible();
    },
  },
  {
    name: 'an answered review card',
    path: '/today/review',
    ready: async (page) => {
      await page.locator('g-question-card .choice').first().click();
      await expect(page.locator('g-question-card .reveal')).toBeVisible();
    },
  },
  {
    name: 'a Design Lab mission',
    path: '/design/missions/first-scale-up',
    ready: (page) => expect(page.getByRole('button', { name: /^Users, / })).toBeVisible(),
  },
  {
    name: 'Settings',
    path: '/today/settings',
    ready: (page) => expect(page.getByRole('radiogroup', { name: 'Daily session' })).toBeVisible(),
  },
  {
    name: 'the code workspace',
    path: '/coding/problems/two-sum',
    ready: async (page) => {
      await showPane(page, 'Code');
      await expect(page.getByRole('textbox', { name: 'Two Sum solution' })).toBeVisible();
    },
  },
  {
    name: 'a tree problem with its example trees',
    path: '/coding/problems/tree-diameter',
    ready: (page) => expect(page.locator('.example g-tree-view').first()).toBeVisible(),
  },
  {
    name: 'a trace of learner code on a tree',
    path: '/coding/problems/tree-diameter',
    ready: async (page) => {
      await trace(page, JS_DIAMETER, 'Diameter of Binary Tree');
      await expect(page.locator('app-trace-player g-tree-view')).toBeVisible();
    },
  },
  {
    name: 'a trace of a recursive DFS with its call stack',
    path: '/coding/problems/tree-diameter',
    ready: async (page) => {
      await trace(page, JS_DIAMETER, 'Diameter of Binary Tree');
      await page.getByRole('slider', { name: 'Timeline' }).fill('17');
      await expect(page.locator('app-trace-player g-list-view', { hasText: 'call stack' }).locator('.item')).toHaveCount(4);
    },
  },
  {
    name: 'a trace of a grid',
    path: '/coding/problems/number-of-islands',
    ready: async (page) => {
      await trace(page, JS_ISLANDS, 'Number of Islands');
      await seek(page, 28, 'Called sink(1, 1)');
    },
  },
  {
    name: 'a mock interview with its code drawer open',
    path: '/mock',
    ready: async (page) => {
      await startMockRound(page, 'Coding', 'Days Until Warmer');
      await expect(page.getByText(/daily temperatures/)).toBeVisible();
      await page.getByRole('button', { name: 'Code', exact: true }).click();
      await expect(page.getByRole('textbox', { name: 'Interview code' })).toBeVisible();
    },
  },
];

for (const theme of ['dark', 'light'] as const) {
  test.describe(`in the ${theme} theme`, () => {
    test.use({ theme });
    // Only colour contrast depends on the theme; the dark pass covers every other rule.
    const contrastOnly = theme === 'light';

    for (const { name, path, ready } of PAGES) {
      test(`${name} has no serious or critical accessibility violations`, async ({ page }) => {
        await page.goto(path);
        await ready(page);
        expect(await blockingViolations(page, { contrastOnly })).toEqual([]);
      });
    }

    test.describe('on a first visit', () => {
      test.use({ pilotNoticeSeen: false });

      test('the pilot welcome has no serious or critical accessibility violations', async ({ page }) => {
        await page.goto('/today');
        await expect(page.getByRole('dialog', { name: 'Welcome to the Grasp pilot' })).toBeVisible();
        expect(await blockingViolations(page, { contrastOnly })).toEqual([]);
      });
    });
  });
}

test.describe('on a first visit', () => {
  test.use({ pilotNoticeSeen: false });

  test('the pilot welcome keeps its button on screen at twice the text size', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/today');
    await page.addStyleTag({ content: 'html { font-size: 200%; }' });
    const dialog = page.getByRole('dialog', { name: 'Welcome to the Grasp pilot' });
    // The dialog box is in the modal's shadow DOM and its content is slotted, so the button is not its DOM descendant.
    const button = page.getByRole('button', { name: /Got it/ });
    await expect(button).toBeVisible();
    await animationsDone(page);

    const within = async (inner: Locator, outer: { x: number; y: number; width: number; height: number }) => {
      const box = (await inner.boundingBox())!;
      return (
        box.y >= outer.y && box.y + box.height <= outer.y + outer.height && box.x >= outer.x && box.x + box.width <= outer.x + outer.width
      );
    };
    // WebKit lays the modal out again a moment after the larger text applies, so the geometry is read until it settles.
    await expect.poll(() => within(dialog, { x: 0, y: 0, width: 390, height: 844 }), { message: 'the dialog fits the screen' }).toBe(true);
    await expect
      .poll(async () => within(button, (await dialog.boundingBox())!), { message: 'the button shows inside the dialog' })
      .toBe(true);
    await button.click();
    await expect(dialog).toBeHidden();
  });
});

test('a visualizer checkpoint can be answered from the keyboard, with focus always in view', { tag: '@player' }, async ({ page }) => {
  await page.goto('/coding/visualizers/binary-search');
  await page.getByRole('button', { name: 'Step forward' }).focus();
  await stepToCheckpoint(page, () => page.keyboard.press('Enter'));
  const prompt = page.getByText('Your call');

  // The step button is disabled at a checkpoint, so focus moves to the question instead of the top of the page.
  await expect(page.locator('.predict .prompt')).toBeFocused();
  await page.keyboard.press('Tab');
  const choice = page.locator('.predict .choice').first();
  await expect(choice).toBeFocused();
  const ring = await choice.evaluate((el) => {
    const style = getComputedStyle(el);
    return el.matches(':focus-visible') && style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0;
  });
  expect(ring, 'the focused choice shows a focus ring').toBe(true);

  await page.keyboard.press('Space');
  await expect(page.locator('.predict .verdict')).toBeFocused();
  await expect(page.locator('.predict .choice .g-answer-mark[aria-label*="correct"]')).toHaveCount(1);
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Continue →' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(prompt).toBeHidden();
  await expect(page.locator('.narration')).toBeFocused();
});

test('stepping and playing from the focused stage leave its scroll alone', { tag: '@player' }, async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto('/coding/visualizers/lcs');
  const scene = page.locator('app-player .scene');
  await scene.focus();
  const top = await scene.evaluate((el) => el.scrollTop);
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('app-player g-transport .count')).toHaveText('2 / 86');
  await page.keyboard.press('Space');
  await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();
  await page.keyboard.press('Space');
  expect(await scene.evaluate((el) => el.scrollTop), 'the stage scroll').toBe(top);
  await expect(scene).toBeFocused();
});

test('the arrow keys still scroll a focused code panel sideways, and step the player', { tag: '@player' }, async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto('/coding/visualizers/lcs');
  const code = page.locator('app-player g-code-panel');
  expect(await code.evaluate((el) => el.scrollWidth > el.clientWidth), 'the code is wider than its panel').toBe(true);
  await code.focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('app-player g-transport .count')).toHaveText('2 / 86');
  await expect.poll(() => code.evaluate((el) => el.scrollLeft), { message: 'the panel scrolled sideways' }).toBeGreaterThan(0);
});

/** How an element sits in the player's view: px shown inside every box that clips it and the viewport, and whether all of it shows. */
async function inView(page: Page, target: Locator) {
  return target.evaluate((el) => {
    const box = el.getBoundingClientRect();
    let top = Math.max(0, document.querySelector('app-player ion-header')!.getBoundingClientRect().bottom);
    let bottom = innerHeight;
    for (let parent = el.parentElement; parent; parent = parent.parentElement) {
      if (getComputedStyle(parent).overflowY === 'visible') continue;
      const clip = parent.getBoundingClientRect();
      top = Math.max(top, clip.top);
      bottom = Math.min(bottom, clip.bottom);
    }
    const shown = Math.min(box.bottom, bottom) - Math.max(box.top, top);
    return { shown, height: box.height, whole: box.top >= top - 0.5 && box.bottom <= bottom + 0.5 };
  });
}

/** Expects the focused element not hidden (WCAG 2.4.11): at least a strip of it in view, or all of a shorter one. */
async function expectFocusShown(page: Page, target: Locator, name: string) {
  await expect(target).toBeFocused();
  const { shown, height } = await inView(page, target);
  expect(shown, `px of ${name} in view`).toBeGreaterThanOrEqual(Math.min(height, 16));
}

// Motion is reduced in this file, so a reveal has finished scrolling by the time focus lands.
test('on a narrow phone, answering and continuing from the keyboard keep Step forward and the focused element on screen', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto('/coding/visualizers/dijkstra');
  const forward = page.getByRole('button', { name: 'Step forward' });
  await forward.focus();
  await stepToCheckpoint(page, () => page.keyboard.press('Enter'));
  await page.keyboard.press('1');
  await expectFocusShown(page, page.locator('.predict .verdict'), 'the verdict');
  expect((await inView(page, forward)).whole, 'Step forward on screen after the answer').toBe(true);
  await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
  await expectFocusShown(page, page.locator('.narration'), 'the narration');
  expect((await inView(page, forward)).whole, 'Step forward on screen after Continue').toBe(true);
});

test('at 400% zoom, answering and continuing from the keyboard never leave the focused element out of view', async ({ page }) => {
  // 1280 x 1024 at 400% lays out as 320 x 256, too short for the controls and the verdict or narration together.
  await page.setViewportSize({ width: 320, height: 256 });
  await page.goto('/coding/visualizers/dijkstra');
  await page.getByRole('button', { name: 'Step forward' }).focus();
  await stepToCheckpoint(page, () => page.keyboard.press('Enter'));
  await page.keyboard.press('1');
  await expectFocusShown(page, page.locator('.predict .verdict'), 'the verdict');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
  await expectFocusShown(page, page.locator('.narration'), 'the narration');
});

test('at 400% zoom, tapping through a checkpoint never leaves the focused element out of view', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 256 });
  await page.goto('/coding/visualizers/dijkstra');
  await stepToCheckpoint(page);
  await expectFocusShown(page, page.locator('.predict .prompt'), 'the prompt');
  await page.locator('.predict .choice').first().click();
  await expectFocusShown(page, page.locator('.predict .verdict'), 'the verdict');
  await page.getByRole('button', { name: 'Continue →' }).click();
  await expectFocusShown(page, page.locator('.narration'), 'the narration');
});

test('Enter on the link under a reviewed card opens it instead of grading the card', async ({ page }) => {
  await page.goto('/today/review');
  await page.locator('g-question-card .choice').first().click();
  const link = page.locator('g-question-card .reveal a');
  await link.focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/coding\/(patterns|visualizers)\//);

  expect((await recordedEvents(page)).map((e) => e.type)).not.toContain('review.graded');
});
