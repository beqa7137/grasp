import type { Page } from '@playwright/test';
import { expect, expectUnmoved, recordedEvents, stepToCheckpoint, stepTotal, synced, test, viewportTop } from './fixtures';

const VISUALIZER_TITLES = [
  "Kruskal's Minimum Spanning Tree",
  'Minimum XOR Sum (Bitmask DP)',
  'Merge Intervals',
  'Subsets by Backtracking',
  'Tree DFS: Preorder, Inorder, Postorder',
  'Jump Game',
  'Single Number (XOR)',
  'Two Sum (Hash Map)',
  'Subarray Sum Equals K',
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
  await page.goto('/visualize');
  await page.getByRole('link', { name: /Binary Search easy/ }).click();
  await expect(page.getByRole('checkbox', { name: 'Predict mode' })).toBeChecked();
  await expect(page.getByText('1 / 13')).toBeVisible();
  await stepToCheckpoint(page);
  await answerCheckpoint(page);
});

for (const title of VISUALIZER_TITLES) {
  test(`${title} opens from the list and asks for the next step`, async ({ page }) => {
    await page.goto('/visualize');
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
  await page.goto('/visualize/binary-search');
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
    await page.goto('/visualize/binary-search');
    const player = page.locator('app-player');
    await stepToCheckpoint(page);
    const wide = page.viewportSize()!.width >= 1024;

    if (wide) {
      await page.getByRole('tab', { name: 'Review' }).click();
      const review = page.locator('app-drill');
      await expect(review.locator('g-question-card .choice:enabled').first()).toBeVisible();
      // Ionic hides the page it leaves only once the tab transition ends.
      await expect(player).toBeHidden();
      await page.keyboard.press('1');
      await expect(review.locator('g-question-card .reveal')).toHaveCount(1);
    } else {
      // The player hides the tab bar under 1024px, so the other page is its pattern, opened from the intro in the Learn tab.
      await page.getByRole('button', { name: 'About this visualizer' }).click();
      await page.getByRole('dialog', { name: 'Binary Search' }).getByRole('link', { name: 'Binary Search', exact: true }).click();
      await expect(page.locator('app-pattern').getByRole('heading', { name: 'Binary Search', level: 1 })).toBeVisible();
      await expect(player).toBeHidden();
      await page.keyboard.press('1');
    }
    expect((await recordedEvents(page)).map((e) => e.type)).not.toContain('predict.answered');

    // The hidden player does not re-render, so look for a stray answer only once it is back in view.
    await page.getByRole('tab', { name: 'Visualize' }).click();
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
    await page.goto('/visualize/dijkstra');
    const player = page.locator('app-player');
    const forward = player.getByRole('button', { name: 'Step forward' });
    const count = player.locator('.scrub .count');
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
  await page.goto('/visualize/binary-search');
  const forward = page.getByRole('button', { name: 'Step forward' });
  await stepToCheckpoint(page);
  await expect(forward).toBeDisabled();
  await page.locator('.predict .choice').first().click();
  await expect(forward).toBeEnabled();
  const before = await viewportTop(forward);
  const step = await page.locator('app-player .scrub .count').textContent();
  await forward.click();
  await expect(page.getByText('Your call')).toBeHidden();
  await expect(page.locator('app-player .scrub .count')).not.toHaveText(step!);
  await expectUnmoved(forward, before, 'Step forward after continuing with it');
});

test(
  'on a phone held sideways, tapping an answer leaves the stage and Step forward where they are',
  { tag: '@player' },
  async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 915, height: 412 });
    await page.goto('/visualize/two-sum-hash');
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

test('on a 320 px phone, every value of a long array fits its cell, and only the array scrolls sideways', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto('/visualize/binary-search');
  const player = page.locator('app-player');
  await player.locator('.input').getByRole('button', { name: 'Edit' }).click();
  await player.getByRole('textbox', { name: /^Sorted numbers/ }).fill('-100, -50, 1, 3, 5, 8, 13, 21, 34, 55, 89, 144');
  await player.getByRole('button', { name: 'Run with this input' }).click();
  const array = player.locator('g-array-view');
  await expect(array.locator('.cell').first()).toHaveText('-100');

  const spilled = await array.evaluate((view) =>
    [...view.querySelectorAll('.cell')].flatMap((cell) => {
      const box = cell.getBoundingClientRect();
      const text = cell.querySelector('.val')!.getBoundingClientRect();
      return text.left < box.left + 1 || text.right > box.right - 1 ? [cell.textContent!.trim()] : [];
    }),
  );
  expect(spilled, 'values wider than their cells').toEqual([]);
  expect(await array.evaluate((view) => view.scrollWidth > view.clientWidth)).toBe(true);
  const sideways = await player.locator('ion-content').evaluate((content) => {
    const scroller = content.shadowRoot!.querySelector('.inner-scroll')!;
    return scroller.scrollWidth - scroller.clientWidth;
  });
  expect(sideways, 'the page scrolls sideways').toBe(0);
});

/** The page itself never scrolls: only the stage, the checkpoint dock and the code scroll inside it. */
async function expectNoPageScroll(page: Page) {
  const scroll = await page.locator('app-player ion-content').evaluate((content) => {
    const scroller = content.shadowRoot!.querySelector('.inner-scroll')!;
    const layout = content.querySelector('.layout')!;
    // A fractional viewport can round a box up by a pixel, which is not room to scroll.
    return {
      page: scroller.scrollHeight - scroller.clientHeight <= 1 && scroller.scrollTop === 0,
      layout: layout.scrollHeight - layout.clientHeight <= 1 && layout.scrollTop === 0,
    };
  });
  expect(scroll, 'the page and the layout unscrolled, with nothing below them').toEqual({ page: true, layout: true });
}

/** Where the drawing sits: the first view in the stage, and how far the stage itself is scrolled. */
async function visualPlace(page: Page) {
  return page.locator('app-player .scene').evaluate((scene) => {
    const box = scene.querySelector('.viz > *')!.getBoundingClientRect();
    return { y: box.y, height: box.height, scrollTop: scene.scrollTop };
  });
}

for (const id of ['dijkstra', 'kruskal-mst']) {
  test(
    `the ${id} drawing stays exactly where it is through a checkpoint, its answer and Continue`,
    { tag: '@player' },
    async ({ page }) => {
      await page.goto(`/visualize/${id}`);
      const player = page.locator('app-player');
      const count = player.locator('.scrub .count');
      const prompt = player.getByText('Your call');
      const total = await stepTotal(count);
      let frame = await visualPlace(page);
      for (let step = 1; !(await prompt.isVisible()); step++) {
        expect(step, 'a checkpoint should come up').toBeLessThan(total);
        frame = await visualPlace(page);
        await player.getByRole('button', { name: 'Step forward' }).click();
        await expect(count.filter({ hasText: new RegExp(`^\\s*${step + 1} /`) }).or(prompt)).toBeVisible();
      }
      expect(await visualPlace(page), 'the drawing at the ask').toEqual(frame);

      await player.locator('.predict .choice').first().click();
      await expect(player.locator('.predict .verdict')).toBeVisible();
      expect(await visualPlace(page), 'the drawing after the answer').toEqual(frame);

      await player.getByRole('button', { name: 'Continue →' }).click();
      await expect(prompt).toBeHidden();
      const after = await visualPlace(page);
      expect({ y: after.y, scrollTop: after.scrollTop }, 'the drawing after Continue').toEqual({ y: frame.y, scrollTop: frame.scrollTop });
      await expectNoPageScroll(page);
    },
  );
}

const AUDITED = [
  'binary-search',
  'lcs',
  'dijkstra',
  'two-sum-hash',
  'subsets-backtracking',
  'linked-list-reversal',
  'kruskal-mst',
  'minimum-xor-sum',
];

for (const id of AUDITED) {
  test(`at the first ${id} checkpoint the whole stage and the prompt are in view, and the page does not scroll`, async ({
    page,
  }, testInfo) => {
    const sizes = [page.viewportSize()!, ...(testInfo.project.name === 'phone' ? [{ width: 320, height: 700 }] : [])];
    for (const size of sizes) {
      await page.setViewportSize(size);
      await page.goto(`/visualize/${id}`);
      await stepToCheckpoint(page);
      await expectNoPageScroll(page);
      const fit = await page.locator('app-player').evaluate((player, visualizer) => {
        const box = (selector: string) => player.querySelector(selector)!.getBoundingClientRect();
        const header = box('ion-header');
        const dock = box('.controls');
        const scene = box('.scene');
        const panel = box('.panel-col');
        const prompt = box('.predict .prompt');
        // Each list under the drawing shows at least its label; longer lists scroll the stage. Subsets on the iPhone's 249px
        // stage is the known exception (an array, a tree and a legend fill it; LOOP.md's R2 follow-ups).
        const lists = visualizer === 'subsets-backtracking' && innerHeight < 700 ? '' : ', .aux g-list-view .label';
        const drawings = [...player.querySelectorAll(`.scene :is(svg, [role="table"], g-array-view, g-grid-view${lists})`)].map((el) =>
          el.getBoundingClientRect(),
        );
        return {
          stage: scene.top >= header.bottom && scene.bottom <= Math.min(dock.top, innerHeight) + 0.5,
          drawing: drawings.length > 0 && drawings.every((d) => d.top >= scene.top && d.bottom <= scene.bottom + 0.5),
          prompt: prompt.top >= panel.top && prompt.bottom <= panel.bottom + 0.5 && prompt.bottom <= innerHeight,
          dock: dock.bottom <= innerHeight + 0.5,
        };
      }, id);
      expect(fit, `at ${size.width}×${size.height}`).toEqual({ stage: true, drawing: true, prompt: true, dock: true });
    }
  });
}

// The frame walks below are one test per tracer (and size): each step is a few browser actions, Playwright's trace records
// every one, and with it a single test of all four walks took about 60s on the iPhone (23s without the trace).
for (const id of ['tree-traversal', 'kruskal-mst']) {
  for (const narrow of [false, true]) {
    test(`every frame of ${id}${narrow ? ' at 320×700' : ''} keeps the dock on screen with no page scroll, its caption taking room from the code`, async ({
      page,
    }, testInfo) => {
      test.skip(testInfo.project.name === 'desktop', 'The caption has its own row beside the stage on a wide screen.');
      if (narrow) await page.setViewportSize({ width: 320, height: 700 });
      const size = page.viewportSize()!;
      await page.goto(`/visualize/${id}`);
      const player = page.locator('app-player');
      await player.getByText('Predict mode').click();
      const count = player.locator('.scrub .count');
      const total = await stepTotal(count);
      for (let step = 1; step <= total; step++) {
        if (step > 1) {
          await player.getByRole('button', { name: 'Step forward' }).click();
          await expect(count).toHaveText(`${step} / ${total}`);
        }
        await expectNoPageScroll(page);
        const dock = (await player.locator('.controls').boundingBox())!;
        expect(dock.y + dock.height, `step ${step}: the dock's bottom`).toBeLessThanOrEqual(size.height + 0.5);
      }
    });
  }
}

for (const id of ['tree-traversal', 'kruskal-mst', 'subsets-backtracking']) {
  test(
    `the ${id} drawing keeps one size on every frame, and height never shrinks its text below 6px`,
    { tag: '@player' },
    async ({ page }, testInfo) => {
      const sizes = [page.viewportSize()!, ...(testInfo.project.name === 'phone' ? [{ width: 320, height: 700 }] : [])];
      for (const size of sizes) {
        await page.setViewportSize(size);
        await page.goto(`/visualize/${id}`);
        const player = page.locator('app-player');
        await player.getByText('Predict mode').click();
        const count = player.locator('.scrub .count');
        const total = await stepTotal(count);
        const boxes = new Map<string, string>();
        for (let step = 1; step <= total; step++) {
          if (step > 1) {
            await player.getByRole('button', { name: 'Step forward' }).click();
            await expect(count).toHaveText(`${step} / ${total}`);
          }
          const drawing = player.locator('.scene svg[role="img"]');
          if (!(await drawing.count())) continue;
          const drawn = await drawing.evaluate((svg: SVGSVGElement) => {
            const box = svg.getBoundingClientRect();
            const view = svg.viewBox.baseVal;
            const scale = Math.min(box.width / view.width, box.height / view.height);
            const text = Math.min(...[...svg.querySelectorAll('text')].map((t) => parseFloat(getComputedStyle(t).fontSize) * scale));
            return { view: `${view.width}×${view.height}`, box: `${Math.round(box.width)}×${Math.round(box.height)}`, text };
          });
          const where = `step ${step} at ${size.width}×${size.height}`;
          expect(drawn.text, `${where}: the smallest text`).toBeGreaterThanOrEqual(6);
          expect(drawn.box, `${where}: the box for viewBox ${drawn.view}`).toBe(boxes.get(drawn.view) ?? drawn.box);
          boxes.set(drawn.view, drawn.box);
        }
      }
    },
  );
}

for (const [id, width, height] of [
  ['dijkstra', 320, 256],
  ['kruskal-mst', 568, 320],
  ['two-sum-hash', 600, 500],
  ['binary-search', 412, 480],
] as const) {
  test(`at ${width}×${height} the layout scrolls and nothing covers the ${id} checkpoint`, { tag: '@player' }, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto(`/visualize/${id}`);
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
    await page.goto(`/visualize/${id}`);
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

test('under 1024px the player hides the tab bar, and the list shows it again', { tag: ['@nav', '@player'] }, async ({ page }) => {
  await page.goto('/visualize');
  const tabs = page.getByRole('navigation', { name: 'Main' });
  await expect(tabs).toBeVisible();
  await page.getByRole('link', { name: /Binary Search easy/ }).click();
  await expect(page.locator('app-player h1')).toHaveText('Binary Search');
  if (page.viewportSize()!.width < 1024) await expect(tabs).toBeHidden();
  else await expect(tabs).toBeVisible();
  await page.locator('app-player ion-back-button').click();
  await expect(page.locator('app-visualize-list')).toBeVisible();
  await expect(tabs).toBeVisible();
});

test('under 1024px, a tab button that opens the player leaves focus on its heading', { tag: ['@nav', '@player'] }, async ({ page }) => {
  if (page.viewportSize()!.width >= 1024) await page.setViewportSize({ width: 800, height: 720 });
  await page.goto('/visualize/binary-search');
  await page.getByRole('button', { name: 'About this visualizer' }).click();
  await page.getByRole('dialog', { name: 'Binary Search' }).getByRole('link', { name: 'Binary Search', exact: true }).click();
  await expect(page.locator('app-pattern').getByRole('heading', { name: 'Binary Search', level: 1 })).toBeVisible();
  await page.getByRole('tab', { name: 'Visualize' }).focus();
  // Ionic selects a tab on Enter's keydown and again on its keyup, which takes a selected tab to its root while its button
  // keeps focus. A person's keyup comes after the switch, so the key is held until then.
  await page.keyboard.down('Enter');
  const heading = page.locator('app-player h1');
  await expect(heading).toBeFocused();
  await page.keyboard.up('Enter');
  await expect(page).toHaveURL(/\/visualize\/binary-search$/);
  await expect(heading).toBeFocused();
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeHidden();
});

/** Where a table run's views sit in the stage: the table's box, the array's height, and whether the legend shows whole under the table. */
async function tablePlace(page: Page) {
  return page.locator('app-player .scene').evaluate((scene) => {
    const stage = scene.getBoundingClientRect();
    const table = scene.querySelector('[role="table"]')!.getBoundingClientRect();
    const array = scene.querySelector('g-array-view')?.getBoundingClientRect();
    const entries = [...scene.querySelectorAll('g-table-view g-legend span')].map((entry) => entry.getBoundingClientRect());
    return {
      table: `${Math.round(table.width)}×${Math.round(table.height)}`,
      array: array && Math.round(array.height),
      lines: new Set(entries.map((entry) => Math.round(entry.top))).size,
      inside: table.top >= stage.top && entries.every((entry) => entry.top >= table.bottom && entry.bottom <= stage.bottom + 0.5),
    };
  });
}

test('at 320px the LCS table leaves its wrapped legend the room it needs in the stage', { tag: '@player' }, async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto('/visualize/lcs');
  const player = page.locator('app-player');
  await player.getByText('Predict mode').click();
  const first = await tablePlace(page);
  expect(first.lines, 'legend lines').toBeGreaterThan(1);
  expect(first.inside, 'the legend whole under the table, in the stage').toBe(true);
  await player.getByRole('slider', { name: 'Timeline' }).fill('85');
  await expect(player.locator('.scrub .count')).toHaveText('86 / 86');
  expect(await tablePlace(page), 'the last frame, with the answer path').toEqual(first);
});

test('a table under an array keeps one size on every frame, with the array and its legend in the stage', async ({ page }, testInfo) => {
  const sizes = [page.viewportSize()!, ...(testInfo.project.name === 'phone' ? [{ width: 320, height: 700 }] : [])];
  for (const size of sizes) {
    await page.setViewportSize(size);
    await page.goto('/visualize/minimum-xor-sum');
    const player = page.locator('app-player');
    await player.getByText('Predict mode').click();
    const count = player.locator('.scrub .count');
    const total = await stepTotal(count);
    const first = await tablePlace(page);
    expect(first.inside, `the legend whole under the table at ${size.width}×${size.height}`).toBe(true);
    for (let step = 2; step <= total; step++) {
      await player.getByRole('button', { name: 'Step forward' }).click();
      await expect(count).toHaveText(`${step} / ${total}`);
      expect(await tablePlace(page), `step ${step} at ${size.width}×${size.height}`).toEqual(first);
    }
  }
});

test('Play at an open checkpoint asks for the answer instead of playing on', { tag: '@player' }, async ({ page }) => {
  await page.goto('/visualize/binary-search');
  await stepToCheckpoint(page);
  const play = page.getByRole('button', { name: 'Play', exact: true });
  await expect(play).toBeEnabled();
  await play.click();
  await expect(page.locator('.predict .prompt')).toBeFocused();
  await expect(page.locator('app-player [role="status"]')).toHaveText('Answer the question to continue.');
  await expect(page.locator('.predict .verdict')).toHaveCount(0);
  expect((await recordedEvents(page)).map((e) => e.type)).not.toContain('predict.answered');

  await page.locator('.predict .choice').first().click();
  await play.click();
  await expect(page.getByText('Your call')).toBeHidden();
});

test('the key hint shows only with a fine pointer', { tag: '@player' }, async ({ page, isMobile }) => {
  await page.goto('/visualize/binary-search');
  const hint = page.locator('app-player .keys');
  if (isMobile) await expect(hint).toBeHidden();
  else await expect(hint).toBeVisible();
  if (isMobile) return;
  // A short wide window has no column for the hint, so the dock keeps its buttons over the timeline.
  await page.setViewportSize({ width: 1280, height: 500 });
  await expect(hint).toBeHidden();
  const dock = await page
    .locator('app-player .controls')
    .evaluate((c) => ({ rows: getComputedStyle(c).gridTemplateRows.split(' ').length, over: c.scrollHeight - c.clientHeight }));
  expect(dock).toEqual({ rows: 2, over: 0 });
});

test('the intro behind ⓘ names the visualizer and leads to its pattern and problem', { tag: '@player' }, async ({ page }) => {
  await page.goto('/visualize/binary-search');
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
