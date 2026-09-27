# Accounts

Accounts are optional. Grasp stays local-first: an anonymous device keeps working without ever signing in. Signing in adds cross-device sync and a way to keep your progress if you lose the device.

There are exactly two ways to sign in: **Google** and **GitHub**. There are no passwords and no email codes. On the web, iOS and Android the app uses [`@capgo/capacitor-social-login`](https://github.com/Cap-go/capacitor-social-login) for both. The API decides who is signing in; the app never holds a provider secret.

## Sign in with Google

1. The app asks the API for a nonce: `POST /api/auth/google/nonce` returns `{ nonce }`. It is 32 random bytes; the server stores only its SHA-256 hash, for 10 minutes, and accepts it once.
2. The plugin signs in with Google in `online` mode and that nonce: Credential Manager on Android, GoogleSignIn on iOS, a popup on the web. Google returns an ID token that carries the nonce.
3. The app checks that the returned ID token carries that nonce, then sends `POST /api/auth/google { idToken, nonce }` with its `x-learner-id` header and gets an ordinary Grasp session back.

The API verifies the ID token itself with `jose`, against Google's published signing keys (`https://www.googleapis.com/oauth2/v3/certs`, which each server process caches for up to 6 hours and fetches again sooner when a token names a key it has not seen):

- signature (RS256 only), issuer (`accounts.google.com` or `https://accounts.google.com`), audience (the web client id, or the iOS client id when set);
- expiry with 60 seconds of clock tolerance, and an issue time at most 10 minutes back;
- the nonce: it must equal the `nonce` sent with the token, and is then consumed atomically. A token carrying a different nonce is rejected before either nonce is used up; an unknown, expired or already used nonce is rejected like a bad token.

The email counts only when Google marks it `email_verified`. If Google's keys cannot be fetched, sign-in answers `503 provider_unavailable`, never `401`, so an outage does not look like a bad token.

No Google client secret is involved. The `GOOGLE_WEB_CLIENT_SECRET` repository secret is not used by anything.

## Sign in with GitHub

GitHub requires its client secret on every code exchange, so the exchange happens on the API:

1. The app picks the PKCE code verifier itself (32 random bytes, base64url) and hands it to the plugin, which runs GitHub's authorization-code flow with PKCE (S256) and `state`, scope `user:email`. GitHub redirects back to `https://<host>/auth/callback` on the web (the popup page) or to `dev.grasp.app://oauth/github` in the native apps.
2. The plugin posts the code to the API as to any OAuth token endpoint: `POST /api/auth/github/token`, URL-encoded, with `grant_type=authorization_code`, `client_id`, `code`, `redirect_uri` and `code_verifier`.
3. The API checks the client id and that `redirect_uri` is one of the two allowed callbacks, adds the client secret and exchanges the code with GitHub. It reads the user's numeric id (`GET /user`) and emails (`GET /user/emails`), then revokes GitHub's token (`DELETE /applications/{client_id}/token`).
4. It answers in OAuth shape, `{ access_token, token_type: 'bearer', expires_in: 300, scope: 'user:email' }` with `Cache-Control: no-store`. The `access_token` is not GitHub's token. It is a **Grasp sign-in ticket**: 32 random bytes that stand for the verified GitHub identity, stored only as a hash, valid for 5 minutes and accepted once. The ticket is bound to the sign-in's PKCE verifier: the server keeps the SHA-256 hash of `code_verifier` with it.
5. The app trades the ticket for a session: `POST /api/auth/github { ticket, codeVerifier }` with its `x-learner-id` header, where `codeVerifier` is the verifier it picked in step 1. The ticket counts only with that verifier (compared in constant time); any other verifier gets `401 invalid_ticket` and spends the ticket, and a missing or malformed one gets `400`.

The email used is the primary verified address, or else the first verified one. `@users.noreply.github.com` aliases never count, since they cannot receive mail. Whether a usable email exists is decided when the ticket is spent, not at the token endpoint.

Token endpoint errors use the OAuth shape `{ error, error_description }`:

| Status | `error`                   | When                                                                  |
| ------ | ------------------------- | --------------------------------------------------------------------- |
| 400    | `invalid_request`         | A parameter is missing or malformed, or `redirect_uri` is not allowed |
| 401    | `invalid_client`          | `client_id` is not this server's GitHub app                           |
| 400    | `invalid_grant`           | GitHub rejected the code (bad, expired, reused, wrong verifier)       |
| 503    | `temporarily_unavailable` | GitHub could not be reached (every call has a 5-second timeout)       |

## Which account a sign-in reaches

Identities are keyed on the provider's stable id: Google's `sub` and GitHub's numeric user id, never the email. Emails are trimmed and lowercased before any lookup or write, and an unverified email is never stored. The rules, in order:

1. **The provider account is already linked:** sign in to that account. Its email is never matched again; the identity's last seen email and sign-in time are updated.
2. **The provider shared no verified email:** refuse with `403 email_unverified`.
3. **An account with that email exists:**
   - if the account has **no sign-in method** (it comes from the old email-code sign-in, see below) and the provider is **authoritative** for the address, link the provider account to it and sign in. Only Google is authoritative: for `@gmail.com` addresses, and for Google Workspace accounts (the token has an `hd` claim);
   - otherwise refuse with `409 account_exists` and `providers`, the sign-in methods that account already has. The learner signs in with one of those, then connects the new provider in Settings.
4. **Otherwise:** create the account, with the provider's verified email, and link the provider account to it. Both are stored in one transaction, so two first sign-ins with the same provider account at the same moment end in the same account.

Step 3 is what stops account pre-hijacking, in both directions:

- A GitHub account, or a Google account whose address Google does not own, can carry a verified address that belongs to someone else, so it never joins an existing account by email.
- An account that already has a sign-in method is never joined by email, not even by an authoritative Google sign-in. Otherwise someone whose GitHub account still lists an address they once controlled could create the account first and keep signing in to it after the address's real owner joined it with Google. The real owner gets `account_exists` instead; if the listed method is not theirs, the operator has to sort it out.

The only accounts joined by email are the old email-code ones: they have no sign-in method anyone could hold, and an authoritative Google sign-in proves the address.

A signed-in learner can **connect** the other provider from Settings: `POST /api/auth/google/link { idToken, nonce }` (after a nonce, as above) or `POST /api/auth/github/link { ticket, codeVerifier }` (after the token endpoint, as above). Both return `{ identities }`. A provider account that is already linked to someone else gets `409 identity_in_use`; linking the same one twice is harmless. Connecting does not need a verified email, since the learner is already signed in. There is no unlinking yet.

`GET /api/auth/me` returns `{ user: { id, email }, learnerId, identities }`, where each identity is `{ provider, email, linkedAt }`. The account's own email is the one it was created with and does not follow later provider changes.

### Accounts from the old email-code sign-in

Accounts created by the old email-code sign-in have no linked sign-in method. Their owners get back in like this:

- **Still signed in:** connect Google or GitHub under **Settings → Sign-in methods**. Connecting needs no matching email, so this works for any address, and from then on that provider signs in.
- **Signed out, with a `@gmail.com` or Google Workspace address:** sign in with Google using that address. Google is authoritative for it and the account has no sign-in method, so rule 3 links the Google account.
- **Signed out, with any other address:** every sign-in gets `409 account_exists` with an empty `providers` list, and the app shows the API's message: "This email belongs to an account from the earlier email sign-in. Sign in with Google using this address to recover it." Only Google addresses can follow that advice; everyone else needs the operator.

The operator can list the accounts that still have no sign-in method, to tell their owners to connect a provider while they are still signed in (a session ends 30 days after its last refresh):

```sql
select u.id, u.email, u.last_login_at
from users u
where not exists (select 1 from auth_identities i where i.user_id = u.id)
order by u.last_login_at desc nulls last;
```

To recover such an account for someone whose address is not a Google one, first make sure they control the address, for example by having them reply from it to a message you send. Then link their GitHub account by hand, using its numeric id (the `id` field of `https://api.github.com/users/<login>`):

```sql
insert into auth_identities (id, user_id, provider, subject, email, created_at)
values (gen_random_uuid(), '<users.id>', 'github', '<numeric GitHub id>', '<lowercased address>', now());
```

They can then sign in with GitHub and connect Google in Settings if they like. There is no equivalent for Google, whose account ids are not public.

## What happens to anonymous progress

The device sends its anonymous learner id (`x-learner-id`) with every sign-in, whichever provider it uses.

- **New account:** the account adopts that learner, so all earlier progress becomes the account's with no copying.
- **Existing account, new device:** the device learner is merged into the account's learner.
  - Events are copied under the account; event ids stay unique.
  - Interview sessions and feedback are re-assigned to the account.
  - The anonymous learner is retired. The merge commits all transfers together, or none of them.
- **A device learner that already belongs to an account** is never taken over: signing in to a different account from it starts that account on a fresh learner.
- **After sign-in:** the app pushes its pending events first, switches to the account's learner id and pulls the merged log.

Once a learner belongs to an account, anonymous requests for it get `401 { code: 'sign_in_required' }`. Knowing a learner id is then no longer enough to read or write that progress.

## Sessions

| Token   | Form                                          | Lifetime   | Stored                                                       |
| ------- | --------------------------------------------- | ---------- | ------------------------------------------------------------ |
| Access  | HS256 JWT (`sub`, `lid`, `fid`), `JWT_SECRET` | 15 minutes | Memory only (app)                                            |
| Refresh | 256-bit random, opaque                        | 30 days    | SHA-256 hash on the server, Capacitor Preferences in the app |

- **Rotation:** every refresh replaces the refresh token. Presenting an already-rotated token more than 10 seconds after its rotation is treated as theft: the whole session family is revoked and every device in that chain must sign in again. The 10-second window allows two tabs refreshing at the same moment.
- **Sign-out** (`POST /api/auth/logout`) revokes the session family. The app then clears local progress and continues as a new anonymous device. The progress itself stays in the account.
- **Deleting an account:** `DELETE /api/me` while signed in erases the progress, interviews, feedback, the account, its tokens and its linked sign-in methods. A durable tombstone keeps only the random learner ID and deletion time to reject stale device writes; any merged guest IDs remain retired, with their destination link cleared. `GET /api/me/export` includes the linked methods (`account.identities`).
- **App behaviour:**
  - It refreshes once on a `token_invalid` 401 and retries the request.
  - Concurrent 401s share one refresh.
  - Network errors keep the session.
  - A `401` on refresh ends the session but keeps local progress. The app asks the learner to sign in again, and no data is lost.
  - An anonymous request with `410 { code: 'learner_erased' }` clears local progress, starts with a new learner ID, and shows a short deletion notice. It does not upload the erased learner's events.
  - `410 { code: 'learner_moved' }` keeps local progress and reloads the learner ID and refresh token from shared storage. The next action uses that identity.

Refresh tokens sit in Capacitor Preferences: `localStorage` on the web, app-private storage on iOS and Android. That storage is not encrypted. A Keychain/Keystore plugin would be the next hardening step before handling anything more sensitive than learning progress.

## Security properties

- **Nonce (Google).** Every ID token must carry a nonce the server issued in the last 10 minutes and has not accepted before, so a leaked or replayed token, or one minted for another app, cannot sign anyone in. The app sends the nonce it asked for next to the token, and both the app and the server refuse a token that carries another one, so a token someone minted for their own nonce cannot be slipped into another person's sign-in or Connect.
- **PKCE and state (GitHub).** The app picks the verifier and the plugin the `state`. An intercepted authorization code is useless without the verifier, which never leaves the app until the exchange.
- **The web callback page.** On `/auth/callback` the app loads the sign-in plugin only when the URL belongs to the flow it started: for GitHub, a `code` or a refusal (`error`) with the pending `state`, and no token anywhere in the URL; for Google, an ID token, whose nonce is then checked as above, or a refusal with no token. Any other visit is sent to `/settings`, so a crafted callback URL cannot hand the app someone else's sign-in. A refusal carries no credential, so a forged one can at most cancel a pending Google sign-in.
- **OAuth results only on the callback page.** The plugin finishes a pending sign-in on any page whose URL carries OAuth response parameters. So on every other path the app removes them (`code`, `state`, `error`, tokens and the like, from the query and the fragment alike) before it starts and again after every back, forward or fragment-only navigation in the page, keeping the rest of the query and fragment, and an injected result never reaches the plugin.
- **The plugin is pinned to an exact version** (`@capgo/capacitor-social-login` in `apps/app/package.json`). The callback guard and the storage cleanup read the plugin's own storage keys, and `social-login-storage.spec.ts` checks them against the installed plugin, so upgrade it on purpose and run that spec.
- **Ticket (GitHub).** The token endpoint hands the app a single-use, 5-minute ticket instead of GitHub's token. Only its hash is stored. The ticket is bound to the app's PKCE verifier, so a ticket someone obtained for their own GitHub account cannot be slipped into another person's sign-in or Connect: that person's app redeems it with its own verifier, which does not match.
- **No provider tokens are kept.** Google's ID token is checked and dropped. GitHub's access token lives only for the two API calls in one request, then is revoked; it never reaches the app and is never stored or logged. Grasp keeps only the provider's user id and last verified email.
- **Nothing sensitive in logs.** The access log records paths only, never bodies or query strings, and error reports strip bodies and the `authorization` header.
- **Provider sessions play no further part.** Once signed in, the learner holds a normal Grasp session (above). After each sign-in the app asks the plugin to forget the provider session, as far as the platform allows.

## Rate limits

Every route has a global limit of `RATE_LIMIT_PER_MINUTE` requests. The limit is counted per signed-in user, across their devices and networks, and per IP for anonymous callers. Counters live in Postgres in fixed one-minute windows, so every API instance enforces the same limit; only hashed keys are stored, never IP addresses. If the counter store fails, limiting pauses (fail open) and an error is logged once a minute. Sign-in routes have stricter limits:

| Route                        | Limit                       |
| ---------------------------- | --------------------------- |
| `google/nonce`               | 20 per 15 minutes, per IP   |
| `google`                     | 10 per 15 minutes, per IP   |
| `github/token`               | 20 per 15 minutes, per IP   |
| `github`                     | 10 per 15 minutes, per IP   |
| `google/link`, `github/link` | 10 per 15 minutes, per user |
| `refresh`                    | 30 per 15 minutes, per IP   |

Nonces and tickets are 256-bit, so these limits bound cost and outbound calls rather than guessing. AI interview messages keep their own per-learner hourly quota.

## Error codes

Sign-in errors have the usual body `{ statusCode, message, code }`. The API owns the wording (`apps/api/src/auth/auth-errors.ts`): the app shows the API's `message` for `account_exists`, `email_unverified` and `identity_in_use`, and "Sign-in didn't complete. Please try again." for anything else.

| Status | `code`                 | Meaning                                                                                                        |
| ------ | ---------------------- | -------------------------------------------------------------------------------------------------------------- |
| 401    | `invalid_credential`   | The Google ID token or its nonce was rejected                                                                  |
| 401    | `invalid_ticket`       | The GitHub ticket is unknown, expired or already used, or came with another verifier than it was issued for    |
| 403    | `email_unverified`     | The provider shared no verified email for a new account                                                        |
| 409    | `account_exists`       | Another account has this email; `providers` lists how to sign in to it, and is empty for an email-code account |
| 409    | `identity_in_use`      | The provider account is linked to a different Grasp account                                                    |
| 404    | `provider_disabled`    | That provider is not configured on this server                                                                 |
| 503    | `provider_unavailable` | Google's signing keys could not be fetched                                                                     |

## Configuration

Each provider switches itself on when its variables are set. `GET /api/auth/config` tells the app which ones are available, together with their public client ids: `{ google: { webClientId, iosClientId } | null, github: { clientId, authorizeUrl } | null }`. With neither, the app says that sign-in isn't available.

| Variable               | Notes                                                                                                          |
| ---------------------- | -------------------------------------------------------------------------------------------------------------- |
| `JWT_SECRET`           | Required in production, at least 32 characters. Development uses a random per-process secret                   |
| `GOOGLE_WEB_CLIENT_ID` | Turns on Google. The web OAuth client id: the ID token audience on every platform, and the app's `webClientId` |
| `GOOGLE_IOS_CLIENT_ID` | Optional. The iOS OAuth client id, accepted as a second audience and served to the iOS app                     |
| `OAUTH_GITHUB_ID`      | Turns on GitHub, together with the secret. The GitHub OAuth app's client id                                    |
| `OAUTH_GITHUB_SECRET`  | The GitHub OAuth app's client secret. The API refuses to start with only one of the two GitHub variables       |
| `OAUTH_GITHUB_URL`     | Default `https://github.com`. Only for GitHub Enterprise (or a local fake in tests)                            |
| `OAUTH_GITHUB_API_URL` | Default `https://api.github.com`                                                                               |

Surrounding whitespace in the client ids and the GitHub secret is ignored, and a blank value counts as unset. The GitHub variables are named `OAUTH_GITHUB_*` because GitHub Actions does not allow secret names that start with `GITHUB_`; the same names are used as repository secrets and as server variables. The native apps need one value at build time, the iOS client id; see [MOBILE.md](MOBILE.md#sign-in-google-and-github).

### Google Cloud

In one Google Cloud project, set up the OAuth consent screen (External, only the basic `openid`, `email` and `profile` scopes) and **publish it**: under **Google Auth Platform → Audience**, click **Publish app** so the status is **In production**. With only the basic scopes, Google requires no verification. While the app stays in **Testing**, only its listed test users (at most 100) can sign in, and everyone else gets `Error 403: access_denied`.

Then create three OAuth clients under **APIs & Services → Credentials**:

1. **Web application.** Its client id is `GOOGLE_WEB_CLIENT_ID`.
   - Authorized JavaScript origins: `https://<host>` and `http://localhost:4200`.
   - Authorized redirect URIs: `https://<host>/auth/callback` and `http://localhost:4200/auth/callback` (the web popup returns there).
   - Google also issues it a client secret; Grasp does not use it.
2. **Android**, package name `dev.grasp.app`, with the SHA-1 of every key that signs a build you test: the shared CI test key `3E:E1:11:6A:13:18:B7:B4:C9:92:5C:9A:85:6E:65:FF:90:45:E1:B8` (see [MOBILE.md](MOBILE.md)), your own debug key (`./gradlew signingReport`), and for store builds the upload and Play App Signing keys. Its client id is not configured anywhere: Android matches the package and signature, and the token's audience is still the web client.
3. **iOS**, bundle id `dev.grasp.app`. Its client id is `GOOGLE_IOS_CLIENT_ID`, for the API and for the native iOS build.

### GitHub

Create an **OAuth app** (Settings → Developer settings → OAuth Apps). Its client id is `OAUTH_GITHUB_ID`; generate a client secret for `OAUTH_GITHUB_SECRET`.

- Homepage URL: `https://<host>`.
- Authorization callback URLs, with matching kept exact:
  - `https://<host>/auth/callback` (web),
  - `http://localhost:4200/auth/callback` (web development),
  - `dev.grasp.app://oauth/github` (iOS and Android).

The app asks for the `user:email` scope only, which lets the API read verified addresses, including private ones.

On the web, the API accepts only the `/auth/callback` on the scheme and host that the token request arrived with. Behind a proxy that terminates TLS, `TRUST_PROXY` must match the proxy hops (Vercel's entry point sets `1`). Otherwise the API sees `http` and rejects every web GitHub sign-in with `invalid_request`; see [DEPLOYMENT.md](DEPLOYMENT.md#docker-image).

## Storage

- `auth_identities`: one row per linked provider account, unique on `(provider, subject)`, removed with its user.
- `auth_one_time`: hashes of Google nonces and GitHub tickets, with their expiry and use time. The ticket's row holds the verified GitHub identity and the hash of the PKCE verifier it is bound to (`{ subject, email, verifierHash }`). Expired rows are swept every 10 minutes with the rate-limit counters.
- `login_codes` belonged to email sign-in and is no longer used. It stays for now, because migrations run while the previous release still serves traffic; a later release drops it.
