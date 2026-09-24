import { createRemoteJWKSet, errors, jwtVerify, type JWTVerifyGetKey } from 'jose';
import { InvalidCredentialError, ProviderUnavailableError } from './provider-errors.js';

const GOOGLE_KEYS_URL = new URL('https://www.googleapis.com/oauth2/v3/certs');
const ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];

/** Public OAuth client ids the app needs to start Google sign-in. */
export interface GoogleClients {
  webClientId: string;
  iosClientId: string | null;
}

export interface GoogleIdToken {
  subject: string;
  nonce: string;
  /** Only when Google marked it verified. */
  email: string | null;
  /** Google owns the address (gmail.com) or the Workspace domain (`hd`), so the email proves the account. */
  authoritative: boolean;
}

export abstract class GoogleIdTokenVerifier {
  /** Null when Google sign-in is not configured. */
  abstract readonly clients: GoogleClients | null;
  abstract verify(idToken: string, now?: Date): Promise<GoogleIdToken>;
}

export class DisabledGoogleIdTokenVerifier extends GoogleIdTokenVerifier {
  readonly clients = null;

  async verify(): Promise<GoogleIdToken> {
    throw new Error('Google sign-in is not configured');
  }
}

/** Checks Google ID tokens locally against Google's published signing keys. */
export class JoseGoogleIdTokenVerifier extends GoogleIdTokenVerifier {
  private readonly audiences: string[];

  constructor(
    readonly clients: GoogleClients,
    private readonly keys: JWTVerifyGetKey = createRemoteJWKSet(GOOGLE_KEYS_URL),
  ) {
    super();
    this.audiences = [clients.webClientId, ...(clients.iosClientId ? [clients.iosClientId] : [])];
  }

  async verify(idToken: string, now = new Date()): Promise<GoogleIdToken> {
    const { payload } = await jwtVerify(idToken, this.keyFor, {
      algorithms: ['RS256'],
      issuer: ISSUERS,
      audience: this.audiences,
      clockTolerance: 60,
      maxTokenAge: '10m',
      requiredClaims: ['sub', 'nonce'],
      currentDate: now,
    }).catch((e: unknown) => {
      if (e instanceof ProviderUnavailableError) throw e;
      throw new InvalidCredentialError(`Google ID token rejected: ${e instanceof Error ? e.message : String(e)}`);
    });
    const { sub, nonce, email, email_verified: emailVerified, hd } = payload;
    if (typeof sub !== 'string' || typeof nonce !== 'string') throw new InvalidCredentialError('Google ID token has malformed claims');
    const verifiedEmail = emailVerified === true && typeof email === 'string' ? email : null;
    return {
      subject: sub,
      nonce,
      email: verifiedEmail,
      authoritative:
        verifiedEmail !== null && (verifiedEmail.toLowerCase().endsWith('@gmail.com') || (typeof hd === 'string' && hd !== '')),
    };
  }

  /** Separates "Google's keys are unreachable" (retry later) from "no key signed this token" (reject). */
  private readonly keyFor: JWTVerifyGetKey = async (header, token) => {
    try {
      return await this.keys(header, token);
    } catch (e) {
      if (e instanceof errors.JWKSNoMatchingKey || e instanceof errors.JWKSMultipleMatchingKeys) throw e;
      throw new ProviderUnavailableError(`Google signing keys unavailable: ${e instanceof Error ? e.message : String(e)}`);
    }
  };
}
