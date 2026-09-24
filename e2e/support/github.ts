import type { APIRequestContext, BrowserContext } from '@playwright/test';
import { createHash, randomBytes } from 'node:crypto';

/** The GitHub OAuth app that the API under test and the fake GitHub server (fake-github.ts) share. */
export const githubApp = {
  port: Number(process.env.E2E_GITHUB_PORT ?? 4410),
  clientId: 'Ov23liE2eGrasp',
  clientSecret: 'e2e-only-github-client-secret',
};

export const fakeGitHubUrl = `http://localhost:${githubApp.port}`;

export interface GitHubUser {
  id: number;
  login: string;
  emails: { email: string; primary: boolean; verified: boolean }[];
}

/** Signs this browser in to the fake GitHub as `user`, so the next "Continue with GitHub" authorizes as them. */
export async function signInToGitHub(context: BrowserContext, user: GitHubUser): Promise<void> {
  await startSession(context.request, user);
}

/**
 * What `user` can get for the web app at `appUrl` with a client and PKCE verifier of their own: an unused
 * authorization code from GitHub, and a sign-in ticket from the Grasp API for another code.
 */
export async function collectGitHubResults(
  client: APIRequestContext,
  appUrl: string,
  user: GitHubUser,
): Promise<{ code: string; ticket: string }> {
  await startSession(client, user);
  const codeVerifier = randomBytes(32).toString('base64url');
  const redirectUri = new URL('/auth/callback', appUrl).href;
  const authorize = new URL('/login/oauth/authorize', fakeGitHubUrl);
  authorize.search = new URLSearchParams({
    client_id: githubApp.clientId,
    response_type: 'code',
    redirect_uri: redirectUri,
    scope: 'user:email',
    state: randomBytes(16).toString('hex'),
    code_challenge: createHash('sha256').update(codeVerifier).digest('base64url'),
    code_challenge_method: 'S256',
  }).toString();
  const newCode = async () => {
    const res = await client.post(authorize.href, { form: { decision: 'authorize' }, maxRedirects: 0 });
    const code = new URL(res.headers()['location'] ?? '', appUrl).searchParams.get('code');
    if (!code) throw new Error(`The fake GitHub issued no code: ${res.status()} ${await res.text()}`);
    return code;
  };
  const token = await client.post(new URL('/api/auth/github/token', appUrl).href, {
    form: {
      grant_type: 'authorization_code',
      client_id: githubApp.clientId,
      code: await newCode(),
      redirect_uri: redirectUri,
      code_verifier: codeVerifier,
    },
  });
  if (!token.ok()) throw new Error(`The API issued no ticket: ${token.status()} ${await token.text()}`);
  return { code: await newCode(), ticket: ((await token.json()) as { access_token: string }).access_token };
}

async function startSession(client: APIRequestContext, user: GitHubUser): Promise<void> {
  const res = await client.post(`${fakeGitHubUrl}/_control/session`, { data: user });
  if (!res.ok()) throw new Error(`The fake GitHub refused the test user: ${res.status()} ${await res.text()}`);
}
