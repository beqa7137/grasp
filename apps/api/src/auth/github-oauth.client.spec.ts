import { Logger } from '@nestjs/common';
import { HttpGitHubOAuthClient, pickEmail, type GitHubSettings } from './github-oauth.client.js';
import { InvalidCredentialError, ProviderUnavailableError } from './provider-errors.js';

const settings: GitHubSettings = {
  clientId: 'Ov23liTest',
  clientSecret: 'test-secret',
  webUrl: 'https://github.test',
  apiUrl: 'https://api.github.test',
};
const grant = { code: 'code-123', redirectUri: 'dev.grasp.app://oauth/github', codeVerifier: 'v'.repeat(43) };

interface Call {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: string;
}

type Route = (call: Call, signal?: AbortSignal | null) => Response | Promise<Response>;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

function fakeGitHub(overrides: Record<string, Route> = {}) {
  const calls: Call[] = [];
  const routes: Record<string, Route> = {
    'POST /login/oauth/access_token': () => json({ access_token: 'gho_secret', token_type: 'bearer', scope: 'user:email' }),
    'GET /user': () => json({ id: 583231, login: 'octocat' }),
    'GET /user/emails': () => json([{ email: 'octocat@example.com', primary: true, verified: true, visibility: 'private' }]),
    'DELETE /applications/Ov23liTest/token': () => new Response(null, { status: 204 }),
    ...overrides,
  };
  const fetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = new URL(String(input));
    const call: Call = {
      method: init?.method ?? 'GET',
      url: String(input),
      headers: Object.fromEntries(new Headers(init?.headers).entries()),
      body: init?.body ? String(init.body) : '',
    };
    calls.push(call);
    const route = routes[`${call.method} ${url.pathname}`];
    if (!route) return json({ message: 'Not Found' }, 404);
    return route(call, init?.signal);
  };
  return { client: new HttpGitHubOAuthClient(settings, fetch as typeof globalThis.fetch, 50), calls };
}

const hang: Route = (_, signal) =>
  new Promise<Response>((_resolve, reject) => signal?.addEventListener('abort', () => reject(signal.reason)));

beforeAll(() => Logger.overrideLogger(false));

describe('HttpGitHubOAuthClient', () => {
  it('exposes what the app needs to start the flow', () => {
    expect(fakeGitHub().client.app).toEqual({ clientId: 'Ov23liTest', authorizeUrl: 'https://github.test/login/oauth/authorize' });
  });

  it('exchanges the code with the secret, reads the identity and revokes the token', async () => {
    const { client, calls } = fakeGitHub();
    expect(await client.identify(grant)).toEqual({ subject: '583231', email: 'octocat@example.com' });

    const [exchange] = calls;
    expect(exchange.url).toBe('https://github.test/login/oauth/access_token');
    expect(exchange.headers['accept']).toBe('application/json');
    expect(Object.fromEntries(new URLSearchParams(exchange.body))).toEqual({
      client_id: 'Ov23liTest',
      client_secret: 'test-secret',
      code: 'code-123',
      redirect_uri: 'dev.grasp.app://oauth/github',
      code_verifier: 'v'.repeat(43),
    });

    for (const api of calls.filter((c) => c.method === 'GET')) {
      expect(api.headers).toMatchObject({
        authorization: 'Bearer gho_secret',
        accept: 'application/vnd.github+json',
        'user-agent': 'grasp',
      });
    }

    const revoke = calls.at(-1)!;
    expect(revoke).toMatchObject({ method: 'DELETE', url: 'https://api.github.test/applications/Ov23liTest/token' });
    expect(revoke.headers['authorization']).toBe(`Basic ${Buffer.from('Ov23liTest:test-secret').toString('base64')}`);
    expect(JSON.parse(revoke.body)).toEqual({ access_token: 'gho_secret' });
  });

  it('treats an error answered with 200 as a rejected code, and calls nothing else', async () => {
    const { client, calls } = fakeGitHub({
      'POST /login/oauth/access_token': () =>
        json({ error: 'bad_verification_code', error_description: 'The code passed is incorrect or expired.' }),
    });
    await expect(client.identify(grant)).rejects.toBeInstanceOf(InvalidCredentialError);
    expect(calls).toHaveLength(1);
  });

  it('still revokes the token when reading the identity fails', async () => {
    const { client, calls } = fakeGitHub({ 'GET /user': () => json({ message: 'Bad credentials' }, 401) });
    await expect(client.identify(grant)).rejects.toBeInstanceOf(InvalidCredentialError);
    expect(calls.at(-1)?.method).toBe('DELETE');
  });

  it('does not fail sign-in when revoking fails', async () => {
    const failing = fakeGitHub({ 'DELETE /applications/Ov23liTest/token': () => json({ message: 'Server Error' }, 500) });
    await expect(failing.client.identify(grant)).resolves.toMatchObject({ subject: '583231' });
    const unreachable = fakeGitHub({ 'DELETE /applications/Ov23liTest/token': () => Promise.reject(new TypeError('fetch failed')) });
    await expect(unreachable.client.identify(grant)).resolves.toMatchObject({ subject: '583231' });
  });

  it('reports GitHub as unavailable on timeouts, network errors and server errors', async () => {
    const slow = fakeGitHub({ 'POST /login/oauth/access_token': hang });
    await expect(slow.client.identify(grant)).rejects.toBeInstanceOf(ProviderUnavailableError);

    const down = fakeGitHub({ 'POST /login/oauth/access_token': () => Promise.reject(new TypeError('fetch failed')) });
    await expect(down.client.identify(grant)).rejects.toBeInstanceOf(ProviderUnavailableError);

    const erroring = fakeGitHub({ 'GET /user/emails': () => new Response('<html>oops</html>', { status: 502 }) });
    await expect(erroring.client.identify(grant)).rejects.toBeInstanceOf(ProviderUnavailableError);
    expect(erroring.calls.at(-1)?.method).toBe('DELETE');
  });

  it('times out the identity calls too, and revokes afterwards', async () => {
    const { client, calls } = fakeGitHub({ 'GET /user': hang });
    await expect(client.identify(grant)).rejects.toBeInstanceOf(ProviderUnavailableError);
    expect(calls.at(-1)?.method).toBe('DELETE');
  });
});

describe('pickEmail', () => {
  it('prefers the primary verified address, then any verified one, never a noreply alias', () => {
    expect(
      pickEmail([
        { email: 'second@example.com', primary: false, verified: true },
        { email: 'first@example.com', primary: true, verified: true },
      ]),
    ).toBe('first@example.com');
    expect(
      pickEmail([
        { email: 'primary@example.com', primary: true, verified: false },
        { email: 'backup@example.com', primary: false, verified: true },
      ]),
    ).toBe('backup@example.com');
    expect(
      pickEmail([
        { email: '583231+octocat@users.noreply.github.com', primary: true, verified: true },
        { email: 'real@example.com', primary: false, verified: true },
      ]),
    ).toBe('real@example.com');
  });

  it('gives null when nothing verified and deliverable is left', () => {
    expect(pickEmail([{ email: 'octocat@users.noreply.github.com', primary: true, verified: true }])).toBeNull();
    expect(pickEmail([{ email: 'unverified@example.com', primary: true, verified: false }])).toBeNull();
    expect(pickEmail([])).toBeNull();
    expect(pickEmail({ message: 'Not Found' })).toBeNull();
  });
});
