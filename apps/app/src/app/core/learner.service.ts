import { Injectable, signal } from '@angular/core';
import { Preferences } from '@capacitor/preferences';

const KEY = 'grasp.learnerId';

@Injectable({ providedIn: 'root' })
export class LearnerService {
  private readonly current = signal('');
  readonly id = this.current.asReadonly();

  async init(): Promise<void> {
    const { value } = await Preferences.get({ key: KEY });
    const id = value ?? crypto.randomUUID();
    if (!value) await Preferences.set({ key: KEY, value: id });
    this.current.set(id);
  }

  /** Starts over as a brand-new anonymous learner. */
  async reset(): Promise<void> {
    await Preferences.remove({ key: KEY });
    await this.init();
  }
}
