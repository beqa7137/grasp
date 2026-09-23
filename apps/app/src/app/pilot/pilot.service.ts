import { Injectable, signal } from '@angular/core';
import { Preferences } from '@capacitor/preferences';

const NOTICE_KEY = 'grasp.pilotNotice.v1';

@Injectable({ providedIn: 'root' })
export class PilotService {
  readonly noticeOpen = signal(false);
  readonly feedbackOpen = signal(false);

  async init(): Promise<void> {
    const { value } = await Preferences.get({ key: NOTICE_KEY });
    this.noticeOpen.set(!value);
  }

  async acknowledgeNotice(): Promise<void> {
    this.noticeOpen.set(false);
    await Preferences.set({ key: NOTICE_KEY, value: new Date().toISOString() });
  }
}
