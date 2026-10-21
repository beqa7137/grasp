import type { Page } from '@playwright/test';
import { expect, expectNoPageScroll, seekTimeline, stepToCheckpoint, stepTotal, test } from './fixtures';

// These specs answer checkpoints from the list; picks.spec.ts covers answering on the picture.
test.use({ checkpoints: 'list' });

test('on a 320 px phone, every value of a long array fits its cell, and only the array scrolls sideways', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto('/coding/visualizers/binary-search');
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
      await page.goto(`/coding/visualizers/${id}`);
      const player = page.locator('app-player');
      const count = player.locator('g-transport .count');
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
      await page.goto(`/coding/visualizers/${id}`);
      await stepToCheckpoint(page);
      await expectNoPageScroll(page);
      const fit = await page.locator('app-player').evaluate((player, visualizer) => {
        const box = (selector: string) => player.querySelector(selector)!.getBoundingClientRect();
        const header = box('ion-header');
        const dock = box('g-transport');
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
      await page.goto(`/coding/visualizers/${id}`);
      const player = page.locator('app-player');
      await player.getByText('Predict mode').click();
      const count = player.locator('g-transport .count');
      const total = await stepTotal(count);
      for (let step = 1; step <= total; step++) {
        if (step > 1) {
          await player.getByRole('button', { name: 'Step forward' }).click();
          await expect(count).toHaveText(`${step} / ${total}`);
        }
        await expectNoPageScroll(page);
        const dock = (await player.locator('g-transport').boundingBox())!;
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
        await page.goto(`/coding/visualizers/${id}`);
        const player = page.locator('app-player');
        await player.getByText('Predict mode').click();
        const count = player.locator('g-transport .count');
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
  await page.goto('/coding/visualizers/lcs');
  const player = page.locator('app-player');
  await player.getByText('Predict mode').click();
  const first = await tablePlace(page);
  expect(first.lines, 'legend lines').toBeGreaterThan(1);
  expect(first.inside, 'the legend whole under the table, in the stage').toBe(true);
  await seekTimeline(page, 85);
  await expect(player.locator('g-transport .count')).toHaveText('86 / 86');
  expect(await tablePlace(page), 'the last frame, with the answer path').toEqual(first);
});

test('a table under an array keeps one size on every frame, with the array and its legend in the stage', async ({ page }, testInfo) => {
  const sizes = [page.viewportSize()!, ...(testInfo.project.name === 'phone' ? [{ width: 320, height: 700 }] : [])];
  for (const size of sizes) {
    await page.setViewportSize(size);
    await page.goto('/coding/visualizers/minimum-xor-sum');
    const player = page.locator('app-player');
    await player.getByText('Predict mode').click();
    const count = player.locator('g-transport .count');
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

/** Whether a stage table's cells hold their floor (square, 1.6 times their text) and its column labels and legend stay apart. */
async function tableHolds(page: Page) {
  return page.locator('app-player .scene').evaluate((scene) => {
    const table = scene.querySelector('[role="table"]')!;
    const cells = [...table.querySelectorAll<HTMLElement>('.cell:not([data-role="active"])')].map((cell) => ({
      box: cell.getBoundingClientRect(),
      text: parseFloat(getComputedStyle(cell).fontSize),
    }));
    const labels = [...table.querySelectorAll('.head.col')].map((head) => {
      const range = document.createRange();
      range.selectNodeContents(head);
      return range.getBoundingClientRect();
    });
    const legend = scene.querySelector('g-table-view g-legend')!.getBoundingClientRect();
    const reach = scene.getBoundingClientRect().top + scene.clientTop + scene.scrollHeight;
    return {
      floor: cells.every(({ box, text }) => box.width >= 1.6 * text - 0.5),
      square: cells.every(({ box }) => Math.abs(box.width - box.height) <= 1),
      labelsApart: labels.every((label, i) => i === 0 || label.left >= labels[i - 1].right + 1),
      legendBelow: legend.top >= table.getBoundingClientRect().bottom && legend.bottom <= reach + 0.5,
    };
  });
}

for (const id of ['subarray-sum-prefix', 'single-number-xor', 'merge-intervals']) {
  test(`every ${id} frame keeps its table's cells square and readable, its labels and legend apart`, async ({ page }, testInfo) => {
    const sizes = [
      page.viewportSize()!,
      ...(testInfo.project.name === 'phone'
        ? [
            { width: 320, height: 700 },
            { width: 412, height: 480 },
          ]
        : []),
    ];
    for (const size of sizes) {
      await page.setViewportSize(size);
      await page.goto(`/coding/visualizers/${id}`);
      const player = page.locator('app-player');
      await player.getByText('Predict mode').click();
      const count = player.locator('g-transport .count');
      const total = await stepTotal(count);
      for (let step = 1; step <= total; step++) {
        if (step > 1) {
          await seekTimeline(page, step - 1);
          await expect(count).toHaveText(`${step} / ${total}`);
        }
        const held = { floor: true, square: true, labelsApart: true, legendBelow: true };
        expect(await tableHolds(page), `step ${step} at ${size.width}×${size.height}`).toEqual(held);
      }
    }
  });
}

test('merge-intervals at its longest input keeps every row readable and within reach of the stage scroll', async ({ page }) => {
  const intervals = [
    [1, 3],
    [8, 10],
    [2, 6],
    [15, 18],
    [18, 20],
    [4, 5],
    [30, 40],
    [35, 45],
    [60, 70],
    [80, 90],
  ];
  await page.goto(`/coding/visualizers/merge-intervals?input=${encodeURIComponent(JSON.stringify({ intervals }))}`);
  const player = page.locator('app-player');
  await expect(player.locator('.scene [role="table"] .head.row')).toHaveCount(10);
  expect(await tableHolds(page)).toEqual({ floor: true, square: true, labelsApart: true, legendBelow: true });
});

test('an array above a tree leaves the tree and its legend in the stage on every trie frame', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'iphone', "The iPhone's 249px stage holds trie only at its floor, so the stage scrolls.");
  await page.goto('/coding/visualizers/trie');
  const player = page.locator('app-player');
  await player.getByText('Predict mode').click();
  const count = player.locator('g-transport .count');
  const total = await stepTotal(count);
  for (let step = 1; step <= total; step++) {
    if (step > 1) {
      await seekTimeline(page, step - 1);
      await expect(count).toHaveText(`${step} / ${total}`);
    }
    const out = await player.locator('.scene').evaluate((scene) => {
      const bottom = scene.getBoundingClientRect().top + scene.clientTop + scene.clientHeight;
      return Math.max(...[...scene.querySelectorAll('svg[role="img"], g-legend')].map((el) => el.getBoundingClientRect().bottom - bottom));
    });
    expect(out, `step ${step}: px of the tree or its legend below the stage`).toBeLessThanOrEqual(0.5);
  }
});
