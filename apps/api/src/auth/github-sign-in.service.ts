import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { z } from 'zod';
import { safeErrorDetails } from '../observability/safe-error.js';
import { invalidTicket, oauthError, providerDisabled } from './auth-errors.js';
import { AuthRateLimitService } from './auth-rate-limit.service.js';
import type { VerifiedIdentity } from './auth.types.js';
import { GitHubOAuthClient, type GitHubApp, type GitHubIdentity } from './github-oauth.client.js';
import { OneTimeValues } from './one-time-values.js';
import { InvalidCredentialError, ProviderUnavailableError } from './provider-errors.js';
import { hashToken, sameHash } from './tokens.js';

export const NATIVE_REDIRECT_URI = 'dev.grasp.app://oauth/github';
const TICKET_TTL_SECONDS = 5 * 60;

export const codeVerifierSchema = z.string().regex(/^[\w.~-]{43,128}$/);

const tokenRequestSchema = z.object({
  grant_type: z.literal('authorization_code'),
  client_id: z.string().min(1).max(256),
  code: z.string().min(1).max(512),
  redirect_uri: z.string().min(1).max(2048),
  code_verifier: codeVerifierSchema,
});

export interface TicketResponse {
  access_token: string;
  token_type: 'bearer';
  expires_in: number;
  scope: string;
}

interface TicketPayload extends GitHubIdentity {
  verifierHash: string;
}

/**
 * The app runs GitHub's authorization-code flow (PKCE and state) and posts the code here, as to an OAuth
 * token endpoint. The server adds the client secret, learns who signed in and answers with a single-use
 * Grasp ticket in place of GitHub's token, which never leaves the server.
 */
@Injectable()
export class GitHubSignInService {
  private readonly log = new Logger(GitHubSignInService.name);

  constructor(
    private readonly github: GitHubOAuthClient,
    private readonly oneTime: OneTimeValues,
    private readonly limits: AuthRateLimitService,
  ) {}

  /** `webRedirectUri` is this site's own callback page. */
  async token(form: unknown, webRedirectUri: string, now = new Date()): Promise<TicketResponse> {
    const app = this.requireApp();
    const parsed = tokenRequestSchema.safeParse(form);
    if (!parsed.success) {
      throw oauthError(HttpStatus.BAD_REQUEST, 'invalid_request', 'The token request is missing or has invalid parameters.');
    }
    const { client_id: clientId, code, redirect_uri: redirectUri, code_verifier: codeVerifier } = parsed.data;
    if (clientId !== app.clientId) throw oauthError(HttpStatus.UNAUTHORIZED, 'invalid_client', 'Unknown client_id.');
    if (redirectUri !== NATIVE_REDIRECT_URI && redirectUri !== webRedirectUri) {
      throw oauthError(HttpStatus.BAD_REQUEST, 'invalid_request', 'redirect_uri is not allowed.');
    }

    let identity: GitHubIdentity;
    try {
      identity = await this.github.identify({ code, redirectUri, codeVerifier });
    } catch (e) {
      if (e instanceof InvalidCredentialError) throw oauthError(HttpStatus.BAD_REQUEST, 'invalid_grant', 'GitHub did not accept the code.');
      if (e instanceof ProviderUnavailableError) {
        this.log.warn({ operation: 'auth.github-identify', ...safeErrorDetails(e) });
        throw oauthError(HttpStatus.SERVICE_UNAVAILABLE, 'temporarily_unavailable', "GitHub can't be reached right now.");
      }
      throw e;
    }
    await this.limits.githubTicket(identity.subject);
    const payload: TicketPayload = { ...identity, verifierHash: hashToken(codeVerifier) };
    const ticket = await this.oneTime.issue('github_ticket', TICKET_TTL_SECONDS * 1000, payload, now);
    return { access_token: ticket, token_type: 'bearer', expires_in: TICKET_TTL_SECONDS, scope: 'user:email' };
  }

  /**
   * Takes the PKCE verifier the app chose for this sign-in, so a ticket issued to someone else's sign-in cannot be
   * slipped into it; a mismatch still spends the ticket. A missing email is not refused here: linking accepts it,
   * and AccountService refuses it only for a new account.
   */
  async redeem(ticket: string, codeVerifier: string, now = new Date()): Promise<VerifiedIdentity> {
    this.requireApp();
    const payload = (await this.oneTime.consume('github_ticket', ticket, now))?.payload as TicketPayload | undefined;
    if (!payload || !sameHash(hashToken(codeVerifier), payload.verifierHash)) throw invalidTicket();
    return { provider: 'github', subject: payload.subject, email: payload.email, authoritative: false };
  }

  private requireApp(): GitHubApp {
    if (!this.github.app) throw providerDisabled('github');
    return this.github.app;
  }
}
