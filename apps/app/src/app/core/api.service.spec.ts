import { TestBed } from '@angular/core/testing';
import { ApiError, ApiService } from './api.service';
import { AuthTokens } from './auth-tokens.service';
import { LearnerService } from './learner.service';
import { RuntimeConfigService } from './runtime-config.service';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

function setup(respond: (path: string, token: string | null) => Response) {
  const requests: string[] = [];
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    const token = (init.headers as Record<string, string>)['authorization'] ?? null;
    requests.push(`${url} ${token ?? 'anonymous'}`);
    return respond(url.replace('/api', ''), token);
  }) as typeof fetch;
  TestBed.configureTestingModule({
    providers: [
      { provide: LearnerService, useValue: { id: () => 'device-learner' } },
      { provide: RuntimeConfigService, useValue: { apiBase: () => '/api' } },
    ],
  });
  const tokens = TestBed.inject(AuthTokens);
  return { api: TestBed.inject(ApiService), tokens, requests };
}

describe('ApiService', () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it('renews an expired access token for signed-in account routes, then retries once', async () => {
    const { api, tokens, requests } = setup((_, token) =>
      token === 'Bearer fresh' ? json(200, { identities: [] }) : json(401, { statusCode: 401, message: 'Expired', code: 'token_invalid' }),
    );
    tokens.accessToken.set('stale');
    tokens.refresher = async () => (tokens.accessToken.set('fresh'), true);
    expect(await api.get('/auth/me')).toEqual({ identities: [] });
    expect(requests).toEqual(['/api/auth/me Bearer stale', '/api/auth/me Bearer fresh']);
  });

  it('never renews around the refresh call itself', async () => {
    let refreshes = 0;
    const { api, tokens } = setup(() => json(401, { statusCode: 401, message: 'Expired', code: 'token_invalid' }));
    tokens.refresher = async () => (refreshes++, true);
    await expect(api.post('/auth/refresh', { refreshToken: 'r' })).rejects.toBeInstanceOf(ApiError);
    expect(refreshes).toBe(0);
  });

  it("rejects with the API's status, code and message", async () => {
    const { api } = setup(() =>
      json(409, { statusCode: 409, message: 'This email already has a Grasp account.', code: 'account_exists', providers: ['google'] }),
    );
    const error = await api.post('/auth/github', { ticket: 't', codeVerifier: 'v' }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 409, code: 'account_exists', message: 'This email already has a Grasp account.' });
  });
});
