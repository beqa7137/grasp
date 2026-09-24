import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { z } from 'zod';
import { invalidTicket, oauthError, providerDisabled } from './auth-errors.js';
import type { VerifiedIdentity } from './auth.types.js';
import { GitHubOAuthClient, type GitHubApp, type GitHubIdentity } from './github-oauth.client.js';
import { OneTimeValues } from './one-time-values.js';
import { InvalidCredentialError, ProviderUnavailableError } from './provider-errors.js';

export const NATIVE_REDIRECT_URI = 'dev.grasp.app://oauth/github';
const TICKET_TTL_SECONDS = 5 * 60;

const tokenRequestSchema = z.object({
  grant_type: z.literal('authorization_code'),
  client_id: z.string().min(1).max(256),
  code: z.string().min(1).max(512),
  redirect_uri: z.string().min(1).max(2048),
  code_verifier: z.string().regex(/^[\w.~-]{43,128}$/),
});

export interface TicketResponse {
  access_token: string;
  token_type: 'bearer';
  expires_in: number;
  scope: string;
}

/**
 * The app runs GitHub's authorization-code flow (PKCE and state) and posts the code here, as to an OAuth
 * token endpoint. The server adds the client secret, learns who signed in and answers with a single-use
 * Grasp ticket in place of GitHub's token, which never leaves the server and is revoked straight away.
 */
@Injectable()
export class GitHubSignInService {
  private readonly log = new Logger(GitHubSignInService.name);

  constructor(
    private readonly github: GitHubOAuthClient,
    private readonly oneTime: OneTimeValues,
  ) {}

  /** `webRedirectUri` is this site's own callback page; the only other accepted target is the native app. */
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
        this.log.warn(e.message);
        throw oauthError(HttpStatus.SERVICE_UNAVAILABLE, 'temporarily_unavailable', "GitHub can't be reached right now.");
      }
      throw e;
    }
    const ticket = await this.oneTime.issue('github_ticket', TICKET_TTL_SECONDS * 1000, identity, now);
    return { access_token: ticket, token_type: 'bearer', expires_in: TICKET_TTL_SECONDS, scope: 'user:email' };
  }

  /** Whether the GitHub account has a usable email is judged here, when the ticket is spent, not at the token endpoint. */
  async redeem(ticket: string, now = new Date()): Promise<VerifiedIdentity> {
    this.requireApp();
    const record = await this.oneTime.consume('github_ticket', ticket, now);
    if (!record) throw invalidTicket();
    const { subject, email } = record.payload as GitHubIdentity;
    return { provider: 'github', subject, email, authoritative: false };
  }

  private requireApp(): GitHubApp {
    if (!this.github.app) throw providerDisabled('github');
    return this.github.app;
  }
}
