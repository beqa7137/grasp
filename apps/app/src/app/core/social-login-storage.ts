import {
  OAUTH_DELIVERED_KEY,
  OAUTH_POPUP_SESSION_KEY,
  OAUTH_RESULT_KEY_PREFIX,
  OAUTH_STATE_KEY,
} from '@capgo/capacitor-social-login/dist/esm/oauth-popup-bridge.js';

/**
 * What `@capgo/capacitor-social-login` keeps in web storage around a popup sign-in, and how the app tidies
 * it up. The plugin leaves some of it behind, and stale entries make a later page load act as if it were the popup.
 * These two keys are private to the plugin's providers; social-login-storage.spec.ts checks them against it.
 */
const GOOGLE_TOKENS_KEY = 'capgo_social_login_google_state';
const OAUTH2_PENDING_LOGIN_PREFIX = 'capgo_social_login_oauth2_state_';

export function readPendingSignIn(): string | null {
  try {
    return localStorage.getItem(OAUTH_STATE_KEY);
  } catch {
    return null;
  }
}

/** The app's own window is never the sign-in popup, whatever an earlier attempt left in this tab. */
export function clearPopupMarkers(): void {
  quietly(() => {
    sessionStorage.removeItem(OAUTH_POPUP_SESSION_KEY);
    sessionStorage.removeItem(OAUTH_DELIVERED_KEY);
  });
}

/** A popup copies this tab's session storage, and a stale "delivered" flag would make it drop the result. */
export function clearBeforeLogin(): void {
  quietly(() => sessionStorage.removeItem(OAUTH_DELIVERED_KEY));
}

/** Drops the Google tokens, relayed results and GitHub PKCE verifiers the plugin keeps too, which the app never reads again. */
export function clearAfterLogin({ rejected }: { rejected: boolean }): void {
  quietly(() => sessionStorage.removeItem(OAUTH_POPUP_SESSION_KEY));
  if (rejected) quietly(() => localStorage.removeItem(OAUTH_STATE_KEY));
  quietly(() => localStorage.removeItem(GOOGLE_TOKENS_KEY));
  quietly(() => {
    const keys = Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i));
    for (const key of keys) {
      if (key?.startsWith(OAUTH_RESULT_KEY_PREFIX) || key?.startsWith(OAUTH2_PENDING_LOGIN_PREFIX)) localStorage.removeItem(key);
    }
  });
}

function quietly(tidy: () => void) {
  try {
    tidy();
  } catch {
    // Storage can be blocked (private modes, site data settings); then there is nothing to tidy.
  }
}
