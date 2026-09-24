import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT, type JSONWebKeySet } from 'jose';
import { JoseGoogleIdTokenVerifier } from '../../src/auth/google-id-token.verifier.js';

export interface GoogleAccount {
  sub: string;
  email: string;
  emailVerified?: boolean;
  hd?: string;
}

/** Signs ID tokens the way Google does, with a key the app under test trusts in place of Google's. */
export class FakeGoogle {
  readonly webClientId = 'grasp-web.apps.googleusercontent.com';

  private constructor(
    private readonly privateKey: CryptoKey,
    private readonly jwks: JSONWebKeySet,
  ) {}

  static async create(): Promise<FakeGoogle> {
    const { privateKey, publicKey } = await generateKeyPair('RS256');
    return new FakeGoogle(privateKey, { keys: [{ ...(await exportJWK(publicKey)), kid: 'fake-google', alg: 'RS256', use: 'sig' }] });
  }

  env(): Record<string, string> {
    return { GOOGLE_WEB_CLIENT_ID: this.webClientId };
  }

  verifier(): JoseGoogleIdTokenVerifier {
    return new JoseGoogleIdTokenVerifier({ webClientId: this.webClientId, iosClientId: null }, createLocalJWKSet(this.jwks));
  }

  idToken(account: GoogleAccount, nonce: string): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    return new SignJWT({
      email: account.email,
      email_verified: account.emailVerified ?? true,
      nonce,
      ...(account.hd ? { hd: account.hd } : {}),
    })
      .setProtectedHeader({ alg: 'RS256', kid: 'fake-google', typ: 'JWT' })
      .setIssuer('https://accounts.google.com')
      .setAudience(this.webClientId)
      .setSubject(account.sub)
      .setIssuedAt(now)
      .setExpirationTime(now + 3600)
      .sign(this.privateKey);
  }
}
