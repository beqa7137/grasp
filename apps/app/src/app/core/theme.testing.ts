/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { DARK_CLASS } from './theme-chrome';

const SOURCE = readFileSync('src/_theme.scss', 'utf8');

export const hexChannels = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];

/** The tokens one theme's block of _theme.scss declares, without the --g- prefix and with rgb-token() expanded as the mixin does. */
export function themeTokens(dark: boolean): Map<string, string> {
  const selector = dark ? `:root.${DARK_CLASS}` : ':root';
  const block = SOURCE.match(new RegExp(`^${selector.replaceAll('.', '\\.')} \\{([^}]*)\\}`, 'm'))?.[1];
  if (block === undefined || block.includes('{')) throw new Error(`_theme.scss has no flat ${selector} block to read`);
  const tokens = new Map<string, string>();
  for (const [, name, hex] of block.matchAll(/@include rgb-token\(([\w-]+), (#[\da-f]{6})\);/g)) {
    tokens.set(name, hex);
    tokens.set(`${name}-rgb`, hexChannels(hex).join(', '));
  }
  for (const [, name, value] of block.matchAll(/^\s*--g-([\w-]+):\s*([^;]+);/gm)) tokens.set(name, value);
  return tokens;
}

export const themeBackground = (dark: boolean) => themeTokens(dark).get('bg');

export const LOOKS = {
  light: { dark: false, scheme: 'light', themeColor: themeBackground(false) },
  dark: { dark: true, scheme: 'dark', themeColor: themeBackground(true) },
};

export const pageLook = (doc: Document = document) => ({
  dark: doc.documentElement.classList.contains(DARK_CLASS),
  scheme: doc.querySelector('meta[name="color-scheme"]')?.getAttribute('content'),
  themeColor: doc.querySelector('meta[name="theme-color"]')?.getAttribute('content'),
});

export function resetPage(): void {
  vi.unstubAllGlobals();
  localStorage.clear();
  document.head.innerHTML = '';
  document.documentElement.className = '';
}

/** How a saved choice and the device's mode resolve, which theme-boot.js and ThemeService must agree on. */
export const THEME_RESOLUTIONS: { saved: 'none' | 'light' | 'dark'; device: 'light' | 'dark'; dark: boolean }[] = [
  { saved: 'none', device: 'light', dark: false },
  { saved: 'none', device: 'dark', dark: true },
  { saved: 'light', device: 'light', dark: false },
  { saved: 'light', device: 'dark', dark: false },
  { saved: 'dark', device: 'light', dark: true },
  { saved: 'dark', device: 'dark', dark: true },
];
