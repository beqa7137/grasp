import { HttpException, Logger } from '@nestjs/common';
import { createLocalJWKSet, createRemoteJWKSet, exportJWK, generateKeyPair, SignJWT, type JWTPayload } from 'jose';
import { MemoryAuthStore } from '../persistence/memory.stores.js';
import {
  DisabledGoogleIdTokenVerifier,
  GoogleIdTokenVerifier,
  JoseGoogleIdTokenVerifier,
  type GoogleClients,
} from './google-id-token.verifier.js';
import { GoogleSignInService } from './google-sign-in.service.js';
import { OneTimeValues } from './one-time-values.js';
import { ProviderUnavailableError } from './provider-errors.js';

const clients: GoogleClients = {
  webClientId: 'web-client.apps.googleusercontent.com',
  iosClientId: 'ios-client.apps.googleusercontent.com',
};
const t0 = new Date('2026-09-20T10:00:00Z');
const at = (ms: number) => new Date(t0.getTime() + ms);

const { privateKey, publicKey } = await generateKeyPair('RS256');
const stranger = await generateKeyPair('RS256');
const keys = createLocalJWKSet({ keys: [{ ...(await exportJWK(publicKey)), kid: 'k1', alg: 'RS256', use: 'sig' }] });

function idToken(claims: JWTPayload, options: { key?: CryptoKey; kid?: string; issuedAt?: Date } = {}) {
  const iat = Math.floor((options.issuedAt ?? t0).getTime() / 1000);
  return new SignJWT({
    iss: 'https://accounts.google.com',
    aud: clients.webClientId,
    sub: '1234567890',
    email: 'ada@gmail.com',
    email_verified: true,
    iat,
    exp: iat + 3600,
    ...claims,
  })
    .setProtectedHeader({ alg: 'RS256', kid: options.kid ?? 'k1', typ: 'JWT' })
    .sign(options.key ?? privateKey);
}

function setup(verifier: GoogleIdTokenVerifier = new JoseGoogleIdTokenVerifier(clients, keys)) {
  return new GoogleSignInService(verifier, new OneTimeValues(new MemoryAuthStore()));
}

/** Presents a token carrying `nonce` along with that same nonce, as the app does. */
const identifyWith = async (google: GoogleSignInService, nonce: string, claims: JWTPayload = {}, now = t0) =>
  google.identify(await idToken({ nonce, ...claims }), nonce, now);

const rejection = async (promise: Promise<unknown>) => {
  const e = await promise.then(
    () => null,
    (error: unknown) => error,
  );
  if (!(e instanceof HttpException)) throw new Error(`Expected an HTTP error, got ${String(e)}`);
  return { status: e.getStatus(), code: (e.getResponse() as { code?: string }).code };
};

beforeAll(() => Logger.overrideLogger(false));
afterEach(() => vi.restoreAllMocks());

describe('Google sign-in', () => {
  it('accepts a valid ID token carrying a fresh server nonce, for the web or iOS client', async () => {
    const google = setup();
    const nonce = await google.newNonce(t0);
    expect(nonce).toMatch(/^[\w-]{43}$/);
    expect(await identifyWith(google, nonce, {}, at(5_000))).toEqual({
      provider: 'google',
      subject: '1234567890',
      email: 'ada@gmail.com',
      authoritative: true,
    });

    const fromIos = await identifyWith(google, await google.newNonce(t0), { aud: clients.iosClientId!, iss: 'accounts.google.com' });
    expect(fromIos.subject).toBe('1234567890');
  });

  it('rejects a token for another audience, from another issuer or signed by another key', async () => {
    const google = setup();
    const nonce = await google.newNonce(t0);
    for (const token of [
      await idToken({ nonce, aud: 'someone-else.apps.googleusercontent.com' }),
      await idToken({ nonce, iss: 'https://evil.example' }),
      await idToken({ nonce }, { key: stranger.privateKey }),
      await idToken({ nonce }, { kid: 'unknown' }),
      'not-a-jwt',
    ]) {
      expect(await rejection(google.identify(token, nonce, t0))).toEqual({ status: 401, code: 'invalid_credential' });
    }
  });

  it('rejects expired and stale tokens', async () => {
    const google = setup();
    const nonce = await google.newNonce(t0);
    const expired = await idToken({ nonce, exp: Math.floor(t0.getTime() / 1000) - 120 });
    expect(await rejection(google.identify(expired, nonce, t0))).toEqual({ status: 401, code: 'invalid_credential' });
    const stale = await idToken({ nonce }, { issuedAt: at(-12 * 60_000) });
    expect(await rejection(google.identify(stale, nonce, t0))).toEqual({ status: 401, code: 'invalid_credential' });
  });

  it('accepts each nonce once, and only nonces it issued that have not expired', async () => {
    const google = setup();
    const nonce = await google.newNonce(t0);
    await identifyWith(google, nonce);
    expect(await rejection(identifyWith(google, nonce))).toEqual({ status: 401, code: 'invalid_credential' });

    expect(await rejection(identifyWith(google, 'made-up-nonce'))).toEqual({ status: 401, code: 'invalid_credential' });
    expect(await rejection(google.identify(await idToken({}), await google.newNonce(t0), t0))).toEqual({
      status: 401,
      code: 'invalid_credential',
    });

    const old = await google.newNonce(t0);
    const late = at(11 * 60_000);
    expect(await rejection(google.identify(await idToken({ nonce: old }, { issuedAt: late }), old, late))).toEqual({
      status: 401,
      code: 'invalid_credential',
    });
  });

  it('rejects a token whose nonce is not the one the app sent, without using up either nonce', async () => {
    const google = setup();
    const [mine, theirs] = [await google.newNonce(t0), await google.newNonce(t0)];
    const injected = await idToken({ nonce: theirs, sub: 'someone-else' });
    expect(await rejection(google.identify(injected, mine, t0))).toEqual({ status: 401, code: 'invalid_credential' });

    expect((await identifyWith(google, mine)).subject).toBe('1234567890');
    expect((await identifyWith(google, theirs, { sub: 'someone-else' })).subject).toBe('someone-else');
  });

  it('keeps the email only when Google verified it', async () => {
    const google = setup();
    expect(await identifyWith(google, await google.newNonce(t0), { email_verified: false })).toMatchObject({
      email: null,
      authoritative: false,
    });
  });

  it('treats Google as authoritative for gmail.com and Workspace (hd) addresses only', async () => {
    const google = setup();
    const identify = async (claims: JWTPayload) => identifyWith(google, await google.newNonce(t0), claims);
    expect(await identify({ email: 'Ada@Gmail.com' })).toMatchObject({ authoritative: true });
    expect(await identify({ email: 'ada@school.edu', hd: 'school.edu' })).toMatchObject({ email: 'ada@school.edu', authoritative: true });
    expect(await identify({ email: 'ada@yahoo.com' })).toMatchObject({ email: 'ada@yahoo.com', authoritative: false });
    expect(await identify({ email: 'ada@yahoo.com', hd: '' })).toMatchObject({ authoritative: false });
  });

  it("answers 503, not 401, when Google's signing keys cannot be fetched", async () => {
    const unreachable = createRemoteJWKSet(new URL('http://127.0.0.1:1/oauth2/v3/certs'), { timeoutDuration: 1_000 });
    const google = setup(new JoseGoogleIdTokenVerifier(clients, unreachable));
    expect(await rejection(identifyWith(google, await google.newNonce(t0)))).toEqual({ status: 503, code: 'provider_unavailable' });
  });

  it('reports itself disabled without a client id', async () => {
    const google = setup(new DisabledGoogleIdTokenVerifier());
    expect(await rejection(google.newNonce(t0))).toEqual({ status: 404, code: 'provider_disabled' });
    expect(await rejection(google.identify('x', 'n'.repeat(43), t0))).toEqual({ status: 404, code: 'provider_disabled' });
  });

  it('keeps provider failure details out of sign-in logs', async () => {
    const logged = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    const verifier = new JoseGoogleIdTokenVerifier(clients, keys);
    vi.spyOn(verifier, 'verify').mockRejectedValue(new ProviderUnavailableError('private-google-token'));
    const google = setup(verifier);

    expect(await rejection(google.identify('private-id-token', 'private-nonce', t0))).toEqual({
      status: 503,
      code: 'provider_unavailable',
    });

    expect(logged.mock.calls).toEqual([[{ operation: 'auth.google-identify', category: 'unknown', code: 'unknown' }]]);
  });
});
