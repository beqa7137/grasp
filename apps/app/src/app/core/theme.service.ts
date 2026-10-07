import { DestroyRef, Injectable, InjectionToken, computed, inject, signal } from '@angular/core';
import { mirrorDevicePref, readDevicePref, writeDevicePref } from './device-prefs';
import { NATIVE_PLATFORM } from './platform';
import { SYSTEM_BARS, applyThemeToDocument, applyThemeToSystemBars } from './theme-chrome';

export type ThemePreference = 'system' | 'light' | 'dark';

export const THEME_KEY = 'grasp.theme';
/** Where public/theme-boot.js looks before the app starts; on the web it is where Preferences keeps THEME_KEY. */
export const FIRST_PAINT_KEY = `CapacitorStorage.${THEME_KEY}`;

/** The device's light or dark mode, or null where the browser cannot tell, which counts as dark. */
export const PREFERS_DARK = new InjectionToken<MediaQueryList | null>('prefers dark', {
  factory: () => (typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null),
});

/**
 * System follows the device's light or dark mode as it changes; Light and Dark override it. Stored per device, like the
 * keyboard setting.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly prefersDark = inject(PREFERS_DARK);
  private readonly native = inject(NATIVE_PLATFORM);
  private readonly systemBars = inject(SYSTEM_BARS);
  private readonly systemDark = signal(this.prefersDark?.matches ?? true);
  private readonly chosen = signal<ThemePreference>('system');

  readonly preference = this.chosen.asReadonly();
  readonly dark = computed(() => this.preference() === 'dark' || (this.preference() === 'system' && this.systemDark()));

  constructor() {
    const followDevice = (e: MediaQueryListEvent) => {
      this.systemDark.set(e.matches);
      if (this.preference() === 'system') this.apply();
    };
    this.prefersDark?.addEventListener('change', followDevice);
    inject(DestroyRef).onDestroy(() => this.prefersDark?.removeEventListener('change', followDevice));
  }

  async init(): Promise<void> {
    const value = await readDevicePref(THEME_KEY);
    this.chosen.set(value === 'light' || value === 'dark' ? value : 'system');
    mirrorDevicePref(FIRST_PAINT_KEY, this.stored());
    this.apply();
  }

  async setPreference(preference: ThemePreference): Promise<void> {
    this.chosen.set(preference);
    this.apply();
    await writeDevicePref(THEME_KEY, this.stored(), FIRST_PAINT_KEY);
  }

  private stored() {
    const preference = this.preference();
    return preference === 'system' ? null : preference;
  }

  private apply() {
    const dark = this.dark();
    applyThemeToDocument(dark);
    if (this.native) void applyThemeToSystemBars(dark, this.systemBars);
  }
}
