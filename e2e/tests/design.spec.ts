import type { Locator } from '@playwright/test';
import { expect, synced, test } from './fixtures';

test('the first Design Lab mission can be solved from the inspector', async ({ page }) => {
  await page.goto('/design');
  await page
    .getByRole('link', { name: /Your First Scale-Up/ })
    .first()
    .click();
  await expect(page.getByText('p99 latency ≤ 150 ms')).toBeVisible();
  const node = (kind: string) => page.locator(`g.node[data-kind="${kind}"]`);
  const sidebar = page.locator('aside.sidebar');

  await page.getByRole('group', { name: 'Add component' }).getByRole('button', { name: 'LB', exact: true }).click();
  await expect(sidebar.getByRole('heading', { name: 'Load Balancer' })).toBeVisible();
  await sidebar.getByRole('button', { name: /Connect to/ }).click();
  await node('app').click();
  await node('client').click();
  await sidebar.getByRole('button', { name: /Connect to/ }).click();
  await node('lb').click();

  // The starter's direct Users → App link is the first connection on the board.
  await page.locator('g.edge').first().dispatchEvent('pointerdown');
  await sidebar.getByRole('button', { name: 'Remove connection', exact: true }).click();

  await node('app').click();
  for (let i = 0; i < 3; i++) await sidebar.getByRole('button', { name: 'More instances', exact: true }).click();

  const sync = synced(page, 'scenario.completed');
  await expect(sidebar.getByRole('heading', { name: 'Scenario cleared' })).toBeVisible();
  await sync;

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Scenario cleared' })).toBeVisible();
});

test('the first Design Lab mission can be solved with the keyboard alone', async ({ page }) => {
  await page.goto('/design/first-scale-up');
  const sidebar = page.locator('aside.sidebar');
  const targets = sidebar.getByRole('group', { name: 'Send traffic to' });
  const press = async (control: Locator) => {
    await control.focus();
    await page.keyboard.press('Enter');
  };
  const inspect = async (node: RegExp, heading: string) => {
    await press(page.getByRole('button', { name: node }));
    await expect(sidebar.getByRole('heading', { name: heading })).toBeVisible();
  };

  await press(page.getByRole('group', { name: 'Add component' }).getByRole('button', { name: 'LB', exact: true }));
  await expect(sidebar.getByRole('heading', { name: 'Load Balancer' })).toBeVisible();
  await press(sidebar.getByRole('button', { name: /Connect to/ }));
  await press(targets.getByRole('button', { name: 'App', exact: true }));
  await expect(sidebar.getByRole('list', { name: 'Sends traffic to' })).toContainText('App');

  await inspect(/^Users, /, 'Users');
  await press(sidebar.getByRole('button', { name: /Connect to/ }));
  await press(targets.getByRole('button', { name: 'LB', exact: true }));
  await press(sidebar.getByRole('button', { name: 'Remove connection to App' }));
  await expect(sidebar.getByRole('button', { name: 'Remove connection to App' })).toBeHidden();

  await inspect(/^App, /, 'App Servers');
  for (const instances of [2, 3, 4]) {
    await press(sidebar.getByRole('button', { name: 'More instances', exact: true }));
    await expect(page.getByRole('button', { name: new RegExp(`^App, App Servers, ${instances} instances`) })).toBeVisible();
  }
  await expect(sidebar.getByRole('heading', { name: 'Scenario cleared' })).toBeVisible();
});

test('new components never land on top of existing ones', { tag: '@smoke' }, async ({ page }) => {
  await page.goto('/design/first-scale-up');
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
