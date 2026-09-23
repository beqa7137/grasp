import { Injectable, signal } from '@angular/core';

/**
 * The current access token and a way to renew it. Kept separate from AuthService so ApiService can
 * use it without a circular dependency.
 */
@Injectable({ providedIn: 'root' })
export class AuthTokens {
  readonly accessToken = signal<string | null>(null);
  /** Set by the server's `sign_in_required` answer: this device's progress now belongs to an account. */
  readonly signInRequired = signal(false);
  refresher: (() => Promise<boolean>) | null = null;
}
