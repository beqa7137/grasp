import { expect, synced, test } from './fixtures';

test('a review session grades every card and schedules the next review', async ({ page }) => {
  await page.goto('/drill');
  await expect(page.getByRole('heading', { name: "Today's review" })).toBeVisible();
  await expect(page.getByText('0 due · 10 new')).toBeVisible();

  const sync = synced(page, 'review.graded');
  const summary = page.getByText(/reviews · \d+ min/);
  // Missed cards come back later in the same session, so the number of answers varies.
  for (let answered = 0; !(await summary.isVisible()); answered++) {
    expect(answered, 'the session should end').toBeLessThan(40);
    await page.locator('g-question-card .choice').first().click();
    await expect(page.locator('g-question-card .verdict')).toHaveText(/Correct|Not quite/);
    await page.getByRole('button', { name: /^(Got it|Continue)/ }).click();
    await expect(summary.or(page.locator('g-question-card .choice:enabled').first())).toBeVisible();
  }
  await expect(page.getByText('Next review', { exact: true })).toBeVisible();
  await sync;
});

test('practice for one pattern stays outside the schedule', async ({ page }) => {
  await page.goto('/learn/pattern/hashing');
  await page.getByRole('link', { name: /Practice 6 items/ }).click();
  await expect(page).toHaveURL(/\/drill\?pattern=hashing/);
  await page.locator('app-drill g-question-card .choice').first().click();
  await expect(page.getByRole('button', { name: /^Next/ })).toBeVisible();
});

test('practice goes back to its lesson, and the Review tab root has no back button', { tag: '@nav' }, async ({ page }) => {
  const drill = page.locator('app-drill');
  const back = drill.locator('ion-back-button');
  await page.goto('/drill');
  await expect(drill.getByRole('heading', { name: "Today's review" })).toBeVisible();
  await expect(back).toBeHidden();

  await page.getByRole('tab', { name: 'Learn' }).click();
  await page.locator('app-learn a.pattern[href="/learn/pattern/hashing"]').click();
  await page.getByRole('link', { name: /Practice 6 items/ }).click();
  await expect(page).toHaveURL(/\/drill\?pattern=hashing/);
  await expect(drill.getByRole('heading', { name: 'Arrays & Hashing', level: 1 })).toBeVisible();
  await back.click();
  await expect(page).toHaveURL(/\/learn\/pattern\/hashing$/);
  await expect(page.getByRole('tab', { name: 'Learn' })).toHaveAttribute('aria-selected', 'true');

  await page.goto('/drill?pattern=sd-latency');
  await back.click();
  await expect(page).toHaveURL(/\/learn\/design\/sd-latency$/);
});
