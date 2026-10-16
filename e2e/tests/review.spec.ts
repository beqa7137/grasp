import { expect, expectSectionLit, section, synced, test } from './fixtures';

test('a review session grades every card and schedules the next review', async ({ page }) => {
  await page.goto('/today/review');
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
  // The summary replaces the card: focus moves to its score, and its next step shows without scrolling, above the tab bar.
  await expect(page.getByRole('heading', { name: /^\d+\/\d+$/ })).toBeFocused();
  const keepGoing = page.getByRole('button', { name: /^Keep going/ });
  await expect(keepGoing).toBeVisible();
  const tabBar = await page.locator('ion-tab-bar').boundingBox();
  const bottom = tabBar?.height ? tabBar.y : page.viewportSize()!.height;
  const box = (await keepGoing.boundingBox())!;
  expect(box.y + box.height).toBeLessThanOrEqual(bottom);
  await sync;
});

test('practice for one pattern stays outside the schedule', async ({ page }) => {
  await page.goto('/coding/patterns/hashing');
  await page.getByRole('link', { name: /Practice 6 items/ }).click();
  await expect(page).toHaveURL(/\/coding\/patterns\/hashing\/drill/);
  await page.locator('app-drill g-question-card .choice').first().click();
  await expect(page.getByRole('button', { name: /^Next/ })).toBeVisible();
});

test('practice goes back to its lesson, and the review back to Today', { tag: '@nav' }, async ({ page }) => {
  const drill = page.locator('app-drill');
  const back = drill.locator('ion-back-button');
  await page.goto('/today/review');
  await expect(drill.getByRole('heading', { name: "Today's review" })).toBeVisible();
  await back.click();
  await expect(page).toHaveURL(/\/today$/);
  await expectSectionLit(page, 'Today');

  await section(page, 'Coding').click();
  await page.locator('app-skill-map a[href="/coding/patterns/hashing"]').click();
  await page.getByRole('link', { name: /Practice 6 items/ }).click();
  await expect(page).toHaveURL(/\/coding\/patterns\/hashing\/drill/);
  await expect(drill.getByRole('heading', { name: 'Arrays & Hashing', level: 1 })).toBeVisible();
  await back.click();
  await expect(page).toHaveURL(/\/coding\/patterns\/hashing$/);
  await expectSectionLit(page, 'Coding');

  await page.goto('/design/topics/sd-latency/drill');
  await back.click();
  await expect(page).toHaveURL(/\/design\/topics\/sd-latency$/);
});

test('on a phone an answered card shows its rating buttons above the tab bar, and its whole explanation above them', async ({
  page,
  isMobile,
}) => {
  test.skip(!isMobile, 'The rating bar sticks only under 1024px.');
  for (const size of [page.viewportSize()!, { width: 320, height: 700 }, { width: 412, height: 480 }]) {
    await page.setViewportSize(size);
    await page.goto('/today/review');
    await page.locator('g-question-card .choice').first().click();
    await expect(page.getByRole('button', { name: /^(Got it|Continue)/ })).toBeVisible();
    // The explanation rises into place, so its box is read until it settles.
    const placed = () =>
      page.locator('app-drill').evaluate((drill) => {
        const tabs = document.querySelector('ion-tab-bar')!.getBoundingClientRect();
        const header = drill.querySelector('ion-header')!.getBoundingClientRect();
        const bar = drill.querySelector('.actions')!.getBoundingClientRect();
        const reveal = drill.querySelector('g-question-card .reveal')!.getBoundingClientRect();
        const buttons = [...drill.querySelectorAll('.actions button')].map((b) => b.getBoundingClientRect());
        return {
          shown: buttons.length > 0 && buttons.every((b) => b.top >= header.bottom && b.bottom <= tabs.top + 0.5),
          explanation: reveal.top >= header.bottom && reveal.bottom <= bar.top + 0.5,
        };
      });
    await expect.poll(placed, { message: `at ${size.width}×${size.height}` }).toEqual({ shown: true, explanation: true });
  }
});

test.describe('with motion reduced, so the explanation does not rise into place after the page scrolls it', () => {
  test.use({ contextOptions: { reducedMotion: 'reduce' } });

  test("on a phone a practice card's explanation ends above its Next bar, whose icon loads after it appears", async ({
    page,
    isMobile,
  }) => {
    test.skip(!isMobile, 'The rating bar sticks only under 1024px.');
    for (const size of [page.viewportSize()!, { width: 320, height: 700 }, { width: 412, height: 480 }]) {
      await page.setViewportSize(size);
      await page.goto('/coding/patterns/binary-search/drill');
      await page.locator('app-drill g-question-card .choice').first().click();
      await expect(page.getByRole('button', { name: /^Next/ })).toBeVisible();
      const clear = () =>
        page.locator('app-drill').evaluate((drill) => {
          const bar = drill.querySelector('.actions')!.getBoundingClientRect();
          return drill.querySelector('g-question-card .reveal')!.getBoundingClientRect().bottom <= bar.top + 0.5;
        });
      await expect.poll(clear, { message: `at ${size.width}×${size.height}` }).toBe(true);
    }
  });
});

test('at 400% zoom the rating buttons stay in the flow, so they never cover the card', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 256 });
  await page.goto('/today/review');
  await page.locator('g-question-card .choice').first().click();
  const actions = page.locator('app-drill .actions');
  await expect(actions).toBeVisible();
  expect(await actions.evaluate((el) => getComputedStyle(el).position)).toBe('static');
});
