import { Injectable, Logger } from '@nestjs/common';
import { safeErrorDetails } from '../observability/safe-error.js';
import { invalidCredential, providerDisabled, providerUnavailable } from './auth-errors.js';
import type { VerifiedIdentity } from './auth.types.js';
import { GoogleIdTokenVerifier, type GoogleIdToken } from './google-id-token.verifier.js';
import { OneTimeValues } from './one-time-values.js';
import { InvalidCredentialError, ProviderUnavailableError } from './provider-errors.js';

const NONCE_TTL_MS = 10 * 60_000;

/**
 * Every Google sign-in carries a nonce the server issued moments before and accepts only once, so an
 * ID token that leaks (or is replayed from another app) cannot sign anyone in. The app also sends the
 * nonce it asked Google for, so a token minted for someone else's nonce cannot be slipped into its sign-in.
 */
@Injectable()
export class GoogleSignInService {
  private readonly log = new Logger(GoogleSignInService.name);

  constructor(
    private readonly verifier: GoogleIdTokenVerifier,
    private readonly oneTime: OneTimeValues,
  ) {}

  async newNonce(now = new Date()): Promise<string> {
    this.requireEnabled();
    return this.oneTime.issue('google_nonce', NONCE_TTL_MS, null, now);
  }

  async identify(idToken: string, nonce: string, now = new Date()): Promise<VerifiedIdentity> {
    this.requireEnabled();
    let token: GoogleIdToken;
    try {
      token = await this.verifier.verify(idToken, now);
    } catch (e) {
      if (e instanceof ProviderUnavailableError) {
        this.log.warn({ operation: 'auth.google-identify', ...safeErrorDetails(e) });
        throw providerUnavailable('google');
      }
      if (e instanceof InvalidCredentialError) throw invalidCredential('google');
      throw e;
    }
    if (token.nonce !== nonce || !(await this.oneTime.consume('google_nonce', nonce, now))) throw invalidCredential('google');
    return { provider: 'google', subject: token.subject, email: token.email, authoritative: token.authoritative };
  }

  private requireEnabled() {
    if (!this.verifier.clients) throw providerDisabled('google');
  }
}
