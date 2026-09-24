import { readPendingSignIn } from './social-login-storage';

/** Where the web sign-in popup comes back to. The API allows GitHub to redirect only here. */
export const SIGN_IN_CALLBACK_PATH = '/auth/callback';

/**
 * Whether the plugin may finish a sign-in on this callback URL. The plugin trusts whatever credential
 * the URL carries while any sign-in is pending, so a page that navigates a tab here could slip in its own.
 * GitHub must answer with the pending flow's secret `state`. Google always sends the same `state`, so its
 * tokens are tied to the sign-in by the ID token's nonce instead, which the app and the API check.
 * A provider error carries no credential and is let through, so a refusal reaches the app as a cancel.
 */
export function answersPendingSignIn(url: URL): boolean {
  const pending = parsePending(readPendingSignIn());
  if (!pending) return false;
  const query = url.searchParams;
  const fragment = new URLSearchParams(url.hash.slice(1));
  const carries = (key: string) => query.has(key) || fragment.has(key);
  const carriesToken = carries('access_token') || carries('id_token');
  switch (pending.provider) {
    case 'oauth2':
      return (
        typeof pending.state === 'string' &&
        query.get('state') === pending.state &&
        (query.has('code') || query.has('error')) &&
        !carriesToken
      );
    case 'google':
      return (fragment.has('access_token') && fragment.has('id_token')) || (carries('error') && !carriesToken);
    default:
      return false;
  }
}

function parsePending(entry: string | null): { provider?: unknown; state?: unknown } | null {
  if (!entry) return null;
  try {
    const pending: unknown = JSON.parse(entry);
    return typeof pending === 'object' && pending !== null ? pending : null;
  } catch {
    return null;
  }
}
