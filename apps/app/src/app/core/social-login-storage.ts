/**
 * What `@capgo/capacitor-social-login` keeps in web storage around a popup sign-in (see its
 * `dist/esm/oauth-popup-bridge.js` and `google-provider.js`), and how the app tidies it up. The plugin
 * leaves some of it behind, and stale entries make a later page load act as if it were the popup.
 */
export const PENDING_SIGN_IN_KEY = 'social_login_oauth_pending';
const POPUP_MARKER_KEY = 'social_login_oauth_popup';
const DELIVERED_KEY = 'social_login_oauth_delivered';
const RESULT_KEY_PREFIX = 'social_login_oauth_result_';
const GOOGLE_TOKENS_KEY = 'capgo_social_login_google_state';

export function readPendingSignIn(): string | null {
  try {
    return localStorage.getItem(PENDING_SIGN_IN_KEY);
  } catch {
    return null;
  }
}

/** The app's own window is never the sign-in popup, whatever an earlier attempt left in this tab. */
export function clearPopupMarkers(): void {
  quietly(() => {
    sessionStorage.removeItem(POPUP_MARKER_KEY);
    sessionStorage.removeItem(DELIVERED_KEY);
  });
}

/** A popup copies this tab's session storage, and a stale "delivered" flag would make it drop the result. */
export function clearBeforeLogin(): void {
  quietly(() => sessionStorage.removeItem(DELIVERED_KEY));
}

/** Also drops the Google tokens and relayed results the plugin keeps, which the app never reads again. */
export function clearAfterLogin({ rejected }: { rejected: boolean }): void {
  quietly(() => sessionStorage.removeItem(POPUP_MARKER_KEY));
  if (rejected) quietly(() => localStorage.removeItem(PENDING_SIGN_IN_KEY));
  quietly(() => localStorage.removeItem(GOOGLE_TOKENS_KEY));
  quietly(() => {
    const keys = Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i));
    for (const key of keys) if (key?.startsWith(RESULT_KEY_PREFIX)) localStorage.removeItem(key);
  });
}

function quietly(tidy: () => void) {
  try {
    tidy();
  } catch {
    // Storage can be blocked (private modes, site data settings); then there is nothing to tidy.
  }
}
