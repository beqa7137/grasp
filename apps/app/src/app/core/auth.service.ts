import { Injectable, computed, inject, signal } from '@angular/core';
import { Preferences } from '@capacitor/preferences';
import { ApiError, ApiService } from './api.service';
import { AuthTokens } from './auth-tokens.service';
import { LearnerService } from './learner.service';
import { ProgressService } from './progress.service';

const REFRESH_KEY = 'grasp.auth.refresh';
const USER_KEY = 'grasp.auth.user';

export interface AccountUser {
  id: string;
  email: string;
}

interface Session {
  accessToken: string;
  refreshToken: string;
  user: AccountUser;
  learnerId: string;
}

/**
 * Optional accounts on top of local-first progress. Signing in folds this device's anonymous progress
 * into the account; signing out leaves the progress in the account and starts the device fresh.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly api = inject(ApiService);
  private readonly tokens = inject(AuthTokens);
  private readonly learner = inject(LearnerService);
  private readonly progress = inject(ProgressService);
  private refreshing: Promise<boolean> | null = null;

  readonly user = signal<AccountUser | null>(null);
  readonly signedIn = computed(() => this.user() !== null);
  readonly signInRequired = this.tokens.signInRequired.asReadonly();
  readonly emailAvailable = signal<boolean | null>(null);

  async init(): Promise<void> {
    this.tokens.refresher = () => this.refresh();
    const [refresh, user] = await Promise.all([Preferences.get({ key: REFRESH_KEY }), Preferences.get({ key: USER_KEY })]);
    if (!refresh.value) return;
    if (user.value) this.user.set(JSON.parse(user.value) as AccountUser);
    // Not awaited: startup must not wait on the network. Requests that need the token retry after it.
    void this.refresh();
  }

  async loadAvailability(): Promise<void> {
    try {
      this.emailAvailable.set((await this.api.get<{ email: boolean }>('/auth/config')).email);
    } catch {
      this.emailAvailable.set(null);
    }
  }

  startEmail(email: string): Promise<unknown> {
    return this.api.post('/auth/email/start', { email });
  }

  async verifyEmail(email: string, code: string): Promise<void> {
    // Push offline progress first so the server can fold it into the account.
    if (!this.tokens.signInRequired()) await this.progress.flush();
    const session = await this.api.post<Session>('/auth/email/verify', { email, code });
    if (this.tokens.signInRequired() && session.learnerId !== this.learner.id()) await this.progress.clearLocal();
    await this.adopt(session);
    await this.progress.resync();
  }

  /** Single-flight: concurrent 401s share one refresh. Keeps the session on network errors. */
  refresh(): Promise<boolean> {
    this.refreshing ??= (async () => {
      const { value } = await Preferences.get({ key: REFRESH_KEY });
      if (!value) return false;
      try {
        await this.adopt(await this.api.post<Session>('/auth/refresh', { refreshToken: value }));
        return true;
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) await this.expire();
        return false;
      }
    })().finally(() => (this.refreshing = null));
    return this.refreshing;
  }

  async signOut(): Promise<void> {
    const { value } = await Preferences.get({ key: REFRESH_KEY });
    if (value) await this.api.post('/auth/logout', { refreshToken: value }).catch(() => undefined);
    await this.forget();
    await this.progress.clearLocal();
    await this.learner.reset();
  }

  /** After the account was deleted on the server: drop the session and start fresh. */
  async forget(): Promise<void> {
    this.tokens.accessToken.set(null);
    this.tokens.signInRequired.set(false);
    this.user.set(null);
    await Promise.all([Preferences.remove({ key: REFRESH_KEY }), Preferences.remove({ key: USER_KEY })]);
  }

  private async adopt(session: Session) {
    this.tokens.accessToken.set(session.accessToken);
    this.tokens.signInRequired.set(false);
    this.user.set(session.user);
    await Promise.all([
      Preferences.set({ key: REFRESH_KEY, value: session.refreshToken }),
      Preferences.set({ key: USER_KEY, value: JSON.stringify(session.user) }),
    ]);
    if (session.learnerId !== this.learner.id()) await this.learner.setId(session.learnerId);
  }

  /** The session ended on the server; keep local progress but ask to sign in again before syncing. */
  private async expire() {
    await this.forget();
    this.tokens.signInRequired.set(true);
  }
}
