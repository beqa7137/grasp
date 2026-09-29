import type { SdLesson } from './types.js';

export const SECURITY_LESSON: SdLesson = {
  why: "Every design with users has to answer how it stores their passwords, how it knows who is calling, and how it stops one user reading another user's data. Breaches rarely come from broken cryptography; they come from fast password hashes, tokens that cannot be revoked, an API that trusts the id in the URL, and a database password committed to git. Interviewers probe whether you can put numbers on a stolen hash, choose between sessions and tokens with a revocation story, name the OAuth roles correctly, and check authorization on every request.",
  widget: {
    kind: 'password-hash',
    tryThis: [
      'Keep the defaults: bcrypt at cost 12, a random password of 8 letters and digits, 8 GPUs. The attacker makes 11,250 guesses a second against about 218 trillion candidates, so trying them all against one salted hash takes about 615 years (on average half that). Switch the hash to SHA-256: 160 billion guesses a second, and the same space falls in about 23 minutes. PBKDF2 at 600,000 iterations gives 120,000 a second, about 58 years. The rates are rounded from published hashcat benchmarks of one high-end GPU, so read them as orders of magnitude.',
      'Back on bcrypt at cost 12, pick 8 lowercase letters: only 209 billion candidates, about 215 days on 8 GPUs, and slide the GPUs to 1,000 to see it drop to about 41 hours. Pick 4 random words: about 3.7 quadrillion candidates, about 10,300 years on 8 GPUs and 82 years on 1,000. Now switch to SHA-256 with 4 words and 8 GPUs: about 6 hours. Six words hold out for about 44,000 years even on SHA-256. These counts assume the password was chosen at random; a human-chosen one falls to a wordlist far sooner.',
      "Keep 8 letters and digits and 8 GPUs, and slide the bcrypt cost: 180,000 guesses a second and about 38 years at cost 8, 45,000 and about 154 years at cost 10 (the OWASP minimum), 615 years at 12, and about 2,800 a second with about 2,460 years at 14. Each step doubles the attacker's work, and also the server's work for every login. Then pick SHA-256 with 12 letters and digits: about 639 years on 8 GPUs, 5 years on 1,000. Length helps any hash; a slow hash protects the users who will not pick long random passwords.",
    ],
  },
  concepts: [
    {
      title: 'Storing passwords: salted, slow hashes',
      body: 'Never store a password or a reversible encryption of it; store a one-way hash built to be slow. Each user gets a unique random salt (16 bytes is common) stored next to the hash, so identical passwords produce different hashes, precomputed tables are useless, and an attacker must attack each user separately. The slowness is a tunable work factor. OWASP recommends Argon2id with at least 19 MiB of memory, 2 iterations and parallelism 1; scrypt with N = 2^17, r = 8, p = 1; bcrypt at cost 10 or more (it only reads the first 72 bytes of input); and PBKDF2-HMAC-SHA256 at 600,000 iterations where FIPS compliance is required. Argon2id and scrypt are memory-hard: each guess needs its own block of memory, which limits how many guesses a GPU can run at once. Libraries store the algorithm, parameters and salt in one string, so you can raise the cost later and rehash each user at their next login. A pepper, a secret key kept outside the database (in a KMS or HSM), can be mixed in with an HMAC so a stolen table alone is not enough.',
    },
    {
      title: 'Offline and online guessing',
      body: 'Offline, an attacker who has stolen the hashes guesses on their own hardware, as fast as the hash allows, with no one watching: SHA-256 runs at billions of guesses a second on one GPU, so a fast hash, salted or not, protects almost nothing. Online, the attacker guesses through your login form, and hash speed is irrelevant: rate limits decide. Limiting each account to 10 failures an hour caps a targeted attack at 240 guesses a day. Hard lockout after a few failures lets anyone lock out any user, so prefer growing delays per account and per IP; NIST SP 800-63B caps consecutive failures at 100 per account. The bigger online threats spread out: password spraying tries a few common passwords on every account, and credential stuffing replays pairs leaked from other sites. Per-IP limits, bot detection, rejecting passwords found in breach lists, and multi-factor authentication stop those.',
    },
    {
      title: 'Sessions and JWT access tokens',
      body: "A server-side session is a random id (128 bits or more) in a cookie marked HttpOnly, Secure and SameSite, pointing at a record in a store such as Redis. Every request costs a lookup, but revocation is instant: delete the record. A JWT access token carries its claims (user, scopes, expiry) and a signature, so any service can verify it locally with the issuer's public key and no lookup; it is signed, not encrypted, so anyone holding it can read it. The price is revocation: a valid JWT works until it expires. So access tokens are short-lived, typically 5 to 15 minutes, and a long-lived refresh token, opaque and stored server-side, gets new ones. Rotate the refresh token on every use, and if an already-used one comes back, assume theft and revoke the whole chain. Pin the accepted signing algorithm when verifying, and never accept `alg: none`.",
    },
    {
      title: 'OAuth 2.0 and OpenID Connect',
      body: 'OAuth 2.0 is delegated authorization: it lets an app act on a user\'s behalf without seeing their password. Four roles: the resource owner (the user), the client (the app asking for access), the authorization server (which authenticates the user, asks for consent and issues tokens) and the resource server (the API that accepts the access token). Apps use the authorization code flow with PKCE: the browser gets a one-time code, and the client exchanges it for tokens, proving with PKCE that it started the flow. OAuth alone does not say who the user is. OpenID Connect adds that: an ID token, a JWT for the client describing the user who signed in. "Sign in with Google" is OIDC; the ID token is for the client, and the access token is for the API, so never send an ID token to an API as proof of access.',
    },
    {
      title: 'TLS everywhere, mTLS between services',
      body: 'TLS encrypts and authenticates every connection: the server proves its identity with a certificate, and TLS 1.3 needs one round trip to set up. Use it on every hop, not only at the edge: traffic behind the load balancer crosses shared networks too, so re-encrypt from the load balancer to the services, and send HSTS so browsers never fall back to plain HTTP. Mutual TLS makes the client present a certificate as well, which gives each service a cryptographic identity. A service mesh or an internal CA issues each workload a short-lived certificate (hours to days) and rotates it automatically, so services can authorize callers by identity (only the orders service may call payments) instead of trusting anything inside the network.',
    },
    {
      title: 'Authorization: RBAC, ABAC and ownership',
      body: "Authentication says who is calling; authorization says what they may do, and it must be checked on every request, on the server. RBAC assigns permissions to roles and roles to users (support agents may view orders): simple to audit, but roles multiply when rules depend on the data. ABAC evaluates attributes of the user, the resource and the context (a manager may approve expenses in their own department under 5,000 dollars). Most bugs are simpler: an insecure direct object reference (IDOR), where `GET /invoices/1235` returns someone else's invoice because the server checked the login but not the owner. Scope every query to the caller, such as `WHERE owner_id = ?` or a tenant id, in one shared data-access layer, and test it. Random ids make guessing harder but are not a check.",
    },
    {
      title: 'Secrets, least privilege, encryption and audit',
      body: 'Keep secrets (database passwords, API keys, signing keys) in a secrets manager such as Vault or a cloud secrets service, never in code, images or config files in git, and rotate them: support two valid versions at once so a rotation needs no downtime, and prefer short-lived dynamic credentials. Least privilege gives each service its own identity with only the permissions it needs, so one compromised service cannot read everything. Disk encryption at rest only protects a stolen disk; for data the application reads, use envelope encryption: a data key encrypts the data locally, and a key in a KMS, which never leaves it, encrypts the data key. Rotating the KMS key rewraps data keys instead of re-encrypting data, and destroying the KMS key that wraps a data key makes its data unreadable, backups included, since the wrapped data key in each backup can no longer be decrypted. Finally, write audit logs of who did what to which resource, when and from where, to append-only storage in a separate account, without passwords or tokens in them.',
    },
  ],
  examples: [
    {
      title: 'The stolen user table',
      problem:
        "An attacker steals a table of 10 million password hashes and rents 8 high-end GPUs. Using the widget's rates, compare unsalted SHA-256, salted SHA-256 and bcrypt at cost 12, then size the login servers for bcrypt if a cost-12 hash takes about 250 ms of one core and peak logins reach 200 a second.",
      insight:
        'Salt forces the attacker to work per user; a slow hash makes each of those guesses expensive. Neither saves a password that is on every wordlist.',
      steps: [
        'Unsalted SHA-256: at 160 billion guesses a second, the attacker hashes each candidate once and checks it against all 10 million hashes at once. A list of a billion leaked passwords and variations takes under a hundredth of a second, and all 218 trillion 8-character letter-and-digit passwords take about 23 minutes, for every user at the same time.',
        'Salted SHA-256: each user needs their own pass. The billion-entry list costs 1,000,000,000 / 160,000,000,000, about 6 ms per user, so 10 million users take about 62,500 seconds, about 17 hours. Salt alone buys hours, not years.',
        'bcrypt at cost 12: 11,250 guesses a second. The billion-entry list now costs about 89,000 seconds, a day, per user, and about 28,000 years for the whole table. But the top 100 passwords take 100 / 11,250, about 9 ms per user, and about 89,000 seconds, one day, across all 10 million: users with "123456" still fall at once.',
        'So reject common and breached passwords at signup, and treat the slow hash as time to detect the breach and force resets, not as immunity.',
        'Server cost: 200 logins a second at 250 ms each is 50 cores busy just hashing, before headroom. Budget for it, rate-limit the login endpoint so attackers cannot turn this into a denial of service, and measure the cost on your own hardware before raising it.',
      ],
    },
    {
      title: 'Revoking access within a minute',
      problem:
        "An API serves 50,000 requests a second from 2 million concurrently active users across 40 services. Security requires that a stolen token or a fired employee's access stops working within 1 minute. Compare server-side sessions, JWTs with short expiry, and JWTs with a revocation list.",
      insight:
        'A self-contained token cannot be revoked; you either shorten its life, which costs refresh traffic, or reintroduce a small shared lookup.',
      steps: [
        'Server-side sessions: each request looks up its session in Redis, 50,000 lookups a second, which a small Redis cluster serves at well under a millisecond each within a zone. Revocation is deleting one key, instant. The cost is a hard dependency on that store for every request.',
        'JWTs lasting 15 minutes: services verify signatures locally, no lookup. But a revoked token keeps working for up to 15 minutes, which misses the requirement.',
        'JWTs lasting 1 minute meet it, but every active user refreshes each minute: 2,000,000 / 60, about 33,000 refreshes a second, each a rotation written to the auth database. That is most of the session lookup load again, as writes.',
        'Middle ground: 15-minute access tokens (2,000,000 / 900, about 2,200 refreshes a second) plus a revocation list pushed to every service. It holds revoked token ids, or a "tokens issued before this time are invalid" mark per user, only until those tokens expire. At 1,000 revocations an hour, it never holds more than about 250 entries, small enough to keep in memory and refresh every few seconds.',
        'Revocation also covers the refresh token: logout, password change or a fired employee revokes the whole refresh chain at the auth server, so no new access tokens can be minted.',
      ],
    },
    {
      title: 'Encrypting tenant data with a KMS',
      problem:
        "A multi-tenant document store holds 2 billion documents for 5,000 tenants and serves 20,000 reads a second from 20 app servers. Compliance wants application-level encryption with keys in a KMS, yearly key rotation, and proof that a departed tenant's data is unreadable. Design it.",
      insight:
        'Call the KMS for keys, not for data: envelope encryption turns 20,000 KMS calls a second into a few, and makes rotation and deletion operations on keys instead of documents.',
      steps: [
        'Calling the KMS to decrypt every document means 20,000 KMS requests a second, each a network round trip, against a per-account request quota; AWS KMS also encrypts at most 4 KB of data per call. It does not scale.',
        "Envelope encryption: give each tenant a data key, encrypt documents locally with AES-256-GCM, and store the data key encrypted by the tenant's KMS key. On a read, the server asks the KMS to decrypt the data key once and caches the plaintext key in memory for 5 minutes.",
        "KMS load: at worst every server refreshes every tenant's key every 5 minutes, 20 times 5,000 / 300, about 333 calls a second, and far fewer in practice since most tenants are idle. Reads pay no KMS latency.",
        'Rotation: rotating a KMS key rewraps 5,000 data keys, a job of seconds, instead of re-encrypting 2 billion documents. Also rotate the data keys themselves: AES-GCM with random nonces should stay under about 4 billion (2^32) encryptions per key, so new writes get a new key version.',
        "Departed tenant: schedule deletion of their KMS key, so every wrapped data key, and with it every copy of their documents, backups included, becomes unreadable (crypto-shredding). Log each KMS decrypt call to the audit log, so access to any tenant's data can be traced.",
      ],
    },
  ],
  pitfalls: [
    'Hashing passwords with a fast hash such as MD5, SHA-1 or SHA-256, even salted: one GPU tries billions of guesses a second, so most of the table is cracked within days.',
    "Checking that the user is logged in but not that they own the resource: changing an id in the URL returns another user's data. Check ownership or tenant in every query, not only in the UI or at the gateway.",
    'Issuing access JWTs that last days with no revocation path, or storing them where page scripts can read them: a stolen token keeps working and cannot be stopped short of rotating the signing key for everyone.',
    'Putting secrets in source code, container images or logs, including request logs that capture Authorization headers or password fields: anyone with read access to the repository or the log store gets production credentials.',
  ],
  followUps: [
    {
      question: 'Why hash passwords instead of encrypting them?',
      answer:
        'Anything encrypted can be decrypted by whoever has the key, and an attacker inside your system often has both the database and the key, which reveals every password at once, passwords that users reuse elsewhere. A hash is one-way: logins only need to compare hashes. If you want a secret on top, add a pepper through an HMAC with a key held in a KMS or HSM, so the stolen table alone cannot be cracked.',
    },
    {
      question: 'How do you migrate a legacy table of unsalted MD5 hashes without forcing every user to reset?',
      answer:
        "Wrap them now: replace each stored MD5 with bcrypt or Argon2id of that MD5, marked with the scheme, so the whole table is protected immediately. At each user's next login, verify through the wrapped scheme, then rehash the plain password with the modern algorithm alone. After some months, force a reset for the dormant accounts. The wrapped form has a weakness: if MD5 values leaked from another site, an attacker can test them against the outer hash and then crack a matching MD5 at full GPU speed, which is why the rehash on login matters.",
    },
    {
      question: 'How does one service know that a request from another service is allowed?',
      answer:
        "mTLS proves which service is calling: each workload has a short-lived certificate naming its identity, and the callee authorizes that identity per endpoint. The end user must be checked too, so the caller forwards the user's token, or a short-lived internal token derived from it, and the callee checks the user's access to the resource. Never trust a plain header such as a user id from inside the network, since any compromised service could set it.",
    },
  ],
};
