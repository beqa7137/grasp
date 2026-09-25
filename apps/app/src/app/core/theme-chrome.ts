import { InjectionToken } from '@angular/core';
import { SystemBars, SystemBarsStyle } from '@capacitor/core';

/** The class Ionic's class palette and our dark tokens both key on. */
export const DARK_CLASS = 'ion-palette-dark';
/** Holds colour transitions off during a live switch (styles.scss). */
export const SWITCHING_CLASS = 'g-theme-switching';

export type SystemBarsApi = Pick<typeof SystemBars, 'setStyle'>;
export const SYSTEM_BARS = new InjectionToken<SystemBarsApi>('system bars', {
  // A wrapper, not the plugin itself: its proxy answers every property, so the injector would call its ngOnDestroy.
  factory: () => ({ setStyle: (options) => SystemBars.setStyle(options) }),
});

/**
 * Shows a resolved theme: the palette class, the color-scheme meta, and a theme-color read back from the stylesheet, so
 * only the page shell repeats the hex values. A live switch holds colour transitions off for two frames.
 */
export function applyThemeToDocument(dark: boolean, { live = false } = {}): void {
  const root = document.documentElement;
  if (live) root.classList.add(SWITCHING_CLASS);
  root.classList.toggle(DARK_CLASS, dark);
  document.querySelector('meta[name="color-scheme"]')?.setAttribute('content', dark ? 'dark' : 'light');
  const background = getComputedStyle(root).getPropertyValue('--g-bg').trim();
  if (background) document.querySelector('meta[name="theme-color"]')?.setAttribute('content', background);
  if (live) requestAnimationFrame(() => requestAnimationFrame(() => root.classList.remove(SWITCHING_CLASS)));
}

/** Status and navigation bar icons that read on the theme's background. */
export function applyThemeToSystemBars(dark: boolean, bars: SystemBarsApi): Promise<void> {
  // SystemBarsStyle.Dark means light icons, for a dark background.
  return bars.setStyle({ style: dark ? SystemBarsStyle.Dark : SystemBarsStyle.Light });
}
