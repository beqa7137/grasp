import { Injectable, signal } from '@angular/core';
import { Preferences } from '@capacitor/preferences';

const KEY = 'grasp.rail.collapsed';
// The web build's Preferences store, read before the first render so a focus route never opens the rail and then shuts it.
const MIRROR = `CapacitorStorage.${KEY}`;

function mirrored(): string | null {
  try {
    return localStorage.getItem(MIRROR);
  } catch {
    return null;
  }
}

/**
 * The "rail collapsed" device preference (REDESIGN.md 2.6, 2.11): whether focus routes show the rail as icons, which they do
 * until the learner expands it there. As `LibraryPrefsService` does, it reads Preferences itself: `device-prefs.ts` is in
 * main alone, and another importer would split it into a first-paint file of its own.
 */
@Injectable({ providedIn: 'root' })
export class RailPrefsService {
  readonly collapsed = signal(mirrored() !== 'off');
  private changed = false;

  constructor() {
    void Preferences.get({ key: KEY }).then(({ value }) => {
      if (value && !this.changed) this.collapsed.set(value !== 'off');
    });
  }

  setCollapsed(collapsed: boolean): void {
    const value = collapsed ? 'on' : 'off';
    this.changed = true;
    this.collapsed.set(collapsed);
    try {
      localStorage.setItem(MIRROR, value);
    } catch {
      // Blocked storage only costs the first render after a reload, which then follows Preferences.
    }
    void Preferences.set({ key: KEY, value });
  }
}
