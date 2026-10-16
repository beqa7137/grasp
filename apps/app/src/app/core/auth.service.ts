import { Injectable, Injector, computed, inject, signal } from '@angular/core';
import { Preferences } from '@capacitor/preferences';
import { ToastController } from '@ionic/angular';
import type { Story } from '@grasp/engine';
import { ApiError, ApiService } from './api.service';
import { AuthTokens } from './auth-tokens.service';
import { LearnerService } from './learner.service';
import { STORY_BANK_KEY, mockHistoryKey, mockLoopKey, moveMockLoop, storyStashKey } from './local-drafts';
import { ProgressService } from './progress.service';
import { type GitHubCredential, SocialSignInService } from './social-sign-in.service';
import { readStoryStash, writeStoryStash } from './story-stash';
import type { StoryBankService } from '../pages/behavioral/story-bank.service';

const REFRESH_KEY = 'grasp.auth.refresh';
const USER_KEY = 'grasp.auth.user';
/** Signing in may merge the device's whole history into the account; failing it at the usual 8 s would send the person through the provider again. */
const SIGN_IN_TIMEOUT_MS = 30_000;

export type SignInProvider = 'google' | 'github';
export const SIGN_IN_PROVIDERS: readonly SignInProvider[] = ['google', 'github'];

/** Signing out would remove stories from this device that the account does not have. */
export class UnsyncedStories extends Error {
  constructor(readonly count: number) {
    super(`${count} ${count === 1 ? 'story has' : 'stories have'} not reached the account`);
  }
}

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
  private readonly injector = inject(Injector);
  private refreshing: Promise<boolean> | null = null;
  private recoveringErased: Promise<void> | null = null;
  private readonly noticedErasedLearners = new Set<string>();
  private endingSession = false;
  private sessionEpoch = 0;
  private sessionWrites: Promise<void> = Promise.resolve();

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
    await this.finishSignIn(() => this.api.post<Session>(`/auth/${provider}`, credential, SIGN_IN_TIMEOUT_MS));
    await this.loadIdentities();
    return true;
  }

  /** Resolves false when the person cancelled. */
  async connect(provider: SignInProvider): Promise<boolean> {
    const credential = await this.credential(provider);
    if (!credential) return false;
    const { identities } = await this.api.post<{ identities: IdentitySummary[] }>(`/auth/${provider}/link`, credential, SIGN_IN_TIMEOUT_MS);
    this.identities.set(identities);
    return true;
  }

  refresh(): Promise<boolean> {
    return this.renewSession().catch(() => false);
  }

  /** Share renewal across callers; temporary failures reach the requesting page without ending the session. */
  private renewSession(): Promise<boolean> {
    if (this.endingSession) return Promise.resolve(false);
    const epoch = this.sessionEpoch;
    this.refreshing ??= (async () => {
      const { value } = await Preferences.get({ key: REFRESH_KEY });
      if (epoch !== this.sessionEpoch) return this.tokens.accessToken() !== null;
      if (!value) return false;
      try {
        const session = await this.api.post<Session>('/auth/refresh', { refreshToken: value });
        if (epoch !== this.sessionEpoch) return this.tokens.accessToken() !== null;
        const learnerChanged = session.learnerId !== this.learner.id();
        if (learnerChanged) this.progress.invalidateSync();
        await this.adopt(session);
        if (learnerChanged && epoch === this.sessionEpoch) void this.progress.resync();
        return this.tokens.accessToken() !== null;
      } catch (e) {
        if (epoch !== this.sessionEpoch) return this.tokens.accessToken() !== null;
        if (!(e instanceof ApiError && e.status === 401)) throw e;
        await this.expire();
        return false;
      }
    })().finally(() => (this.refreshing = null));
    return this.refreshing;
  }

  /** Rejects with `UnsyncedStories`, changing nothing, while stories on this device have not reached the account. */
  async signOut(discardUnsyncedStories = false): Promise<void> {
    this.endingSession = true;
    try {
      await this.refreshing?.catch(() => false);
      const { value } = await Preferences.get({ key: REFRESH_KEY });
      if (!value && this.tokens.accessToken()) throw new Error('The session cannot be revoked without its refresh token');
      const unsynced = value && !discardUnsyncedStories ? (await this.unsyncedStories()).count : 0;
      if (unsynced) throw new UnsyncedStories(unsynced);
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

  /** Loaded on demand to keep it out of first paint; once it exists, the story bank syncs whenever the learner signs in. */
  private async storyBank(): Promise<StoryBankService> {
    const { StoryBankService } = await import('../pages/behavioral/story-bank.service');
    return this.injector.get(StoryBankService);
  }

  /**
   * Uploads what it can first, as the device starts fresh after signing out and the rest would be lost. `checked` is
   * false when the account could not be asked, so the count is every story on the device.
   */
  async unsyncedStories(): Promise<{ count: number; checked: boolean }> {
    await this.refreshing?.catch(() => false);
    let bank: StoryBankService;
    try {
      bank = await this.storyBank();
    } catch {
      // A tab from an older deploy may fail to load the story bank; then every story it holds counts as unsynced.
      const { value } = await Preferences.get({ key: STORY_BANK_KEY });
      const stories = value ? (JSON.parse(value) as { deleted?: true }[]) : [];
      return { count: stories.filter((story) => !story.deleted).length, checked: false };
    }
    const { stories, checked } = await bank.flush();
    return { count: stories.length, checked };
  }

  /**
   * Through the story bank's queue, so a change still pending there cannot write the old bank back afterwards. With a
   * learner, the bank kept aside for them goes too.
   */
  private async clearStories(learnerId?: string): Promise<void> {
    try {
      await (await this.storyBank()).clear(learnerId);
    } catch {
      if (learnerId) await Preferences.remove({ key: storyStashKey(learnerId) });
    }
  }

  /** Stories written after a session ended would otherwise be lost when another account starts the device fresh. */
  private async stashStories(learnerId: string): Promise<void> {
    try {
      await (await this.storyBank()).stash(learnerId);
    } catch {
      const { value } = await Preferences.get({ key: STORY_BANK_KEY });
      if (!value) return;
      // The merge lives with the story bank, so both copies are kept; bringing them back keeps each story's latest change.
      const now = new Date();
      await writeStoryStash(learnerId, [...(await readStoryStash(learnerId, now)), ...(JSON.parse(value) as Story[])], now);
    }
  }

  private async forget(): Promise<number> {
    const epoch = ++this.sessionEpoch;
    this.tokens.accessToken.set(null);
    this.tokens.signInRequired.set(false);
    this.user.set(null);
    this.identities.set(null);
    await this.writeSession(async () => {
      await Promise.all([Preferences.remove({ key: REFRESH_KEY }), Preferences.remove({ key: USER_KEY })]);
    });
    return epoch;
  }

  private async recoverRetiredLearner(code: 'learner_erased' | 'learner_moved', learnerId: string): Promise<void> {
    if (this.learner.id() !== learnerId) return;
    if (code === 'learner_moved') {
      const learnerChanged = await this.learner.reload();
      if (learnerChanged) this.progress.invalidateSync();
      const { value } = await Preferences.get({ key: REFRESH_KEY });
      if (value) await this.refresh();
      if (learnerChanged) void this.progress.resync();
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
    this.progress.invalidateSync();
    const learnerId = this.learner.id();
    await this.forget();
    await this.clearStories(learnerId);
    await Preferences.remove({ key: mockLoopKey(learnerId) });
    await Preferences.remove({ key: mockHistoryKey(learnerId) });
    await this.progress.clearLocal();
    await this.learner.reset();
    this.tokens.signInRequired.set(false);
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
    const startsOver = erasedDeviceLearner || (this.tokens.signInRequired() && session.learnerId !== this.learner.id());
    if (startsOver) {
      if (!erasedDeviceLearner) await this.stashStories(this.learner.id());
      await this.clearStories();
      await this.progress.clearLocal();
    }
    this.sessionEpoch++;
    this.progress.invalidateSync();
    await this.adopt(session);
    if (!startsOver) await moveMockLoop(deviceLearnerId, session.learnerId);
    if (erasedDeviceLearner) await this.showErasedNotice(deviceLearnerId);
    await this.storyBank()
      .then((bank) => bank.restore(session.learnerId))
      .catch(() => undefined);
    await this.progress.resync();
  }

  private async adopt(session: Session) {
    const epoch = this.sessionEpoch;
    this.tokens.accessToken.set(session.accessToken);
    this.tokens.signInRequired.set(false);
    this.user.set(session.user);
    await this.writeSession(async () => {
      if (epoch !== this.sessionEpoch) return;
      await Promise.all([
        Preferences.set({ key: REFRESH_KEY, value: session.refreshToken }),
        Preferences.set({ key: USER_KEY, value: JSON.stringify(session.user) }),
      ]);
      if (epoch === this.sessionEpoch && session.learnerId !== this.learner.id()) await this.learner.setId(session.learnerId);
    });
  }

  private writeSession(write: () => Promise<void>): Promise<void> {
    const next = this.sessionWrites.catch(() => undefined).then(write);
    this.sessionWrites = next;
    return next;
  }

  /** The session ended on the server; keep local progress but ask to sign in again before syncing. */
  private async expire() {
    const epoch = await this.forget();
    if (epoch === this.sessionEpoch) this.tokens.signInRequired.set(true);
  }
}
