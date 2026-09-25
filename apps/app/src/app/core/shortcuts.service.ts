import { Injectable, signal } from '@angular/core';
import { Preferences } from '@capacitor/preferences';
import { isCharacterKey, isKeyForPage } from './page-keys';

const OFF_KEY = 'grasp.shortcuts.off';

/**
 * Single-character page shortcuts, such as 1–4 to answer, can be turned off for speech input, which types words that
 * would fire them. Stored per device.
 */
@Injectable({ providedIn: 'root' })
export class ShortcutsService {
  readonly characterKeys = signal(true);

  async init(): Promise<void> {
    const { value } = await Preferences.get({ key: OFF_KEY });
    this.characterKeys.set(!value);
  }

  async setCharacterKeys(on: boolean): Promise<void> {
    this.characterKeys.set(on);
    await (on ? Preferences.remove({ key: OFF_KEY }) : Preferences.set({ key: OFF_KEY, value: 'off' }));
  }

  handles(host: Element, e: KeyboardEvent): boolean {
    return isKeyForPage(host, e) && (this.characterKeys() || !isCharacterKey(e));
  }
}
