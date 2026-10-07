import { Injectable, signal } from '@angular/core';
import { readDevicePref, writeDevicePref } from './device-prefs';
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

  constructor() {
    void readDevicePref(MOTION_KEY).then((value) => {
      if (!this.changed) this.chosen.set(motionPreference(value));
    });
  }

  async setPreference(preference: MotionPreference): Promise<void> {
    this.changed = true;
    this.chosen.set(preference);
    applyMotion(document.documentElement, preference);
    await writeDevicePref(MOTION_KEY, preference === 'system' ? null : preference, MOTION_MIRROR_KEY);
  }
}
