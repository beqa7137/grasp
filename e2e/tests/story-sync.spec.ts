import type { Page } from '@playwright/test';
import { randomInt } from 'node:crypto';
import { type GitHubUser, signInToGitHub } from '../support/github';
import { expect, newClientIp, test } from './fixtures';

const ACTION = 'I traced the failure to an expired credential, I rotated it, I added an alert on missing files and I wrote the runbook.';

function newGitHubUser(): GitHubUser {
  const id = randomInt(1, 2 ** 47);
  return { id, login: `e2e-${id}`, emails: [{ email: `e2e-${id}@example.com`, primary: true, verified: true }] };
}

/** Signs in from Settings and resolves with the session's access token. */
async function signIn(page: Page): Promise<string> {
  await page.goto('/settings');
  const signedIn = page.waitForResponse((r) => r.request().method() === 'POST' && r.url().endsWith('/api/auth/github'));
  const popup = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Continue with GitHub' }).click();
  const consent = await popup;
  const closed = consent.waitForEvent('close');
  await consent.getByRole('button', { name: 'Authorize' }).click();
  await closed;
  return ((await (await signedIn).json()) as { accessToken: string }).accessToken;
}

const uploaded = (page: Page) =>
  page.waitForResponse((r) => r.request().method() === 'PUT' && new URL(r.url()).pathname.startsWith('/api/stories/') && r.ok());

async function exportedStories(page: Page, accessToken: string) {
  const response = await page.request.get('/api/me/export', { headers: { authorization: `Bearer ${accessToken}` } });
  expect(response.status()).toBe(200);
  return ((await response.json()) as { stories: { title: string; deleted?: true }[] }).stories;
}

// A signed-in page that reloads asks for progress by device before its session renews, and the API answers 401 once.
test.use({ expectedConsoleErrors: [/status of 401/] });

test("a signed-in learner's stories reach their other devices, with edits, deletes and the export", async ({ page, context, browser }) => {
  test.setTimeout(90_000);
  const user = newGitHubUser();
  await signInToGitHub(context, user);

  await page.goto('/behavioral/stories');
  await page.getByRole('button', { name: 'New story' }).click();
  await page.getByLabel('Title').fill('The billing export');
  await page.getByRole('button', { name: 'Ownership', exact: true }).click();
  await page.getByLabel('Action', { exact: true }).fill(ACTION);
  await expect(page.locator('app-story').getByText('Saved on this device only.')).toBeVisible();

  const firstUpload = uploaded(page);
  const accessToken = await signIn(page);
  await firstUpload;
  await page.goto('/behavioral/stories');
  await expect(page.locator('app-story-bank').getByText('Synced to your account.')).toBeVisible();

  const other = await browser.newContext({ baseURL: new URL(page.url()).origin });
  try {
    await other.addInitScript(() => localStorage.setItem('CapacitorStorage.grasp.pilotNotice.v1', new Date().toISOString()));
    await other.setExtraHTTPHeaders({ 'x-forwarded-for': newClientIp() });
    await signInToGitHub(other, user);
    const second = await other.newPage();
    await signIn(second);
    await second.goto('/behavioral/stories');
    await expect(second.getByRole('link', { name: /The billing export/ })).toContainText('Ownership');
    await second.getByRole('link', { name: /The billing export/ }).click();
    await expect(second.getByLabel('Action', { exact: true })).toHaveValue(ACTION);

    await page.getByRole('link', { name: /The billing export/ }).click();
    const edited = uploaded(page);
    await page.getByLabel('Title').fill('The billing export runbook');
    await edited;
    expect((await exportedStories(page, accessToken)).map((s) => s.title)).toEqual(['The billing export runbook']);

    await second.goto('/behavioral/stories');
    await second.getByRole('link', { name: /The billing export runbook/ }).click();
    const deleted = uploaded(second);
    await second.getByRole('button', { name: 'Delete story' }).click();
    await deleted;
    await expect(second.getByRole('heading', { name: '0 of 13 competencies have a story' })).toBeVisible();

    await page.goto('/behavioral/stories');
    await expect(page.getByRole('heading', { name: '0 of 13 competencies have a story' })).toBeVisible();
    await expect(page.getByRole('link', { name: /The billing export/ })).toHaveCount(0);
    expect(await exportedStories(page, accessToken)).toEqual([expect.objectContaining({ title: '', deleted: true })]);
  } finally {
    await other.close();
  }
});
