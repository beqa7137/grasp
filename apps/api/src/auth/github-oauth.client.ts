import { Logger } from '@nestjs/common';
import { safeErrorDetails } from '../observability/safe-error.js';
import { InvalidCredentialError, ProviderUnavailableError } from './provider-errors.js';

/** Public values the app needs to start GitHub sign-in. */
export interface GitHubApp {
  clientId: string;
  authorizeUrl: string;
}

export interface GitHubSettings {
  clientId: string;
  clientSecret: string;
  webUrl: string;
  apiUrl: string;
}

export interface GitHubGrant {
  code: string;
  redirectUri: string;
  codeVerifier: string;
}

export interface GitHubIdentity {
  /** GitHub's numeric user id, which never changes (unlike the login or emails). */
  subject: string;
  email: string | null;
}

export abstract class GitHubOAuthClient {
  /** Null when GitHub sign-in is not configured. */
  abstract readonly app: GitHubApp | null;
  /** Exchanges an authorization code, reads who signed in, then revokes GitHub's token so it outlives no request. */
  abstract identify(grant: GitHubGrant): Promise<GitHubIdentity>;
}

export class DisabledGitHubOAuthClient extends GitHubOAuthClient {
  readonly app = null;

  async identify(): Promise<GitHubIdentity> {
    throw new Error('GitHub sign-in is not configured');
  }
}

const TIMEOUT_MS = 5_000;
const NOREPLY = /@users\.noreply\.github\.com$/i;
const API_HEADERS = { accept: 'application/vnd.github+json' };

export class HttpGitHubOAuthClient extends GitHubOAuthClient {
  readonly app: GitHubApp;
  private readonly log = new Logger('GitHub');

  constructor(
    private readonly settings: GitHubSettings,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly timeoutMs = TIMEOUT_MS,
  ) {
    super();
    this.app = { clientId: settings.clientId, authorizeUrl: `${settings.webUrl}/login/oauth/authorize` };
  }

  async identify(grant: GitHubGrant): Promise<GitHubIdentity> {
    const token = await this.exchange(grant);
    try {
      const [user, emails] = await Promise.all([this.api('/user', token), this.api('/user/emails', token)]);
      const id = (user as { id?: unknown } | null)?.id;
      if (!Number.isSafeInteger(id)) throw new ProviderUnavailableError('GitHub returned a user without an id');
      return { subject: String(id), email: pickEmail(emails) };
    } finally {
      await this.revoke(token);
    }
  }

  private async exchange({ code, redirectUri, codeVerifier }: GitHubGrant): Promise<string> {
    const { clientId, clientSecret, webUrl } = this.settings;
    const res = await this.send(`${webUrl}/login/oauth/access_token`, {
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: redirectUri,
        code_verifier: codeVerifier,
      }),
    });
    const body = (await this.read(res)) as { access_token?: unknown; error?: unknown } | null;
    if (res.ok && typeof body?.access_token === 'string') return body.access_token;
    // GitHub answers 200 with an `error` for bad, expired or reused codes, and for app misconfiguration.
    const reason = typeof body?.error === 'string' ? body.error : `status ${res.status}`;
    this.log.warn({ operation: 'auth.github-exchange-rejected' });
    throw new InvalidCredentialError(`GitHub rejected the authorization code: ${reason}`);
  }

  private async api(path: string, token: string): Promise<unknown> {
    const res = await this.send(`${this.settings.apiUrl}${path}`, { headers: { ...API_HEADERS, authorization: `Bearer ${token}` } });
    if (res.status < 500 && !res.ok) throw new InvalidCredentialError(`GitHub refused ${path}: status ${res.status}`);
    return this.read(res);
  }

  /** Best effort: a token that fails to revoke still expires on GitHub's side and was never stored here. */
  private async revoke(token: string): Promise<void> {
    const { clientId, clientSecret, apiUrl } = this.settings;
    try {
      const res = await this.send(`${apiUrl}/applications/${encodeURIComponent(clientId)}/token`, {
        method: 'DELETE',
        headers: {
          ...API_HEADERS,
          authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ access_token: token }),
      });
      await res.body?.cancel();
      if (!res.ok) throw new Error(`status ${res.status}`);
    } catch (e) {
      this.log.warn({ operation: 'auth.github-revoke', ...safeErrorDetails(e) });
    }
  }

  private async send(url: string, init: RequestInit): Promise<Response> {
    try {
      return await this.fetchImpl(url, {
        ...init,
        headers: { 'user-agent': 'grasp', ...init.headers },
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (e) {
      throw new ProviderUnavailableError(`GitHub request failed: ${e instanceof Error ? e.name : String(e)}`);
    }
  }

  private async read(res: Response): Promise<unknown> {
    if (res.status >= 500) throw new ProviderUnavailableError(`GitHub answered ${res.status}`);
    try {
      return await res.json();
    } catch (e) {
      throw new ProviderUnavailableError(`GitHub sent an unreadable response: ${e instanceof Error ? e.name : String(e)}`);
    }
  }
}

/** Primary and verified, else the first verified one; never a noreply alias, which cannot receive mail. */
export function pickEmail(entries: unknown): string | null {
  if (!Array.isArray(entries)) return null;
  const usable = entries.filter(
    (e): e is { email: string; primary?: unknown } => typeof e?.email === 'string' && e.verified === true && !NOREPLY.test(e.email),
  );
  return (usable.find((e) => e.primary === true) ?? usable[0])?.email ?? null;
}
