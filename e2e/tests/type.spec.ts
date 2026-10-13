import { randomUUID } from 'node:crypto';
import { expect, test } from './fixtures';
import { typeFindings } from './type-rules';

const PAGES = [
  ['Today', '/today'],
  ['the binary search pattern page', '/coding/patterns/binary-search'],
  ['the Load Balancing lesson', '/design/topics/sd-load-balancing'],
  ['a case study', '/design/cases/url-shortener'],
  ['Settings', '/today/settings'],
  ['a Lab mission', '/design/missions/first-scale-up'],
  ['a visualizer, whose panel headings are labels', '/coding/visualizers/binary-search'],
];

for (const [name, path] of PAGES) {
  test(`${name} keeps Space Grotesk to display sizes, card titles in Inter and uppercase in the label role`, async ({ page }) => {
    await page.goto(path, { waitUntil: 'networkidle' });
    await expect(page.locator('.ion-page:not(.ion-page-hidden) ion-title').first()).toBeVisible();
    expect(await typeFindings(page)).toEqual({ small: [], titles: [], display: [], labels: [] });
  });
}

test("the visualizer's intro titles itself in Inter 600, though its popover is not a card", async ({ page }) => {
  await page.goto('/coding/visualizers/binary-search', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'About this visualizer' }).click();
  await expect(page.locator('app-player-intro h2')).toBeVisible();
  expect(await typeFindings(page)).toEqual({ small: [], titles: [], display: [], labels: [] });
});

test("Mock's Recent heading, outside any card, titles itself in Inter 600", async ({ page }) => {
  const session = {
    id: randomUUID(),
    track: 'coding',
    problem: { id: 'two-sum', title: 'Two Sum', track: 'coding', patternIds: [] },
    messages: [],
    hintsUsed: 0,
    status: 'active',
    createdAt: new Date().toISOString(),
    mode: 'offline',
  };
  await page.route('**/api/interview/sessions', (route) =>
    route.request().method() === 'GET' ? route.fulfill({ json: [session] }) : route.continue(),
  );
  await page.goto('/mock', { waitUntil: 'networkidle' });
  await expect(page.getByRole('heading', { name: 'Recent' })).toBeVisible();
  expect(await typeFindings(page)).toEqual({ small: [], titles: [], display: [], labels: [] });
});

test("the Lab's connection readout stays monospaced, as code type, in its inspector card", async ({ page }) => {
  await page.goto('/design/missions/first-scale-up', { waitUntil: 'networkidle' });
  await page.locator('.edge .hit').first().dispatchEvent('pointerdown');
  const readout = page.locator('.inspector h2.mono');
  await expect(readout).toHaveText(/rps$/);
  expect(await readout.evaluate((el) => getComputedStyle(el).fontFamily)).toMatch(/^"?JetBrains Mono/);
  expect(await typeFindings(page)).toEqual({ small: [], titles: [], display: [], labels: [] });
});
