import { Injectable, signal } from '@angular/core';
import { mirrorDevicePref, readDevicePref, writeDevicePref } from './device-prefs';
import { MOTION_KEY, MOTION_MIRROR_KEY, applyMotion, motionPreference, type MotionPreference } from './motion';

/**
 * The Motion setting: System follows the device's reduce motion setting, Reduced and Full override it. Stored per device.
 * CSS motion follows a change at once; Ionic's page transitions follow it after a restart (`bootMotion`).
 */
@Injectable({ providedIn: 'root' })
export class MotionPreferenceService {
  private readonly chosen = signal<MotionPreference>('system');
  private changed = false;
  readonly preference = this.chosen.asReadonly();

  /** Reads the stored choice and puts `data-motion` and the boot mirror back in line with it, as ThemeService.init does. */
  async init(): Promise<void> {
    const saved = motionPreference(await readDevicePref(MOTION_KEY));
    if (this.changed) return;
    this.chosen.set(saved);
    applyMotion(document.documentElement, saved);
    mirrorDevicePref(MOTION_MIRROR_KEY, saved === 'system' ? null : saved);
  }

  async setPreference(preference: MotionPreference): Promise<void> {
    this.changed = true;
    this.chosen.set(preference);
    applyMotion(document.documentElement, preference);
    await writeDevicePref(MOTION_KEY, preference === 'system' ? null : preference, MOTION_MIRROR_KEY);
  }
}
