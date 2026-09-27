import { Injectable, computed, inject, signal } from '@angular/core';
import { Preferences } from '@capacitor/preferences';
import { ToastController } from '@ionic/angular';
import { ApiError, ApiService } from './api.service';
import { AuthTokens } from './auth-tokens.service';
import { LearnerService } from './learner.service';
import { ProgressService } from './progress.service';
import { type GitHubCredential, SocialSignInService } from './social-sign-in.service';

const REFRESH_KEY = 'grasp.auth.refresh';
const USER_KEY = 'grasp.auth.user';

export type SignInProvider = 'google' | 'github';
export const SIGN_IN_PROVIDERS: readonly SignInProvider[] = ['google', 'github'];

export interface AccountUser {
  id: string;
  email: string;
}

export interface IdentitySummary {
  provider: SignInProvider;
  email: string | null;
  linkedAt: string;
}

interface Session {
  accessToken: string;
  refreshToken: string;
  user: AccountUser;
  learnerId: string;
  deviceLearnerErased?: true;
}

type ProviderCredential = { idToken: string; nonce: string } | GitHubCredential;

/**
 * Optional accounts on top of local-first progress, signed in with Google or GitHub. Signing in folds
 * this device's anonymous progress into the account; signing out leaves the progress in the account
 * and starts the device fresh. Failed requests reject with the API's `ApiError` and its `code`.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly api = inject(ApiService);
  private readonly tokens = inject(AuthTokens);
  private readonly learner = inject(LearnerService);
  private readonly progress = inject(ProgressService);
  private readonly social = inject(SocialSignInService);
  private readonly toasts = inject(ToastController);
  private refreshing: Promise<boolean> | null = null;
  private recoveringErased: Promise<void> | null = null;
  private readonly noticedErasedLearners = new Set<string>();
  private endingSession = false;

  readonly user = signal<AccountUser | null>(null);
  readonly signedIn = computed(() => this.user() !== null);
  readonly signInRequired = this.tokens.signInRequired.asReadonly();
  /** The providers this device can sign in with; null until known. */
  readonly providers = signal<SignInProvider[] | null>(null);
  /** Whether the last attempt to learn the providers failed; `providers` stays null then. */
  readonly providersFailed = signal(false);
  /** The signed-in account's linked providers; null until loaded. */
  readonly identities = signal<IdentitySummary[] | null>(null);

  async init(): Promise<void> {
    this.tokens.refresher = () => this.renewSession();
    this.tokens.learnerRetired = (code, learnerId) => this.recoverRetiredLearner(code, learnerId);
    const [refresh, user] = await Promise.all([Preferences.get({ key: REFRESH_KEY }), Preferences.get({ key: USER_KEY })]);
    if (!refresh.value) return;
    if (user.value) this.user.set(JSON.parse(user.value) as AccountUser);
    // Not awaited: startup must not wait on the network. Requests that need the token retry after it.
    void this.refresh();
  }

  async loadProviders(): Promise<void> {
    this.providersFailed.set(false);
    try {
      const config = await this.social.providers();
      const available = SIGN_IN_PROVIDERS.filter((provider) => config[provider] !== null);
      this.providers.set(available);
      if (available.length) this.social.prepare();
    } catch {
      this.providers.set(null);
      this.providersFailed.set(true);
    }
  }

  async loadIdentities(): Promise<void> {
    if (!this.signedIn()) return;
    try {
      this.identities.set((await this.api.get<{ identities: IdentitySummary[] }>('/auth/me')).identities);
    } catch {
      // Keeps whatever was shown; Settings loads them again next time it opens.
    }
  }

  /** Resolves false when the person cancelled at the provider. */
  async signIn(provider: SignInProvider): Promise<boolean> {
    const credential = await this.credential(provider);
    if (!credential) return false;
    await this.finishSignIn(() => this.api.post<Session>(`/auth/${provider}`, credential));
    await this.loadIdentities();
    return true;
  }

  /** Resolves false when the person cancelled. */
  async connect(provider: SignInProvider): Promise<boolean> {
    const credential = await this.credential(provider);
    if (!credential) return false;
    const { identities } = await this.api.post<{ identities: IdentitySummary[] }>(`/auth/${provider}/link`, credential);
    this.identities.set(identities);
    return true;
  }

  refresh(): Promise<boolean> {
    return this.renewSession().catch(() => false);
  }

  /** Share renewal across callers; temporary failures reach the requesting page without ending the session. */
  private renewSession(): Promise<boolean> {
    if (this.endingSession) return Promise.resolve(false);
    this.refreshing ??= (async () => {
      const { value } = await Preferences.get({ key: REFRESH_KEY });
      if (!value) return false;
      try {
        await this.adopt(await this.api.post<Session>('/auth/refresh', { refreshToken: value }));
        return true;
      } catch (e) {
        if (!(e instanceof ApiError && e.status === 401)) throw e;
        await this.expire();
        return false;
      }
    })().finally(() => (this.refreshing = null));
    return this.refreshing;
  }

  async signOut(): Promise<void> {
    this.endingSession = true;
    try {
      await this.refreshing?.catch(() => false);
      const { value } = await Preferences.get({ key: REFRESH_KEY });
      if (!value && this.tokens.accessToken()) throw new Error('The session cannot be revoked without its refresh token');
      if (value) await this.api.post('/auth/logout', { refreshToken: value });
      await this.clearDevice();
    } finally {
      this.endingSession = false;
    }
  }

  async startFreshAfterDeletion(): Promise<void> {
    this.endingSession = true;
    try {
      await this.refreshing?.catch(() => false);
      await this.clearDevice();
    } finally {
      this.endingSession = false;
    }
  }

  private async forget(): Promise<void> {
    this.tokens.accessToken.set(null);
    this.tokens.signInRequired.set(false);
    this.user.set(null);
    this.identities.set(null);
    await Promise.all([Preferences.remove({ key: REFRESH_KEY }), Preferences.remove({ key: USER_KEY })]);
  }

  private async recoverRetiredLearner(code: 'learner_erased' | 'learner_moved', learnerId: string): Promise<void> {
    if (this.learner.id() !== learnerId) return;
    if (code === 'learner_moved') {
      await this.learner.reload();
      const { value } = await Preferences.get({ key: REFRESH_KEY });
      if (value) await this.refresh();
      return;
    }
    this.recoveringErased ??= (async () => {
      await this.startFreshAfterDeletion();
      await this.showErasedNotice(learnerId);
    })().finally(() => (this.recoveringErased = null));
    await this.recoveringErased;
  }

  private async showErasedNotice(learnerId: string): Promise<void> {
    if (this.noticedErasedLearners.has(learnerId)) return;
    this.noticedErasedLearners.add(learnerId);
    const toast = await this.toasts.create({
      message: "This learner's data was deleted on another device.",
      duration: 3500,
      position: 'bottom',
    });
    await toast.present();
  }

  private async clearDevice(): Promise<void> {
    await this.forget();
    await this.progress.clearLocal();
    await this.learner.reset();
  }

  private async credential(provider: SignInProvider): Promise<ProviderCredential | null> {
    if (provider === 'github') return this.social.github();
    const { nonce } = await this.api.post<{ nonce: string }>('/auth/google/nonce');
    const idToken = await this.social.google(nonce);
    return idToken ? { idToken, nonce } : null;
  }

  private async finishSignIn(request: () => Promise<Session>) {
    // Push offline progress first so the server can fold it into the account.
    if (!this.tokens.signInRequired()) await this.progress.flush();
    const deviceLearnerId = this.learner.id();
    const session = await request();
    const erasedDeviceLearner = session.deviceLearnerErased && this.learner.id() === deviceLearnerId;
    if (erasedDeviceLearner || (this.tokens.signInRequired() && session.learnerId !== this.learner.id())) await this.progress.clearLocal();
    await this.adopt(session);
    if (erasedDeviceLearner) await this.showErasedNotice(deviceLearnerId);
    await this.progress.resync();
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
