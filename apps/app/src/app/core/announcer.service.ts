import { DestroyRef, Injectable, inject, signal } from '@angular/core';

/** Clearing the region first and filling it a moment later makes screen readers announce a repeated message too. */
const REFILL_DELAY_MS = 100;

/**
 * Tells screen readers about a change they would not otherwise hear. A page provides its own and shows `message` in a
 * status region of its own, so Ionic hides the region with the page: a message then never lingers on, or reaches, the
 * page the learner has moved to.
 */
@Injectable()
export class AnnouncerService {
  private readonly text = signal('');
  readonly message = this.text.asReadonly();
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    inject(DestroyRef).onDestroy(() => clearTimeout(this.timer));
  }

  announce(message: string): void {
    clearTimeout(this.timer);
    this.text.set('');
    this.timer = setTimeout(() => this.text.set(message), REFILL_DELAY_MS);
  }
}
