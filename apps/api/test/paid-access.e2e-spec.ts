import type Anthropic from '@anthropic-ai/sdk';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import request from 'supertest';
import type { AuthSession } from '../src/auth/session.service.js';
import { TokenService } from '../src/auth/tokens.js';
import { ClaudeInterviewer } from '../src/interview/claude.interviewer.js';
import type { InterviewSession, Scorecard } from '../src/interview/interview.types.js';
import { Interviewer } from '../src/interview/interviewer.js';
import { RUBRICS } from '../src/interview/prompts.js';
import { SpendGuard } from '../src/interview/spend-guard.js';
import { SpendStore } from '../src/persistence/spend.store.js';
import { AuthStore, CoordinationStore, InterviewStore } from '../src/persistence/stores.js';
import { createTestApp } from './support/app.js';
import { resetDatabase } from './support/database.js';
import { fakeAnthropic } from './support/fake-anthropic.js';
import { freshIp, OAuthFakes } from './support/oauth.js';

const databaseUrl = process.env['TEST_DATABASE_URL'];
const storages = databaseUrl ? (['memory', 'postgres'] as const) : (['memory'] as const);
const jwtSecret = 'paid-access-test-secret-0123456789abcdef';
const hourMs = 3_600_000;
const scorecard: Scorecard = {
  mode: 'ai',
  verdict: 'lean-hire',
  summary: 'Good reasoning with a clear complexity explanation.',
  dimensions: RUBRICS.coding.map(({ name }) => ({ name, score: 3, evidence: 'The candidate explained the approach.' })),
  strengths: ['Explained the stack'],
  improvements: ['Check boundary inputs'],
  weakPatterns: ['monotonic-stack'],
};

const bearer = (account: AuthSession) => ({ Authorization: `Bearer ${account.accessToken}` });
const guest = (learnerId: string) => ({ 'x-learner-id': learnerId });

function barrier() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

describe.each(storages)('Paid interview access over HTTP (%s storage)', (storage) => {
  let fakes: OAuthFakes;
  let provider: ReturnType<typeof fakeAnthropic>;
  const apps: NestExpressApplication[] = [];
  const githubIds = new Map<string, number>();

  beforeAll(async () => {
    fakes = await OAuthFakes.start();
  });

  beforeEach(async () => {
    if (storage === 'postgres') await resetDatabase(databaseUrl!);
    provider = fakeAnthropic((body) =>
      body['output_config']?.['format'] ? { text: JSON.stringify(scorecard) } : { stream: ['Keep going.'] },
    );
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await Promise.all(apps.splice(0).map((app) => app.close()));
  });

  afterAll(async () => {
    await fakes?.close();
  });

  async function instance(options: { client?: Anthropic; ai?: boolean; quota?: number } = {}) {
    const app = await createTestApp(
      {
        DATABASE_URL: storage === 'postgres' ? databaseUrl : undefined,
        JWT_SECRET: jwtSecret,
        TRUST_PROXY: '1',
        RATE_LIMIT_PER_MINUTE: '1000',
        INTERVIEW_MESSAGES_PER_HOUR: String(options.quota ?? 120),
        AI_DAILY_BUDGET_USD: '100',
        ...fakes.env(),
      },
      (builder) => {
        const configured = fakes.customize(builder);
        return options.ai === false
          ? configured
          : configured.overrideProvider(Interviewer).useFactory({
              inject: [SpendGuard],
              factory: (spend: SpendGuard) => new ClaudeInterviewer(options.client ?? provider.client, { model: 'claude-sonnet-5' }, spend),
            });
      },
    );
    apps.push(app);
    return app;
  }

  async function signIn(app: NestExpressApplication, email: string, learnerId = randomUUID(), method: 'google' | 'github' = 'google') {
    const http = () => request(app.getHttpServer());
    if (!githubIds.has(email)) githubIds.set(email, 1000 + githubIds.size);
    const body =
      method === 'google'
        ? await fakes.googleCredential(http, { sub: email, email })
        : await fakes.githubTicket(http, { id: githubIds.get(email)!, emails: [{ email, primary: true, verified: true }] });
    return (await http().post(`/api/auth/${method}`).set(guest(learnerId)).set('X-Forwarded-For', freshIp()).send(body).expect(200))
      .body as AuthSession;
  }

  async function start(app: NestExpressApplication, headers: Record<string, string>, mode?: 'ai' | 'offline') {
    return (
      await request(app.getHttpServer())
        .post('/api/interview/sessions')
        .set(headers)
        .send({ track: 'coding', problemId: 'warmer-days', ...(mode ? { mode } : {}) })
        .expect(201)
    ).body as { id: string; mode: string; aiAccess: string; messages: unknown[] };
  }

  const message = (app: NestExpressApplication, id: string, headers: Record<string, string>, hint = false) =>
    request(app.getHttpServer())
      .post(`/api/interview/sessions/${id}/messages`)
      .set(headers)
      .send({ content: hint ? '' : 'I would scan from the right with a monotonic stack.', hint });
  const score = (app: NestExpressApplication, id: string, headers: Record<string, string>) =>
    request(app.getHttpServer()).post(`/api/interview/sessions/${id}/score`).set(headers);
  const setMode = (app: NestExpressApplication, id: string, headers: Record<string, string>, mode: 'ai' | 'offline') =>
    request(app.getHttpServer()).post(`/api/interview/sessions/${id}/mode`).set(headers).send({ mode });
  const quota = (app: NestExpressApplication, learnerId: string) => app.get(CoordinationStore).read(`interview-quota:${learnerId}`, hourMs);

  it('defaults guests and signed-in accounts to offline while describing AI access separately', async () => {
    const app = await instance();
    const guestId = randomUUID();
    const catalog = await request(app.getHttpServer()).get('/api/interview/problems').set(guest(guestId)).expect(200);
    expect(catalog.body).toMatchObject({ aiAccess: 'sign-in-required' });
    expect(await start(app, guest(guestId))).toMatchObject({ mode: 'offline', aiAccess: 'sign-in-required' });
    const account = await signIn(app, 'defaults@example.com');
    expect((await request(app.getHttpServer()).get('/api/interview/problems').set(bearer(account)).expect(200)).body).toMatchObject({
      aiAccess: 'available',
    });
    expect(await start(app, bearer(account))).toMatchObject({ mode: 'offline', aiAccess: 'available' });
    expect(provider.requests).toHaveLength(0);
    expect(await app.get(SpendGuard).spentToday()).toBe(0);
  });

  it('rejects rotating guest UUIDs on every paid path without quota, transcript, or spend changes', async () => {
    const app = await instance();
    for (let index = 0; index < 3; index++) {
      const learnerId = randomUUID();
      const headers = guest(learnerId);
      const deniedStart = await request(app.getHttpServer())
        .post('/api/interview/sessions')
        .set(headers)
        .send({ track: 'coding', mode: 'ai' })
        .expect(403);
      expect(deniedStart.body.code).toBe('ai_sign_in_required');
      const session = await start(app, headers);
      expect((await setMode(app, session.id, headers, 'ai').expect(403)).body.code).toBe('ai_sign_in_required');
      const store = app.get(InterviewStore);
      const stored = (await store.get(learnerId, session.id))!;
      await store.save({ ...stored, mode: 'ai' });
      const before = await store.get(learnerId, session.id);
      for (const call of [message(app, session.id, headers), message(app, session.id, headers, true), score(app, session.id, headers)]) {
        expect((await call.expect(403)).body.code).toBe('ai_sign_in_required');
      }
      expect(await store.get(learnerId, session.id)).toEqual(before);
      expect(await quota(app, learnerId)).toBe(0);
    }
    expect(provider.requests).toHaveLength(0);
    expect(await app.get(SpendGuard).spentToday()).toBe(0);
  });

  it('provides guest scripted replies, hints, and scores on an AI-enabled deployment', async () => {
    const app = await instance();
    const learnerId = randomUUID();
    const headers = guest(learnerId);
    const session = await start(app, headers);
    expect((await message(app, session.id, headers).expect(200)).text).toContain('event: done');
    expect((await message(app, session.id, headers, true).expect(200)).text).toContain('event: done');
    const result = await score(app, session.id, headers).expect(201);
    expect(result.body).toMatchObject({ mode: 'offline', status: 'scored', scorecard: { mode: 'offline' } });
    expect(result.body.scorecard.summary).not.toMatch(/ANTHROPIC_API_KEY|API key/i);
    const spent = await quota(app, learnerId);
    expect((await score(app, session.id, headers).expect(201)).body.scorecard).toEqual(result.body.scorecard);
    expect(await quota(app, learnerId)).toBe(spent);
    await setMode(app, session.id, headers, 'ai').expect(409);
    expect(provider.requests).toHaveLength(0);
    expect(await app.get(SpendGuard).spentToday()).toBe(0);
  });

  it.each(['google', 'github'] as const)(
    'preserves guest sessions through %s adoption and merge until explicit AI opt-in',
    async (method) => {
      const app = await instance();
      const learnerId = randomUUID();
      const original = await start(app, guest(learnerId));
      const account = await signIn(app, `${method}-merge@example.com`, learnerId, method);
      expect(account.learnerId).toBe(learnerId);
      const adopted = await request(app.getHttpServer()).get(`/api/interview/sessions/${original.id}`).set(bearer(account)).expect(200);
      expect(adopted.body).toMatchObject({ id: original.id, mode: 'offline', aiAccess: 'available', messages: original.messages });
      const secondGuest = randomUUID();
      const second = await start(app, guest(secondGuest));
      await message(app, second.id, guest(secondGuest)).expect(200);
      const beforeMerge = (await app.get(InterviewStore).get(secondGuest, second.id))!;
      const merged = await signIn(app, `${method}-merge@example.com`, secondGuest, method);
      expect(merged.learnerId).toBe(learnerId);
      const moved = await request(app.getHttpServer()).get(`/api/interview/sessions/${second.id}`).set(bearer(merged)).expect(200);
      expect(moved.body).toMatchObject({ id: second.id, mode: 'offline', messages: beforeMerge.messages });
      expect(provider.requests).toHaveLength(0);
      const chosen = await setMode(app, second.id, bearer(merged), 'ai').expect(201);
      expect(chosen.body).toMatchObject({ id: second.id, mode: 'ai', messages: beforeMerge.messages });
      expect(await quota(app, learnerId)).toBe(0);
      await message(app, second.id, bearer(merged)).expect(200);
      expect(provider.requests).toHaveLength(1);
      const stored = await app.get(InterviewStore).get(learnerId, second.id);
      expect(stored?.mode).toBe('ai');
      expect(stored?.messages).toHaveLength(beforeMerge.messages.length + 2);
      expect(await app.get(SpendGuard).spentToday()).toBeCloseTo(0.0024, 6);
    },
  );

  it('shares paid quota across account sessions, learner headers, IPs, and database instances', async () => {
    const first = await instance({ quota: 1 });
    const second = storage === 'postgres' ? await instance({ quota: 1 }) : first;
    const account = await signIn(first, 'shared-quota@example.com');
    const otherDevice = await signIn(second, 'shared-quota@example.com');
    const a = await start(first, bearer(account), 'ai');
    const b = await start(second, bearer(otherDevice), 'ai');
    await message(first, a.id, { ...bearer(account), ...guest(randomUUID()), 'X-Forwarded-For': freshIp() }).expect(200);
    await message(second, b.id, { ...bearer(otherDevice), ...guest(randomUUID()), 'X-Forwarded-For': freshIp() }).expect(429);
    expect(await quota(second, account.learnerId)).toBe(1);
    expect(provider.requests).toHaveLength(1);
    const another = await signIn(second, 'independent-quota@example.com');
    const c = await start(second, bearer(another), 'ai');
    await message(second, c.id, bearer(another)).expect(200);
    expect(provider.requests).toHaveLength(2);
  });

  it.each(['forged', 'expired', 'revoked', 'deleted'] as const)('rejects %s credentials before paid calls', async (kind) => {
    const app = await instance();
    const account = await signIn(app, `${kind}@example.com`);
    const session = await start(app, bearer(account), 'ai');
    const tokens = new TokenService(jwtSecret);
    const claims = await tokens.verify(account.accessToken);
    let accessToken = account.accessToken;
    if (kind === 'forged') accessToken = await new TokenService(`${jwtSecret}-different`).sign(claims);
    if (kind === 'expired') accessToken = await tokens.sign(claims, new Date(Date.now() - 16 * 60_000));
    if (kind === 'revoked') {
      await request(app.getHttpServer()).post('/api/auth/logout').send({ refreshToken: account.refreshToken }).expect(204);
    }
    if (kind === 'deleted') await request(app.getHttpServer()).delete('/api/me').set(bearer(account)).expect(204);
    const headers = { Authorization: `Bearer ${accessToken}` };
    for (const call of [message(app, session.id, headers), message(app, session.id, headers, true), score(app, session.id, headers)]) {
      expect((await call.expect(401)).body.code).toBe('token_invalid');
    }
    await setMode(app, session.id, headers, 'ai').expect(401);
    expect(provider.requests).toHaveLength(0);
    expect(await app.get(SpendGuard).spentToday()).toBe(0);
    expect(await quota(app, account.learnerId)).toBe(0);
  });

  it('normalizes unmarked legacy sessions to offline even with earlier AI usage', async () => {
    const app = await instance();
    const account = await signIn(app, 'legacy-active@example.com');
    const session = await start(app, bearer(account), 'ai');
    const store = app.get(InterviewStore);
    const stored = (await store.get(account.learnerId, session.id))!;
    delete stored.mode;
    stored.usage = { calls: 1, inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0, costUsd: 0.000012 };
    await store.save(stored);
    expect(
      (await request(app.getHttpServer()).get(`/api/interview/sessions/${session.id}`).set(bearer(account)).expect(200)).body.mode,
    ).toBe('offline');
    const recent = await request(app.getHttpServer()).get('/api/interview/sessions').set(bearer(account)).expect(200);
    expect(recent.body.find((item: { id: string }) => item.id === session.id).mode).toBe('offline');
    await message(app, session.id, bearer(account)).expect(200);
    expect(provider.requests).toHaveLength(0);
    expect(await app.get(SpendGuard).spentToday()).toBe(0);
  });

  it('returns legacy cached AI scores when paid configuration is unavailable', async () => {
    const app = await instance({ ai: false });
    const account = await signIn(app, 'cached-score@example.com');
    const session = await start(app, bearer(account));
    expect(session).toMatchObject({ mode: 'offline', aiAccess: 'unavailable' });
    const store = app.get(InterviewStore);
    const stored = (await store.get(account.learnerId, session.id))!;
    delete stored.mode;
    const cached: InterviewSession = { ...stored, status: 'scored', scorecard, scoredAt: new Date().toISOString() };
    await store.save(cached);
    const result = await score(app, session.id, bearer(account)).expect(201);
    expect(result.body.mode).toBe('ai');
    expect(result.body.scorecard).toEqual(scorecard);
    expect(result.body.aiAccess).toBe('unavailable');
    expect(await store.get(account.learnerId, session.id)).toEqual(cached);
    expect(await quota(app, account.learnerId)).toBe(0);
    await setMode(app, session.id, bearer(account), 'offline').expect(409);
    const active = await start(app, bearer(account));
    expect((await setMode(app, active.id, bearer(account), 'ai').expect(503)).body.code).toBe('ai_unavailable');
    expect((await store.get(account.learnerId, active.id))?.mode).toBe('offline');
    expect(provider.requests).toHaveLength(0);
    expect(await app.get(SpendGuard).spentToday()).toBe(0);
  });

  it('denies logout completed after request guards but before paid admission', async () => {
    const first = await instance();
    const second = storage === 'postgres' ? await instance() : first;
    const account = await signIn(first, 'admission-race@example.com');
    const session = await start(first, bearer(account), 'ai');
    const loaded = barrier();
    const resume = barrier();
    const store = first.get(InterviewStore);
    const get = store.get.bind(store);
    vi.spyOn(store, 'get').mockImplementationOnce(async (...args) => {
      const found = await get(...args);
      loaded.release();
      await resume.promise;
      return found;
    });
    const pending = message(first, session.id, bearer(account)).then((response) => response);
    try {
      await Promise.race([
        loaded.promise,
        pending.then(() => {
          throw new Error('Reply ended before the session-load barrier.');
        }),
      ]);
      await request(second.getHttpServer()).post('/api/auth/logout').send({ refreshToken: account.refreshToken }).expect(204);
    } finally {
      resume.release();
      await Promise.allSettled([pending]);
    }
    const result = await pending;
    expect(result.status).toBe(401);
    expect(result.body.code).toBe('token_invalid');
    expect((await get(account.learnerId, session.id))?.messages).toHaveLength(1);
    expect(await quota(first, account.learnerId)).toBe(0);
    expect(provider.requests).toHaveLength(0);
    expect(await first.get(SpendGuard).spentToday()).toBe(0);
  });

  it('completes an admitted reply after logout and rejects the next request', async () => {
    const first = await instance();
    const second = storage === 'postgres' ? await instance() : first;
    const account = await signIn(first, 'admitted-logout@example.com');
    const session = await start(first, bearer(account), 'ai');
    const claims = await new TokenService(jwtSecret).verify(account.accessToken);
    const admitted = barrier();
    const resume = barrier();
    const coordination = first.get(CoordinationStore);
    const take = coordination.take.bind(coordination);
    vi.spyOn(coordination, 'take').mockImplementationOnce(async (...args) => {
      admitted.release();
      await resume.promise;
      return take(...args);
    });
    const pending = message(first, session.id, bearer(account)).then((response) => response);
    try {
      await Promise.race([
        admitted.promise,
        pending.then(() => {
          throw new Error('Reply ended before the paid-admission barrier.');
        }),
      ]);
      expect(provider.requests).toHaveLength(0);
      expect(await first.get(SpendStore).spentToday()).toBe(0);
      await request(second.getHttpServer()).post('/api/auth/logout').send({ refreshToken: account.refreshToken }).expect(204);
      expect(await second.get(AuthStore).activeFamily(claims.userId, claims.learnerId, claims.familyId)).toBe(false);
    } finally {
      resume.release();
      await Promise.allSettled([pending]);
    }
    const result = await pending;
    expect(result.status).toBe(200);
    expect(result.text).toContain('event: done');
    expect(result.text).not.toContain('event: error');
    const store = second.get(InterviewStore);
    const saved = await store.get(account.learnerId, session.id);
    expect(saved?.messages).toHaveLength(3);
    expect(saved?.messages.at(-1)?.content).toBe('Keep going.');
    expect(saved?.usage).toEqual({
      calls: 1,
      inputTokens: 1000,
      outputTokens: 40,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      costUsd: 0.0024,
    });
    expect(await second.get(SpendStore).spentToday()).toBe(2400);
    expect(await second.get(SpendGuard).spentToday()).toBe(0.0024);
    expect(await quota(second, account.learnerId)).toBe(1);
    const denied = await message(second, session.id, bearer(account)).expect(401);
    expect(denied.body.code).toBe('token_invalid');
    expect(await store.get(account.learnerId, session.id)).toEqual(saved);
    expect(await second.get(SpendStore).spentToday()).toBe(2400);
    expect(await quota(second, account.learnerId)).toBe(1);
    expect(provider.requests).toHaveLength(1);
  });

  it('fails closed if active account verification fails after the session loads', async () => {
    const app = await instance();
    const account = await signIn(app, 'admission-storage@example.com');
    const session = await start(app, bearer(account), 'ai');
    const store = app.get(InterviewStore);
    const get = store.get.bind(store);
    const failure = new pg.DatabaseError('private account verification failure', 0, 'error');
    failure.code = '53300';
    vi.spyOn(store, 'get').mockImplementationOnce(async (...args) => {
      const found = await get(...args);
      vi.spyOn(app.get(AuthStore), 'activeFamily').mockRejectedValueOnce(failure);
      return found;
    });
    await message(app, session.id, bearer(account)).expect(503);
    expect((await get(account.learnerId, session.id))?.messages).toHaveLength(1);
    expect(await quota(app, account.learnerId)).toBe(0);
    expect(provider.requests).toHaveLength(0);
    expect(await app.get(SpendGuard).spentToday()).toBe(0);
  });

  it('serializes mode changes with paid replies and persists an explicit switch back to offline', async () => {
    const entered = barrier();
    const resume = barrier();
    const client = provider.client.withOptions({
      middleware: [
        async (outgoing, next) => {
          const response = await next(outgoing);
          entered.release();
          await resume.promise;
          return response;
        },
      ],
    });
    const first = await instance({ client });
    const second = storage === 'postgres' ? await instance() : first;
    const account = await signIn(first, 'mode-race@example.com');
    const session = await start(first, bearer(account), 'ai');
    const pending = message(first, session.id, bearer(account)).then((response) => response);
    try {
      await Promise.race([
        entered.promise,
        pending.then(() => {
          throw new Error('Reply ended before the provider barrier.');
        }),
      ]);
      await setMode(second, session.id, bearer(account), 'offline').expect(409);
      expect((await second.get(InterviewStore).get(account.learnerId, session.id))?.mode).toBe('ai');
    } finally {
      resume.release();
      await Promise.allSettled([pending]);
    }
    expect((await pending).status).toBe(200);
    const changed = await setMode(second, session.id, bearer(account), 'offline').expect(201);
    expect(changed.body).toMatchObject({
      mode: 'offline',
      messages: expect.arrayContaining([{ role: 'interviewer', content: 'Keep going.', at: expect.any(String) }]),
    });
    const result = await score(second, session.id, bearer(account)).expect(201);
    expect(result.body.scorecard.mode).toBe('offline');
    await setMode(second, session.id, bearer(account), 'ai').expect(409);
    expect(provider.requests).toHaveLength(1);
    expect(await second.get(SpendGuard).spentToday()).toBeCloseTo(0.0024, 6);
  });
});
