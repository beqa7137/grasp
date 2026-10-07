import { Injectable, signal } from '@angular/core';
import { Preferences } from '@capacitor/preferences';

const NOTICE_KEY = 'grasp.pilotNotice.v1';
const MOVED_KEY = 'grasp.movedNote.v1';

@Injectable({ providedIn: 'root' })
export class PilotService {
  readonly noticeOpen = signal(false);
  readonly feedbackOpen = signal(false);
  /** The welcome dialog opened in this session, so no other notice joins it (REDESIGN.md 2.13). */
  welcomedThisSession = false;

  async init(): Promise<void> {
    const { value } = await Preferences.get({ key: NOTICE_KEY });
    this.noticeOpen.set(!value);
    this.welcomedThisSession = !value;
  }

  /**
   * Whether to show "Where things moved" (REDESIGN.md 2.13). It is decided once, on the first launch of the five sections:
   * only a learner who already had progress then (`returning`) sees it, and never in the session the welcome dialog opened.
   */
  async offerMovedNote(returning: boolean): Promise<boolean> {
    if ((await Preferences.get({ key: MOVED_KEY })).value) return false;
    await Preferences.set({ key: MOVED_KEY, value: new Date().toISOString() });
    return returning && !this.welcomedThisSession;
  }

  async acknowledgeNotice(): Promise<void> {
    this.noticeOpen.set(false);
    await Preferences.set({ key: NOTICE_KEY, value: new Date().toISOString() });
  }
}
