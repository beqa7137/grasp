import { InjectionToken } from '@angular/core';
import { SystemBars, SystemBarsStyle } from '@capacitor/core';

export const DARK_CLASS = 'ion-palette-dark';
export const SWITCHING_CLASS = 'g-theme-switching';

export type SystemBarsApi = Pick<typeof SystemBars, 'setStyle'>;
export const SYSTEM_BARS = new InjectionToken<SystemBarsApi>('system bars', {
  // A wrapper, not the plugin itself: its proxy answers every property, so the injector would call its ngOnDestroy.
  factory: () => ({ setStyle: (options) => SystemBars.setStyle(options) }),
});

/**
 * Reads theme-color back from the stylesheet, so only the page shell repeats the hex values. Holds colour transitions
 * off for two frames.
 */
export function applyThemeToDocument(dark: boolean): void {
  const root = document.documentElement;
  root.classList.add(SWITCHING_CLASS);
  root.classList.toggle(DARK_CLASS, dark);
  document.querySelector('meta[name="color-scheme"]')?.setAttribute('content', dark ? 'dark' : 'light');
  const background = getComputedStyle(root).getPropertyValue('--g-bg').trim();
  if (background) document.querySelector('meta[name="theme-color"]')?.setAttribute('content', background);
  requestAnimationFrame(() => requestAnimationFrame(() => root.classList.remove(SWITCHING_CLASS)));
}

export function applyThemeToSystemBars(dark: boolean, bars: SystemBarsApi): Promise<void> {
  // SystemBarsStyle.Dark means light icons, for a dark background.
  return bars.setStyle({ style: dark ? SystemBarsStyle.Dark : SystemBarsStyle.Light });
}
