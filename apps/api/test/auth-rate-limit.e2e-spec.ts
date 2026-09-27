import type { NestExpressApplication } from '@nestjs/platform-express';
import { randomInt, randomUUID } from 'node:crypto';
import request, { type Response } from 'supertest';
import { AUTH_NETWORK_LIMIT } from '../src/auth/auth-rate-limit.service.js';
import type { Provider } from '../src/auth/auth.types.js';
import { SessionService, type AuthSession } from '../src/auth/session.service.js';
import { hashToken } from '../src/auth/tokens.js';
import { AuthStore, CoordinationStore } from '../src/persistence/stores.js';
import { createTestApp } from './support/app.js';
import { migrateDatabase } from './support/database.js';
import { FakeGoogle } from './support/fake-google.js';
import { freshIp, OAuthFakes } from './support/oauth.js';

const databaseUrl = process.env['TEST_DATABASE_URL'];
const storages = databaseUrl ? (['memory', 'postgres'] as const) : (['memory'] as const);
const providers = ['google', 'github'] as const;
let nextAccount = randomInt(1_000_000_000, 9_000_000_000);
const account = () => ({ id: nextAccount++, email: `fairness-${randomUUID()}@example.com` });
type Account = ReturnType<typeof account>;
const githubAccount = ({ id, email }: Account) => ({ id, emails: [{ email, primary: true, verified: true }] });

function expectLimited(response: Response, limit: number, windowMs = 15 * 60_000) {
  expect(response.status).toBe(429);
  expect(response.body).toMatchObject({ statusCode: 429, code: 'rate_limited', retryAfterSeconds: expect.any(Number) });
  const retry = response.body.retryAfterSeconds;
  expect(retry).toBeGreaterThanOrEqual(1);
  expect(retry).toBeLessThanOrEqual(windowMs / 1000);
  expect(response.headers['retry-after']).toBe(String(retry));
  expect(response.headers['x-ratelimit-limit']).toBe(String(limit));
  expect(response.headers['x-ratelimit-remaining']).toBe('0');
  expect(response.headers['x-ratelimit-reset']).toBe(String(retry));
  expect(response.body.accessToken).toBeUndefined();
  expect(response.body.refreshToken).toBeUndefined();
  expect(response.body.access_token).toBeUndefined();
}

describe.each(storages)('Authentication rate limits (%s storage)', (storage) => {
  let apps: NestExpressApplication[] = [];
  let fakes: OAuthFakes;
  const on = (index = 0) => apps[index % apps.length];
  const http = (index = 0) => request(on(index).getHttpServer());
  const credential = (provider: Provider, who: Account, ip = freshIp(), index = 0) =>
    provider === 'google'
      ? fakes.googleCredential(() => http(index), { sub: String(who.id), email: who.email }, ip)
      : fakes.githubTicket(() => http(index), githubAccount(who), ip);
  const signIn = async (provider: Provider, who: Account, ip = freshIp(), index = 0) =>
    http(index)
      .post(`/api/auth/${provider}`)
      .set('X-Forwarded-For', ip)
      .send(await credential(provider, who, ip, index));
  const refresh = (refreshToken: string, ip = freshIp(), index = 0) =>
    http(index).post('/api/auth/refresh').set('X-Forwarded-For', ip).send({ refreshToken });

  beforeAll(async () => {
    if (storage === 'postgres') await migrateDatabase(databaseUrl!);
    fakes = await OAuthFakes.start();
    const env = {
      DATABASE_URL: storage === 'postgres' ? databaseUrl : undefined,
      JWT_SECRET: 'auth-fairness-test-secret-0123456789abcdef',
      TRUST_PROXY: '1',
      ...fakes.env(),
    };
    apps = await Promise.all(Array.from({ length: storage === 'postgres' ? 2 : 1 }, () => createTestApp(env, fakes.customize)));
  });

  afterAll(async () => {
    await Promise.all(apps.map((app) => app.close()));
    await fakes?.close();
  });

  beforeEach(async () => {
    // Keep a burst inside one fixed window, including the minute nested within the principal window.
    const remaining = AUTH_NETWORK_LIMIT.windowMs - (Date.now() % AUTH_NETWORK_LIMIT.windowMs);
    if (remaining < 3000) await new Promise((resolve) => setTimeout(resolve, remaining + 20));
  });

  it.each(providers)(
    'admits 35 distinct %s accounts and their refreshes from one shared IP',
    async (provider) => {
      const ip = freshIp();
      const users = new Set<string>();
      for (let i = 0; i < 35; i++) {
        await http(i).get('/api/auth/config').set('X-Forwarded-For', ip).expect(200);
        const signedIn = await signIn(provider, account(), ip, i);
        expect(signedIn.status).toBe(200);
        const session = signedIn.body as AuthSession;
        users.add(session.user.id);
        const rotated = await refresh(session.refreshToken, ip, i + 1).expect(200);
        expect(rotated.body.user.id).toBe(session.user.id);
        expect(rotated.body.refreshToken).not.toBe(session.refreshToken);
        await http(i).post('/api/auth/logout').set('X-Forwarded-For', ip).send({ refreshToken: rotated.body.refreshToken }).expect(204);
      }
      expect(users.size).toBe(35);
    },
    20_000,
  );

  it.each(providers)('shares a verified %s sign-in budget across IPs while isolating another account', async (provider) => {
    const who = account();
    const userIds = new Set<string>();
    for (let i = 0; i < 10; i++) {
      const response = await signIn(provider, who, freshIp(), i);
      expect(response.status).toBe(200);
      userIds.add(response.body.user.id);
    }
    expect(userIds.size).toBe(1);
    const ip = freshIp();
    expectLimited(await signIn(provider, who, ip, 1), 10);
    expect((await signIn(provider, account(), ip)).status).toBe(200);
  });

  it('keeps identical Google and GitHub subject values in separate budgets', async () => {
    const google = account();
    for (let i = 0; i < 10; i++) expect((await signIn('google', google)).status).toBe(200);
    expectLimited(await signIn('google', google), 10);
    const github = { ...account(), id: google.id };
    expect((await signIn('github', github)).status).toBe(200);
  });

  it('does not debit a Google subject for forged signatures or rejected nonces', async () => {
    const who = account();
    const ip = freshIp();
    const proof = await fakes.googleCredential(() => http(), { sub: String(who.id), email: who.email }, ip);
    const stranger = await FakeGoogle.create();
    const forged = await stranger.idToken({ sub: String(who.id), email: who.email }, proof.nonce);
    const unknownNonce = 'u'.repeat(43);
    const unknown = await fakes.google.idToken({ sub: String(who.id), email: who.email }, unknownNonce);
    for (let i = 0; i < 12; i++) {
      const body = [
        { idToken: forged, nonce: proof.nonce },
        { idToken: proof.idToken, nonce: unknownNonce },
        { idToken: unknown, nonce: unknownNonce },
      ][i % 3];
      const rejected = await http(i).post('/api/auth/google').set('X-Forwarded-For', ip).send(body).expect(401);
      expect(rejected.body.code).toBe('invalid_credential');
    }
    await http().post('/api/auth/google').set('X-Forwarded-For', ip).send(proof).expect(200);
    for (let i = 1; i < 10; i++) expect((await signIn('google', who, ip, i)).status).toBe(200);
    expectLimited(await signIn('google', who, ip), 10);
    expect((await http().post('/api/auth/google').set('X-Forwarded-For', ip).send(proof).expect(401)).body.code).toBe('invalid_credential');
  });

  it('does not debit a GitHub subject for unknown, mismatched, or replayed tickets', async () => {
    const who = account();
    const ip = freshIp();
    const proof = await fakes.githubTicket(() => http(), githubAccount(who), ip);
    const wrongVerifier = { ...proof, codeVerifier: 'v'.repeat(43) };
    const redeem = (body: object, index = 0) => http(index).post('/api/auth/github').set('X-Forwarded-For', ip).send(body);
    expect((await redeem(wrongVerifier).expect(401)).body.code).toBe('invalid_ticket');
    for (let i = 0; i < 12; i++) {
      const rejected = await redeem(i % 2 ? proof : { ...proof, ticket: 't'.repeat(43) }, i).expect(401);
      expect(rejected.body.code).toBe('invalid_ticket');
    }
    for (let i = 0; i < 10; i++) expect((await signIn('github', who, ip, i)).status).toBe(200);
    expectLimited(await signIn('github', who, ip), 10);
  });

  it('limits verified GitHub token exchanges across IPs without counting rejected grants', async () => {
    const who = account();
    const exchange = (form: object, ip = freshIp(), index = 0) =>
      http(index).post('/api/auth/github/token').set('X-Forwarded-For', ip).type('form').send(form);
    for (let i = 0; i < 21; i++) {
      const rejected = await exchange({ ...fakes.githubTokenForm(githubAccount(who)), code: 'unknown-code' }, freshIp(), i).expect(400);
      expect(rejected.body.error).toBe('invalid_grant');
    }
    for (let i = 0; i < 20; i++) {
      const accepted = await exchange(fakes.githubTokenForm(githubAccount(who)), freshIp(), i).expect(200);
      expect(accepted.body.access_token).toMatch(/^[\w-]{43}$/);
    }
    const ip = freshIp();
    const denied = await exchange(fakes.githubTokenForm(githubAccount(who)), ip, 1);
    expectLimited(denied, 20);
    expect(denied.headers['cache-control']).toBe('no-store');
    await exchange(fakes.githubTokenForm(githubAccount(account())), ip).expect(200);
  });

  it('shares refresh quota across rotated tokens, families, IPs, and API instances', async () => {
    const who = account();
    const first = (await signIn('google', who)).body as AuthSession;
    const second = (await signIn('google', who, freshIp(), 1)).body as AuthSession;
    const sessions = [
      await on()
        .get(SessionService)
        .refresh(first.refreshToken, new Date(Date.now() - 20_000)),
      second,
    ];
    for (let i = 0; i < 29; i++) {
      const slot = i % 2;
      const response = await refresh(sessions[slot].refreshToken, freshIp(), i).expect(200);
      sessions[slot] = response.body;
    }
    const store = on().get(AuthStore);
    const unrotated = sessions[0].refreshToken;
    expect((await store.refreshTokenByHash(hashToken(unrotated)))?.rotatedAt).toBeNull();
    const ip = freshIp();
    expectLimited(await refresh(unrotated, ip, 1), 30);
    expect((await store.refreshTokenByHash(hashToken(unrotated)))?.rotatedAt).toBeNull();
    expectLimited(await refresh(sessions[1].refreshToken, freshIp()), 30);

    const untouched = (await signIn('google', account(), ip)).body as AuthSession;
    await refresh(untouched.refreshToken, ip, 1).expect(200);

    await refresh(first.refreshToken, ip, 1).expect(401);
    await http().get('/api/auth/me').set('Authorization', `Bearer ${sessions[0].accessToken}`).expect(401);
    await refresh(sessions[0].refreshToken, freshIp()).expect(401);
    await http(1).get('/api/auth/me').set('Authorization', `Bearer ${sessions[1].accessToken}`).expect(200);
    await http().post('/api/auth/logout').set('X-Forwarded-For', ip).send({ refreshToken: sessions[1].refreshToken }).expect(204);
    await refresh(sessions[1].refreshToken, ip, 1).expect(401);
    await http(1).get('/api/auth/me').set('Authorization', `Bearer ${sessions[1].accessToken}`).expect(401);
  });

  it('does not spend a live account refresh budget on unknown, expired, or revoked tokens', async () => {
    const who = account();
    let live = (await signIn('google', who)).body as AuthSession;
    const revoked = (await signIn('google', who)).body as AuthSession;
    await http().post('/api/auth/logout').send({ refreshToken: revoked.refreshToken }).expect(204);
    const user = (await on().get(AuthStore).userById(live.user.id))!;
    const expired = await on()
      .get(SessionService)
      .start(user, new Date(Date.now() - 31 * 24 * 60 * 60_000));
    const invalid = ['unknown-refresh-token-0123456789', expired.refreshToken, revoked.refreshToken];
    const ip = freshIp();
    for (let i = 0; i < 33; i++) await refresh(invalid[i % invalid.length], ip, i).expect(401);
    for (let i = 0; i < 30; i++) live = (await refresh(live.refreshToken, ip, i).expect(200)).body;
    expectLimited(await refresh(live.refreshToken, ip, 1), 30);
    for (const token of invalid) await refresh(token, ip, 1).expect(401);
  });

  it.each([
    ['/api/auth/config', 'AuthController.config', 200],
    ['/api/auth/google/nonce', 'GoogleController.nonce', 200],
    ['/api/auth/google', 'GoogleController.signIn', 400],
    ['/api/auth/github/token', 'GitHubController.token', 400],
    ['/api/auth/github', 'GitHubController.signIn', 400],
    ['/api/auth/refresh', 'AuthController.refresh', 400],
    ['/api/auth/logout', 'AuthController.logout', 400],
  ] as const)('retains the network ceiling on %s', async (path, handler, acceptedStatus) => {
    const ip = freshIp();
    const { limit, windowMs } = AUTH_NETWORK_LIMIT;
    await on()
      .get(CoordinationStore)
      .add(`rate:${handler}:${hashToken(`ip:${ip}`)}`, windowMs, limit - 1);
    const hit = (address: string, index = 0) => {
      const req = path === '/api/auth/config' ? http(index).get(path) : http(index).post(path).send({});
      return req.set('X-Forwarded-For', address);
    };
    const finalAllowed = await hit(ip, 1).expect(acceptedStatus);
    expect(finalAllowed.headers['x-ratelimit-limit']).toBe(String(limit));
    expect(finalAllowed.headers['x-ratelimit-remaining']).toBe('0');
    expectLimited(await hit(ip), limit, windowMs);
    await hit(freshIp(), 1).expect(acceptedStatus);
    const separateRoute = path === '/api/auth/config' ? '/api/auth/google/nonce' : '/api/auth/config';
    const separate = separateRoute.endsWith('config') ? http(1).get(separateRoute) : http(1).post(separateRoute);
    await separate.set('X-Forwarded-For', ip).expect(200);
  });

  it.runIf(storage === 'postgres')('atomically admits one sign-in budget across two API instances', async () => {
    const who = account();
    const proofs = await Promise.all(Array.from({ length: 18 }, (_, i) => credential('google', who, freshIp(), i)));
    const responses = await Promise.all(
      proofs.map((proof, i) => http(i).post('/api/auth/google').set('X-Forwarded-For', freshIp()).send(proof)),
    );
    const admitted = responses.filter((response) => response.status === 200);
    const denied = responses.filter((response) => response.status === 429);
    expect(admitted).toHaveLength(10);
    expect(denied).toHaveLength(8);
    expect(new Set(admitted.map((response) => response.body.user.id)).size).toBe(1);
    for (const response of denied) expectLimited(response, 10);
  });

  it.runIf(storage === 'postgres')('atomically admits one refresh budget across two API instances', async () => {
    const who = account();
    const first = (await signIn('google', who)).body as AuthSession;
    const second = (await signIn('google', who, freshIp(), 1)).body as AuthSession;
    const responses = await Promise.all(
      Array.from({ length: 40 }, (_, i) => refresh(i % 2 ? first.refreshToken : second.refreshToken, freshIp(), i)),
    );
    expect(responses.filter((response) => response.status === 200)).toHaveLength(30);
    const denied = responses.filter((response) => response.status === 429);
    expect(denied).toHaveLength(10);
    for (const response of denied) expectLimited(response, 30);
  });
});
