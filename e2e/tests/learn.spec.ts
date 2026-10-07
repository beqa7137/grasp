import { expect, synced, test } from './fixtures';

test.describe('first visit', () => {
  test.use({ pilotNoticeSeen: false });

  test('welcomes pilot testers once, then shows the daily loop', { tag: ['@smoke', '@nav'] }, async ({ page }) => {
    await page.goto('/');
    const welcome = page.getByRole('heading', { name: 'Welcome to the Grasp pilot' });
    await expect(welcome).toBeVisible();
    await expect(page.locator('app-pilot-notice')).toContainText(
      'Send feedback any time from Settings. Bugs, confusion and ideas are all useful.',
    );
    await page.getByRole('button', { name: "Got it, let's start" }).click();
    await expect(welcome).toBeHidden();
    await expect(page).toHaveURL(/\/learn$/);
    await expect(page.getByRole('heading', { name: 'Build intuition, not a problem count.' })).toBeVisible();

    await page.reload();
    await expect(page.getByRole('heading', { name: 'Build intuition, not a problem count.' })).toBeVisible();
    await expect(welcome).toBeHidden();
  });
});

test('a pattern page teaches the cue and template and links to practice', { tag: '@smoke' }, async ({ page }) => {
  await page.goto('/learn');
  await page
    .getByRole('link', { name: /Arrays & Hashing/ })
    .first()
    .click();
  await expect(page.getByRole('heading', { name: 'Arrays & Hashing', level: 1 })).toBeVisible();
  await expect(page.getByRole('heading', { name: /Cues/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Template' })).toBeVisible();

  await page.getByRole('link', { name: 'Code: Two Sum' }).click();
  await expect(page).toHaveURL(/\/code\/two-sum$/);
  await expect(page.getByRole('heading', { name: 'Two Sum', level: 1 })).toBeVisible();
});

test('deep links load directly, and unknown paths land on Learn', { tag: ['@smoke', '@nav'] }, async ({ page }) => {
  await page.goto('/visualize/binary-search');
  await expect(page.getByRole('heading', { name: 'Binary Search', level: 1 })).toBeVisible();
  await page.goto('/no-such-page');
  await expect(page).toHaveURL(/\/learn$/);
});

test('the Study plan tile lines up with the Review tile beside it', { tag: '@nav' }, async ({ page }) => {
  await page.goto('/learn');
  const learn = page.locator('app-learn');
  const plan = (await learn.getByRole('link', { name: /^Study plan/ }).boundingBox())!;
  const review = (await learn.getByRole('link', { name: /^Review/ }).boundingBox())!;
  expect(plan.y).toBe(review.y);
});

test('the Learn menu sends feedback and opens the study plan', { tag: '@nav' }, async ({ page }) => {
  await page.goto('/learn');
  const learn = page.locator('app-learn');
  const more = learn.getByRole('button', { name: 'More options' });
  const menu = page.locator('ion-popover');
  const feedback = menu.getByRole('button', { name: 'Send feedback' });
  const plan = menu.getByRole('button', { name: 'Study plan' });

  await expect(more).toHaveAttribute('aria-haspopup', 'dialog');
  await expect(more).toHaveAttribute('aria-expanded', 'false');
  await more.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog', { name: 'More options' })).toBeVisible();
  await expect(feedback).toBeFocused();
  await expect(learn.getByRole('button', { name: 'More options', includeHidden: true })).toHaveAttribute('aria-expanded', 'true');
  const focused = async () => (await page.evaluate(() => document.activeElement?.textContent?.trim())) ?? '';
  const reached = new Set<string>();
  for (let i = 0; i < 4; i++) {
    await page.keyboard.press('Tab');
    reached.add(await focused());
  }
  expect([...reached]).toEqual(expect.arrayContaining(['Send feedback', 'Study plan']));
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
  await expect(more).toBeFocused();
  await expect(more).toHaveAttribute('aria-expanded', 'false');

  await more.dblclick();
  await expect(feedback).toBeVisible();
  await expect(menu).toHaveCount(1);
  await plan.click();
  await expect(page).toHaveURL(/\/plan$/);
  await expect(page.locator('app-plan').getByRole('heading', { name: 'Plan to your interview', level: 1 })).toBeVisible();
  await expect(menu).toHaveCount(0);
  await expect(page.locator('ion-backdrop:visible')).toHaveCount(0);
});

test('no fixed box sits over the page on a phone', { tag: '@nav' }, async ({ page, isMobile }) => {
  test.skip(!isMobile, 'The right-edge tab covered content on phones.');
  for (const path of ['/learn', '/code/two-sum', '/visualize/binary-search']) {
    await page.goto(path);
    await expect(page.locator('ion-router-outlet > .ion-page:not(.ion-page-hidden) ion-content').last()).toBeVisible();
    const fixed = await page.evaluate(() => {
      const overlays = 'ion-modal, ion-popover, ion-alert, ion-toast, ion-loading, ion-action-sheet';
      const content = document.querySelector('ion-router-outlet .ion-page:not(.ion-page-hidden) ion-content')!.getBoundingClientRect();
      return [...document.body.querySelectorAll('*')]
        .filter((el) => getComputedStyle(el).position === 'fixed' && !el.closest(overlays))
        .filter((el) => {
          const r = el.getBoundingClientRect();
          return (
            r.width && r.height && r.left < content.right && content.left < r.right && r.top < content.bottom && content.top < r.bottom
          );
        })
        .map((el) => `${el.localName}.${[...el.classList].join('.')}`);
    });
    expect(fixed, path).toEqual([]);
  }
});

test('an answer waiting for its upload never shows progress as waiting to sync', async ({ page }) => {
  await page.goto('/learn');
  const status = page.locator('app-learn .sync');
  await expect(status).toHaveAttribute('data-status', 'synced');
  await status.evaluate((element) => {
    const seen = new Set([element.getAttribute('data-status')]);
    new MutationObserver(() => seen.add(element.getAttribute('data-status'))).observe(element, { attributes: true });
    Object.assign(window, { syncStatuses: seen });
  });

  await page.getByRole('tab', { name: 'Review' }).click();
  const sync = synced(page, 'review.graded');
  await page.locator('g-question-card .choice').first().click();
  await page.getByRole('button', { name: /^(Got it|Continue)/ }).click();
  await page.getByRole('tab', { name: 'Learn' }).click();
  await sync;
  await expect(status).toHaveAttribute('data-status', 'synced');
  expect(await page.evaluate(() => [...(window as unknown as { syncStatuses: Set<string> }).syncStatuses])).not.toContain('pending');
});

test.describe('warmed offline lessons', () => {
  test.use({ expectedConsoleErrors: [/ERR_INTERNET_DISCONNECTED|WebKit encountered an internal error/] });

  test('opens an unvisited pattern and steps through an unvisited visualizer after disconnecting', async ({ page, context }) => {
    await page.goto('/learn', { waitUntil: 'networkidle' });
    await context.setOffline(true);

    await page.locator('a.pattern[href="/learn/pattern/two-pointers"]').click();
    await expect(page.getByRole('heading', { name: 'Two Pointers', level: 1 })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Template' })).toBeVisible();

    await page.locator('ion-tab-button[tab="visualize"]').click();
    await page.locator('a.item[href="/visualize/binary-search"]').click();
    await expect(page.getByRole('heading', { name: 'Binary Search', level: 1 })).toBeVisible();
    const counter = page.locator('app-player g-transport .count');
    const initial = await counter.textContent();
    await page.getByRole('button', { name: 'Step forward' }).click();
    await expect(counter).not.toHaveText(initial!);
  });
});

test.describe('progress sync recovery', () => {
  test.use({ expectedConsoleErrors: [/Failed to load resource/] });

  test('keeps the retry alert and keyboard focus in place until sync recovers', async ({ page }) => {
    let pulls = 0;
    let releaseRetry!: () => void;
    const retryResponse = new Promise<void>((resolve) => (releaseRetry = resolve));
    await page.route('**/api/progress/events*', async (route) => {
      if (route.request().method() !== 'GET') return route.continue();
      pulls++;
      if (pulls === 2) await retryResponse;
      if (pulls <= 2) {
        return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'Database unavailable' }) });
      }
      return route.continue();
    });

    await page.goto('/learn');
    const alert = page.getByRole('alert').filter({ hasText: 'Sync is unavailable' });
    const retry = alert.getByRole('button');
    const hero = page.locator('.hero');
    await expect(alert).toBeVisible();
    await expect(page.getByRole('link', { name: /Your session ended/ })).toHaveCount(0);
    const heroTop = (await hero.boundingBox())!.y;

    await retry.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('.sync[data-status="syncing"]')).toBeVisible();
    await expect(alert).toBeVisible();
    await expect(retry).toBeDisabled();
    await expect(retry).toHaveText('Trying again');
    await expect(alert).toBeFocused();
    expect(Math.abs((await hero.boundingBox())!.y - heroTop)).toBeLessThan(1);

    releaseRetry();
    await expect(page.locator('.sync[data-status="offline"]')).toBeVisible();
    await expect(retry).toBeEnabled();
    await expect(retry).toHaveText('Try again');
    await expect(retry).toBeFocused();

    await page.keyboard.press('Enter');
    const syncedStatus = page.locator('.sync[data-status="synced"]');
    await expect(syncedStatus).toBeVisible();
    await expect(alert).toHaveCount(0);
    await expect(syncedStatus).toBeFocused();
  });
});

test('every page named after its content gets that name as its title, from a direct visit', { tag: '@nav' }, async ({ page }) => {
  const titles: [string, RegExp][] = [
    ['/learn/pattern/hashing', /Arrays & Hashing pattern/],
    ['/learn/design/sd-overload', /Backpressure & Load Shedding/],
    ['/visualize/binary-search', /Binary Search/],
    ['/design/case/url-shortener', /URL Shortener/],
    ['/design/first-scale-up', /Your First Scale-Up/],
    ['/behavioral/feedback', /Giving & Receiving Feedback/],
    ['/code/two-sum', /Two Sum/],
  ];
  for (const [path, title] of titles) {
    await page.goto(path);
    await expect(page, path).toHaveTitle(title);
  }
});
