import { AuthRateLimitService } from './auth-rate-limit.service.js';
import { HttpException, Logger } from '@nestjs/common';
import { MemoryAuthStore, MemoryCoordinationStore } from '../persistence/memory.stores.js';
import { DisabledGitHubOAuthClient, GitHubOAuthClient, type GitHubIdentity } from './github-oauth.client.js';
import { GitHubSignInService, NATIVE_REDIRECT_URI } from './github-sign-in.service.js';
import { OneTimeValues } from './one-time-values.js';
import { ProviderUnavailableError } from './provider-errors.js';
import { hashToken } from './tokens.js';

class StubGitHub extends GitHubOAuthClient {
  readonly app = { clientId: 'Ov23liTest', authorizeUrl: 'https://github.test/login/oauth/authorize' };

  async identify(): Promise<GitHubIdentity> {
    return { subject: '583231', email: 'octocat@example.com' };
  }
}

const t0 = new Date('2026-09-20T10:00:00Z');
const webCallback = 'https://grasp.test/auth/callback';
const [verifierA, verifierB] = ['a'.repeat(43), 'b'.repeat(43)];
const tokenForm = (codeVerifier: string) => ({
  grant_type: 'authorization_code',
  client_id: 'Ov23liTest',
  code: 'code-123',
  redirect_uri: NATIVE_REDIRECT_URI,
  code_verifier: codeVerifier,
});

function setup(github: GitHubOAuthClient = new StubGitHub()) {
  const store = new MemoryAuthStore();
  return {
    github: new GitHubSignInService(
      github,
      new OneTimeValues(store),
      new AuthRateLimitService(new MemoryCoordinationStore(() => t0.getTime())),
    ),
    store,
  };
}

const rejection = async (promise: Promise<unknown>) => {
  const e = await promise.then(
    () => null,
    (error: unknown) => error,
  );
  if (!(e instanceof HttpException)) throw new Error(`Expected an HTTP error, got ${String(e)}`);
  return { status: e.getStatus(), code: (e.getResponse() as { code?: string }).code };
};

afterEach(() => vi.restoreAllMocks());

describe('GitHub sign-in', () => {
  it("binds the ticket to the app's verifier, storing only the verifier's hash", async () => {
    const { github, store } = setup();
    const stored = vi.spyOn(store, 'addOneTime');
    const { access_token: ticket } = await github.token(tokenForm(verifierA), webCallback, t0);

    expect(stored.mock.calls[0]?.[0].payload).toEqual({
      subject: '583231',
      email: 'octocat@example.com',
      verifierHash: hashToken(verifierA),
    });
    expect(JSON.stringify(stored.mock.calls)).not.toContain(verifierA);
    expect(await github.redeem(ticket, verifierA, t0)).toEqual({
      provider: 'github',
      subject: '583231',
      email: 'octocat@example.com',
      authoritative: false,
    });
    expect(await rejection(github.redeem(ticket, verifierA, t0))).toEqual({ status: 401, code: 'invalid_ticket' });
  });

  it('refuses a ticket presented with another verifier than it was issued for, which spends it', async () => {
    const { github } = setup();
    const { access_token: ticket } = await github.token(tokenForm(verifierA), webCallback, t0);
    expect(await rejection(github.redeem(ticket, verifierB, t0))).toEqual({ status: 401, code: 'invalid_ticket' });
    expect(await rejection(github.redeem(ticket, verifierA, t0))).toEqual({ status: 401, code: 'invalid_ticket' });
  });

  it('refuses unknown and expired tickets', async () => {
    const { github } = setup();
    expect(await rejection(github.redeem('x'.repeat(43), verifierA, t0))).toEqual({ status: 401, code: 'invalid_ticket' });
    const { access_token: ticket } = await github.token(tokenForm(verifierA), webCallback, t0);
    expect(await rejection(github.redeem(ticket, verifierA, new Date(t0.getTime() + 5 * 60_000)))).toEqual({
      status: 401,
      code: 'invalid_ticket',
    });
  });

  it('reports itself disabled without a GitHub app', async () => {
    const { github } = setup(new DisabledGitHubOAuthClient());
    expect(await rejection(github.token(tokenForm(verifierA), webCallback, t0))).toEqual({ status: 404, code: 'provider_disabled' });
    expect(await rejection(github.redeem('x'.repeat(43), verifierA, t0))).toEqual({ status: 404, code: 'provider_disabled' });
  });

  it('keeps provider failure details out of sign-in logs', async () => {
    const logged = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    const client = new StubGitHub();
    vi.spyOn(client, 'identify').mockRejectedValue(new ProviderUnavailableError('private-github-token'));
    const { github } = setup(client);

    expect(await rejection(github.token(tokenForm(verifierA), webCallback, t0))).toMatchObject({ status: 503 });
    expect(logged.mock.calls).toEqual([[{ operation: 'auth.github-identify', category: 'unknown', code: 'unknown' }]]);
  });
});
