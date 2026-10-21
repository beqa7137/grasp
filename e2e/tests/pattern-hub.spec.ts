import { PATTERN_CATALOG, nextVisualizer, patternProblems } from '@grasp/engine';
import { expect, expectSectionLit, shownPage, test } from './fixtures';

const hub = (page: import('@playwright/test').Page) => page.locator('app-pattern-hub');
/** The Ionic views in the tabs' outlet: every page Ionic keeps, shown or not. */
const views = (page: import('@playwright/test').Page) => page.locator('ion-tabs ion-router-outlet > .ion-page');

test('switching pattern segments adds no Ionic view and no history, and back leaves the hub', { tag: '@nav' }, async ({ page }) => {
  await page.goto('/coding/patterns/binary-search');
  await expect(hub(page).getByRole('heading', { name: 'Binary Search', level: 1 })).toBeVisible();
  const nav = hub(page).getByRole('navigation', { name: 'Binary Search sections' });
  await expect(nav.getByRole('link', { name: 'Lesson' })).toHaveAttribute('aria-current', 'page');
  const pages = await views(page).count();
  const entries = await page.evaluate(() => history.length);

  for (const [name, url, heading] of [
    ['Problems (9)', /\/coding\/patterns\/binary-search\/problems$/, 'Problems'],
    ['Drill', /\/coding\/patterns\/binary-search\/drill$/, 'Drill'],
    ['Lesson', /\/coding\/patterns\/binary-search$/, 'Why it works'],
  ] as const) {
    await nav.getByRole('link', { name }).click();
    await expect(page).toHaveURL(url);
    await expect(nav.getByRole('link', { name })).toHaveAttribute('aria-current', 'page');
    await expect(hub(page).getByRole('heading', { name: heading, level: 2 })).toBeVisible();
    await expect(hub(page).getByRole('heading', { name: 'Binary Search', level: 1 })).toBeVisible();
    expect(await views(page).count(), `${name} adds no view`).toBe(pages);
    expect(await page.evaluate(() => history.length), `${name} adds no history entry`).toBe(entries);
  }
  await hub(page).locator('ion-back-button').click();
  await expect(page).toHaveURL(/\/coding$/);
  await expectSectionLit(page, 'Coding');
});

test('the header places the pattern in its track, and Prev, Next and the footer move along the roadmap', async ({ page }) => {
  await page.goto('/coding');
  await page.locator('app-skill-map a[href="/coding/patterns/binary-search"]').click();
  const head = hub(page);
  await expect(head.getByText(`Foundations · pattern 4 of ${PATTERN_CATALOG.length}`)).toBeVisible();
  await expect(head.getByText('Solved 0 of 9')).toBeVisible();
  await expect(head.locator('.status')).toContainText('New');
  await expect(head.getByRole('link', { name: 'Watch Binary Search →' })).toBeVisible();
  const steps = head.getByRole('navigation', { name: 'Foundations patterns' });
  // Binary Search ends Foundations: no Next within the track, and the footer crosses into Core.
  await expect(steps.getByRole('link')).toHaveCount(1);
  await expect(head.getByRole('link', { name: 'Next: Prefix Sums →' })).toBeVisible();

  await steps.getByRole('link', { name: 'Previous: ← Sliding Window' }).click();
  await expect(page).toHaveURL(/\/coding\/patterns\/sliding-window$/);
  const sliding = shownPage(page);
  await expect(sliding.getByRole('heading', { name: 'Sliding Window', level: 1 })).toBeVisible();
  await expect(sliding.getByRole('link', { name: 'Next: Binary Search →' }).first()).toBeVisible();
  await sliding.getByRole('link', { name: 'Next: Binary Search →' }).first().click();
  await expect(page).toHaveURL(/\/coding\/patterns\/binary-search$/);
  await shownPage(page).getByRole('link', { name: 'Next: Prefix Sums →' }).click();
  await expect(shownPage(page).getByText(`Core · pattern 5 of ${PATTERN_CATALOG.length}`)).toBeVisible();

  // Each step replaced the pattern, so back returns to the Skill map, not through the roadmap.
  await expect(hub(page), 'the replaced pattern leaves').toHaveCount(1);
  await hub(page).locator('ion-back-button').click();
  await expect(page).toHaveURL(/\/coding$/);
});

test("the Problems segment lists the pattern's own problems first, with status, best score and the mock marker", async ({ page }) => {
  await page.goto('/coding/patterns/greedy/problems');
  const rows = hub(page).locator('app-pattern-problems a[g-entry-row]');
  const expected = patternProblems('greedy');
  await expect(rows).toHaveCount(expected.length);
  await expect(rows.locator('.title')).toHaveText(expected.map((p) => p.title));
  const shared = expected.find((p) => p.patternIds[0] !== 'greedy')!;
  await expect(rows.filter({ hasText: shared.title })).toContainText(/also in /);

  await page.goto('/coding/patterns/binary-search/problems');
  const ship = hub(page).locator('a[href="/coding/problems/ship-within-days"]');
  await expect(ship).toContainText('Mock round');
  await expect(ship.getByRole('img', { name: 'Unsolved' })).toBeVisible();
});

test('a problem opened from the hub names its pattern, and back returns to the Problems segment', { tag: '@nav' }, async ({ page }) => {
  await page.goto('/coding/patterns/binary-search/problems');
  await hub(page).locator('a[href="/coding/problems/search-rotated-array"]').click();
  await expect(page).toHaveURL(/\/coding\/problems\/search-rotated-array$/);
  const workspace = page.locator('app-code-workspace');
  await expect(workspace.locator('.chips').getByRole('link', { name: 'Binary Search' })).toBeVisible();
  await expect(workspace.getByRole('button', { name: 'Show pattern' })).toHaveCount(0);
  await workspace.locator('ion-back-button').click();
  await expect(page).toHaveURL(/\/coding\/patterns\/binary-search\/problems$/);
  await expect(hub(page).getByRole('heading', { name: 'Problems', level: 2 })).toBeVisible();
});

test("the Lesson's Code link opens its problem with the pattern named, and back returns to the Lesson", async ({ page }) => {
  await page.goto('/coding/patterns/binary-search');
  await hub(page).getByRole('link', { name: 'Code: Capacity To Ship Packages Within D Days →' }).click();
  await expect(page).toHaveURL(/\/coding\/problems\/ship-within-days$/);
  const workspace = page.locator('app-code-workspace');
  await expect(workspace.locator('.chips').getByRole('link', { name: 'Binary Search' })).toBeVisible();
  await expect(workspace.getByRole('button', { name: 'Show pattern' })).toHaveCount(0);
  await workspace.locator('ion-back-button').click();
  await expect(page).toHaveURL(/\/coding\/patterns\/binary-search$/);
});

test('the Drill segment drills the pattern under its hub', async ({ page }) => {
  await page.goto('/coding/patterns/binary-search/drill');
  await expect(hub(page).getByRole('heading', { name: 'Binary Search', level: 1 })).toBeVisible();
  const drill = hub(page).locator('app-drill-session');
  await expect(drill.getByRole('heading', { name: 'Drill', level: 2 })).toBeVisible();
  await expect(drill.getByText('Drill · not scheduled')).toHaveCount(0);
  await drill.locator('g-question-card .choice').first().click();
  await expect(drill.getByRole('button', { name: /^Next/ })).toBeVisible();
});

test('the player ends on its problem and the next visualizer, which replaces it', { tag: '@player' }, async ({ page }) => {
  await page.goto('/coding/visualizers/dijkstra');
  const player = page.locator('app-player');
  await expect(player.getByRole('heading', { name: "Dijkstra's Shortest Paths", level: 1 })).toBeVisible();
  await player.locator('.scene').focus();
  await page.keyboard.press('End');
  await expect(player.locator('g-transport .count')).toHaveText(/^(\d+) \/ \1$/);
  const card = player.getByRole('navigation', { name: 'Next steps' });
  const next = nextVisualizer('dijkstra')!;
  // The roadmap puts Minimum Spanning Tree after Dijkstra; REDESIGN.md 4.4's Union-Find comes before it.
  expect(next.id).toBe('kruskal-mst');
  await expect(card.getByRole('link', { name: 'Write Network Delay Time →' })).toBeVisible();
  // The end card sits at the top of region R, so no box it is in clips it, as the caption's own scroll did at 1024×768.
  const clipped = () =>
    card.getByRole('link').evaluateAll(
      (links) =>
        links.filter((link) => {
          const box = link.getBoundingClientRect();
          for (let el = link.parentElement; el; el = el.parentElement) {
            if (getComputedStyle(el).overflowY === 'visible') continue;
            const view = el.getBoundingClientRect();
            if (box.top < view.top - 0.5 || box.bottom > view.bottom + 0.5) return true;
          }
          return box.bottom > innerHeight;
        }).length,
    );
  expect(await clipped(), 'end-card links cut off').toBe(0);
  if (page.viewportSize()!.width >= 1024) {
    await page.setViewportSize({ width: 1024, height: 768 });
    await expect.poll(clipped, { message: 'end-card links cut off at 1024×768' }).toBe(0);
  }
  await card.getByRole('link', { name: `Next visualizer: ${next.title} →` }).click();
  await expect(page).toHaveURL(/\/coding\/visualizers\/kruskal-mst$/);
  await expect(shownPage(page).getByRole('heading', { name: next.title, level: 1 })).toBeVisible();
});
