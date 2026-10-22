import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

const LOOKS = {
  light: { dark: false, scheme: 'light', themeColor: '#f4f5f9', accent: '#5846dc', background: 'rgb(244, 245, 249)' },
  dark: { dark: true, scheme: 'dark', themeColor: '#0b0d12', accent: '#9d8cff', background: 'rgb(11, 13, 18)' },
};

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
    await page.goto('/today');
    await expect.poll(() => look(page)).toEqual(LOOKS.dark);

    await page.emulateMedia({ colorScheme: 'light' });
    await expect.poll(() => look(page)).toEqual(LOOKS.light);
  });

  test('Light, chosen from the keyboard, overrides a dark device and stays after a reload', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/today/settings');
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
    await page.goto('/today');
    expect(await look(page)).toEqual(LOOKS.light);
    await expect(page.locator('app-root')).toBeEmpty();
  });
});

const SECONDARY = '.g-btn:not(.primary, .ghost, [aria-pressed="true"], [aria-checked="true"]):not(:disabled)';

/**
 * The relative luminance each shown match paints, and the card surface's. A translucent background shows what is under
 * it, so it is laid over each ancestor down to the first opaque one.
 */
function luminances(page: Page, selector: string) {
  return page.evaluate((query) => {
    type Rgba = [number, number, number, number];
    const rgba = (css: string): Rgba => {
      const [r, g, b, a = 1] = (css.match(/[\d.]+/g) ?? []).map(Number);
      return [r, g, b, a];
    };
    const painted = (element: Element): number[] => {
      const layers: Rgba[] = [];
      for (let e: Element | null = element; e; e = e.parentElement) {
        const layer = rgba(getComputedStyle(e).backgroundColor);
        if (layer[3] > 0) layers.unshift(layer);
        if (layer[3] === 1) break;
      }
      return layers.reduce<number[]>((under, [r, g, b, a]) => [r, g, b].map((c, i) => c * a + under[i] * (1 - a)), [255, 255, 255]);
    };
    const luminance = (element: Element) => {
      const [r, g, b] = painted(element).map((c) => ((c /= 255) <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const probe = document.body.appendChild(document.createElement('div'));
    probe.style.background = 'var(--g-surface)';
    const surface = luminance(probe);
    probe.remove();
    const shown = [...document.querySelectorAll(query)].filter((e) => e.checkVisibility() && e.closest('.ion-page:not(.ion-page-hidden)'));
    return { surface, shown: shown.map((e) => ({ text: e.textContent?.trim(), luminance: luminance(e) })) };
  }, selector);
}

test.describe('in light', () => {
  test.use({ theme: 'light' });

  // REDESIGN.md 3.2: a secondary button on a sunken grey read as disabled on the white card.
  for (const path of ['/behavioral/conflict', '/today/settings', '/design/topics/sd-load-balancing']) {
    test(`secondary buttons are not darker than the card on ${path}`, async ({ page }) => {
      await page.goto(path);
      await expect(page.locator(SECONDARY).first()).toBeVisible();
      const { surface, shown } = await luminances(page, SECONDARY);
      expect(shown.length).toBeGreaterThan(0);
      expect(shown.filter((b) => b.luminance < surface - 1e-6).map((b) => b.text)).toEqual([]);
    });
  }

  // Raised choices became as white as the card, so a key cap painted with the card's colour vanished into its choice.
  test("an answer choice's number key keeps a fill of its own", async ({ page }) => {
    await page.goto('/coding/patterns/binary-search');
    await expect(page.locator('g-question-card .choice .key').first()).toBeVisible();
    const choices = (await luminances(page, 'g-question-card .choice')).shown;
    const keys = (await luminances(page, 'g-question-card .choice .key')).shown;
    expect(keys.length).toBe(choices.length);
    const contrast = (a: number, b: number) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    for (const [i, key] of keys.entries()) expect(contrast(key.luminance, choices[i].luminance)).toBeGreaterThan(1.1);
  });
});

test.describe('in dark', () => {
  test.use({ theme: 'dark' });

  // Dark keeps the raised step apart from the card, so a control with the raised shadow on the card's fill stood out.
  test("the Lab's palette buttons take the raised fill", async ({ page }) => {
    await page.goto('/design/missions/first-scale-up');
    // Phones show the palette as a row of chips, the desktop Lab (R21) as a column of tiles.
    await expect(page.locator('.palette .tool, .tool-tile').first()).toBeVisible();
    const { raised, tools } = await page.evaluate(() => {
      const probe = document.body.appendChild(document.createElement('div'));
      probe.style.background = 'var(--g-raised)';
      const fill = getComputedStyle(probe).backgroundColor;
      probe.remove();
      return {
        raised: fill,
        tools: [...document.querySelectorAll('.palette .tool, .tool-tile')].map((e) => getComputedStyle(e).backgroundColor),
      };
    });
    expect(tools.length).toBeGreaterThan(0);
    expect(new Set(tools)).toEqual(new Set([raised]));
  });
});
