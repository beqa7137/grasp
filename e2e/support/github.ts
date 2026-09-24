import type { BrowserContext } from '@playwright/test';

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
  const res = await context.request.post(`${fakeGitHubUrl}/_control/session`, { data: user });
  if (!res.ok()) throw new Error(`The fake GitHub refused the test user: ${res.status()} ${await res.text()}`);
}
