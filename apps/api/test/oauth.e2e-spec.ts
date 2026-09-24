import type { NestExpressApplication } from '@nestjs/platform-express';
import { randomBytes, randomUUID } from 'node:crypto';
import request from 'supertest';
import type { User } from '../src/auth/auth.types.js';
import { NATIVE_REDIRECT_URI } from '../src/auth/github-sign-in.service.js';
import { AuthStore } from '../src/persistence/stores.js';
import { createTestApp } from './support/app.js';
import { resetDatabase } from './support/database.js';
import type { GitHubAccount } from './support/fake-github.js';
import { FakeGoogle } from './support/fake-google.js';
import { freshIp, OAuthFakes } from './support/oauth.js';

const testDatabaseUrl = process.env['TEST_DATABASE_URL'];
const storages = testDatabaseUrl ? (['memory', 'postgres'] as const) : (['memory'] as const);

const githubUser = (id: number, email: string | null, extra: GitHubAccount['emails'] = []): GitHubAccount => ({
  id,
  emails: [...(email ? [{ email, primary: true, verified: true }] : []), ...extra],
});

describe.each(storages)('Sign-in with Google and GitHub (%s storage)', (storage) => {
  let app: NestExpressApplication;
  let fakes: OAuthFakes;
  const http = () => request(app.getHttpServer());
  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

  const googleSignIn = async (sub: string, email: string, options: { emailVerified?: boolean; device?: string } = {}) => {
    const credential = await fakes.googleCredential(http, { sub, email, emailVerified: options.emailVerified });
    const req = http().post('/api/auth/google').set('X-Forwarded-For', freshIp());
    if (options.device) req.set('x-learner-id', options.device);
    return req.send(credential);
  };
  const redeem = (credential: object) => http().post('/api/auth/github').set('X-Forwarded-For', freshIp()).send(credential);
  const githubSignIn = async (account: GitHubAccount) => redeem(await fakes.githubTicket(http, account));
  const tokenRequest = (form: Record<string, string>, headers: Record<string, string> = {}) =>
    http().post('/api/auth/github/token').set('X-Forwarded-For', freshIp()).set(headers).type('form').send(form);
  /** An account from the earlier email-code sign-in, which has no linked sign-in method. */
  const emailCodeAccount = async (email: string): Promise<User> => {
    const user: User = { id: randomUUID(), email, learnerId: randomUUID(), createdAt: new Date().toISOString(), lastLoginAt: null };
    await app.get(AuthStore).createUser(user);
    return user;
  };

  beforeAll(async () => {
    if (storage === 'postgres') await resetDatabase(testDatabaseUrl!);
    fakes = await OAuthFakes.start();
    app = await createTestApp(
      { DATABASE_URL: storage === 'postgres' ? testDatabaseUrl : undefined, TRUST_PROXY: '1', ...fakes.env() },
      fakes.customize,
    );
  });

  afterAll(async () => {
    await app.close();
    await fakes.close();
  });

  it('tells the app which providers it offers, with their public client ids', async () => {
    expect((await http().get('/api/auth/config').expect(200)).body).toEqual({
      google: { webClientId: fakes.google.webClientId, iosClientId: null },
      github: { clientId: fakes.github.clientId, authorizeUrl: `${fakes.github.url}/login/oauth/authorize` },
    });
  });

  describe('Google', () => {
    it('signs in with an ID token whose nonce is used once', async () => {
      const credential = await fakes.googleCredential(http, { sub: 'g-ada', email: 'Ada@Gmail.com' });
      const session = (await http().post('/api/auth/google').send(credential).expect(200)).body;
      expect(session).toMatchObject({ user: { email: 'ada@gmail.com' }, expiresIn: 900 });

      const replay = await http().post('/api/auth/google').set('X-Forwarded-For', freshIp()).send(credential).expect(401);
      expect(replay.body.code).toBe('invalid_credential');
    });

    it('rejects tokens with a nonce it never issued, or signed by anyone but Google', async () => {
      const madeUp = randomBytes(32).toString('base64url');
      const unknown = await fakes.google.idToken({ sub: 'g-x', email: 'x@gmail.com' }, madeUp);
      const rejected = await http().post('/api/auth/google').send({ idToken: unknown, nonce: madeUp }).expect(401);
      expect(rejected.body.code).toBe('invalid_credential');

      const { nonce } = (await http().post('/api/auth/google/nonce').expect(200)).body;
      const forged = await (await FakeGoogle.create()).idToken({ sub: 'g-x', email: 'x@gmail.com' }, nonce);
      expect((await http().post('/api/auth/google').send({ idToken: forged, nonce }).expect(401)).body.code).toBe('invalid_credential');

      const { idToken } = await fakes.googleCredential(http, { sub: 'g-x', email: 'x@gmail.com' });
      for (const malformed of [{}, { idToken }, { idToken, nonce: 'short' }, { idToken: 'x'.repeat(4097), nonce }]) {
        await http().post('/api/auth/google').set('X-Forwarded-For', freshIp()).send(malformed).expect(400);
      }
    });

    it("rejects a token minted for another nonce than the one sent, so a stranger's token cannot be slipped in", async () => {
      const mine = await fakes.googleCredential(http, { sub: 'g-kit', email: 'kit@gmail.com' });
      const theirs = await fakes.googleCredential(http, { sub: 'g-mallory', email: 'mallory@gmail.com' });
      const post = (credential: { idToken: string; nonce: string }) =>
        http().post('/api/auth/google').set('X-Forwarded-For', freshIp()).send(credential);
      expect((await post({ idToken: theirs.idToken, nonce: mine.nonce }).expect(401)).body.code).toBe('invalid_credential');
      expect((await post(mine).expect(200)).body.user.email).toBe('kit@gmail.com');
    });

    it('refuses a new account without a verified email', async () => {
      const res = await googleSignIn('g-unverified', 'someone@example.com', { emailVerified: false });
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('email_unverified');
    });

    it('links a gmail address to an account from the earlier email sign-in, but never to one with a sign-in method', async () => {
      const legacy = await emailCodeAccount('eli@gmail.com');
      const viaGoogle = (await googleSignIn('g-eli', 'eli@gmail.com')).body;
      expect(viaGoogle.user.id).toBe(legacy.id);
      const me = await http().get('/api/auth/me').set(bearer(viaGoogle.accessToken)).expect(200);
      expect(me.body.identities.map((i: { provider: string }) => i.provider)).toEqual(['google']);

      await githubSignIn(githubUser(5001, 'fin@gmail.com')).then((r) => expect(r.status).toBe(200));
      const refused = await googleSignIn('g-fin', 'fin@gmail.com');
      expect(refused.status).toBe(409);
      expect(refused.body).toMatchObject({ code: 'account_exists', providers: ['github'] });
    });

    it('lets concurrent first sign-ins with the same Google account land in one account', async () => {
      const [a, b] = await Promise.all([
        googleSignIn('g-twin', 'twin@gmail.com', { device: '7e7e7e7e-7e7e-4e7e-8e7e-7e7e7e7e7e7e' }),
        googleSignIn('g-twin', 'twin@gmail.com', { device: '8f8f8f8f-8f8f-4f8f-8f8f-8f8f8f8f8f8f' }),
      ]);
      expect([a.status, b.status]).toEqual([200, 200]);
      expect(a.body.user.id).toBe(b.body.user.id);
    });
  });

  describe('GitHub token endpoint', () => {
    it("answers like an OAuth token endpoint, with a Grasp ticket instead of GitHub's token, which it revokes", async () => {
      const revokedBefore = fakes.github.revoked.length;
      const res = await tokenRequest(fakes.githubTokenForm(githubUser(6001, 'fay@example.com'))).expect(200);
      expect(res.headers['cache-control']).toBe('no-store');
      expect(res.body).toEqual({
        access_token: expect.stringMatching(/^[\w-]{43}$/),
        token_type: 'bearer',
        expires_in: 300,
        scope: 'user:email',
      });
      expect(fakes.github.revoked).toHaveLength(revokedBefore + 1);
      expect(fakes.github.revoked.at(-1)).not.toBe(res.body.access_token);
    });

    it("accepts the native callback and this site's own web callback only", async () => {
      const web = { Host: 'grasp.test', 'X-Forwarded-Proto': 'https' };
      await tokenRequest(fakes.githubTokenForm(githubUser(6002, 'gil@example.com'), 'https://grasp.test/auth/callback'), web).expect(200);

      for (const redirect of ['http://grasp.test/auth/callback', 'https://evil.example/auth/callback', 'dev.grasp.app://evil']) {
        const res = await tokenRequest(fakes.githubTokenForm(githubUser(6002, 'gil@example.com'), redirect), web).expect(400);
        expect(res.body.error).toBe('invalid_request');
      }
    });

    it('rejects a foreign client id, malformed requests and codes GitHub does not accept', async () => {
      const form = () => fakes.githubTokenForm(githubUser(6003, 'hal@example.com'));
      const foreign = await tokenRequest({ ...form(), client_id: 'someone-else' }).expect(401);
      expect(foreign.body).toEqual({ error: 'invalid_client', error_description: expect.any(String) });

      for (const bad of [{ grant_type: 'refresh_token' }, { code_verifier: 'short' }, { code: '' }]) {
        const res = await tokenRequest({ ...form(), ...bad }).expect(400);
        expect(res.body.error).toBe('invalid_request');
      }

      const unknownCode = await tokenRequest({ ...form(), code: 'not-a-code' }).expect(400);
      expect(unknownCode.body.error).toBe('invalid_grant');
      const wrongVerifier = await tokenRequest({ ...form(), code_verifier: randomBytes(32).toString('base64url') }).expect(400);
      expect(wrongVerifier.body.error).toBe('invalid_grant');
    });

    it('reports GitHub outages as temporarily unavailable', async () => {
      fakes.github.failNextExchange = 502;
      const res = await tokenRequest(fakes.githubTokenForm(githubUser(6004, 'ivy@example.com'))).expect(503);
      expect(res.body.error).toBe('temporarily_unavailable');
    });
  });

  describe('GitHub sign-in', () => {
    it('accepts a ticket once', async () => {
      const credential = await fakes.githubTicket(http, githubUser(7001, 'jan@example.com'));
      expect((await redeem(credential).expect(200)).body.user.email).toBe('jan@example.com');
      expect((await redeem(credential).expect(401)).body.code).toBe('invalid_ticket');
      expect((await redeem({ ...credential, ticket: 'x'.repeat(43) }).expect(401)).body.code).toBe('invalid_ticket');
      await redeem({ ...credential, ticket: 'short' }).expect(400);
    });

    it('requires the verifier the ticket was issued for, so a ticket from another sign-in cannot be slipped in', async () => {
      const mine = await fakes.githubTicket(http, githubUser(7010, 'kim@example.com'));
      const theirs = await fakes.githubTicket(http, githubUser(7011, 'max@example.com'));
      for (const malformed of [
        { ticket: mine.ticket },
        { ...mine, codeVerifier: 'short' },
        { ...mine, codeVerifier: `${'v'.repeat(42)}!` },
      ]) {
        await redeem(malformed).expect(400);
      }

      const injected = await redeem({ ticket: theirs.ticket, codeVerifier: mine.codeVerifier }).expect(401);
      expect(injected.body.code).toBe('invalid_ticket');
      expect((await redeem(mine).expect(200)).body.user.email).toBe('kim@example.com');
      expect((await redeem(theirs).expect(401)).body.code).toBe('invalid_ticket');
    });

    it('uses a verified deliverable email and refuses when GitHub has none', async () => {
      const noreply = { email: '7002+kai@users.noreply.github.com', primary: true, verified: true };
      const unverified = { email: 'kai@example.com', primary: false, verified: false };
      const refused = await githubSignIn(githubUser(7002, null, [noreply, unverified]));
      expect(refused.status).toBe(403);
      expect(refused.body.code).toBe('email_unverified');

      const secondary = await githubSignIn(githubUser(7003, null, [noreply, { email: 'Lou@Example.com', primary: false, verified: true }]));
      expect(secondary.status).toBe(200);
      expect(secondary.body.user.email).toBe('lou@example.com');
    });

    it('tells the owner of an email-code account how to recover it', async () => {
      await emailCodeAccount('gus@example.com');
      const res = await githubSignIn(githubUser(7006, 'gus@example.com'));
      expect(res.status).toBe(409);
      expect(res.body).toEqual({
        statusCode: 409,
        code: 'account_exists',
        providers: [],
        message: 'This email belongs to an account from the earlier email sign-in. Sign in with Google using this address to recover it.',
      });
    });

    it('never links to an existing account by email, and names the provider to use instead', async () => {
      const existing = (await googleSignIn('g-mia', 'mia@gmail.com')).body;
      const res = await githubSignIn(githubUser(7004, 'mia@gmail.com'));
      expect(res.status).toBe(409);
      expect(res.body).toMatchObject({ code: 'account_exists', providers: ['google'] });
      const me = await http().get('/api/auth/me').set(bearer(existing.accessToken)).expect(200);
      expect(me.body.identities).toHaveLength(1);
    });

    it('lets concurrent first sign-ins with the same GitHub account land in one account', async () => {
      // Each round is one more chance for the two requests to interleave inside the database.
      for (let round = 0; round < 5; round++) {
        const account = githubUser(7100 + round, `twin-${round}@example.com`);
        const credentials = await Promise.all([fakes.githubTicket(http, account), fakes.githubTicket(http, account)]);
        const [a, b] = await Promise.all(credentials.map((credential) => redeem(credential).set('x-learner-id', randomUUID())));
        expect([a.status, b.status]).toEqual([200, 200]);
        expect(a.body.user.id).toBe(b.body.user.id);
      }
    });
  });

  describe('Connecting another provider', () => {
    it('adds GitHub to a signed-in Google account, which can then sign in with either', async () => {
      const viaGoogle = (await googleSignIn('g-ned', 'ned@gmail.com')).body;
      const credential = await fakes.githubTicket(http, githubUser(8001, 'ned@work.example'));
      const linked = await http().post('/api/auth/github/link').set(bearer(viaGoogle.accessToken)).send(credential).expect(200);
      expect(linked.body.identities).toEqual([
        { provider: 'google', email: 'ned@gmail.com', linkedAt: expect.any(String) },
        { provider: 'github', email: 'ned@work.example', linkedAt: expect.any(String) },
      ]);

      const viaGitHub = (await githubSignIn(githubUser(8001, 'ned@work.example'))).body;
      expect(viaGitHub.user.id).toBe(viaGoogle.user.id);
    });

    it('adds Google to a signed-in GitHub account, even when Google has no verified email', async () => {
      const viaGitHub = (await githubSignIn(githubUser(8002, 'ola@example.com'))).body;
      const credential = await fakes.googleCredential(http, { sub: 'g-ola', email: 'ola@example.com', emailVerified: false });
      const linked = await http().post('/api/auth/google/link').set(bearer(viaGitHub.accessToken)).send(credential).expect(200);
      expect(linked.body.identities).toEqual([
        { provider: 'github', email: 'ola@example.com', linkedAt: expect.any(String) },
        { provider: 'google', email: null, linkedAt: expect.any(String) },
      ]);
    });

    it('refuses a provider account that belongs to someone else, and anonymous callers', async () => {
      await githubSignIn(githubUser(8003, 'pat@example.com'));
      const other = (await googleSignIn('g-quinn', 'quinn@gmail.com')).body;
      const pats = await fakes.githubTicket(http, githubUser(8003, 'pat@example.com'));
      const taken = await http().post('/api/auth/github/link').set(bearer(other.accessToken)).send(pats).expect(409);
      expect(taken.body.code).toBe('identity_in_use');

      const anonymous = await fakes.githubTicket(http, githubUser(8004, 'ray@example.com'));
      await http().post('/api/auth/github/link').set('x-learner-id', '9a9a9a9a-9a9a-4a9a-8a9a-9a9a9a9a9a9a').send(anonymous).expect(401);
      const credential = await fakes.googleCredential(http, { sub: 'g-ray', email: 'ray@gmail.com' });
      await http().post('/api/auth/google/link').send(credential).expect(401);
    });

    it("refuses a ticket from someone else's sign-in, so their GitHub account cannot be connected to mine", async () => {
      const victim = (await googleSignIn('g-sue', 'sue@gmail.com')).body;
      const own = await fakes.githubTicket(http, githubUser(8005, 'sue@work.example'));
      const attacker = await fakes.githubTicket(http, githubUser(8006, 'eve@example.com'));
      const injected = await http()
        .post('/api/auth/github/link')
        .set(bearer(victim.accessToken))
        .send({ ticket: attacker.ticket, codeVerifier: own.codeVerifier })
        .expect(401);
      expect(injected.body.code).toBe('invalid_ticket');
      const me = await http().get('/api/auth/me').set(bearer(victim.accessToken)).expect(200);
      expect(me.body.identities.map((i: { provider: string }) => i.provider)).toEqual(['google']);
    });
  });
});

describe('Sign-in when no provider is configured', () => {
  let app: NestExpressApplication;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createTestApp({ GOOGLE_WEB_CLIENT_ID: undefined, OAUTH_GITHUB_ID: undefined, OAUTH_GITHUB_SECRET: undefined });
  });

  afterAll(async () => {
    await app.close();
  });

  it('says so, and every provider route answers provider_disabled', async () => {
    expect((await http().get('/api/auth/config').expect(200)).body).toEqual({ google: null, github: null });
    for (const [path, body] of [
      ['/api/auth/google/nonce', {}],
      ['/api/auth/google', { idToken: 'x', nonce: 'n'.repeat(43) }],
      ['/api/auth/github', { ticket: 'x'.repeat(43), codeVerifier: 'v'.repeat(43) }],
    ] as const) {
      expect((await http().post(path).send(body).expect(404)).body.code).toBe('provider_disabled');
    }
    const token = await http()
      .post('/api/auth/github/token')
      .type('form')
      .send({
        grant_type: 'authorization_code',
        client_id: 'x',
        code: 'x',
        redirect_uri: NATIVE_REDIRECT_URI,
        code_verifier: 'v'.repeat(43),
      })
      .expect(404);
    expect(token.body.code).toBe('provider_disabled');
  });
});
