import { createHash, randomBytes } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

export interface GitHubAccount {
  id: number;
  emails: { email: string; primary: boolean; verified: boolean }[];
}

interface Grant {
  account: GitHubAccount;
  redirectUri: string;
  codeChallenge: string;
}

const s256 = (verifier: string) => createHash('sha256').update(verifier).digest('base64url');

/**
 * A local stand-in for github.com and api.github.com that checks what the real one checks on the token
 * exchange: client id and secret, a single-use code, the same redirect_uri and the PKCE verifier.
 */
export class FakeGitHub {
  readonly clientId = 'Ov23liFakeGrasp';
  readonly clientSecret = 'fake-github-secret';
  /** Revoked access tokens, in order. */
  readonly revoked: string[] = [];
  /** The next token exchange answers with this HTTP status instead. */
  failNextExchange: number | null = null;

  private readonly grants = new Map<string, Grant>();
  private readonly tokens = new Map<string, GitHubAccount>();

  private constructor(private readonly server: Server) {}

  static async start(): Promise<FakeGitHub> {
    const server = createServer();
    const fake = new FakeGitHub(server);
    server.on('request', (req, res) => void fake.handle(req, res));
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    return fake;
  }

  get url(): string {
    return `http://127.0.0.1:${(this.server.address() as AddressInfo).port}`;
  }

  env(): Record<string, string> {
    return {
      OAUTH_GITHUB_ID: this.clientId,
      OAUTH_GITHUB_SECRET: this.clientSecret,
      OAUTH_GITHUB_URL: this.url,
      OAUTH_GITHUB_API_URL: `${this.url}/api`,
    };
  }

  /** What GitHub's authorize page does once the user approves: returns the code for the redirect. */
  authorize(account: GitHubAccount, redirectUri: string, codeVerifier: string): string {
    const code = randomBytes(10).toString('hex');
    this.grants.set(code, { account, redirectUri, codeChallenge: s256(codeVerifier) });
    return code;
  }

  close(): Promise<void> {
    return new Promise((resolve) => this.server.close(() => resolve()));
  }

  private async handle(req: IncomingMessage, res: ServerResponse) {
    const url = new URL(req.url ?? '/', this.url);
    const body = await readBody(req);
    const route = `${req.method} ${url.pathname}`;

    if (route === 'POST /login/oauth/access_token') return this.exchange(new URLSearchParams(body), res);

    if (route === `DELETE /api/applications/${this.clientId}/token`) {
      const basic = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');
      if (req.headers.authorization !== `Basic ${basic}`) return send(res, 401, { message: 'Requires authentication' });
      const token = (JSON.parse(body) as { access_token: string }).access_token;
      this.tokens.delete(token);
      this.revoked.push(token);
      return send(res, 204);
    }

    const account = this.tokens.get(req.headers.authorization?.replace(/^Bearer /, '') ?? '');
    if (!account) return send(res, 401, { message: 'Bad credentials' });
    if (route === 'GET /api/user') return send(res, 200, { id: account.id, login: `user${account.id}` });
    if (route === 'GET /api/user/emails') return send(res, 200, account.emails);
    return send(res, 404, { message: 'Not Found' });
  }

  private exchange(form: URLSearchParams, res: ServerResponse) {
    if (this.failNextExchange) {
      const status = this.failNextExchange;
      this.failNextExchange = null;
      return send(res, status, { message: 'Unavailable' });
    }
    if (form.get('client_id') !== this.clientId || form.get('client_secret') !== this.clientSecret) {
      return send(res, 200, { error: 'incorrect_client_credentials' });
    }
    const grant = this.grants.get(form.get('code') ?? '');
    this.grants.delete(form.get('code') ?? '');
    if (!grant) return send(res, 200, { error: 'bad_verification_code' });
    if (grant.redirectUri !== form.get('redirect_uri')) return send(res, 200, { error: 'redirect_uri_mismatch' });
    if (grant.codeChallenge !== s256(form.get('code_verifier') ?? '')) return send(res, 200, { error: 'bad_verification_code' });
    const token = `gho_${randomBytes(16).toString('hex')}`;
    this.tokens.set(token, grant.account);
    return send(res, 200, { access_token: token, token_type: 'bearer', scope: 'user:email' });
  }
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf8');
}

function send(res: ServerResponse, status: number, body?: unknown) {
  res.writeHead(status, body === undefined ? {} : { 'content-type': 'application/json' });
  res.end(body === undefined ? undefined : JSON.stringify(body));
}
