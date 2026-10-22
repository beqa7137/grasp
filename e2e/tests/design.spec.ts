import type { Locator } from '@playwright/test';
import { expect, synced, test } from './fixtures';

test('the first Design Lab mission can be solved from the inspector', { tag: '@lab' }, async ({ page }) => {
  await page.goto('/design/missions');
  await page
    .getByRole('link', { name: /Your First Scale-Up/ })
    .first()
    .click();
  await expect(page.getByText('p99 latency ≤ 150 ms')).toBeVisible();
  const node = (kind: string) => page.locator(`g.node[data-kind="${kind}"]`);
  const lab = page.locator('app-sandbox');

  await page.getByRole('group', { name: 'Add component' }).getByRole('button', { name: 'LB', exact: true }).click();
  await expect(lab.getByRole('heading', { name: 'Load Balancer' })).toBeVisible();
  await lab.getByRole('button', { name: /Connect to/ }).click();
  await node('app').click();
  await node('client').click();
  await lab.getByRole('button', { name: /Connect to/ }).click();
  await node('lb').click();

  // The starter's direct Users → App link is the first connection on the board.
  await page.locator('g.edge').first().dispatchEvent('pointerdown');
  await lab.getByRole('button', { name: 'Remove connection', exact: true }).click();

  await node('app').click();
  for (let i = 0; i < 3; i++) await lab.getByRole('button', { name: 'More instances', exact: true }).click();

  const sync = synced(page, 'scenario.completed');
  await expect(lab.getByRole('heading', { name: 'Scenario cleared' })).toBeVisible();
  await sync;

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Scenario cleared' })).toBeVisible();
});

test('the first Design Lab mission can be solved with the keyboard alone', { tag: '@lab' }, async ({ page }) => {
  await page.goto('/design/missions/first-scale-up');
  const lab = page.locator('app-sandbox');
  const targets = lab.getByRole('group', { name: 'Send traffic to' });
  const press = async (control: Locator) => {
    await control.focus();
    await page.keyboard.press('Enter');
  };
  const inspect = async (node: RegExp, heading: string) => {
    await press(page.getByRole('button', { name: node }));
    await expect(lab.getByRole('heading', { name: heading })).toBeVisible();
  };

  await press(page.getByRole('group', { name: 'Add component' }).getByRole('button', { name: 'LB', exact: true }));
  await expect(lab.getByRole('heading', { name: 'Load Balancer' })).toBeVisible();
  await press(lab.getByRole('button', { name: /Connect to/ }));
  await press(targets.getByRole('button', { name: 'App', exact: true }));
  await expect(lab.getByRole('list', { name: 'Sends traffic to' })).toContainText('App');

  await inspect(/^Users, /, 'Users');
  await press(lab.getByRole('button', { name: /Connect to/ }));
  await press(targets.getByRole('button', { name: 'LB', exact: true }));
  await press(lab.getByRole('button', { name: 'Remove connection to App' }));
  await expect(lab.getByRole('button', { name: 'Remove connection to App' })).toBeHidden();

  await inspect(/^App, /, 'App Servers');
  for (const instances of [2, 3, 4]) {
    await press(lab.getByRole('button', { name: 'More instances', exact: true }));
    await expect(page.getByRole('button', { name: new RegExp(`^App, App Servers, ${instances} instances`) })).toBeVisible();
  }
  await expect(lab.getByRole('heading', { name: 'Scenario cleared' })).toBeVisible();
});

test('new components never land on top of existing ones', { tag: ['@smoke', '@lab'] }, async ({ page }) => {
  await page.goto('/design/missions/first-scale-up');
  const palette = page.getByRole('group', { name: 'Add component' });
  for (const kind of ['LB', 'Cache', 'Replica', 'Queue']) await palette.getByRole('button', { name: kind, exact: true }).click();
  const nodes = page.locator('g.node rect.body');
  await expect(nodes).toHaveCount(7);
  const boxes = await nodes.evaluateAll((rects) => rects.map((r) => r.getBoundingClientRect().toJSON()));
  for (const [i, a] of boxes.entries()) {
    for (const b of boxes.slice(i + 1)) {
      const overlap = a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
      expect(overlap, `components overlap: ${JSON.stringify([a, b])}`).toBe(false);
    }
  }
});

test(
  'the leaderboard mission opens from the list with its budget, and its starter does not clear it',
  { tag: '@lab' },
  async ({ page }) => {
    await page.goto('/design/missions');
    await page
      .getByRole('link', { name: /Leaderboard on a Budget/ })
      .first()
      .click();
    await expect(page.getByText('p99 latency ≤ 200 ms')).toBeVisible();
    await expect(page.getByText('Cost ≤ $8.5k/mo')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Scenario cleared' })).toHaveCount(0);
  },
);
