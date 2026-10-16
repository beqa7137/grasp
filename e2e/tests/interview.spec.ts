import type { Locator, Page } from '@playwright/test';
import { expect, openStartSheet, recordedEvents, startMockRound, synced, test } from './fixtures';

/** Opens a coding interview and answers twice, which brings up End & score. */
async function interviewUntilScorable(page: Page, problem: string) {
  await startMockRound(page, 'Coding', problem);
  const input = page.getByRole('textbox', { name: /Think out loud/ });
  const replies = page.locator('app-interview-session .msg:not(.me)');
  await expect(replies.first()).toBeVisible();
  for (const text of [
    'Can the input be empty, and how long can it get?',
    'I would slide a window and track the most frequent value in it.',
  ]) {
    const before = await replies.count();
    await input.fill(text);
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    // The reply shows while it streams in, and the box stays read-only until it has.
    await expect(replies).toHaveCount(before + 1, { timeout: 30_000 });
    await expect(input).toBeEditable({ timeout: 30_000 });
  }
  await expect(page.getByRole('button', { name: 'End & score' })).toBeVisible({ timeout: 30_000 });
}

test('a mock interview runs to a scorecard', async ({ page }) => {
  await startMockRound(page, 'Coding', 'Days Until Warmer');
  await expect(page.getByText(/daily temperatures/)).toBeVisible();

  const input = page.getByRole('textbox', { name: /Think out loud/ });
  const [box, composer] = await Promise.all([input.boundingBox(), page.locator('.composer').boundingBox()]);
  expect(box!.width, 'the answer box keeps most of the composer, even on a phone').toBeGreaterThan(composer!.width * 0.6);
  const say = async (text: string) => {
    await input.fill(text);
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Send', exact: true })).toBeDisabled();
    await expect(input).toBeEditable({ timeout: 30_000 });
  };
  await say('Can temperatures repeat, and how long can the array get?');
  await say(
    'I would keep a monotonic stack of indices still waiting for a warmer day. Each new temperature pops every colder index and records the distance. That is O(n) time and O(n) space.',
  );

  const sync = synced(page, 'interview.scored');
  await page.getByRole('button', { name: 'End & score' }).click();
  await expect(page.getByText(/Scorecard · (Scripted: rubric checks|AI interviewer)/)).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('.scorecard .verdict')).not.toBeEmpty();
  await sync;
});

test('the Mock hub offers the full loop first, then a Single round of each track', { tag: '@smoke' }, async ({ page }) => {
  await page.goto('/mock');
  await expect(page.getByRole('heading', { name: 'Mock interviews', level: 1 })).toBeVisible();
  const loop = page.getByRole('link', { name: /^Full loop/ });
  await expect(loop).toContainText('One round of each: Coding 45 · System design 45 · Behavioral 20 min');
  await expect(loop).toHaveAttribute('href', '/mock/loop');
  const headings = page.locator('app-interview-home').getByRole('heading', { level: 3 });
  await expect(headings).toHaveText(['Coding round', 'System design round', 'Behavioral round']);
  expect((await loop.boundingBox())!.y).toBeLessThan((await headings.first().boundingBox())!.y);
  for (const card of await page.locator('app-interview-home .round').all()) await expect(card).toContainText(/Readiness \d+ · Building/);
  const sheet = await openStartSheet(page, 'Coding');
  await expect(sheet.getByRole('radio', { name: 'Surprise me' })).toBeChecked();
  await expect(sheet.getByRole('radio', { name: 'Scripted' })).toHaveAttribute('aria-checked', 'true');
  await expect(sheet.locator('.chip')).toHaveCount(0);
});

test('the start sheet lists catalog titles, and History shows them by round', async ({ page }) => {
  await page.goto('/mock');
  const sheet = await openStartSheet(page, 'System design');
  await expect(sheet.locator('fieldset label')).toHaveText(['Surprise me', 'URL Shortener', 'News Feed', 'Rate Limiter', 'Chat App']);
  await sheet.getByRole('button', { name: 'Close' }).click();
  await expect(sheet).toBeHidden();
  const coding = await openStartSheet(page, 'Coding');
  await expect(coding.getByRole('radio', { name: 'Capacity To Ship Packages Within D Days' })).toBeVisible();
  await expect(coding.getByRole('radio', { name: 'Longest Repeating Character Replacement' })).toBeVisible();
  await coding.getByRole('radio', { name: 'Course Schedule Order' }).check();
  await coding.getByRole('button', { name: 'Start round' }).click();
  await expect(page).toHaveURL(/\/mock\/[0-9a-f-]{36}$/);
  await expect(page.locator('app-interview-session ion-title')).toContainText('Course Schedule Order');
  await page.waitForLoadState('networkidle');
  await page.goto('/mock');
  const history = page.locator('app-interview-home .history');
  await expect(page.getByRole('heading', { name: 'History', level: 2 })).toBeVisible();
  await expect(page.locator('app-interview-home h3.group')).toHaveText(['Coding']);
  await expect(history.getByRole('link', { name: /^Course Schedule Order\s*Scripted · .* In progress$/ })).toBeVisible();
});

test.describe('interview score recovery', () => {
  test.use({ expectedConsoleErrors: [/net::ERR_FAILED/] });

  test('recovers a lost scoring response from the committed card and its single progress event', async ({ page }) => {
    await interviewUntilScorable(page, 'Days Until Warmer');
    const id = new URL(page.url()).pathname.split('/').at(-1)!;
    const path = `/api/interview/sessions/${id}/score`;
    let committedScore: Record<string, unknown> | undefined;
    await page.route(`**${path}`, async (route) => {
      const response = await route.fetch();
      expect(response.status()).toBe(201);
      committedScore = await response.json();
      await route.abort('failed');
    });

    await page.getByRole('button', { name: 'End & score' }).click();
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page.getByRole('button', { name: 'End & score' })).toBeEnabled();
    await expect(page.locator('.scorecard')).toHaveCount(0);
    const learnerId = await page.evaluate(() => localStorage.getItem('CapacitorStorage.grasp.learnerId')!);
    const headers = { 'x-learner-id': learnerId };
    const readProgress = async () => {
      const response = await page.request.get('/api/progress/events', { headers });
      expect(response.status()).toBe(200);
      return (await response.json()).events as { id: string; at: string }[];
    };
    const committedEvents = await readProgress();
    expect(committedEvents.filter((event) => event.id === `interview-${id}`)).toHaveLength(1);
    expect(committedEvents.find((event) => event.id === `interview-${id}`)?.at).toBe(committedScore?.['scoredAt']);
    const localEvents = await recordedEvents(page);
    expect(localEvents.some((event: { id: string }) => event.id === `interview-${id}`)).toBe(false);

    await page.unroute(`**${path}`);
    const retry = page.waitForResponse((response) => response.request().method() === 'POST' && new URL(response.url()).pathname === path);
    const sync = synced(page, 'interview.scored');
    await page.getByRole('button', { name: 'End & score' }).click();
    const recovered = await retry;
    expect(recovered.status()).toBe(201);
    expect(await recovered.json()).toEqual(committedScore);
    await expect(page.locator('.scorecard')).toBeVisible();
    await expect(page.getByRole('alert')).toHaveCount(0);
    await sync;
    expect(await readProgress()).toEqual(committedEvents);
    await page.reload();
    await expect(page.locator('.scorecard')).toBeVisible();
    await expect(page.getByRole('button', { name: 'End & score' })).toHaveCount(0);
  });
});

test.describe('interview access recovery', () => {
  test.use({ expectedConsoleErrors: [/Failed to load resource: the server responded with a status of 403/] });

  test('keeps sign-in focused and visible after a rejected reply finishes scrolling', async ({ page }) => {
    await page.route('**/api/interview/sessions/*', async (route) => {
      const response = await route.fetch();
      const session = await response.json();
      await route.fulfill({
        response,
        json: {
          ...session,
          mode: 'ai',
          aiAccess: 'available',
          messages: Array.from({ length: 8 }, () => session.messages[0]),
        },
      });
    });
    await page.route('**/api/interview/sessions/*/messages', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 50));
      await route.fulfill({ status: 403, json: { code: 'ai_sign_in_required', message: 'Sign in to continue with AI.' } });
    });
    await startMockRound(page, 'Coding', 'Days Until Warmer');
    const input = page.getByRole('textbox', { name: /Think out loud/ });
    await page.getByRole('button', { name: 'Code', exact: true }).click();
    await input.fill('My unsent explanation must stay here.');
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    const heading = page.getByRole('heading', { name: 'Sign in for AI interviews' });
    await expect(heading).toBeVisible();
    await page.waitForTimeout(400);
    await expect(heading).toBeFocused();
    const bounds = await heading.evaluate(async (element) => {
      const content = element.closest('ion-content') as HTMLElement & { getScrollElement(): Promise<HTMLElement> };
      const viewport = (await content.getScrollElement()).getBoundingClientRect();
      const title = element.getBoundingClientRect();
      return { top: title.top, bottom: title.bottom, visibleTop: viewport.top, visibleBottom: viewport.bottom };
    });
    expect(bounds.top).toBeGreaterThanOrEqual(bounds.visibleTop);
    expect(bounds.bottom).toBeLessThanOrEqual(bounds.visibleBottom);
    await expect(input).toHaveValue('My unsent explanation must stay here.');
  });
});

/** Expects what shows of the toolbar's title, its text clipped to its box, which an ellipsis ends, to end before `control`. */
async function expectTitleBefore(title: Locator, control: Locator, message: string) {
  const titleEnd = await title.evaluate((el) => {
    const range = document.createRange();
    range.selectNodeContents(el);
    return Math.min(range.getBoundingClientRect().right, el.shadowRoot!.querySelector('.toolbar-title')!.getBoundingClientRect().right);
  });
  expect(titleEnd, message).toBeLessThanOrEqual((await control.boundingBox())!.x);
}

// 640 px is 200% zoom on a 1280 px window; the doubled text size is the browser's own setting.
test('at 200% zoom, with the text at its size or doubled, End & score sits beside the interview title, never over it', async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, 'Zoom is a desktop browser setting; a phone is checked at 320 px.');
  await page.setViewportSize({ width: 640, height: 500 });
  await interviewUntilScorable(page, 'Longest Repeating Character Replacement');
  for (const textSize of ['100%', '200%']) {
    await page.evaluate((size) => (document.documentElement.style.fontSize = size), textSize);
    await expectTitleBefore(
      page.locator('app-interview-session ion-title'),
      page.getByRole('button', { name: 'End & score' }),
      `with ${textSize} text, the title ends before End & score starts`,
    );
  }
});

test('on a 320 px phone, End & score and the Design Lab Reset sit beside their titles, never over them', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'A 320 px screen is a phone.');
  await page.setViewportSize({ width: 320, height: 700 });
  await interviewUntilScorable(page, 'Longest Repeating Character Replacement');
  await expectTitleBefore(
    page.locator('app-interview-session ion-title'),
    page.getByRole('button', { name: 'End & score' }),
    'the interview title ends before End & score starts',
  );

  await page.goto('/design/missions/first-scale-up');
  const toolbar = page.locator('app-sandbox ion-toolbar');
  await expect(toolbar.locator('ion-title')).toHaveText('Your First Scale-Up');
  await expectTitleBefore(
    toolbar.locator('ion-title'),
    toolbar.getByRole('button', { name: 'Reset' }),
    'the mission title ends before Reset starts',
  );
});
