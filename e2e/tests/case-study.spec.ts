import { expect, recordedEvents, synced, test } from './fixtures';

test('a case study is worked stage by stage, resumes where the learner left it, and opens its build in the Design Lab', async ({
  page,
}) => {
  await page.goto('/design/cases');
  await page.getByRole('link', { name: /URL Shortener/ }).click();
  await expect(page.getByRole('heading', { name: 'URL Shortener', level: 1 })).toBeVisible();

  const decision = page.getByRole('group', { name: /Which answer changes the design the most/ });
  await decision.getByRole('button', { name: /Can users pick a custom alias/ }).click();
  await expect(decision).toBeFocused();
  await expect(decision.getByRole('img', { name: 'your answer, wrong' })).toBeVisible();
  await expect(decision.getByRole('img', { name: 'correct answer' })).toBeVisible();
  await expect(decision.getByText(/Scale and the read to write ratio decide nearly everything/)).toBeVisible();

  await page.getByRole('button', { name: 'Show the model answer' }).click();
  await expect(page.getByText(/^Functional: create a short link/)).toBeVisible();
  await page.getByRole('button', { name: 'Show all' }).click();
  await page.getByRole('button', { name: 'Next: Estimate the traffic' }).click();
  await expect(page.getByRole('heading', { name: /Estimate the traffic/ })).toBeFocused();

  const estimate = page.getByRole('textbox', { name: 'Average redirects per second' });
  await estimate.fill('lots');
  await page.getByRole('button', { name: 'Check', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText(/Type a number/);
  await estimate.fill('120k');
  await page.getByRole('button', { name: 'Check', exact: true }).click();
  const result = page.getByRole('status').filter({ hasText: '115,741 redirects/s' });
  await expect(result).toContainText('Spot on.');
  await expect(result).toBeFocused();
  await expect(estimate).toBeDisabled();

  await page.reload();
  await expect(page.getByRole('heading', { name: /Estimate the traffic/ })).toBeVisible();

  await page.goto('/design/cases/url-shortener/build');
  await expect(page).toHaveTitle(/URL Shortener build/);
  await expect(page.getByText(/design at 40k requests per second/)).toBeVisible();
  await expect(page.locator('g.node[data-kind="cache"]')).toBeVisible();
});

/** The News Feed decisions after the first, answered as recommended; the options are shown in a shuffled order. */
const RECOMMENDED: Record<number, RegExp> = { 4: /^Hybrid: push for most accounts/, 6: /^A cursor: return the last post ID seen/ };

test('a case study keeps every answer across a reload, and finishing it syncs a progress event and marks it finished', async ({ page }) => {
  await page.goto('/design/cases');
  const card = page.getByRole('link', { name: /^News Feed/ });
  await card.click();
  const stages = page.locator('li.stage');
  const decision = stages.nth(0).getByRole('group', { name: /Which question narrows this design the most/ });
  await decision.getByRole('button', { name: /Can posts include images and video/ }).click();
  await expect(decision.getByRole('img', { name: 'your answer, wrong' })).toBeVisible();
  await page.getByRole('button', { name: 'Show the model answer' }).click();
  await page.getByRole('button', { name: 'Show all' }).click();
  await page.getByRole('button', { name: 'Next: Estimate the reads' }).click();
  const reads = page.getByRole('textbox', { name: 'Average feed reads per second' });
  await reads.fill('35k');
  await page.getByRole('button', { name: 'Check', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: '34,722 reads/s' })).toContainText('Spot on.');
  await stages.nth(1).getByRole('button', { name: 'Show the model answer' }).click();

  await page.reload();
  await expect(decision.getByRole('img', { name: 'your answer, wrong' })).toBeVisible();
  await expect(decision.getByRole('button')).toHaveCount(0);
  await expect(stages.nth(0).locator('.points li')).toHaveCount(4);
  await expect(reads).toHaveValue('35k');
  await expect(reads).toBeDisabled();
  await expect(page.getByRole('status').filter({ hasText: '34,722 reads/s' })).toContainText('Spot on.');
  await expect(stages.nth(1).getByText('1 of 2', { exact: true })).toBeVisible();

  await page.goto('/design/cases');
  await expect(card).toContainText('Stage 2 of 8');
  await card.click();
  await expect(reads).toHaveValue('35k');

  const sync = synced(page, 'case.completed');
  for (let i = 1; i < 8; i++) {
    const stage = stages.nth(i);
    await expect(stage.getByRole('button', { name: /Show all|Show the model answer/ })).toBeVisible();
    const estimate = stage.getByRole('textbox');
    if ((await estimate.count()) && (await estimate.isEnabled())) {
      await estimate.fill('1');
      await stage.getByRole('button', { name: 'Check', exact: true }).click();
    }
    if (i in RECOMMENDED) await stage.locator('fieldset').getByRole('button', { name: RECOMMENDED[i] }).click();
    if (i > 1) await stage.getByRole('button', { name: 'Show the model answer' }).click();
    await stage.getByRole('button', { name: 'Show all' }).click();
    await stage.getByRole('button', { name: i < 7 ? /^Next: / : 'Finish the case' }).click();
  }
  await expect(page.locator('.outcome')).toBeFocused();
  await expect(page.getByText('Decisions as recommended: 2 of 3. Estimates within 2x: 1 of 2.')).toBeVisible();
  await sync;

  const learnerId = await page.evaluate(() => localStorage.getItem('CapacitorStorage.grasp.learnerId'));
  const snapshot = await page.request.get('/api/progress', { headers: { 'x-learner-id': learnerId! } });
  const { state } = await snapshot.json();
  expect(state.cases['news-feed']).toMatchObject({ completions: 1, bestChoices: 2, decisions: 3, closeEstimates: 1, estimates: 2 });
  expect(Object.keys(state.introduced)).toEqual(expect.arrayContaining(['sd-caching', 'sd-queues', 'sd-replication']));

  await page.goto('/design/cases');
  await expect(card).toContainText('Finished');
  await expect(page.getByText('Decisions as recommended: 2 of 3. Estimates within 2x: 1 of 2.')).toBeVisible();
  await page.getByRole('link', { name: 'Review: News Feed' }).click();
  await expect(reads).toHaveValue('35k');
  await expect(page.getByRole('heading', { name: 'What costs candidates this question' })).toBeVisible();

  await page.goto('/design/cases');
  await page.getByRole('button', { name: 'Start over: News Feed' }).click();
  await expect(stages.nth(0).getByRole('heading', { name: /Clarify what matters/ })).toBeFocused();
  await expect(decision.getByRole('button')).toHaveCount(4);
  await expect(stages).toHaveCount(1);
  expect((await recordedEvents(page)).filter((e) => e.type === 'case.completed')).toHaveLength(1);
});

test('a case build names nodes by their role and stores files in an object store', { tag: '@lab' }, async ({ page }) => {
  await page.goto('/design/cases/file-sync/build');
  const blocks = page.getByRole('button', { name: /^Block store, Object Store/ });
  await blocks.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Block store' })).toBeVisible();
  await expect(page.getByRole('slider', { name: /^Files/ })).toHaveValue('50');
  await expect(page.getByRole('button', { name: /^Metadata API, App Servers/ })).toHaveCount(1);
});
