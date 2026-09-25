/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { DARK_CLASS } from './theme-chrome';

const TOKENS = readFileSync('src/_theme.scss', 'utf8');

/** The --g-bg that one theme's block of _theme.scss sets. */
export function themeBackground(dark: boolean): string | undefined {
  const selector = dark ? `:root.${DARK_CLASS}` : ':root';
  const block = TOKENS.match(new RegExp(`^${selector.replaceAll('.', '\\.')} \\{([^}]*)\\}`, 'm'))?.[1];
  return block?.match(/@include rgb-token\(bg, (#[\da-f]{6})\);/)?.[1];
}

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
