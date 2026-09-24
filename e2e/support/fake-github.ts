import { createHash, randomBytes } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';

/**
 * A stand-in for github.com and api.github.com in the browser tests, started by playwright.config.ts.
 * Like GitHub, it shows a consent page (Authorize or Cancel), then checks the token exchange: client id
 * and secret, a single-use code, the same redirect_uri and the PKCE verifier. Each browser picks its own
 * signed-in user through POST /_control/session (a cookie), so tests running in parallel never mix users.
 */

interface User {
  id: number;
  login: string;
  emails: { email: string; primary: boolean; verified: boolean }[];
}

interface Authorization {
  redirectUri: string;
  state: string | null;
  codeChallenge: string;
  scope: string;
}

interface Grant extends Authorization {
  user: User;
}

interface Token {
  user: User;
  scope: string;
}

const port = Number(process.env.PORT);
const clientId = process.env.CLIENT_ID ?? '';
const clientSecret = process.env.CLIENT_SECRET ?? '';
if (!port || !clientId || !clientSecret) throw new Error('fake-github needs PORT, CLIENT_ID and CLIENT_SECRET');

const SESSION_COOKIE = 'fake_github_session';
const MAX_BODY_BYTES = 64 * 1024;
const ACCESS_DENIED_DOCS = 'https://docs.github.com/apps/managing-oauth-apps/troubleshooting-authorization-request-errors/#access-denied';

const sessions = new Map<string, User>();
const grants = new Map<string, Grant>();
const tokens = new Map<string, Token>();

createServer((req, res) => {
  handle(req, res).catch((e: unknown) => json(res, 500, { message: e instanceof Error ? e.message : String(e) }));
}).listen(port);

async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? '/', `http://localhost:${port}`);
  switch (`${req.method} ${url.pathname}`) {
    case 'POST /_control/session':
      return startSession(await readBody(req), res);
    case 'GET /login/oauth/authorize':
      return consentPage(req, url, res);
    case 'POST /login/oauth/authorize':
      return decide(req, url, new URLSearchParams(await readBody(req)), res);
    case 'POST /login/oauth/access_token':
      return exchange(new URLSearchParams(await readBody(req)), res);
    case 'GET /api/user':
      return withToken(req, res, ({ user }) => json(res, 200, { id: user.id, login: user.login }));
    case 'GET /api/user/emails':
      return withToken(req, res, ({ user, scope }) =>
        scope.split(' ').includes('user:email')
          ? json(
              res,
              200,
              user.emails.map((e) => ({ ...e, visibility: e.primary ? 'private' : null })),
            )
          : json(res, 404, { message: 'Not Found' }),
      );
    case `DELETE /api/applications/${clientId}/token`:
      return revoke(req, await readBody(req), res);
    default:
      return json(res, 404, { message: 'Not Found' });
  }
}

function startSession(body: string, res: ServerResponse) {
  const user = JSON.parse(body) as User;
  if (!Number.isSafeInteger(user.id) || typeof user.login !== 'string' || !Array.isArray(user.emails)) {
    return json(res, 400, { message: 'Expected { id, login, emails }' });
  }
  const session = randomBytes(16).toString('hex');
  sessions.set(session, user);
  res.writeHead(204, { 'set-cookie': `${SESSION_COOKIE}=${session}; Path=/; HttpOnly; SameSite=Lax` }).end();
}

function consentPage(req: IncomingMessage, url: URL, res: ServerResponse) {
  const request = authorization(url);
  if (typeof request === 'string') return html(res, 400, `<p>${request}</p>`);
  const user = signedInUser(req);
  if (!user) return html(res, 401, '<p>Sign in to GitHub first.</p>');
  // Without an action the form posts back to this URL, query string included.
  return html(
    res,
    200,
    `<h1>Authorize Grasp</h1><p>Signed in as ${escapeHtml(user.login)}.</p><form method="post"><button name="decision" value="cancel">Cancel</button> <button name="decision" value="authorize">Authorize</button></form>`,
  );
}

/** Cancel sends the person back with the error GitHub uses when access is denied. */
function decide(req: IncomingMessage, url: URL, form: URLSearchParams, res: ServerResponse) {
  const request = authorization(url);
  const user = signedInUser(req);
  if (typeof request === 'string' || !user) return html(res, 400, '<p>Bad authorization request.</p>');
  const back = new URL(request.redirectUri);
  if (form.get('decision') === 'cancel') {
    back.searchParams.set('error', 'access_denied');
    back.searchParams.set('error_description', 'The user has denied your application access.');
    back.searchParams.set('error_uri', ACCESS_DENIED_DOCS);
  } else {
    const code = randomBytes(10).toString('hex');
    grants.set(code, { ...request, user });
    back.searchParams.set('code', code);
  }
  if (request.state !== null) back.searchParams.set('state', request.state);
  res.writeHead(302, { location: back.href }).end();
}

/** GitHub answers token-exchange failures with 200 and an `error` field. */
function exchange(form: URLSearchParams, res: ServerResponse) {
  if (form.get('client_id') !== clientId || form.get('client_secret') !== clientSecret) {
    return json(res, 200, {
      error: 'incorrect_client_credentials',
      error_description: 'The client_id and/or client_secret are incorrect.',
    });
  }
  const code = form.get('code') ?? '';
  const grant = grants.get(code);
  grants.delete(code);
  if (!grant) return json(res, 200, { error: 'bad_verification_code', error_description: 'The code is incorrect or expired.' });
  if (form.get('redirect_uri') !== grant.redirectUri) {
    return json(res, 200, { error: 'redirect_uri_mismatch', error_description: 'The redirect_uri does not match the authorization.' });
  }
  if (s256(form.get('code_verifier') ?? '') !== grant.codeChallenge) {
    return json(res, 200, { error: 'bad_verification_code', error_description: 'The code_verifier does not match the code_challenge.' });
  }
  const token = `gho_${randomBytes(18).toString('base64url')}`;
  tokens.set(token, { user: grant.user, scope: grant.scope });
  return json(res, 200, { access_token: token, token_type: 'bearer', scope: grant.scope });
}

function withToken(req: IncomingMessage, res: ServerResponse, respond: (token: Token) => void) {
  const token = tokens.get(req.headers.authorization?.replace(/^(Bearer|token) /i, '') ?? '');
  if (!token) return json(res, 401, { message: 'Bad credentials' });
  respond(token);
}

function revoke(req: IncomingMessage, body: string, res: ServerResponse) {
  const basic = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`;
  if (req.headers.authorization !== basic) return json(res, 401, { message: 'Requires authentication' });
  const { access_token: token } = JSON.parse(body) as { access_token?: string };
  if (!token || !tokens.delete(token)) return json(res, 404, { message: 'Not Found' });
  res.writeHead(204).end();
}

function authorization(url: URL): Authorization | string {
  const query = url.searchParams;
  if (query.get('client_id') !== clientId) return 'Unknown client_id.';
  if (query.get('response_type') !== 'code') return 'response_type must be code.';
  const codeChallenge = query.get('code_challenge');
  if (query.get('code_challenge_method') !== 'S256' || !codeChallenge) return 'PKCE with S256 is required.';
  const redirectUri = query.get('redirect_uri');
  if (!redirectUri || !URL.canParse(redirectUri)) return 'A valid redirect_uri is required.';
  return { redirectUri, state: query.get('state'), codeChallenge, scope: query.get('scope') ?? '' };
}

function signedInUser(req: IncomingMessage): User | undefined {
  const cookie = req.headers.cookie
    ?.split(/;\s*/)
    .find((pair) => pair.startsWith(`${SESSION_COOKIE}=`))
    ?.slice(SESSION_COOKIE.length + 1);
  return cookie ? sessions.get(cookie) : undefined;
}

async function readBody(req: IncomingMessage): Promise<string> {
  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (body.length > MAX_BODY_BYTES) throw new Error('Request body too large');
  }
  return body;
}

function json(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' }).end(JSON.stringify(body));
}

function html(res: ServerResponse, status: number, body: string) {
  res.writeHead(status, { 'content-type': 'text/html; charset=utf-8' }).end(`<!doctype html><title>GitHub</title>${body}`);
}

function s256(verifier: string) {
  return createHash('sha256').update(verifier).digest('base64url');
}

function escapeHtml(text: string) {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}
