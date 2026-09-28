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
