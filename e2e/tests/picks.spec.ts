import AxeBuilder from '@axe-core/playwright';
import { getAlgorithm, pickCheckpoints, type AlgorithmDef, type Locator, type Prediction } from '@grasp/engine';
import type { Page } from '@playwright/test';
import { expect, stepToCheckpoint, synced, test } from './fixtures';

type Method = 'pointer' | 'keyboard';
/** The array and grid cells a pick names. */
type Cell = Extract<Locator, { at: unknown }>;

/** The default input's checkpoints as the player asks them, with each ask. */
function checkpointsOf(id: string): { at: number; predict: Prediction }[] {
  const algo = getAlgorithm(id) as AlgorithmDef;
  const frames = algo.trace(algo.validate(algo.defaultInput));
  return pickCheckpoints(frames).map((at) => ({ at, predict: frames[at].predict! }));
}

const player = (page: Page) => page.locator('app-player');
const cell = (page: Page, at: Cell) =>
  at.view === 'grid'
    ? player(page).locator(`g-grid-view [data-at="${(at.at as number[]).join(',')}"]`)
    : player(page)
        .locator('g-array-view [data-pick]')
        .nth(at.at as number);
const stage = (page: Page) => player(page).locator('.scene');
const verdict = (page: Page) => player(page).locator('.predict .verdict');

/** Steps by the step key (or button), skipping the checkpoints before the one at `n`, and opens it. */
async function openCheckpoint(page: Page, n: number, method: Method) {
  const step = method === 'keyboard' ? () => page.keyboard.press('ArrowRight') : undefined;
  for (let i = 0; i <= n; i++) {
    await stepToCheckpoint(page, step);
    if (i < n) await player(page).getByRole('button', { name: 'Skip' }).click();
  }
}

/** Switches the open ask to the picture when the list opened instead (cells too small to tap here), by `method`. */
async function toPicture(page: Page, method: Method) {
  const toggle = player(page).getByRole('button', { name: 'Answer on the picture' });
  if (!(await toggle.isVisible())) return;
  if (method === 'pointer') return toggle.click();
  for (let i = 0; i < 12 && !(await toggle.evaluate((el) => el === document.activeElement)); i++) await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
}

/** Moves the roving focus from the first cell to `at` and picks it with `key`. */
async function keyTo(page: Page, at: Cell, from: Cell | null, key: 'Enter' | ' ') {
  const pos = (c: Cell | null) => (c === null ? [0, 0] : c.view === 'grid' ? (c.at as number[]) : [0, c.at as number]);
  const [r0, c0] = pos(from);
  const [r1, c1] = pos(at);
  for (let r = r0; r < r1; r++) await page.keyboard.press('ArrowDown');
  for (let r = r0; r > r1; r--) await page.keyboard.press('ArrowUp');
  for (let c = c0; c < c1; c++) await page.keyboard.press('ArrowRight');
  for (let c = c0; c > c1; c--) await page.keyboard.press('ArrowLeft');
  await expect(cell(page, at)).toBeFocused();
  await page.keyboard.press(key);
}

/** Answers the open pick ask right on the picture by `method`: taps or clicks, or arrows and Enter (Space for two cells). */
async function pickRight(page: Page, predict: Prediction, method: Method, touch: boolean) {
  const pick = predict.pick!;
  if (pick.on !== 'cell') throw new Error('not a cell pick');
  const cells = (pick.count === 2 ? pick.cells[predict.answer] : pick.cells[predict.answer].slice(0, 1)) as Cell[];
  await toPicture(page, method);
  await expect(stage(page).locator('[role="radiogroup"], [role="group"]')).toBeVisible();
  if (method === 'keyboard') {
    await expect(player(page).locator('[data-pick][tabindex="0"]').first()).toBeFocused();
    let from: Cell | null = null;
    for (const at of cells) {
      await keyTo(page, at, from, pick.count === 2 ? ' ' : 'Enter');
      from = at;
    }
    if (pick.count === 2) {
      // Tab skips Lock it in until the second pick has enabled it.
      await expect(player(page).getByRole('button', { name: 'Lock it in' })).toBeEnabled();
      await page.keyboard.press('Tab');
      await expect(player(page).getByRole('button', { name: 'Lock it in' })).toBeFocused();
      await page.keyboard.press('Enter');
    }
  } else {
    for (const at of cells) await (touch ? cell(page, at).tap() : cell(page, at).click());
    if (pick.count === 2) await player(page).getByRole('button', { name: 'Lock it in' }).click();
  }
}

const PICKS: [string, string][] = [
  ['binary-search', 'Binary Search'],
  ['two-sum-hash', 'Two Sum'],
  ['longest-unique-substring', 'Sliding Window'],
  ['grid-bfs', 'Grid BFS'],
];

for (const [id, name] of PICKS) {
  for (const method of ['pointer', 'keyboard'] as const) {
    test(`${name}'s pick ask is answered on the picture by ${method} alone`, { tag: '@player' }, async ({ page, hasTouch }) => {
      const checkpoints = checkpointsOf(id);
      const n = checkpoints.findIndex((c) => c.predict.pick?.on === 'cell');
      await page.goto(`/coding/visualizers/${id}`);
      await openCheckpoint(page, n, method);
      const sync = synced(page, 'predict.answered');
      await pickRight(page, checkpoints[n].predict, method, hasTouch);
      await expect(verdict(page)).toContainText('Exactly.');
      await expect(verdict(page)).toBeFocused();
      await sync;
      // The learner's pick stays drawn on the payoff as their guess, judged once the step has played.
      const pick = checkpoints[n].predict.pick!;
      if (pick.on === 'cell' && pick.count !== 2)
        await expect(cell(page, pick.cells[checkpoints[n].predict.answer][0] as Cell)).toHaveClass(/you-right/);
      await expect(player(page).locator('.you.verdict')).toContainText('✓ you:');
      await page.keyboard.press('ArrowRight');
      await expect(player(page).getByText('Your call')).toBeHidden();
    });
  }
}

test('a value ask takes a chip, or a number typed and locked in', { tag: '@player' }, async ({ page, hasTouch }) => {
  const checkpoints = checkpointsOf('grid-bfs');
  const n = checkpoints.findIndex((c) => c.predict.pick?.on === 'value');
  const { predict } = checkpoints[n];
  await page.goto('/coding/visualizers/grid-bfs');
  await openCheckpoint(page, n, 'pointer');
  const chip = player(page).locator('.predict .choices.chips .choice').nth(predict.answer);
  await (hasTouch ? chip.tap() : chip.click());
  await expect(verdict(page)).toContainText('Exactly.');

  // Keyboard alone, with a number no chip offers: wrong, and the verdict names it.
  await page.goto('/coding/visualizers/grid-bfs');
  await openCheckpoint(page, n, 'keyboard');
  const field = player(page).getByLabel('Or type it');
  await expect(field).toHaveAttribute('inputmode', 'numeric');
  for (let i = 0; i < 10 && !(await field.evaluate((el) => el === document.activeElement)); i++) await page.keyboard.press('Tab');
  await page.keyboard.type('9');
  const sync = synced(page, 'predict.answered');
  await page.keyboard.press('Enter');
  await expect(verdict(page)).toContainText('Not quite.');
  await expect(verdict(page)).toContainText(`You answered 9; it is ${predict.choices[predict.answer]}.`);
  await expect(player(page).locator('.you.verdict')).toContainText(`× you: 9 · actual: ${predict.choices[predict.answer]}`);
  await sync;
});

test('a digit on a value ask types into its field, never choosing a chip by its place', { tag: '@player' }, async ({ page }) => {
  const checkpoints = checkpointsOf('grid-bfs');
  const n = checkpoints.findIndex((c) => c.predict.pick?.on === 'value');
  const { predict } = checkpoints[n];
  await page.goto('/coding/visualizers/grid-bfs');
  await openCheckpoint(page, n, 'keyboard');
  await expect(player(page).locator('.predict .choices.chips .key')).toHaveCount(0);
  await page.keyboard.press(predict.choices[predict.answer]);
  const field = player(page).getByLabel('Or type it');
  await expect(field).toBeFocused();
  await expect(field).toHaveValue(predict.choices[predict.answer]);
  await expect(verdict(page)).toHaveCount(0);
  await page.keyboard.press('Enter');
  await expect(verdict(page)).toContainText('Exactly.');
});

test('the list opens by default when cells are too small to tap, and the switch is remembered', { tag: '@player' }, async ({ page }) => {
  await page.goto('/coding/visualizers/binary-search');
  await stepToCheckpoint(page);
  const { size, coarse } = await player(page).evaluate((el) => ({
    size: Math.min(
      ...[...el.querySelectorAll('[data-pick]')].map((c) => Math.min(c.getBoundingClientRect().width, c.getBoundingClientRect().height)),
    ),
    coarse: matchMedia('(pointer: coarse)').matches,
  }));
  const small = size < (coarse ? 44 : 24);
  const choices = player(page).locator('.predict .choice');
  if (small) {
    await expect(choices).toHaveCount(3);
    await expect(stage(page).locator('[role="radiogroup"]')).toHaveCount(0);
    await player(page).getByRole('button', { name: 'Answer on the picture' }).click();
  }
  await expect(choices).toHaveCount(0);
  await expect(stage(page).locator('[role="radiogroup"]')).toBeVisible();
  await expect(player(page).locator('.pick-ask')).toHaveText('Tap a cell the search keeps.');

  await player(page).getByRole('button', { name: 'Answer from a list' }).click();
  await expect(choices.first()).toBeFocused();
  await page.reload();
  await stepToCheckpoint(page);
  await expect(choices).toHaveCount(3);
  await player(page).getByRole('button', { name: 'Answer on the picture' }).click();
  await expect(stage(page).locator('[role="radiogroup"]')).toBeVisible();

  // The picture, once chosen, stays for the next ask, however small its cells.
  await player(page).getByRole('button', { name: 'Skip' }).click();
  await stepToCheckpoint(page);
  await expect(stage(page).locator('[role="radiogroup"]')).toBeVisible();
  await expect(choices).toHaveCount(0);
});

test(
  'the arrows move only within a pick, never stepping the run, in a radio group and in a two-cell group',
  { tag: '@player' },
  async ({ page }) => {
    for (const id of ['binary-search', 'two-sum-hash']) {
      const checkpoints = checkpointsOf(id);
      const n = checkpoints.findIndex((c) => c.predict.pick?.on === 'cell');
      await page.goto(`/coding/visualizers/${id}`);
      await openCheckpoint(page, n, 'keyboard');
      await toPicture(page, 'keyboard');
      const count = await player(page).locator('g-transport .count').textContent();
      const cells = player(page).locator('.scene [data-pick]');
      await expect(cells.first()).toBeFocused();
      for (const key of ['ArrowRight', 'ArrowRight', 'ArrowLeft', 'End', 'ArrowLeft', 'Home']) await page.keyboard.press(key);
      await expect(cells.first()).toBeFocused();
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('ArrowLeft');
      await expect(cells.first(), id).toBeFocused();
      await expect(player(page).locator('g-transport .count'), id).toHaveText(count!);
      await expect(player(page).getByText('Your call'), id).toBeVisible();
    }
  },
);

test('the run ends with how many were predicted and a way back to each one missed', { tag: '@player' }, async ({ page, hasTouch }) => {
  const checkpoints = checkpointsOf('binary-search');
  await page.goto('/coding/visualizers/binary-search');
  for (const [n, { predict }] of checkpoints.entries()) {
    await stepToCheckpoint(page);
    if (n === 1) {
      // A cell the search has already dropped is no choice: a wrong answer of its own.
      await toPicture(page, 'pointer');
      await (hasTouch ? cell(page, { view: 'array', at: 0 }).tap() : cell(page, { view: 'array', at: 0 }).click());
      await expect(verdict(page)).toContainText('You answered index 0');
    } else await pickRight(page, predict, 'pointer', hasTouch);
    await expect(player(page).locator('.end-card')).toHaveCount(0);
    await player(page).getByRole('button', { name: 'Continue →' }).click();
  }
  const total = await player(page).locator('g-transport .count').textContent();
  const last = Number(total!.split('/')[1]);
  while (!(await player(page).locator('.end-card').isVisible())) await player(page).getByRole('button', { name: 'Step forward' }).click();
  const card = player(page).locator('.end-card');
  await expect(card).toContainText(`${checkpoints.length - 1} of ${checkpoints.length} predicted`);
  await card.getByRole('button', { name: `Step ${checkpoints[1].at + 1} · missed` }).click();
  await expect(player(page).getByText(`${checkpoints[1].at + 1} / ${last}`, { exact: true })).toBeVisible();
  await expect(player(page).getByText('Your call')).toBeHidden();
});

test('an ask on the picture passes axe, its cells a radio group named by the prompt', { tag: '@player' }, async ({ page }) => {
  await page.goto('/coding/visualizers/binary-search');
  await stepToCheckpoint(page);
  await toPicture(page, 'pointer');
  const group = stage(page).getByRole('radiogroup');
  await expect(group).toHaveAccessibleName(/What happens next\?/);
  await expect(group.getByRole('radio')).toHaveCount(10);
  await expect(group.getByRole('radio', { name: 'index 0, 2' })).toHaveAttribute('aria-checked', 'false');
  const { violations } = await new AxeBuilder({ page })
    .include('app-player')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => v.id)).toEqual([]);
});

test('a predict card in review plays the step after it once answered', { tag: '@player' }, async ({ page }) => {
  await page.goto('/coding/patterns/binary-search/drill');
  const card = page.locator('app-drill-session g-question-card');
  // Each wait is for the next card's choices, so a click never lands on the answered card it replaces.
  for (let i = 0; i < 12; i++) {
    await expect(card.locator('.choice:enabled').first()).toBeVisible();
    if (await card.locator('.visual').isVisible()) break;
    await card.locator('.choice').first().click();
    await page.locator('app-drill-session .actions .g-btn.primary').first().click();
  }
  await expect(card.locator('.visual')).toBeVisible();
  const before = await card.locator('.visual').innerHTML();
  await expect(card.locator('.payoff')).toHaveCount(0);
  await card.locator('.choice').first().click();
  await expect(card.locator('.payoff')).toContainText(/^[✓×] you: /);
  expect(await card.locator('.visual').innerHTML()).not.toBe(before);
});
