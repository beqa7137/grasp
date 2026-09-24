# Accounts

Accounts are optional. Grasp stays local-first: an anonymous device keeps working without ever signing in. Signing in adds cross-device sync and a way to keep your progress if you lose the device.

## Sign-in: email codes, no passwords

1. `POST /api/auth/email/start { email }` emails a 6-digit code that is valid for 10 minutes.
   - The response is `202 { sent: true }` whether or not an account exists, so addresses can't be enumerated.
   - Codes are stored as an HMAC keyed with `JWT_SECRET`, so a leaked database can't be brute-forced offline.
   - At most 3 codes per address per 15 minutes, plus a per-IP limit on the route.
2. `POST /api/auth/email/verify { email, code }` checks the newest unused code in constant time. A code is locked after 5 wrong guesses and can be used only once.

Mail goes through Resend (`RESEND_API_KEY`, `MAIL_FROM`). In development the code is printed to the server log instead. In production without a provider, email sign-in reports itself as unavailable (`GET /api/auth/config` returns `{ email: false }`) and the app says so.

## What happens to anonymous progress

The device sends its anonymous learner id (`x-learner-id`) when it verifies a code.

- **New account:** the account adopts that learner, so all earlier progress becomes the account's with no copying.
- **Existing account, new device:** the device learner is merged into the account's learner.
  - Events are copied under the account; event ids are unique, so re-running is harmless.
  - Interview sessions and feedback are re-assigned to the account.
  - The anonymous learner is then deleted.
  - Every step is idempotent, so an interrupted merge completes on the next sign-in.
- **After sign-in:** the app pushes its pending events first, switches to the account's learner id and pulls the merged log.

Once a learner belongs to an account, anonymous requests for it get `401 { code: 'sign_in_required' }`. Knowing a learner id is then no longer enough to read or write that progress.

## Sessions

| Token   | Form                                   | Lifetime   | Stored                                                       |
| ------- | -------------------------------------- | ---------- | ------------------------------------------------------------ |
| Access  | HS256 JWT (`sub`, `lid`), `JWT_SECRET` | 15 minutes | Memory only (app)                                            |
| Refresh | 256-bit random, opaque                 | 30 days    | SHA-256 hash on the server, Capacitor Preferences in the app |

- **Rotation:** every refresh replaces the refresh token. Presenting an already-rotated token more than 10 seconds after its rotation is treated as theft: the whole session family is revoked and every device in that chain must sign in again. The 10-second window allows two tabs refreshing at the same moment.
- **Sign-out** (`POST /api/auth/logout`) revokes the session family. The app then clears local progress and continues as a new anonymous device. The progress itself stays in the account.
- **Deleting an account:** `DELETE /api/me` while signed in erases the progress, interviews, feedback, the account and its tokens.
- **App behaviour:**
  - It refreshes once on a `token_invalid` 401 and retries the request.
  - Concurrent 401s share one refresh.
  - Network errors keep the session.
  - A `401` on refresh ends the session but keeps local progress. The app asks the learner to sign in again, and no data is lost.

Refresh tokens sit in Capacitor Preferences: `localStorage` on the web, app-private storage on iOS and Android. That storage is not encrypted. A Keychain/Keystore plugin would be the next hardening step before handling anything more sensitive than learning progress.

## Rate limits

Every route has a global limit of `RATE_LIMIT_PER_MINUTE` requests. The limit is counted per signed-in user, across their devices and networks, and per IP for anonymous callers. Counters live in Postgres in fixed one-minute windows, so every API instance enforces the same limit; only hashed keys are stored, never IP addresses. If the counter store fails, limiting pauses (fail open) and an error is logged once a minute. Sign-in routes have stricter per-IP limits:

| Route          | Limit per IP      |
| -------------- | ----------------- |
| `email/start`  | 5 per 15 minutes  |
| `email/verify` | 10 per 15 minutes |
| `refresh`      | 30 per 15 minutes |

AI interview messages keep their own per-learner hourly quota.

## Configuration

| Variable         | Notes                                                                                        |
| ---------------- | -------------------------------------------------------------------------------------------- |
| `JWT_SECRET`     | Required in production, at least 32 characters. Development uses a random per-process secret |
| `RESEND_API_KEY` | Turns on email delivery                                                                      |
| `MAIL_FROM`      | Sender, for example `Grasp <login@yourdomain>`. The domain must be verified in Resend        |
