import { Injectable, signal } from '@angular/core';
import { Preferences } from '@capacitor/preferences';

export type LibraryView = 'pattern' | 'mixed';

const VIEW_KEY = 'grasp.problems.view';
const TAGS_KEY = 'grasp.problems.patternTags';
// The web build's Preferences store, so the web reads its own value; the native apps keep a copy there.
const VIEW_MIRROR = `CapacitorStorage.${VIEW_KEY}`;
const TAGS_MIRROR = `CapacitorStorage.${TAGS_KEY}`;

// Not `device-prefs.ts`: it is in main alone, and a lazy page importing it splits it into a first-paint file of its own.
function mirrored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/**
 * The library's two device preferences (REDESIGN.md 4.2, 2.9): the view, and whether pattern tags show on rows that would
 * otherwise hide them. The localStorage mirror gives the first render the stored view, so a Mixed list never opens grouped.
 */
@Injectable({ providedIn: 'root' })
export class LibraryPrefsService {
  readonly view = signal<LibraryView>(mirrored(VIEW_MIRROR) === 'mixed' ? 'mixed' : 'pattern');
  readonly showTags = signal(mirrored(TAGS_MIRROR) === 'on');

  constructor() {
    void Promise.all([Preferences.get({ key: VIEW_KEY }), Preferences.get({ key: TAGS_KEY })]).then(
      ([{ value: view }, { value: tags }]) => {
        if (view) this.view.set(view === 'mixed' ? 'mixed' : 'pattern');
        if (tags) this.showTags.set(tags === 'on');
      },
    );
  }

  setView(view: LibraryView): void {
    this.view.set(view);
    this.write(VIEW_KEY, VIEW_MIRROR, view);
  }

  setShowTags(on: boolean): void {
    this.showTags.set(on);
    this.write(TAGS_KEY, TAGS_MIRROR, on ? 'on' : 'off');
  }

  private write(key: string, mirror: string, value: string): void {
    try {
      localStorage.setItem(mirror, value);
    } catch {
      // Blocked storage only costs the first render after a reload, which then follows Preferences.
    }
    void Preferences.set({ key, value });
  }
}
