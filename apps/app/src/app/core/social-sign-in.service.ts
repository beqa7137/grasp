import { Injectable, InjectionToken, inject } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import type { InitializeOptions, SocialLogin } from '@capgo/capacitor-social-login';
import { ApiService } from './api.service';
import { RuntimeConfigService } from './runtime-config.service';
import { SIGN_IN_CALLBACK_PATH } from './sign-in-callback';
import { clearAfterLogin, clearBeforeLogin, readRelayedResult } from './social-login-storage';

/** `GET /auth/config`: the public client ids of the providers the server accepts. */
export interface ProviderConfig {
  google: { webClientId: string; iosClientId: string | null } | null;
  github: { clientId: string; authorizeUrl: string } | null;
}

/** The API redeems the ticket only with the PKCE verifier of the sign-in that earned it. */
export interface GitHubCredential {
  ticket: string;
  codeVerifier: string;
}

export type SocialLoginApi = Pick<typeof SocialLogin, 'initialize' | 'login' | 'logout'>;

export const SOCIAL_LOGIN = new InjectionToken<() => Promise<SocialLoginApi>>('social login plugin', {
  factory: () => () => import('@capgo/capacitor-social-login').then((m) => m.SocialLogin),
});
export const DEVICE_PLATFORM = new InjectionToken<string>('device platform', { factory: () => Capacitor.getPlatform() });

const NATIVE_GITHUB_REDIRECT = 'dev.grasp.app://oauth/github';
const GITHUB = 'github';
const USER_CANCELLED = 'USER_CANCELLED';

/**
 * Google and GitHub sign-in through `@capgo/capacitor-social-login`, on the web and in the native apps.
 * Returns the credential the API redeems (a Google ID token; for GitHub, a Grasp ticket and its PKCE
 * verifier), or null when the person cancelled. The plugin is loaded and initialized on first use, never at app start.
 */
@Injectable({ providedIn: 'root' })
export class SocialSignInService {
  private readonly api = inject(ApiService);
  private readonly runtime = inject(RuntimeConfigService);
  private readonly loadPlugin = inject(SOCIAL_LOGIN);
  private readonly platform = inject(DEVICE_PLATFORM);
  private config: Promise<ProviderConfig> | null = null;
  private plugin: Promise<SocialLoginApi> | null = null;

  /** The providers this device can use. */
  async providers(): Promise<ProviderConfig> {
    this.config ??= this.api.get<ProviderConfig>('/auth/config').catch((e: unknown) => {
      this.config = null;
      throw e;
    });
    const { google, github } = await this.config;
    return { google: this.canUseGoogle(google) ? google : null, github };
  }

  /**
   * Loads the plugin before the tap: the web flow opens a popup, and browsers only allow that while the
   * tap still counts as a user gesture, which slow chunk downloads in between would use up.
   */
  prepare(): void {
    this.ready().catch(() => undefined);
  }

  async google(nonce: string): Promise<string | null> {
    const plugin = await this.ready();
    const signedIn = await ifNotCancelled(
      this.withWebCleanup(() => plugin.login({ provider: 'google', options: { nonce, forcePrompt: true } })),
    );
    if (!signedIn) return null;
    // The plugin's web logout only revokes the token through Google endpoints that the page's CSP blocks.
    if (this.platform !== 'web') plugin.logout({ provider: 'google' }).catch(() => undefined);
    const idToken = signedIn.result.responseType === 'online' ? signedIn.result.idToken : null;
    if (!idToken) throw new Error('Google returned no ID token.');
    // On the web the popup relays whatever token lands on the callback page, including one from someone else's sign-in.
    if (idTokenNonce(idToken) !== nonce) throw new Error('Google returned an ID token for a different sign-in.');
    return idToken;
  }

  async github(): Promise<GitHubCredential | null> {
    const plugin = await this.ready();
    const codeVerifier = newSecret();
    const state = newSecret();
    const signedIn = await ifNotCancelled(
      this.withWebCleanup(() =>
        plugin
          .login({ provider: 'oauth2', options: { providerId: GITHUB, codeVerifier, state } })
          .catch((e: unknown) => relayedGitHubLogin(state) ?? Promise.reject(e)),
      ),
    );
    if (!signedIn) return null;
    plugin.logout({ provider: 'oauth2', providerId: GITHUB }).catch(() => undefined);
    const ticket = signedIn.result.accessToken?.token;
    if (!ticket) throw new Error('GitHub sign-in returned no ticket.');
    return { ticket, codeVerifier };
  }

  private async withWebCleanup<T>(login: () => Promise<T>): Promise<T> {
    if (this.platform !== 'web') return login();
    clearBeforeLogin();
    try {
      const result = await login();
      clearAfterLogin({ rejected: false });
      return result;
    } catch (e) {
      clearAfterLogin({ rejected: true });
      throw e;
    }
  }

  private ready(): Promise<SocialLoginApi> {
    this.plugin ??= Promise.all([this.loadPlugin(), this.providers()])
      .then(async ([plugin, providers]) => {
        await plugin.initialize(this.options(providers));
        return plugin;
      })
      .catch((e: unknown) => {
        this.plugin = null;
        throw e;
      });
    return this.plugin;
  }

  private options({ google, github }: ProviderConfig): InitializeOptions {
    const web = this.platform === 'web';
    const callback = `${location.origin}${SIGN_IN_CALLBACK_PATH}`;
    const options: InitializeOptions = {};
    if (google) {
      options.google = {
        webClientId: google.webClientId,
        iOSClientId: google.iosClientId ?? undefined,
        iOSServerClientId: google.webClientId,
        mode: 'online',
        redirectUrl: web ? callback : undefined,
      };
    }
    if (github) {
      options.oauth2 = {
        [GITHUB]: {
          appId: github.clientId,
          authorizationBaseUrl: github.authorizeUrl,
          accessTokenEndpoint: new URL(`${this.runtime.apiBase()}/auth/github/token`, location.href).href,
          redirectUrl: web ? callback : NATIVE_GITHUB_REDIRECT,
          scope: 'user:email',
          pkceEnabled: true,
          responseType: 'code',
          androidUseCustomTabs: true,
        },
      };
    }
    return options;
  }

  /** An iOS build must have registered this Google client's URL scheme, or GoogleSignIn crashes the app. */
  private canUseGoogle(google: ProviderConfig['google']): boolean {
    if (!google || this.platform !== 'ios') return !!google;
    return google.iosClientId !== null && google.iosClientId === this.runtime.config().googleIosClientId;
  }
}

async function ifNotCancelled<T>(login: Promise<T>): Promise<T | null> {
  try {
    return await login;
  } catch (e) {
    if (isCancel(e)) return null;
    throw e;
  }
}

function isCancel(error: unknown): boolean {
  if ((error as { code?: unknown } | null)?.code === USER_CANCELLED) return true;
  // The plugin reports a refusal at GitHub as a plain error: its web and iOS flows pass on only GitHub's description.
  return error instanceof Error && /access_denied|denied your application access/i.test(error.message);
}

/**
 * The plugin checks once a second whether the popup has closed, and the popup closes itself as soon as it has
 * relayed its result. A check that runs after the close but before the relayed message reports a cancel.
 */
function relayedGitHubLogin(state: string) {
  const relayed = readRelayedResult(state) as { type?: unknown; accessToken?: { token?: string } | null } | null;
  return relayed?.type === 'oauth-response' ? { provider: 'oauth2' as const, result: relayed } : null;
}

function newSecret(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/** The ID token's `nonce` claim. Reading it needs no signature check: the API verifies the token itself. */
function idTokenNonce(idToken: string): unknown {
  try {
    const payload = (idToken.split('.')[1] ?? '').replace(/-/g, '+').replace(/_/g, '/');
    return (JSON.parse(atob(payload)) as { nonce?: unknown } | null)?.nonce;
  } catch {
    return undefined;
  }
}
