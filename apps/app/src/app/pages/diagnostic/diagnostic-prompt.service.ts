import { Injectable, signal } from '@angular/core';
import { Preferences } from '@capacitor/preferences';

const DISMISSED_KEY = 'grasp.diagnosticPrompt.dismissed';

/** Per device, not synced with progress, like the pilot notice. */
@Injectable({ providedIn: 'root' })
export class DiagnosticPromptService {
  readonly dismissed = signal(false);

  async init(): Promise<void> {
    const { value } = await Preferences.get({ key: DISMISSED_KEY });
    this.dismissed.set(Boolean(value));
  }

  async dismiss(): Promise<void> {
    this.dismissed.set(true);
    await Preferences.set({ key: DISMISSED_KEY, value: new Date().toISOString() });
  }
}
