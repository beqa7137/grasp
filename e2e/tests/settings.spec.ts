import { readFile } from 'node:fs/promises';
import { expect, synced, test } from './fixtures';

test('study settings sync as events', async ({ page }) => {
  await page.goto('/settings');
  const sync = synced(page, 'settings.changed');
  await page.getByRole('radiogroup', { name: 'Daily session' }).getByRole('radio', { name: '20 min' }).click();
  await sync;
  await page.reload();
  await expect(page.getByRole('radiogroup', { name: 'Daily session' }).getByRole('radio', { name: '20 min' })).toBeChecked();
});

test('learners can export their data, then delete it', async ({ page }, testInfo) => {
  await page.goto('/settings');
  const sync = synced(page, 'settings.changed');
  await page.getByRole('radiogroup', { name: 'New cards per day' }).getByRole('radio', { name: '5', exact: true }).click();
  await sync;

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export' }).click();
  const file = testInfo.outputPath('export.json');
  await (await download).saveAs(file);
  const exported = JSON.parse(await readFile(file, 'utf8'));
  expect(JSON.stringify(exported)).toContain('settings.changed');

  const learnerLine = page.getByText(/Learner [0-9a-f]{8} ·/);
  const before = await learnerLine.textContent();
  await page.getByRole('button', { name: 'Delete…' }).click();
  const confirm = page.getByRole('alertdialog');
  await expect(confirm).toBeVisible();
  await confirm.getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByText('Your data was deleted. You are starting fresh.')).toBeVisible();
  await expect(learnerLine).not.toHaveText(before!);
  await expect(page.getByRole('radiogroup', { name: 'New cards per day' }).getByRole('radio', { name: '10', exact: true })).toBeChecked();
});

test('feedback reaches the team with the screen it came from', { tag: '@nav' }, async ({ page }) => {
  await page.goto('/learn');
  const more = page.locator('app-learn').getByRole('button', { name: 'More options' });
  await more.focus();
  await page.keyboard.press('Enter');
  await page.locator('ion-popover').getByRole('button', { name: 'Send feedback' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Send feedback' })).toBeVisible();
  await page.getByRole('radio', { name: 'Idea' }).click();
  await page.getByRole('textbox', { name: 'Your feedback' }).fill('End-to-end test: an idea from the learn page.');
  await page.getByRole('radiogroup', { name: 'Usefulness from 1 to 5' }).getByRole('radio', { name: '4' }).click();

  const sent = page.waitForResponse((r) => r.request().method() === 'POST' && r.url().endsWith('/api/feedback'));
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  const response = await sent;
  expect(response.status()).toBe(201);
  expect(response.request().postDataJSON()).toMatchObject({ kind: 'idea', rating: 4, context: { route: '/learn' } });
  await expect(page.getByRole('heading', { name: 'Thank you' })).toBeVisible();
  await page.getByRole('button', { name: 'Close' }).click();
  await expect(page.getByRole('heading', { name: 'Thank you' })).toBeHidden();
  await expect(more).toBeFocused();
});

test('a tap on the Learn menu gives focus back to it when feedback closes', { tag: '@nav' }, async ({ page }) => {
  await page.goto('/learn');
  const more = page.locator('app-learn').getByRole('button', { name: 'More options' });
  await more.click();
  await page.locator('ion-popover').getByRole('button', { name: 'Send feedback' }).click();
  const sheet = page.locator('app-feedback-sheet');
  await expect(sheet.getByRole('heading', { name: 'Send feedback' })).toBeVisible();
  await sheet.getByRole('button', { name: 'Cancel' }).click();
  await expect(sheet).toHaveCount(0);
  await expect(more).toBeFocused();
});

test('Settings sends feedback too, from its own screen', async ({ page }) => {
  await page.goto('/settings');
  await page.getByRole('button', { name: 'Feedback', exact: true }).click();
  const sheet = page.locator('app-feedback-sheet');
  await expect(sheet).toContainText("Includes the screen you're on (/settings)");
  await sheet.getByRole('button', { name: 'Cancel' }).click();
  await expect(sheet).toHaveCount(0);
});

test('settings explain what is stored', { tag: '@smoke' }, async ({ page }) => {
  await page.goto('/settings');
  await expect(page.getByRole('heading', { name: 'Your data' })).toBeVisible();
  await expect(page.getByText(/your behavioral stories stay on this device until you sign in/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Export' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Delete…' })).toBeVisible();
  await expect(
    page.getByText(
      /behavioral answers, including any story you start an answer from, are sent to OpenAI's GPT-6 Luna through Vercel's AI Gateway/,
    ),
  ).toBeVisible();
});
