import { Injectable, signal } from '@angular/core';

/** Request-level auth callbacks live here so ApiService does not depend on AuthService. */
@Injectable({ providedIn: 'root' })
export class AuthTokens {
  readonly accessToken = signal<string | null>(null);
  /** Set by the server's `sign_in_required` answer: this device's progress now belongs to an account. */
  readonly signInRequired = signal(false);
  refresher: (() => Promise<boolean>) | null = null;
  learnerRetired: ((code: 'learner_erased' | 'learner_moved', learnerId: string) => Promise<void>) | null = null;
}
