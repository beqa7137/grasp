import type { Page } from '@playwright/test';
import { expect, recordedEvents, stepToCheckpoint, synced, test, viewportTop } from './fixtures';

const VISUALIZER_TITLES = [
  'Merge Intervals',
  'Subsets by Backtracking',
  'Tree DFS: Preorder, Inorder, Postorder',
  'Jump Game',
  'Single Number (XOR)',
  'Two Sum (Hash Map)',
  'Subarray Sum Equals K',
  'Linked List Cycle (Floyd)',
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

test('predicting the next step of a visualizer counts toward mastery', { tag: '@smoke' }, async ({ page }) => {
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

test('the timeline steps forward and back', async ({ page }) => {
  await page.goto('/visualize/binary-search');
  await page.getByText('Predict mode').click();
  await expect(page.getByRole('checkbox', { name: 'Predict mode' })).not.toBeChecked();
  await page.getByRole('button', { name: 'Step forward' }).click();
  await expect(page.getByText('2 / 13')).toBeVisible();
  await page.getByRole('button', { name: 'Step back' }).click();
  await expect(page.getByText('1 / 13')).toBeVisible();
});

test('number keys answer only the page in view, not a checkpoint left open on the Visualize tab', async ({ page }) => {
  await page.goto('/visualize/binary-search');
  const player = page.locator('app-player');
  await stepToCheckpoint(page);

  await page.getByRole('tab', { name: 'Review' }).click();
  const review = page.locator('app-drill');
  await expect(review.locator('g-question-card .choice:enabled').first()).toBeVisible();
  // Ionic hides the page it leaves only once the tab transition ends.
  await expect(player).toBeHidden();
  await page.keyboard.press('1');
  await expect(review.locator('g-question-card .reveal')).toHaveCount(1);
  expect((await recordedEvents(page)).map((e) => e.type)).not.toContain('predict.answered');

  // The hidden player does not re-render, so look for a stray answer only once it is back in view.
  await page.getByRole('tab', { name: 'Visualize' }).click();
  await expect(player.getByText('Your call')).toBeVisible();
  await expect(player.locator('.predict .verdict')).toHaveCount(0);
  const sync = synced(page, 'predict.answered');
  await page.keyboard.press('1');
  await expect(player.locator('.predict .verdict')).toHaveCount(1);
  await sync;
});

test('Step forward stays under the finger through every step and checkpoint, however far Continue was scrolled to', async ({ page }) => {
  await page.goto('/visualize/dijkstra');
  const player = page.locator('app-player');
  const forward = player.getByRole('button', { name: 'Step forward' });
  const count = player.locator('.scrub .count');
  const prompt = player.getByText('Your call');
  const total = Number((await count.textContent())!.split('/')[1]);
  const home = await viewportTop(forward);
  let checkpoints = 0;
  for (let step = 1; step < total; step = Number((await count.textContent())!.split('/')[0])) {
    await forward.click();
    await expect(count.filter({ hasText: new RegExp(`^\\s*${step + 1} /`) }).or(prompt)).toBeVisible();
    if (await prompt.isVisible()) {
      checkpoints++;
      // On a phone the verdict and Continue end below the fold, so the clicks scroll to them as a finger would.
      await player.locator('.predict .choice').first().click();
      await player.getByRole('button', { name: 'Continue →' }).click();
      await expect(prompt).toBeHidden();
    }
    expect(Math.abs((await viewportTop(forward)) - home), `Step forward after step ${step}`).toBeLessThan(1);
  }
  expect(checkpoints).toBeGreaterThan(0);
});

test('an answered checkpoint also continues from Step forward, which stays where it was tapped', async ({ page }) => {
  await page.goto('/visualize/binary-search');
  const forward = page.getByRole('button', { name: 'Step forward' });
  await stepToCheckpoint(page);
  await expect(forward).toBeDisabled();
  await page.locator('.predict .choice').first().click();
  await expect(forward).toBeEnabled();
  await forward.scrollIntoViewIfNeeded();
  const before = await viewportTop(forward);
  const step = await page.locator('app-player .scrub .count').textContent();
  await forward.click();
  await expect(page.getByText('Your call')).toBeHidden();
  await expect(page.locator('app-player .scrub .count')).not.toHaveText(step!);
  expect(Math.abs((await viewportTop(forward)) - before)).toBeLessThan(1);
});

test('on a phone, a shorter step leaves no empty room under the drawing and its narration', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto('/visualize/linked-list-cycle');
  const player = page.locator('app-player');
  await player.getByText('Predict mode').click();
  const forward = player.getByRole('button', { name: 'Step forward' });
  const count = player.locator('.scrub .count');
  const total = Number((await count.textContent())!.split('/')[1]);
  for (let step = 2; step <= total; step++) {
    await forward.click();
    await expect(count).toHaveText(`${step} / ${total}`);
    const room = await player.locator('.scene').evaluate((scene) => {
      const content = Math.max(...[...scene.children].map((child) => child.getBoundingClientRect().bottom));
      return scene.getBoundingClientRect().bottom - content;
    });
    expect(room, `empty room under step ${step}`).toBeLessThan(1);
  }
});

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
