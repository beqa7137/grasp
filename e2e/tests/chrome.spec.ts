import type { Locator, Page } from '@playwright/test';
import { expect, test } from './fixtures';

/** REDESIGN.md 5.2 R7's checks on the pages it migrated: no nested panel, no system checkbox, no resize grip. */
async function expectSkinned(scope: Locator) {
  await expect(scope.locator('.panel .panel')).toHaveCount(0);
  const looks = await scope.evaluateAll((roots) =>
    roots.flatMap((root) => [
      ...[...root.querySelectorAll('textarea')].map((t) => `textarea resize ${getComputedStyle(t).resize}`),
      ...[...root.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')].map((box) => {
        const style = getComputedStyle(box);
        return `checkbox ${style.appearance === 'none' || style.opacity === '0' ? 'skinned' : 'system'}`;
      }),
    ]),
  );
  expect(looks.filter((look) => look.endsWith(' system') || (look.startsWith('textarea') && !look.endsWith(' none')))).toEqual([]);
  return looks;
}

const toolbarTitle = (page: Page) => page.locator('app-settings > ion-header ion-title');
const largeTitle = (page: Page) => page.locator('app-settings g-page-header ion-title');

test('Settings shows its title once, large at the top and in the toolbar once scrolled', async ({ page }) => {
  await page.goto('/today/settings');
  const h1 = page.getByRole('heading', { level: 1 });
  await expect(h1).toHaveText('Settings');
  await expect(h1).toBeVisible();
  await expect(largeTitle(page)).not.toHaveAttribute('aria-hidden');
  await expect(toolbarTitle(page)).toHaveAttribute('aria-hidden', 'true');
  await expect(toolbarTitle(page)).toHaveCSS('opacity', '0');
  await expect(page.getByRole('banner')).toHaveCount(1);

  await page.getByRole('heading', { name: 'Your data' }).scrollIntoViewIfNeeded();
  await expect(toolbarTitle(page)).toHaveCSS('opacity', '1');
  await expect(toolbarTitle(page)).not.toHaveAttribute('aria-hidden');
  await expect(largeTitle(page)).toHaveAttribute('aria-hidden', 'true');
  await expect(page.getByRole('banner')).toHaveCount(1);
});

test('Settings, the feedback dialog and the drill summary use the skins and nest no panel', async ({ page }) => {
  await page.goto('/today/settings');
  expect(await expectSkinned(page.locator('app-settings'))).toContain('checkbox skinned');

  await page.getByRole('button', { name: 'Feedback', exact: true }).click();
  const sheet = page.locator('app-feedback-sheet');
  await expect(sheet.getByRole('radiogroup', { name: 'Kind of feedback' })).toBeVisible();
  expect(await expectSkinned(sheet)).toEqual(['textarea resize none']);
  const field = sheet.getByRole('textbox', { name: 'Your feedback' });
  const before = (await field.boundingBox())!.height;
  await field.fill(Array.from({ length: 12 }, (_, i) => `Line ${i + 1}`).join('\n'));
  await expect.poll(async () => (await field.boundingBox())!.height, 'the field grows with its text').toBeGreaterThan(before);
  await sheet.getByRole('button', { name: 'Cancel' }).click();

  await page.goto('/coding/patterns/binary-search/drill');
  const summary = page.getByText(/practice answers · \d+ min/);
  for (let answered = 0; !(await summary.isVisible()); answered++) {
    expect(answered).toBeLessThan(20);
    await page.locator('g-question-card .choice').first().click();
    await page.getByRole('button', { name: /^Next/ }).click();
    await expect(summary.or(page.locator('g-question-card .choice:enabled').first())).toBeVisible();
  }
  await expect(page.locator('app-drill').getByRole('heading', { name: /^\d+\/\d+$/ })).toBeFocused();
  await expectSkinned(page.locator('app-drill'));
});

test.describe('first visit', () => {
  test.use({ pilotNoticeSeen: false });

  test('the pilot welcome nests no panel', async ({ page }) => {
    await page.goto('/today');
    const notice = page.locator('app-pilot-notice');
    await expect(notice.getByRole('heading', { name: 'Welcome to the Grasp pilot' })).toBeVisible();
    await expectSkinned(notice);
  });
});
