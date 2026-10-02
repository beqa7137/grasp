import AxeBuilder from '@axe-core/playwright';
import type { Locator, Page } from '@playwright/test';
import { expect, synced, test } from './fixtures';

test.use({ contextOptions: { reducedMotion: 'reduce' } });

async function seriousViolations(page: Page): Promise<string[]> {
  const { violations } = await new AxeBuilder({ page })
    .include('app-sandbox')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'])
    .analyze();
  return violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(', ')}`);
}

test.describe('in the dark theme', () => {
  test.use({ theme: 'dark' });

  test('Attachments Everywhere opens from the list and is cleared by mouse with an object store', async ({ page }) => {
    await page.goto('/design');
    const card = page.getByRole('link', { name: /^\d+ Attachments Everywhere/ });
    await expect(card).toContainText('50% files');
    await card.click();
    await expect(page.locator('.mission .eyebrow')).toContainText('10k rps · 30% reads · 50% files');
    expect(await seriousViolations(page)).toEqual([]);

    const sidebar = page.locator('aside.sidebar');
    const node = (kind: string) => page.locator(`g.node[data-kind="${kind}"]`);
    const fit = page.getByRole('button', { name: 'Show whole board' });
    if (await fit.isEnabled()) await fit.click();

    await page.getByRole('group', { name: 'Add component' }).getByRole('button', { name: 'Objects', exact: true }).click();
    await expect(sidebar.getByRole('heading', { name: 'Object Store' })).toBeVisible();
    await node('app').click();
    await expect(sidebar.getByRole('heading', { name: 'App Servers' })).toBeVisible();
    await sidebar.getByRole('button', { name: /Connect to/ }).click();
    await node('blob').click();
    await expect(sidebar.getByRole('list', { name: 'Sends traffic to' })).toContainText('Objects');
    for (let i = 0; i < 3; i++) await sidebar.getByRole('button', { name: 'More instances', exact: true }).click();

    await node('db').click();
    await expect(sidebar.getByRole('heading', { name: 'Primary DB' })).toBeVisible();
    const sync = synced(page, 'scenario.completed');
    await sidebar.getByRole('button', { name: 'More shards', exact: true }).click();
    await expect(sidebar.getByRole('heading', { name: 'Scenario cleared' })).toBeVisible();
    await sync;
    expect(await seriousViolations(page)).toEqual([]);
  });
});

test.describe('in the light theme', () => {
  test.use({ theme: 'light' });

  test('Attachments Everywhere is cleared with the keyboard alone', async ({ page }) => {
    await page.goto('/design/mail-attachments');
    const sidebar = page.locator('aside.sidebar');
    const press = async (control: Locator) => {
      await control.focus();
      await page.keyboard.press('Enter');
    };
    const inspect = async (name: RegExp, heading: string) => {
      await press(page.getByRole('button', { name }));
      await expect(sidebar.getByRole('heading', { name: heading })).toBeVisible();
    };
    await expect(page.getByRole('button', { name: /^DB, Primary DB, 1 shard,/ })).toBeVisible();
    expect(await seriousViolations(page)).toEqual([]);

    await press(page.getByRole('group', { name: 'Add component' }).getByRole('button', { name: 'Objects', exact: true }));
    await expect(sidebar.getByRole('heading', { name: 'Object Store' })).toBeVisible();
    await inspect(/^App, App Servers, /, 'App Servers');
    await press(sidebar.getByRole('button', { name: /Connect to/ }));
    await press(sidebar.getByRole('group', { name: 'Send traffic to' }).getByRole('button', { name: 'Objects', exact: true }));
    await expect(sidebar.getByRole('list', { name: 'Sends traffic to' })).toContainText('Objects');
    for (const instances of [7, 8, 9]) {
      await press(sidebar.getByRole('button', { name: 'More instances', exact: true }));
      await expect(page.getByRole('button', { name: new RegExp(`^App, App Servers, ${instances} instances`) })).toBeVisible();
    }
    await expect(sidebar.getByRole('heading', { name: 'Scenario cleared' })).toHaveCount(0);

    await inspect(/^DB, Primary DB, /, 'Primary DB');
    await press(sidebar.getByRole('button', { name: 'More shards', exact: true }));
    await expect(page.getByRole('button', { name: /^DB, Primary DB, 2 shards,/ })).toBeVisible();
    await expect(sidebar.getByRole('heading', { name: 'Scenario cleared' })).toBeVisible();
    expect(await seriousViolations(page)).toEqual([]);
  });
});

test('a free build sets the share of file requests in its workload, and an old board keeps the old rule until the learner sets one', async ({
  page,
}) => {
  await page.goto('/design/free-build?case=file-sync');
  const files = page.getByRole('slider', { name: /^Files/ });
  await expect(files).toHaveValue('50');
  await expect(page.getByRole('button', { name: /^Block store, Object Store, 1 instance, 22% utilized/ })).toBeVisible();

  await page.evaluate(() => {
    const nodes = [
      { id: 'users', kind: 'client', x: 80, y: 240, instances: 1 },
      { id: 'lb', kind: 'lb', x: 270, y: 240, instances: 2 },
      { id: 'app', kind: 'app', x: 460, y: 240, instances: 3 },
      { id: 'db', kind: 'db', x: 700, y: 240, instances: 1 },
      { id: 'blob-1-abcd', kind: 'blob', x: 460, y: 400, instances: 1, share: 0.7 },
    ];
    const edges = [
      { from: 'users', to: 'lb' },
      { from: 'lb', to: 'app' },
      { from: 'app', to: 'db' },
      { from: 'app', to: 'blob-1-abcd' },
    ];
    const saved = { design: { nodes, edges }, workload: { rps: 5000, readRatio: 0.9 } };
    localStorage.setItem('CapacitorStorage.grasp.design.free-build', JSON.stringify(saved));
  });
  // A board saved before the workload named its share keeps the share on its store and the old rule, until the learner sets one.
  await page.goto('/design/free-build');
  const p99 = page.locator('.metric', { hasText: 'p99 latency' });
  await expect(page.getByRole('slider', { name: 'Files old rule' })).toBeVisible();
  await expect(p99).toContainText('369');
  await files.fill('0');
  await expect(page.getByRole('slider', { name: 'Files 0%' })).toBeVisible();
  await expect(p99).not.toContainText('369');

  // The email build's workers write to its store, so it keeps the old rule until the learner names a share. Only the
  // workload changes here, so the board must be saved for a workload change alone.
  await page.goto('/design/free-build?case=email-service');
  const saved = () => page.evaluate(() => localStorage.getItem('CapacitorStorage.grasp.design.case.email-service') ?? '');
  await expect.poll(saved).toContain('"design"');
  await expect(page.getByRole('slider', { name: 'Files old rule' })).toHaveValue('30');
  await page.getByRole('slider', { name: /^Files/ }).fill('30');
  await expect(page.getByRole('slider', { name: 'Files 30%' })).toBeVisible();
  await expect.poll(saved).toContain('"objectShare":0.3');
  await page.reload();
  await expect(page.getByRole('slider', { name: 'Files 30%' })).toBeVisible();
});
