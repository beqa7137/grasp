import { Injectable, signal } from '@angular/core';
import { readDevicePref, writeDevicePref } from './device-prefs';

/** Automatic answers on the picture when its cells are big enough to tap (REDESIGN.md 3.8), and from the list when not. */
export type CheckpointPreference = 'auto' | 'picture' | 'list';

export const CHECKPOINTS_KEY = 'grasp.checkpoints';

/**
 * Where a visualizer's pick asks are answered (REDESIGN.md 3.8): on the picture, as a list, or by the size of the picture's
 * cells. Stored per device. Only the
 * player and Settings read it, so it loads with them rather than at start.
 */
@Injectable({ providedIn: 'root' })
export class CheckpointPrefService {
  private readonly chosen = signal<CheckpointPreference>('auto');
  private changed = false;
  readonly preference = this.chosen.asReadonly();

  constructor() {
    void readDevicePref(CHECKPOINTS_KEY).then((value) => {
      if (!this.changed) this.chosen.set(value === 'list' || value === 'picture' ? value : 'auto');
    });
  }

  async setPreference(preference: CheckpointPreference): Promise<void> {
    this.changed = true;
    this.chosen.set(preference);
    await writeDevicePref(CHECKPOINTS_KEY, preference === 'auto' ? null : preference);
  }
}
