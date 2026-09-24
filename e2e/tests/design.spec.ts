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

  await page.getByRole('toolbar', { name: 'Add component' }).getByRole('button', { name: 'LB', exact: true }).click();
  await expect(sidebar.getByRole('heading', { name: 'Load Balancer' })).toBeVisible();
  await sidebar.getByRole('button', { name: /Connect to/ }).click();
  await node('app').click();
  await node('client').click();
  await sidebar.getByRole('button', { name: /Connect to/ }).click();
  await node('lb').click();

  // The starter's direct Users → App link is the first connection on the board.
  await page.locator('g.edge').first().dispatchEvent('pointerdown');
  await sidebar.getByRole('button', { name: 'Remove connection' }).click();

  await node('app').click();
  for (let i = 0; i < 3; i++) await sidebar.getByRole('button', { name: 'More', exact: true }).click();

  const sync = synced(page, 'scenario.completed');
  await expect(sidebar.getByRole('heading', { name: 'Scenario cleared' })).toBeVisible();
  await sync;

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Scenario cleared' })).toBeVisible();
});

test('new components never land on top of existing ones', { tag: '@smoke' }, async ({ page }) => {
  await page.goto('/design/first-scale-up');
  const toolbar = page.getByRole('toolbar', { name: 'Add component' });
  for (const kind of ['LB', 'Cache', 'Replica', 'Queue']) await toolbar.getByRole('button', { name: kind, exact: true }).click();
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
