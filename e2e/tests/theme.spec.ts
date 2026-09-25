import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

const LOOKS = {
  light: { dark: false, scheme: 'light', themeColor: '#f4f5f9', accent: '#5846dc', background: 'rgb(244, 245, 249)' },
  dark: { dark: true, scheme: 'dark', themeColor: '#0b0d12', accent: '#9d8cff', background: 'rgb(11, 13, 18)' },
};

/** What decides the theme on the page: the palette class, the two metas, a token and the painted background. */
function look(page: Page) {
  return page.evaluate(() => ({
    dark: document.documentElement.classList.contains('ion-palette-dark'),
    scheme: document.querySelector('meta[name="color-scheme"]')?.getAttribute('content'),
    themeColor: document.querySelector('meta[name="theme-color"]')?.getAttribute('content'),
    accent: getComputedStyle(document.documentElement).getPropertyValue('--g-accent').trim(),
    background: getComputedStyle(document.body).backgroundColor,
  }));
}

test.describe('with no theme chosen', () => {
  test.use({ theme: 'system' });

  test('the app follows the device, also when the device switches', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/learn');
    await expect.poll(() => look(page)).toEqual(LOOKS.dark);

    await page.emulateMedia({ colorScheme: 'light' });
    await expect.poll(() => look(page)).toEqual(LOOKS.light);
  });

  test('Light, chosen from the keyboard, overrides a dark device and stays after a reload', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/settings');
    const themes = page.getByRole('radiogroup', { name: 'Theme' });
    await expect(themes.getByRole('radio', { name: 'System' })).toBeChecked();

    await themes.getByRole('radio', { name: 'System' }).focus();
    await page.keyboard.press('ArrowRight');
    await expect(themes.getByRole('radio', { name: 'Light' })).toBeChecked();
    await expect(themes.getByRole('radio', { name: 'Light' })).toBeFocused();
    await expect.poll(() => look(page)).toEqual(LOOKS.light);

    await page.reload();
    await expect(themes.getByRole('radio', { name: 'Light' })).toBeChecked();
    await expect.poll(() => look(page)).toEqual(LOOKS.light);

    await themes.getByRole('radio', { name: 'Light' }).click();
    await page.keyboard.press('ArrowLeft');
    await expect(themes.getByRole('radio', { name: 'System' })).toBeChecked();
    await expect.poll(() => look(page)).toEqual(LOOKS.dark);

    // The device is dark, so only a cleared Light choice lets the reload come back dark.
    await page.reload();
    await expect(themes.getByRole('radio', { name: 'System' })).toBeChecked();
    await expect.poll(() => look(page)).toEqual(LOOKS.dark);
  });
});

test.describe('before the app starts', () => {
  test.use({ theme: 'light', expectedConsoleErrors: [/Failed to load resource/] });

  test('the page already shows the chosen theme, so it never flashes the other one', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.route(/\/main-[\w-]+\.js$/, (route) => route.abort());
    await page.goto('/learn');
    expect(await look(page)).toEqual(LOOKS.light);
    await expect(page.locator('app-root')).toBeEmpty();
  });
});
