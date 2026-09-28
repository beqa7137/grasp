import { expect, test } from './fixtures';

test('a system design lesson opens from Learn and its widget answers the keyboard', async ({ page }) => {
  await page.goto('/learn');
  await page.getByRole('link', { name: /Latency & Queueing/ }).click();
  await expect(page.getByRole('heading', { name: 'Latency & Queueing', level: 1 })).toBeVisible();

  const slider = page.getByRole('slider', { name: /Utilization/ });
  const p99 = page.locator('.readouts div').filter({ hasText: 'p99' }).locator('dd');
  await expect(p99).toHaveText('92 ms');
  await slider.focus();
  for (let i = 0; i < 40; i++) await page.keyboard.press('ArrowRight');
  await expect(page.getByText('Utilization 90%')).toBeVisible();
  await expect(p99).toHaveText('461 ms');

  await expect(page.getByRole('link', { name: 'Mission: Your First Scale-Up' })).toBeVisible();
  await expect(page.getByRole('heading', { name: /Quick check/ })).toBeVisible();
});

test('the sharding lesson counts the keys that move when a node joins, by consistent hashing and by hash mod N', async ({ page }) => {
  await page.goto('/learn/design/sd-sharding');
  const moved = page.locator('.readouts div').filter({ hasText: 'Last change moved' }).locator('dd');
  await expect(moved).toHaveText('nothing yet');

  await page.getByRole('button', { name: 'Add node E' }).click();
  await expect(moved).toHaveText('46 of 200');

  const modes = page.getByRole('radiogroup', { name: 'How keys are assigned' });
  await modes.getByRole('radio', { name: 'Consistent hashing' }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(modes.getByRole('radio', { name: 'hash mod N' })).toBeFocused();
  await modes.getByRole('radio', { name: 'hash mod N' }).click();
  await expect(moved).toHaveText('nothing yet');
  await page.getByRole('button', { name: 'Remove node E' }).click();
  await expect(moved).toHaveText(/^1[5-7]\d of 200$/);
});

test('the queue lesson drains the backlog sooner with more consumers', async ({ page }) => {
  await page.goto('/learn/design/sd-queues');
  const drained = page.locator('.readouts div').filter({ hasText: 'Drained' }).locator('dd');
  await expect(drained).toHaveText('25 s after spike');
  await page.getByRole('button', { name: 'More consumers' }).click();
  await expect(drained).toHaveText('no backlog');
  await page.getByRole('button', { name: 'Fewer consumers' }).click();
  await page.getByRole('button', { name: 'Fewer consumers' }).click();
  await expect(drained).toHaveText('never');
});

test('the rate limiting lesson shows a fixed window passing twice the limit at a window edge', async ({ page }) => {
  await page.goto('/learn/design/sd-rate-limiting');
  await expect(page.getByRole('radio', { name: 'Edge burst' })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByText('20 of 20 accepted · worst second 20')).toBeVisible();
  await expect(page.getByText('10 of 20 accepted · worst second 10')).toBeVisible();
  await page.getByRole('radio', { name: 'Steady' }).click();
  await expect(page.getByText('24 of 24 accepted · worst second 8')).toHaveCount(3);
});

test('the reliability lesson shows a second database copy removing almost all downtime', async ({ page }) => {
  await page.goto('/learn/design/sd-reliability');
  const whole = page.locator('.readouts div').filter({ hasText: 'Whole request' }).locator('dd');
  await expect(whole).toHaveText('99.950%');
  await page.getByRole('button', { name: 'More Database copies' }).click();
  await expect(whole).toHaveText('99.99997%');
  await expect(page.locator('.readouts div').filter({ hasText: 'Down a year' }).locator('dd')).toHaveText('8 s');
});

test('the estimation drill judges a typed estimate and shows the working', async ({ page }) => {
  await page.goto('/learn/design/sd-estimation');
  const drill = page.locator('app-estimate-drill');
  await drill.getByRole('textbox').fill('6k');
  await drill.getByRole('button', { name: 'Check', exact: true }).click();
  await expect(drill.getByRole('status')).toContainText('Spot on.');
  await drill.getByRole('button', { name: 'Next question' }).click();
  await expect(drill.getByText('Question 2 of 6')).toBeVisible();
  await expect(drill.getByRole('textbox')).toBeFocused();
});

test('the capacity lesson moves the bottleneck when the database gets a second instance', async ({ page }) => {
  await page.goto('/learn/design/sd-capacity');
  const readout = (name: string) => page.locator('.readouts div').filter({ hasText: name }).locator('dd');
  await expect(readout('Bottleneck')).toHaveText('Database');
  await expect(readout('Dropped')).toHaveText('4,000/s');
  await page.getByRole('button', { name: 'More Database' }).click();
  await expect(readout('Bottleneck')).toHaveText('App servers');
  await expect(readout('Dropped')).toHaveText('2,000/s');
});

test('the consistency lesson shows a stale read once R + W no longer exceeds N, and a failed write when too few replicas are up', async ({
  page,
}) => {
  await page.goto('/learn/design/sd-consistency');
  const readout = (name: string) => page.locator('.readouts div').filter({ hasText: name }).locator('dd');
  await expect(readout('R + W vs N')).toHaveText('4 > 3');
  await expect(readout('The read sees')).toHaveText('the new value');
  await page.getByRole('button', { name: 'Lower Read quorum' }).click();
  await expect(readout('R + W vs N')).toHaveText('3 ≤ 3');
  await expect(readout('The read sees')).toHaveText('possibly the old value');
  await page.getByRole('button', { name: /^Replica 1,/ }).click();
  await page.getByRole('button', { name: /^Replica 2,/ }).click();
  await expect(page.getByRole('button', { name: /^Replica 1, down/ })).toHaveAttribute('aria-pressed', 'true');
  await expect(readout('Write')).toHaveText('fails');
});

test('the consensus lesson lets only a majority commit, and an even split stops writes everywhere', async ({ page }) => {
  await page.goto('/learn/design/sd-consensus');
  const writes = page.locator('.readouts div').filter({ hasText: 'Writes' }).locator('dd');
  await expect(writes).toHaveText('commit on the right');
  await expect(page.getByText('Left: old leader cannot commit')).toBeVisible();
  await page.getByRole('radio', { name: '4', exact: true }).click();
  await expect(writes).toHaveText('stop everywhere');
  const slider = page.getByRole('slider', { name: /Nodes on the left/ });
  await slider.focus();
  await page.keyboard.press('ArrowRight');
  await expect(writes).toHaveText('commit on the left');
  await expect(page.getByText('Left: majority, leader stays')).toBeVisible();
});

test('the unique ids lesson trades timestamp years for generator bits, and weighs random ids by the birthday bound', async ({ page }) => {
  await page.goto('/learn/design/sd-ids');
  const readout = (name: string) => page.locator('.readouts div').filter({ hasText: name }).locator('dd');
  await expect(readout('Lasts')).toHaveText('69.7 years');
  await expect(readout('Generators')).toHaveText('1,024');
  const generators = page.getByRole('slider', { name: /Generator bits/ });
  await generators.focus();
  await page.keyboard.press('ArrowRight');
  await expect(readout('Lasts')).toHaveText('34.8 years');
  await expect(readout('Chance of any repeat')).toHaveText('about 9.4 × 10^-20');
  await page.getByRole('radio', { name: '64 random bits' }).click();
  await expect(readout('Chance of any repeat')).toHaveText('2.7%');
});

test('the search lesson intersects posting lists for AND and ranks every match for OR', async ({ page }) => {
  await page.goto('/learn/design/sd-search');
  const results = page.locator('app-index-widget .results li');
  await expect(results).toHaveCount(1);
  await expect(results.first()).toContainText('Redis is a fast in-memory database');
  await expect(results.first()).toContainText('1.02');
  await page.getByRole('radio', { name: 'Any word (OR)' }).click();
  await expect(results).toHaveCount(5);
  await page.getByRole('searchbox').fill('zebra');
  await expect(page.getByText('No document matches.')).toBeVisible();
});

test('the stream lesson drops an event that arrives after its window closed, until the lateness allows for it', async ({ page }) => {
  await page.goto('/learn/design/sd-streams');
  const dropped = page.locator('.readouts div').filter({ hasText: 'Dropped' }).locator('dd');
  await expect(dropped).toHaveText('event at 8 s');
  const lateness = page.getByRole('slider', { name: /Allowed lateness/ });
  await lateness.focus();
  for (let i = 0; i < 6; i++) await page.keyboard.press('ArrowRight');
  await expect(dropped).toHaveText('none');
  await page.getByRole('radio', { name: 'Session' }).click();
  await expect(page.locator('.readouts div').filter({ hasText: 'Windows' }).locator('dd')).toHaveText('1');
});

test('the storage lesson compares write amplification, and bloom filters keep an LSM lookup to one read', async ({ page }) => {
  await page.goto('/learn/design/sd-storage');
  const engine = (name: string) => page.getByRole('region', { name });
  const readout = (name: string, label: string) => engine(name).locator('.readouts div').filter({ hasText: label }).locator('dd');
  await expect(readout('B-tree', 'Write amp.')).toHaveText('42×');
  await expect(readout('LSM tree', 'Write amp.')).toHaveText('24×');
  await expect(readout('LSM tree', 'Reads per lookup')).toHaveText('1');
  await page.getByRole('checkbox', { name: /Bloom filters/ }).uncheck();
  await expect(readout('LSM tree', 'Reads per lookup')).toHaveText('5');
});
