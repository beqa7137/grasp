import type { Page } from '@playwright/test';
import {
  expect,
  expectNoPageScroll,
  expectUnmoved,
  openPlayback,
  recordedEvents,
  section,
  seekTimeline,
  stepToCheckpoint,
  stepTotal,
  synced,
  test,
  viewportTop,
} from './fixtures';

const VISUALIZER_TITLES = [
  "Kruskal's Minimum Spanning Tree",
  'Minimum XOR Sum (Bitmask DP)',
  'Merge Intervals',
  'Subsets by Backtracking',
  'Tree Traversal: preorder, inorder, postorder',
  'Jump Game',
  'Single Number (XOR)',
  'Two Sum (Hash Map)',
  'Subarray Sum Equals K with Prefix Sums',
  'Linked List Cycle (Floyd)',
  'Reverse a Linked List',
  'House Robber',
];

async function answerCheckpoint(page: Page) {
  const sync = synced(page, 'predict.answered');
  await page.locator('.predict .choice').first().click();
  await expect(page.getByText(/^(Exactly\.|Not quite\.)/)).toBeVisible();
  await page.getByRole('button', { name: 'Continue →' }).click();
  await expect(page.getByText('Your call')).toBeHidden();
  await sync;
}

test('predicting the next step of a visualizer counts toward mastery', { tag: ['@smoke', '@player'] }, async ({ page }) => {
  await page.goto('/coding/visualizers');
  await page.getByRole('link', { name: /Binary Search Easy/ }).click();
  await expect(page.getByRole('checkbox', { name: 'Predict mode' })).toBeChecked();
  await expect(page.getByText('1 / 13')).toBeVisible();
  await stepToCheckpoint(page);
  await answerCheckpoint(page);
});

for (const title of VISUALIZER_TITLES) {
  test(`${title} opens from the list and asks for the next step`, async ({ page }) => {
    await page.goto('/coding/visualizers');
    await page
      .getByRole('link')
      .filter({ has: page.getByRole('heading', { name: title, exact: true }) })
      .click();
    await expect(page.getByRole('heading', { name: title, level: 1 })).toBeVisible();
    await stepToCheckpoint(page);
    await answerCheckpoint(page);
  });
}

test('the timeline steps forward and back', { tag: '@player' }, async ({ page }) => {
  await page.goto('/coding/visualizers/binary-search');
  await page.getByText('Predict mode').click();
  await expect(page.getByRole('checkbox', { name: 'Predict mode' })).not.toBeChecked();
  await page.getByRole('button', { name: 'Step forward' }).click();
  await expect(page.getByText('2 / 13')).toBeVisible();
  await page.getByRole('button', { name: 'Step back' }).click();
  await expect(page.getByText('1 / 13')).toBeVisible();
});

test(
  'number keys answer only the page in view, not a checkpoint left open under another page',
  { tag: ['@nav', '@player'] },
  async ({ page }) => {
    await page.goto('/coding/visualizers/binary-search');
    const player = page.locator('app-player');
    await stepToCheckpoint(page);
    const wide = page.viewportSize()!.width >= 1024;

    if (wide) {
      await section(page, 'Today').click();
      await page
        .locator('app-today')
        .getByRole('link', { name: /^Review/ })
        .click();
      const review = page.locator('app-drill');
      await expect(review.locator('g-question-card .choice:enabled').first()).toBeVisible();
      // Ionic hides the page it leaves only once the tab transition ends.
      await expect(player).toBeHidden();
      await page.keyboard.press('1');
      await expect(review.locator('g-question-card .reveal')).toHaveCount(1);
    } else {
      // The player hides the tab bar under 1024px, so the other page is its pattern, opened from the intro.
      await page.getByRole('button', { name: 'About this visualizer' }).click();
      await page.getByRole('dialog', { name: 'Binary Search' }).getByRole('link', { name: 'Binary Search', exact: true }).click();
      await expect(page.locator('app-pattern').getByRole('heading', { name: 'Binary Search', level: 1 })).toBeVisible();
      await expect(player).toBeHidden();
      await page.keyboard.press('1');
    }
    expect((await recordedEvents(page)).map((e) => e.type)).not.toContain('predict.answered');

    // The hidden player does not re-render, so look for a stray answer only once it is back in view.
    if (wide) await section(page, 'Coding').click();
    else await page.locator('app-pattern ion-back-button').click();
    await expect(player.getByText('Your call')).toBeVisible();
    await expect(player.locator('.predict .verdict')).toHaveCount(0);
    const sync = synced(page, 'predict.answered');
    await page.keyboard.press('1');
    await expect(player.locator('.predict .verdict')).toHaveCount(1);
    await sync;
  },
);

test(
  'Step forward stays under the finger through every step and checkpoint, however far Continue was scrolled to',
  { tag: '@player' },
  async ({ page }) => {
    await page.goto('/coding/visualizers/dijkstra');
    const player = page.locator('app-player');
    const forward = player.getByRole('button', { name: 'Step forward' });
    const count = player.locator('g-transport .count');
    const prompt = player.getByText('Your call');
    const total = await stepTotal(count);
    const home = await viewportTop(forward);
    let checkpoints = 0;
    for (let step = 1; step < total; step = Number((await count.textContent())!.split('/')[0])) {
      await forward.click();
      await expect(count.filter({ hasText: new RegExp(`^\\s*${step + 1} /`) }).or(prompt)).toBeVisible();
      if (await prompt.isVisible()) {
        checkpoints++;
        // Continue can sit below the fold of the checkpoint dock, which the click scrolls as a finger would.
        await player.locator('.predict .choice').first().click();
        await player.getByRole('button', { name: 'Continue →' }).click();
        await expect(prompt).toBeHidden();
      }
      await expectUnmoved(forward, home, `Step forward after step ${step}`);
    }
    expect(checkpoints).toBeGreaterThan(0);
  },
);

test('an answered checkpoint also continues from Step forward, which stays where it was tapped', { tag: '@player' }, async ({ page }) => {
  await page.goto('/coding/visualizers/binary-search');
  const forward = page.getByRole('button', { name: 'Step forward' });
  await stepToCheckpoint(page);
  await expect(forward).toBeDisabled();
  await page.locator('.predict .choice').first().click();
  await expect(forward).toBeEnabled();
  const before = await viewportTop(forward);
  const step = await page.locator('app-player g-transport .count').textContent();
  await forward.click();
  await expect(page.getByText('Your call')).toBeHidden();
  await expect(page.locator('app-player g-transport .count')).not.toHaveText(step!);
  await expectUnmoved(forward, before, 'Step forward after continuing with it');
});

test(
  'on a phone held sideways, tapping an answer leaves the stage and Step forward where they are',
  { tag: '@player' },
  async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 915, height: 412 });
    await page.goto('/coding/visualizers/two-sum-hash');
    await stepToCheckpoint(page);
    const player = page.locator('app-player');
    const forward = player.getByRole('button', { name: 'Step forward' });
    const scene = player.locator('.scene');
    const [home, stage] = [await viewportTop(forward), await viewportTop(scene)];
    await player.locator('.predict .choice').first().click();
    await expect(player.locator('.predict .verdict')).toBeVisible();
    await expectUnmoved(forward, home, 'Step forward after tapping an answer');
    await expectUnmoved(scene, stage, 'the stage after tapping an answer');
    await expectNoPageScroll(page);
  },
);

for (const [id, width, height] of [
  ['dijkstra', 320, 256],
  ['kruskal-mst', 568, 320],
  ['two-sum-hash', 600, 500],
  ['binary-search', 412, 480],
] as const) {
  test(`at ${width}×${height} the layout scrolls and nothing covers the ${id} checkpoint`, { tag: '@player' }, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto(`/coding/visualizers/${id}`);
    await stepToCheckpoint(page);
    // Each element's first and last lines, since a sticky control would cover an end. Before the answer each element is
    // scrolled into view; the verdict is read where the page put it.
    const covered = (selector: string, scroll: boolean) =>
      page.locator('app-player').evaluate(
        (player, [within, reveal]) =>
          [...player.querySelectorAll<HTMLElement>(within)].flatMap((el) => {
            if (reveal) el.scrollIntoView({ block: 'nearest' });
            const box = el.getBoundingClientRect();
            return [box.top + 4, box.bottom - 4].flatMap((y) => {
              const hit = document.elementFromPoint(box.left + Math.min(20, box.width / 2), y);
              return hit && el.contains(hit) ? [] : [`${el.className} under ${hit?.className}`];
            });
          }),
        [selector, scroll] as const,
      );
    expect(await covered('.predict :is(.prompt, .choice)', true), 'the prompt and every choice').toEqual([]);
    await page.locator('.predict .choice').first().click();
    await expect(page.locator('.predict .verdict')).toBeVisible();
    // Continue takes no pointer events while it arms, so a hit test sees through it until then.
    await page.locator('.predict .continue').evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)));
    expect(await covered('.predict .verdict', false), 'the verdict').toEqual([]);
  });
}

test('on a phone, Continue shows under the verdict in R right after an answer', { tag: '@player' }, async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'desktop', 'R is the phone layout.');
  for (const id of ['binary-search', 'kruskal-mst', 'lcs']) {
    await page.goto(`/coding/visualizers/${id}`);
    await stepToCheckpoint(page);
    await page.locator('.predict .choice').first().click();
    await expect(page.locator('.predict .verdict')).toBeVisible();
    const place = await page.locator('app-player').evaluate((player) => {
      const box = (selector: string) => player.querySelector(selector)!.getBoundingClientRect();
      const [r, verdict, go] = [box('.panel-col'), box('.predict .verdict'), box('.predict .continue')];
      return {
        continue: go.top >= r.top && go.bottom <= r.bottom + 0.5,
        verdictTop: verdict.top >= r.top,
        clear: verdict.bottom <= go.top + 1,
      };
    });
    expect(place, id).toEqual({ continue: true, verdictTop: true, clear: true });
  }
});

/** The open checkpoint's prompt has focus and shows whole in R, once its panel has risen into place. */
async function expectPromptFocused(page: Page, where = '') {
  const prompt = page.locator('.predict .prompt');
  await expect(prompt, `the prompt focused ${where}`).toBeFocused();
  await page.locator('.predict').evaluate((panel) => Promise.all(panel.getAnimations().map((a) => a.finished)));
  const whole = await prompt.evaluate((el) => {
    const [r, box] = [el.closest('.panel-col')!.getBoundingClientRect(), el.getBoundingClientRect()];
    return box.top >= r.top - 0.5 && box.bottom <= r.bottom + 0.5;
  });
  expect(whole, `the prompt whole in R ${where}`).toBe(true);
}

/**
 * Answers the open checkpoint by key and continues, which leaves focus on the narration, then scrolls R down as a learner
 * might and steps by key to the next checkpoint, whose prompt and verdict take focus in turn.
 */
async function keyToNextCheckpoint(page: Page, where = '') {
  await page.keyboard.press('1');
  await expect(page.locator('.predict .verdict'), `the verdict focused ${where}`).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('app-player .narration'), `the narration focused after Continue ${where}`).toBeFocused();
  await page.locator('app-player .panel-col').evaluate((r) => r.scrollTo({ top: r.scrollHeight }));
  await stepToCheckpoint(page, () => page.keyboard.press('ArrowRight'));
  await expectPromptFocused(page, `at the next checkpoint ${where}`);
  await page.keyboard.press('1');
  await expect(page.locator('.predict .verdict'), `the next verdict focused ${where}`).toBeFocused();
}

test('under 1024px the player hides the tab bar, and the list shows it again', { tag: ['@nav', '@player'] }, async ({ page }) => {
  await page.goto('/coding/visualizers');
  const tabs = page.getByRole('navigation', { name: 'Main' });
  await expect(tabs).toBeVisible();
  await page.getByRole('link', { name: /Binary Search Easy/ }).click();
  await expect(page.locator('app-player h1')).toHaveText('Binary Search');
  if (page.viewportSize()!.width < 1024) await expect(tabs).toBeHidden();
  else await expect(tabs).toBeVisible();
  await page.locator('app-player ion-back-button').click();
  await expect(page.locator('app-visualizers')).toBeVisible();
  await expect(tabs).toBeVisible();
});

test(
  'under 1024px, a tab button that opens the player leaves focus on its heading, and every checkpoint reached by key takes it',
  { tag: ['@nav', '@player'] },
  async ({ page }) => {
    // The player hides the tab bar under 1024px, so it is left for another tab with the bar still shown.
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/coding/visualizers/binary-search');
    await expect(page.locator('app-player h1')).toBeVisible();
    await section(page, 'Today').click();
    await expect(page.locator('app-today h1')).toBeVisible();
    await page.setViewportSize({ width: 800, height: 720 });
    await section(page, 'Coding').focus();
    // Ionic selects a tab on Enter's keydown and again on its keyup, which takes a selected tab to its root while its button
    // keeps focus. A person's keyup comes after the switch, so the key is held until then.
    await page.keyboard.down('Enter');
    const heading = page.locator('app-player h1');
    await expect(heading).toBeFocused();
    await page.keyboard.up('Enter');
    await expect(page).toHaveURL(/\/coding\/visualizers\/binary-search$/);
    await expect(heading).toBeFocused();
    await expect(page.getByRole('navigation', { name: 'Main' })).toBeHidden();

    await stepToCheckpoint(page, () => page.keyboard.press('ArrowRight'));
    await expectPromptFocused(page);
    await keyToNextCheckpoint(page);
  },
);

const SIZES = [
  { width: 412, height: 915 },
  { width: 800, height: 720 },
  { width: 1280, height: 720 },
];

test('a deep link leaves focus on the page, so every checkpoint reached by key takes it', { tag: '@player' }, async ({ page }) => {
  for (const size of SIZES) {
    await page.setViewportSize(size);
    await page.goto('/coding/visualizers/binary-search');
    if (size.width < 1024) await expect(page.getByRole('navigation', { name: 'Main' })).toBeHidden();
    await expect(page.locator('app-player h1')).not.toBeFocused();
    await stepToCheckpoint(page, () => page.keyboard.press('ArrowRight'));
    await expectPromptFocused(page, `at ${size.width}×${size.height}`);
    await keyToNextCheckpoint(page, `at ${size.width}×${size.height}`);
  }
});

test(
  'a checkpoint reached by key from the code or an Input button takes focus, also below 900px, where it hides them',
  { tag: '@player' },
  async ({ page }) => {
    for (const size of SIZES) {
      await page.setViewportSize(size);
      for (const from of ['code', 'Random'] as const) {
        await page.goto('/coding/visualizers/binary-search');
        const player = page.locator('app-player');
        await (from === 'code' ? player.locator('g-code-panel') : player.locator('.input').getByRole('button', { name: from })).focus();
        await stepToCheckpoint(page, () => page.keyboard.press('ArrowRight'));
        await expectPromptFocused(page, `from ${from} at ${size.width}×${size.height}`);
      }
    }
  },
);

test('a checkpoint reached in play while the Timeline has focus takes it, its prompt whole in R', { tag: '@player' }, async ({ page }) => {
  for (const size of SIZES) {
    await page.setViewportSize(size);
    await page.goto('/coding/visualizers/binary-search');
    const player = page.locator('app-player');
    await player.locator('.panel-col').evaluate((r) => r.scrollTo({ top: r.scrollHeight }));
    await openPlayback(page);
    await player.getByRole('button', { name: 'Play', exact: true }).focus();
    await page.keyboard.press('Enter');
    const timeline = player.getByRole('slider', { name: 'Timeline' });
    await timeline.focus();
    await expect(timeline).toBeFocused();
    await expectPromptFocused(page, `from the Timeline at ${size.width}×${size.height}`);
  }
});

test(
  'typing into the input while it plays through a checkpoint keeps focus in the field, announces the checkpoint and answers nothing',
  { tag: '@player' },
  async ({ page }) => {
    await page.goto('/coding/visualizers/binary-search');
    const player = page.locator('app-player');
    await openPlayback(page);
    const fastest = player.getByRole('radiogroup', { name: 'Speed' }).getByRole('radio', { name: '4×' });
    await fastest.click();
    await expect(fastest).toHaveAttribute('aria-checked', 'true');
    await page.keyboard.press('Escape');
    await player.getByRole('button', { name: 'Play', exact: true }).click();
    await player.locator('.input').getByRole('button', { name: 'Edit' }).click();
    const field = player.getByRole('textbox', { name: /^Sorted numbers/ });
    await field.click();
    await page.keyboard.press('End');
    const before = await field.inputValue();
    await page.keyboard.type('12341234123412341234', { delay: 120 });
    await expect(player.getByText('Your call')).toBeVisible();
    await expect(field).toBeFocused();
    await expect(player.locator('[role="status"]')).toHaveText(/^Checkpoint: nums\[mid\] = -?\d+, target = -?\d+\. What happens next\?$/);
    const place = await field.evaluate((el) => {
      const r = el.closest('.panel-col')!;
      const [view, box] = [r.getBoundingClientRect(), el.getBoundingClientRect()];
      return {
        whole: box.top >= view.top - 0.5 && box.bottom <= view.bottom + 0.5,
        nearest:
          r.scrollTop === 0 ||
          Math.abs(view.top + r.clientTop + r.clientHeight - parseFloat(getComputedStyle(r).scrollPaddingBottom) - box.bottom) <= 1,
      };
    });
    expect(place, 'the field whole in R, scrolled no further from the dock than it needs').toEqual({ whole: true, nearest: true });
    expect(await field.inputValue()).toBe(before + '12341234123412341234');
    await expect(player.locator('.predict .verdict')).toHaveCount(0);
    expect((await recordedEvents(page)).map((e) => e.type)).not.toContain('predict.answered');
  },
);

for (const [id, width, height] of [
  ['dijkstra', 320, 256],
  ['kruskal-mst', 568, 320],
] as const) {
  test(
    `at ${width}×${height} a tapped checkpoint's prompt shows whole once its panel has risen into place`,
    { tag: '@player' },
    async ({ page }) => {
      await page.setViewportSize({ width, height });
      await page.goto(`/coding/visualizers/${id}`);
      await stepToCheckpoint(page);
      const prompt = page.locator('.predict .prompt');
      await expect(prompt).toBeFocused();
      await page.locator('.predict').evaluate((panel) => Promise.all(panel.getAnimations().map((a) => a.finished)));
      const place = await prompt.evaluate((el) => {
        const view = el.closest('.layout')!.getBoundingClientRect();
        const box = el.getBoundingClientRect();
        return { top: box.top >= view.top - 0.5, bottom: box.bottom <= view.bottom + 0.5 };
      });
      expect(place).toEqual({ top: true, bottom: true });
    },
  );
}

test(
  'in the layout that scrolls, a long caption pushes what follows down instead of running over it',
  { tag: '@player' },
  async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 256 });
    await page.goto('/coding/visualizers/dijkstra');
    const player = page.locator('app-player');
    await player.getByText('Predict mode').click();
    const count = player.locator('g-transport .count');
    const total = await stepTotal(count);
    for (let step = 1; step <= total; step++) {
      if (step > 1) {
        await seekTimeline(page, step - 1);
        await expect(count).toHaveText(`${step} / ${total}`);
      }
      const over = await player.evaluate(
        (el) =>
          el.querySelector('.narration .body')!.getBoundingClientRect().bottom -
          el.querySelector('.panel-col')!.getBoundingClientRect().top,
      );
      expect(over, `step ${step}: the caption's bottom past R's top`).toBeLessThanOrEqual(0.5);
    }
  },
);

test('Play at an open checkpoint asks for the answer instead of playing on', { tag: '@player' }, async ({ page }) => {
  await page.goto('/coding/visualizers/binary-search');
  await stepToCheckpoint(page);
  const play = page.getByRole('button', { name: 'Play', exact: true });
  await expect(play).toBeEnabled();
  await play.click();
  await expect(page.locator('.predict .prompt')).toBeFocused();
  await expect(page.locator('app-player [role="status"]')).toHaveText('Answer or skip to continue.');
  await expect(page.locator('.predict .verdict')).toHaveCount(0);
  expect((await recordedEvents(page)).map((e) => e.type)).not.toContain('predict.answered');

  await page.locator('.predict .choice').first().click();
  await play.click();
  await expect(page.getByText('Your call')).toBeHidden();
});

test('the key hint shows only with a fine pointer', { tag: '@player' }, async ({ page, isMobile }) => {
  await page.goto('/coding/visualizers/binary-search');
  const hint = page.locator('app-player .keys');
  if (isMobile) await expect(hint).toBeHidden();
  else await expect(hint).toBeVisible();
  if (isMobile) return;
  // A short wide window (the player under 424px tall) gets the dock with ⋯, which has no room for the hint, and nothing in it
  // overflows. From 1024px the rail leaves the player the window's whole height, which the tab bar shared before R10.
  await page.setViewportSize({ width: 1280, height: 440 });
  await expect(hint).toBeHidden();
  await expect(page.getByRole('button', { name: 'More playback controls' })).toBeVisible();
  const dock = await page
    .locator('app-player g-transport')
    .evaluate((d) => ({ over: d.scrollHeight - d.clientHeight, wide: d.scrollWidth - d.clientWidth }));
  expect(dock).toEqual({ over: 0, wide: 0 });
});

test('the intro behind ⓘ names the visualizer and leads to its pattern and problem', { tag: '@player' }, async ({ page }) => {
  await page.goto('/coding/visualizers/binary-search');
  const about = page.getByRole('button', { name: 'About this visualizer' });
  await about.click();
  const intro = page.getByRole('dialog', { name: 'Binary Search' });
  await expect(intro.getByRole('heading', { name: 'Binary Search' })).toBeVisible();
  await expect(intro.getByRole('link', { name: /^Now write it yourself: / })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(intro).toBeHidden();
  await expect(about).toBeFocused();
  await expect(about).toHaveAttribute('aria-expanded', 'false');
});
