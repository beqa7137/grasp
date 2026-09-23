import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { Mailer, type MailMessage } from '../src/auth/mailer.js';
import { createTestApp } from './support/app.js';
import { resetDatabase } from './support/database.js';

class CapturingMailer extends Mailer {
  readonly enabled = true;
  readonly sent: MailMessage[] = [];
  async send(message: MailMessage) {
    this.sent.push(message);
  }
  codeFor(email: string) {
    const mail = [...this.sent].reverse().find((m) => m.to === email);
    return /(\d{6})/.exec(mail!.subject)![1];
  }
}

const testDatabaseUrl = process.env['TEST_DATABASE_URL'];
const storages = testDatabaseUrl ? (['memory', 'postgres'] as const) : (['memory'] as const);
const phone = '3a3a3a3a-3a3a-4a3a-8a3a-3a3a3a3a3a3a';
const laptop = '4b4b4b4b-4b4b-4b4b-8b4b-4b4b4b4b4b4b';
const stranger = '5c5c5c5c-5c5c-4c5c-8c5c-5c5c5c5c5c5c';

describe.each(storages)('Accounts (%s storage)', (storage) => {
  let app: NestExpressApplication;
  const mailer = new CapturingMailer();
  const http = () => request(app.getHttpServer());
  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
  const event = (id: string) => ({
    id,
    at: new Date().toISOString(),
    type: 'predict.answered',
    algorithmId: 'binary-search',
    patternId: 'binary-search',
    correct: true,
  });

  let client = 0;
  /** Each sign-in comes from its own address so the strict per-IP limits on sign-in routes don't interfere. */
  const signIn = async (email: string, device?: string) => {
    const ip = `198.51.100.${++client}`;
    await http().post('/api/auth/email/start').set('X-Forwarded-For', ip).send({ email }).expect(202);
    const req = http().post('/api/auth/email/verify').set('X-Forwarded-For', ip);
    if (device) req.set('x-learner-id', device);
    return (await req.send({ email, code: mailer.codeFor(email.trim().toLowerCase()) }).expect(200)).body;
  };

  beforeAll(async () => {
    if (storage === 'postgres') await resetDatabase(testDatabaseUrl!);
    app = await createTestApp({ DATABASE_URL: storage === 'postgres' ? testDatabaseUrl : undefined, TRUST_PROXY: '1' }, (b) =>
      b.overrideProvider(Mailer).useValue(mailer),
    );
  });

  afterAll(async () => {
    await app.close();
  });

  it('reports that email sign-in is available', async () => {
    expect((await http().get('/api/auth/config').expect(200)).body).toEqual({ email: true });
  });

  it('validates input and never reveals whether an account exists', async () => {
    await http().post('/api/auth/email/start').send({ email: 'not-an-email' }).expect(400);
    const a = await http().post('/api/auth/email/start').send({ email: 'Nobody@Example.com ' }).expect(202);
    expect(a.body).toEqual({ sent: true });
    expect(mailer.sent.at(-1)!.to).toBe('nobody@example.com');
    await http().post('/api/auth/email/verify').send({ email: 'nobody@example.com', code: '12' }).expect(400);
    const wrong = mailer.codeFor('nobody@example.com') === '000000' ? '111111' : '000000';
    const res = await http().post('/api/auth/email/verify').send({ email: 'nobody@example.com', code: wrong }).expect(401);
    expect(res.body.message).toMatch(/invalid or has expired/);
  });

  it('turns an anonymous device into an account and protects its progress', async () => {
    await http()
      .post('/api/progress/events')
      .set('x-learner-id', phone)
      .send({ events: [event('evt-phone-0001')] })
      .expect(200);
    const session = await signIn('Ada@Example.com', phone);
    expect(session).toMatchObject({ user: { email: 'ada@example.com' }, learnerId: phone, expiresIn: 900 });

    const mine = await http().get('/api/progress/events').set(bearer(session.accessToken)).expect(200);
    expect(mine.body.events.map((e: { id: string }) => e.id)).toEqual(['evt-phone-0001']);

    const anonymous = await http().get('/api/progress/events').set('x-learner-id', phone).expect(401);
    expect(anonymous.body.code).toBe('sign_in_required');
    expect((await http().get('/api/auth/me').set(bearer(session.accessToken)).expect(200)).body).toMatchObject({
      user: { email: 'ada@example.com' },
      learnerId: phone,
    });
    await http().get('/api/auth/me').set('x-learner-id', stranger).expect(401);
  });

  it('merges a second device, including interviews and feedback, into the account', async () => {
    await http()
      .post('/api/progress/events')
      .set('x-learner-id', laptop)
      .send({ events: [event('evt-laptop-01')] })
      .expect(200);
    const interview = await http().post('/api/interview/sessions').set('x-learner-id', laptop).send({ track: 'coding' }).expect(201);
    await http()
      .post('/api/feedback')
      .set('x-learner-id', laptop)
      .send({ kind: 'idea', message: 'from the laptop', rating: null, context: { route: '/', release: null, platform: 'web' } })
      .expect(201);

    const session = await signIn('ada@example.com', laptop);
    expect(session.learnerId).toBe(phone);

    const auth = bearer(session.accessToken);
    const events = await http().get('/api/progress/events').set(auth).expect(200);
    expect(events.body.events.map((e: { id: string }) => e.id).sort()).toEqual(['evt-laptop-01', 'evt-phone-0001']);
    await http().get(`/api/interview/sessions/${interview.body.id}`).set(auth).expect(200);
    const exported = await http().get('/api/me/export').set(auth).expect(200);
    expect(exported.body.account.email).toBe('ada@example.com');
    expect(exported.body.feedback.map((f: { message: string }) => f.message)).toEqual(['from the laptop']);

    const orphan = await http().get('/api/progress/events').set('x-learner-id', laptop).expect(200);
    expect(orphan.body.events).toEqual([]);
  });

  it('rotates refresh tokens, and logging out ends the session', async () => {
    const session = await signIn('bob@example.com', stranger);
    const next = (await http().post('/api/auth/refresh').send({ refreshToken: session.refreshToken }).expect(200)).body;
    expect(next.refreshToken).not.toBe(session.refreshToken);
    await http().get('/api/auth/me').set(bearer(next.accessToken)).expect(200);

    await http().post('/api/auth/logout').send({ refreshToken: next.refreshToken }).expect(204);
    await http().post('/api/auth/refresh').send({ refreshToken: next.refreshToken }).expect(401);
  });

  it('rejects forged or garbled access tokens with a code the app can act on', async () => {
    const res = await http().get('/api/progress').set('Authorization', 'Bearer not.a.jwt').expect(401);
    expect(res.body.code).toBe('token_invalid');
  });

  it('deletes the whole account on request', async () => {
    const device = '6d6d6d6d-6d6d-4d6d-8d6d-6d6d6d6d6d6d';
    const session = await signIn('cy@example.com', device);
    await http().delete('/api/me').set(bearer(session.accessToken)).expect(204);
    await http().get('/api/auth/me').set(bearer(session.accessToken)).expect(401);
    await http().post('/api/auth/refresh').send({ refreshToken: session.refreshToken }).expect(401);
    await http().get('/api/progress/events').set('x-learner-id', device).expect(200);

    const fresh = await signIn('cy@example.com');
    expect(fresh.user.id).not.toBe(session.user.id);
  });
});

describe('Per-user rate limits', () => {
  let app: NestExpressApplication;
  const mailer = new CapturingMailer();

  beforeAll(async () => {
    app = await createTestApp({ RATE_LIMIT_PER_MINUTE: '4' }, (b) => b.overrideProvider(Mailer).useValue(mailer));
  });

  afterAll(async () => {
    await app.close();
  });

  it('gives each signed-in user their own budget, separate from the shared IP', async () => {
    const http = () => request(app.getHttpServer());
    const tokens: string[] = [];
    for (const email of ['u1@example.com', 'u2@example.com']) {
      await http().post('/api/auth/email/start').send({ email }).expect(202);
      const code = /(\d{6})/.exec(mailer.sent.at(-1)!.subject)![1];
      tokens.push((await http().post('/api/auth/email/verify').send({ email, code }).expect(200)).body.accessToken);
    }
    const hit = (token?: string) => {
      const req = http().get('/api/curriculum/patterns');
      return token ? req.set('Authorization', `Bearer ${token}`) : req.set('x-learner-id', phone);
    };
    for (let i = 0; i < 4; i++) await hit(tokens[0]).expect(200);
    await hit(tokens[0]).expect(429);
    await hit(tokens[1]).expect(200);
    for (let i = 0; i < 4; i++) await hit().expect(200);
    await hit().expect(429);
  });
});
