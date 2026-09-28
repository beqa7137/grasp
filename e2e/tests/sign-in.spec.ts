import type { BrowserContext, Page } from '@playwright/test';
import { createHmac, randomBytes, randomInt } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { type GitHubUser, collectGitHubResults, signInToGitHub } from '../support/github';
import { expect, newClientIp, recordedEvents, synced, test } from './fixtures';

const CALLBACK_OPENERS_KEY = 'e2e.callbackOpeners';

function newGitHubUser({ verified }: { verified: boolean }): GitHubUser {
  const id = randomInt(1, 2 ** 47);
  return { id, login: `e2e-${id}`, emails: [{ email: `e2e-${id}@example.com`, primary: true, verified }] };
}

async function openGitHubConsent(page: Page): Promise<Page> {
  const opened = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Continue with GitHub' }).click();
  return opened;
}

/** The popup closes itself once it has handed GitHub's answer back to the app. */
async function answerGitHub(popup: Page, decision: 'Authorize' | 'Cancel') {
  const closed = popup.waitForEvent('close');
  await popup.getByRole('button', { name: decision }).click();
  await closed;
}

async function continueWithGitHub(page: Page) {
  await answerGitHub(await openGitHubConsent(page), 'Authorize');
}

/** Records, for each page load of /auth/callback, whether that sign-in window could still reach the app. */
async function recordCallbackOpeners(context: BrowserContext): Promise<(page: Page) => Promise<boolean[]>> {
  await context.addInitScript((key) => {
    if (location.pathname !== '/auth/callback') return;
    const seen = JSON.parse(localStorage.getItem(key) ?? '[]') as boolean[];
    localStorage.setItem(key, JSON.stringify([...seen, window.opener !== null]));
  }, CALLBACK_OPENERS_KEY);
  return (page) => page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '[]') as boolean[], CALLBACK_OPENERS_KEY);
}

/** Records every request, from any page, that redeems a GitHub sign-in ticket. */
function recordRedemptions(context: BrowserContext): string[] {
  const redeemed: string[] = [];
  context.on('request', (request) => {
    if (request.method() === 'POST' && /\/api\/auth\/github(\/link)?$/.test(new URL(request.url()).pathname)) {
      redeemed.push(request.url());
    }
  });
  return redeemed;
}

/** The sign-in plugin finishes a pending sign-in as soon as it loads, and afterwards whenever the fragment changes. */
async function waitForSignInPlugin(page: Page) {
  await page.waitForFunction(() => 'SocialLogin' in ((window as { Capacitor?: { Plugins?: object } }).Capacitor?.Plugins ?? {}));
}

/** Keeps the tab open whatever its scripts do, and counts their attempts to close it. */
async function countCloseAttempts(page: Page): Promise<() => Promise<number>> {
  await page.addInitScript(() => {
    let attempts = 0;
    window.close = () => void attempts++;
    Object.defineProperty(window, 'e2eCloseAttempts', { get: () => attempts });
  });
  return () => page.evaluate(() => (window as unknown as { e2eCloseAttempts: number }).e2eCloseAttempts);
}

test('signing in with GitHub keeps the progress made before, and signing back in returns to the same account', async ({
  page,
  context,
}) => {
  const user = newGitHubUser({ verified: true });
  const email = user.emails[0].email;
  await signInToGitHub(context, user);

  await page.goto('/drill');
  const graded = synced(page, 'review.graded');
  await page.locator('g-question-card .choice').first().click();
  await page.getByRole('button', { name: /^(Got it|Continue)/ }).click();
  await graded;

  await page.goto('/settings');
  const account = page.locator('app-account-settings');
  const learner = page.getByText(/Learner [0-9a-f]{8} ·/);
  const anonymousLearner = (await learner.textContent())!;

  const signedIn = page.waitForResponse((r) => r.request().method() === 'POST' && r.url().endsWith('/api/auth/github'));
  await continueWithGitHub(page);
  const { accessToken } = (await (await signedIn).json()) as { accessToken: string };
  await expect(account.getByText(email, { exact: true })).toBeVisible();
  await expect(account.getByRole('button', { name: 'Sign out' })).toBeVisible();
  await expect(account.getByRole('heading', { name: 'Sign-in methods' })).toBeVisible();
  await expect(account.getByText(`Connected · ${email}`)).toBeVisible();
  await expect(account.getByRole('button', { name: 'Connect Google' })).toBeVisible();

  // The new account adopted this device's learner, with the review done before signing in.
  await expect(learner).toHaveText(anonymousLearner);
  const progress = await page.request.get('/api/progress/events', { headers: { authorization: `Bearer ${accessToken}` } });
  expect(progress.status()).toBe(200);
  expect(((await progress.json()) as { events: { type: string }[] }).events.map((e) => e.type)).toContain('review.graded');

  await account.getByRole('button', { name: 'Sign out' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Sign out' }).click();
  await expect(account.getByRole('button', { name: 'Continue with GitHub' })).toBeVisible();
  await expect(learner).not.toHaveText(anonymousLearner);

  await continueWithGitHub(page);
  await expect(account.getByText(email, { exact: true })).toBeVisible();
  await expect(learner).toHaveText(anonymousLearner);
});

test('a second device starts fresh after the account was deleted elsewhere and it reloads', async ({ page, context, browser }) => {
  test.setTimeout(90_000);
  const user = newGitHubUser({ verified: true });
  await signInToGitHub(context, user);

  await page.goto('/drill');
  const graded = synced(page, 'review.graded');
  await page.locator('g-question-card .choice').first().click();
  await page.getByRole('button', { name: /^(Got it|Continue)/ }).click();
  await graded;
  await page.goto('/settings');
  const firstSignIn = page.waitForResponse(
    (response) => response.request().method() === 'POST' && response.url().endsWith('/api/auth/github'),
  );
  await continueWithGitHub(page);
  const oldLearner = ((await (await firstSignIn).json()) as { learnerId: string }).learnerId;

  const other = await browser.newContext({ baseURL: new URL(page.url()).origin });
  try {
    await other.addInitScript(() => localStorage.setItem('CapacitorStorage.grasp.pilotNotice.v1', new Date().toISOString()));
    await other.setExtraHTTPHeaders({ 'x-forwarded-for': newClientIp() });
    await signInToGitHub(other, user);
    const secondPage = await other.newPage();
    await secondPage.goto('/settings');
    const secondSignIn = secondPage.waitForResponse(
      (response) => response.request().method() === 'POST' && response.url().endsWith('/api/auth/github'),
    );
    await continueWithGitHub(secondPage);
    expect(((await (await secondSignIn).json()) as { learnerId: string }).learnerId).toBe(oldLearner);
    await expect.poll(async () => (await recordedEvents(secondPage)).length).toBeGreaterThan(0);

    await page.getByRole('button', { name: 'Delete…' }).click();
    const deleted = page.waitForResponse((response) => response.request().method() === 'DELETE' && response.url().endsWith('/api/me'));
    await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click();
    expect((await deleted).status()).toBe(204);

    const readStatuses: number[] = [];
    secondPage.on('response', (response) => {
      if (response.request().method() === 'GET' && new URL(response.url()).pathname === '/api/progress/events') {
        readStatuses.push(response.status());
      }
    });
    await secondPage.reload();
    await expect.poll(() => readStatuses.includes(410)).toBe(true);
    await expect(secondPage.getByText("This learner's data was deleted on another device.")).toBeVisible();
    await expect.poll(() => secondPage.evaluate(() => localStorage.getItem('CapacitorStorage.grasp.learnerId'))).not.toBe(oldLearner);
    const freshLearner = await secondPage.evaluate(() => localStorage.getItem('CapacitorStorage.grasp.learnerId'));
    await expect.poll(async () => (await recordedEvents(secondPage)).length).toBe(0);

    await secondPage.goto('/drill');
    const freshSynced = synced(secondPage, 'review.graded');
    await secondPage.locator('g-question-card .choice').first().click();
    await secondPage.getByRole('button', { name: /^(Got it|Continue)/ }).click();
    await freshSynced;
    const freshEvents = await recordedEvents(secondPage);
    expect(freshEvents).toHaveLength(1);
    const freshEventId = freshEvents[0].id;

    const reloadedRead = secondPage.waitForResponse(
      (response) => response.request().method() === 'GET' && new URL(response.url()).pathname === '/api/progress/events',
    );
    await secondPage.reload();
    const reloadedResponse = await reloadedRead;
    expect(reloadedResponse.request().headers()['x-learner-id']).toBe(freshLearner);
    expect(reloadedResponse.status()).toBe(200);
    await expect.poll(() => secondPage.evaluate(() => localStorage.getItem('CapacitorStorage.grasp.learnerId'))).toBe(freshLearner);
    await expect.poll(async () => (await recordedEvents(secondPage)).map((event) => event.id)).toEqual([freshEventId]);
    await secondPage.goto('/settings');
    const newSignIn = secondPage.waitForResponse(
      (response) => response.request().method() === 'POST' && response.url().endsWith('/api/auth/github'),
    );
    await continueWithGitHub(secondPage);
    const newSession = (await (await newSignIn).json()) as { accessToken: string; learnerId: string };
    expect(newSession.learnerId).toBe(freshLearner);
    const progress = await secondPage.request.get('/api/progress/events', {
      headers: { authorization: `Bearer ${newSession.accessToken}` },
    });
    expect(progress.status()).toBe(200);
    expect(((await progress.json()) as { events: { id: string }[] }).events.map((event) => event.id)).toEqual([freshEventId]);
  } finally {
    await other.close();
  }
});

test.describe('a GitHub account without a verified email', () => {
  test.use({ expectedConsoleErrors: [/the server responded with a status of 403/] });

  test('is told how to make sign-in work', async ({ page, context }) => {
    await signInToGitHub(context, newGitHubUser({ verified: false }));
    await page.goto('/settings');
    await continueWithGitHub(page);

    const account = page.locator('app-account-settings');
    await expect(account.getByRole('alert')).toHaveText(
      "GitHub didn't share a verified email address. Verify one with GitHub, then try again.",
    );
    await expect(account.getByRole('button', { name: 'Continue with GitHub' })).toBeEnabled();
  });
});

test.describe('GitHub sign-in with a slow token exchange', () => {
  for (const delayMs of [1_500, 3_000]) {
    test(`completes when the exchange takes ${delayMs} ms, because the popup keeps its link to the app on /auth/callback`, async ({
      page,
      context,
    }) => {
      const callbackOpeners = await recordCallbackOpeners(context);
      await context.route('**/api/auth/github/token', async (route) => {
        await delay(delayMs);
        await route.continue();
      });
      const user = newGitHubUser({ verified: true });
      await signInToGitHub(context, user);

      await page.goto('/settings');
      await continueWithGitHub(page);
      await expect(page.locator('app-account-settings').getByText(user.emails[0].email, { exact: true })).toBeVisible();
      expect(await callbackOpeners(page), 'the sign-in window on /auth/callback can still reach the app').toEqual([true]);
    });
  }
});

test('pressing Cancel on GitHub leaves the person signed out, silently', async ({ page, context }) => {
  await signInToGitHub(context, newGitHubUser({ verified: true }));
  await page.goto('/settings');
  await answerGitHub(await openGitHubConsent(page), 'Cancel');

  const account = page.locator('app-account-settings');
  await expect(account.getByRole('button', { name: 'Continue with GitHub' })).toBeEnabled();
  await expect(account.getByRole('alert')).toHaveCount(0);
  await expect(account.getByRole('button', { name: 'Sign out' })).toHaveCount(0);
});

test('a crafted sign-in result sent to /auth/callback while a GitHub sign-in is pending signs no one in', async ({ page, context }) => {
  const user = newGitHubUser({ verified: true });
  await signInToGitHub(context, user);
  const redeemed = recordRedemptions(context);

  await page.goto('/settings');
  const popup = await openGitHubConsent(page);
  await expect(popup.getByRole('button', { name: 'Authorize' })).toBeVisible();

  // What another site could do while the popup waits on GitHub: send a Grasp tab to the callback with a ticket of its own.
  const crafted = await context.newPage();
  await crafted.goto(`/auth/callback#access_token=${randomBytes(32).toString('base64url')}&token_type=bearer`);
  await expect(crafted).toHaveURL(/\/settings$/);
  expect(redeemed, 'no sign-in ticket was redeemed').toEqual([]);

  const account = page.locator('app-account-settings');
  await expect(account.getByRole('button', { name: 'Sign out' })).toHaveCount(0);
  await answerGitHub(popup, 'Authorize');
  await expect(account.getByText(user.emails[0].email, { exact: true })).toBeVisible();
});

test("another person's GitHub code or ticket in a Grasp tab's address while a GitHub sign-in is pending signs no one in", async ({
  page,
  context,
  playwright,
  baseURL,
}) => {
  const client = await playwright.request.newContext({ extraHTTPHeaders: { 'x-forwarded-for': newClientIp() } });
  const theirs = await collectGitHubResults(client, baseURL!, newGitHubUser({ verified: true }));
  await client.dispose();
  const user = newGitHubUser({ verified: true });
  await signInToGitHub(context, user);
  const redeemed = recordRedemptions(context);

  await page.goto('/settings');
  const popup = await openGitHubConsent(page);
  await expect(popup.getByRole('button', { name: 'Authorize' })).toBeVisible();

  // What another site could do while the popup waits on GitHub: open Grasp pages whose address carries a result of its own.
  const tab = await context.newPage();
  for (const planted of [
    `/settings#access_token=${theirs.ticket}&token_type=bearer`,
    `/settings?code=${theirs.code}&state=${randomBytes(16).toString('hex')}`,
  ]) {
    await tab.goto(planted);
    await waitForSignInPlugin(tab);
    await expect(tab).toHaveURL(/\/settings$/);
  }
  await tab.evaluate((ticket) => (location.hash = `access_token=${ticket}&token_type=bearer`), theirs.ticket);
  await expect(tab).toHaveURL(/\/settings$/);
  expect(redeemed, 'no sign-in ticket was redeemed').toEqual([]);

  const account = page.locator('app-account-settings');
  await expect(account.getByRole('button', { name: 'Sign out' })).toHaveCount(0);
  await answerGitHub(popup, 'Authorize');
  await expect(account.getByText(user.emails[0].email, { exact: true })).toBeVisible();
  expect(redeemed).toHaveLength(1);
});

test('after the Google window is closed, reloading keeps the tab open and GitHub sign-in still works', async ({ page, context }) => {
  await fakeGoogle(context);
  const closeAttempts = await countCloseAttempts(page);
  const user = newGitHubUser({ verified: true });
  await signInToGitHub(context, user);

  await page.goto('/settings');
  const opened = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Continue with Google' }).click();
  const popup = await opened;
  await expect(popup.getByRole('link', { name: 'Continue as E2E Tester' })).toBeVisible();
  await popup.close();
  await page.reload();

  await continueWithGitHub(page);
  await expect(page.locator('app-account-settings').getByText(user.emails[0].email, { exact: true })).toBeVisible();
  expect(await closeAttempts(), 'the app tab tried to close itself').toBe(0);
});

test.describe('Google sign-in', () => {
  test.use({ expectedConsoleErrors: [/the server responded with a status of 401/] });

  test("relays the popup's result under the site's security headers, and the API refuses a token Google never signed", async ({
    page,
    context,
  }) => {
    const google = await fakeGoogle(context);
    const callbackOpeners = await recordCallbackOpeners(context);

    await page.goto('/settings');
    const nonce = page.waitForResponse((r) => r.request().method() === 'POST' && r.url().endsWith('/api/auth/google/nonce'));
    const opened = page.waitForEvent('popup');
    await page.getByRole('button', { name: 'Continue with Google' }).click();
    const popup = await opened;
    const chooser = popup.getByRole('link', { name: 'Continue as E2E Tester' });
    await expect(chooser).toBeVisible();
    // The plugin takes a sign-in window it can no longer reach for one the person closed, so the
    // app's pages must let the provider's page keep its link back (Cross-Origin-Opener-Policy).
    expect(await popup.evaluate(() => window.opener !== null), 'the sign-in window can still reach the app').toBe(true);
    const issued = google.lastSignIn;
    expect(issued?.nonce, 'Google is asked for the nonce the API issued').toBe(((await (await nonce).json()) as { nonce: string }).nonce);

    const attempt = page.waitForResponse((r) => r.request().method() === 'POST' && r.url().endsWith('/api/auth/google'));
    await chooser.click();
    const response = await attempt;
    expect(response.request().postDataJSON(), 'the app sends the token with the nonce it asked for').toEqual({
      idToken: issued?.idToken,
      nonce: issued?.nonce,
    });
    expect(response.status()).toBe(401);
    await expect(page.locator('app-account-settings').getByRole('alert')).toHaveText("Sign-in didn't complete. Please try again.");
    expect(await callbackOpeners(page), 'the sign-in window on /auth/callback can still reach the app').toEqual([true]);
  });
});

/** Stands in for Google's sign-in page in popups, and remembers what the app last asked it for. */
async function fakeGoogle(context: BrowserContext): Promise<{ lastSignIn?: { nonce: string | null; idToken: string } }> {
  const google: { lastSignIn?: { nonce: string | null; idToken: string } } = {};
  await context.route(/^https:\/\/accounts\.google\.com\//, async (route) => {
    const authorize = new URL(route.request().url());
    if (authorize.pathname !== '/o/oauth2/v2/auth') return route.fulfill({ status: 404 });
    google.lastSignIn = { nonce: authorize.searchParams.get('nonce'), idToken: forgedGoogleIdToken(authorize) };
    await route.fulfill({ contentType: 'text/html', body: googleAccountChooser(authorize, google.lastSignIn.idToken) });
  });
  return google;
}

/** An ID token with the claims Google would send for this sign-in, signed with a key Google never had. */
function forgedGoogleIdToken(authorize: URL): string {
  const now = Math.floor(Date.now() / 1000);
  const segment = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const unsigned = `${segment({ alg: 'HS256', typ: 'JWT' })}.${segment({
    iss: 'https://accounts.google.com',
    aud: authorize.searchParams.get('client_id'),
    sub: '109876543210',
    email: 'e2e.tester@gmail.com',
    email_verified: true,
    nonce: authorize.searchParams.get('nonce'),
    iat: now,
    exp: now + 3600,
  })}`;
  return `${unsigned}.${createHmac('sha256', 'not-google').update(unsigned).digest('base64url')}`;
}

/** Stands in for Google's account chooser: continuing returns to the app the way Google's implicit flow does. */
function googleAccountChooser(authorize: URL, idToken: string): string {
  const back = new URL(authorize.searchParams.get('redirect_uri')!);
  back.hash = new URLSearchParams({
    access_token: 'e2e-access-token',
    token_type: 'Bearer',
    expires_in: '3599',
    id_token: idToken,
    state: authorize.searchParams.get('state') ?? '',
  }).toString();
  const href = back.href.replaceAll('&', '&amp;').replaceAll('"', '&quot;');
  return `<!doctype html><title>Sign in</title><a href="${href}">Continue as E2E Tester</a>`;
}
