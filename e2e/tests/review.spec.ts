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

test('on a phone an answered card shows its rating buttons above the tab bar, and its verdict above them', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'The rating bar sticks only under 1024px.');
  for (const size of [page.viewportSize()!, { width: 320, height: 700 }]) {
    await page.setViewportSize(size);
    await page.goto('/drill');
    await page.locator('g-question-card .choice').first().click();
    await expect(page.getByRole('button', { name: /^(Got it|Continue)/ })).toBeVisible();
    const placed = await page.locator('app-drill').evaluate((drill) => {
      const tabs = document.querySelector('ion-tab-bar')!.getBoundingClientRect();
      const header = drill.querySelector('ion-header')!.getBoundingClientRect();
      const bar = drill.querySelector('.actions')!.getBoundingClientRect();
      const verdict = drill.querySelector('g-question-card .reveal .verdict')!.getBoundingClientRect();
      const buttons = [...drill.querySelectorAll('.actions button')].map((b) => b.getBoundingClientRect());
      return {
        shown: buttons.length > 0 && buttons.every((b) => b.top >= header.bottom && b.bottom <= tabs.top + 0.5),
        verdict: verdict.top >= header.bottom && verdict.bottom <= bar.top + 0.5,
      };
    });
    expect(placed, `at ${size.width}×${size.height}`).toEqual({ shown: true, verdict: true });
  }
});

test('at 400% zoom the rating buttons stay in the flow, so they never cover the card', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 256 });
  await page.goto('/drill');
  await page.locator('g-question-card .choice').first().click();
  const actions = page.locator('app-drill .actions');
  await expect(actions).toBeVisible();
  expect(await actions.evaluate((el) => getComputedStyle(el).position)).toBe('static');
});
