import { HttpException, Logger } from '@nestjs/common';
import { MemoryAuthStore, MemoryFeedbackStore, MemoryInterviewStore, MemoryProgressStore } from '../persistence/memory.stores.js';
import { AuthService, CODES_PER_WINDOW, MAX_CODE_ATTEMPTS } from './auth.service.js';
import { DisabledMailer, Mailer, type MailMessage } from './mailer.js';
import { TokenService } from './tokens.js';

class CapturingMailer extends Mailer {
  readonly enabled = true;
  readonly sent: MailMessage[] = [];
  async send(message: MailMessage) {
    this.sent.push(message);
  }
  lastCode() {
    return /(\d{6})/.exec(this.sent.at(-1)!.subject)![1];
  }
}

const SECRET = 'unit-test-secret-0123456789abcdef-0123456789';
const t0 = new Date('2026-09-20T10:00:00Z');
const at = (ms: number) => new Date(t0.getTime() + ms);
const MIN = 60_000;

function setup(mailer: Mailer = new CapturingMailer()) {
  const stores = {
    auth: new MemoryAuthStore(),
    progress: new MemoryProgressStore(),
    interviews: new MemoryInterviewStore(),
    feedback: new MemoryFeedbackStore(),
  };
  const tokens = new TokenService(SECRET);
  const service = new AuthService(stores.auth, stores.progress, stores.interviews, stores.feedback, mailer, tokens, SECRET);
  return { service, tokens, mailer: mailer as CapturingMailer, ...stores };
}

const status = (e: unknown) => (e instanceof HttpException ? e.getStatus() : e);

beforeAll(() => Logger.overrideLogger(false));

describe('AuthService', () => {
  it('signs in with an emailed code that works once and expires after ten minutes', async () => {
    const { service, mailer, tokens } = setup();
    await service.startEmail('ada@example.com', t0);
    const code = mailer.lastCode();
    expect(mailer.sent[0]).toMatchObject({ to: 'ada@example.com' });
    expect(mailer.sent[0].text).toContain(code);

    const session = await service.verifyEmail('ada@example.com', code, null, at(9 * MIN));
    expect(await tokens.verify(session.accessToken, at(9 * MIN))).toEqual({ userId: session.user.id, learnerId: session.learnerId });
    expect(await service.verifyEmail('ada@example.com', code, null, at(9 * MIN)).catch(status)).toBe(401);

    await service.startEmail('ada@example.com', at(20 * MIN));
    expect(await service.verifyEmail('ada@example.com', mailer.lastCode(), null, at(31 * MIN)).catch(status)).toBe(401);
  });

  it('locks a code after too many wrong guesses', async () => {
    const { service, mailer } = setup();
    await service.startEmail('bob@example.com', t0);
    const code = mailer.lastCode();
    const wrong = code === '000000' ? '111111' : '000000';
    for (let i = 0; i < MAX_CODE_ATTEMPTS; i++)
      expect(await service.verifyEmail('bob@example.com', wrong, null, t0).catch(status)).toBe(401);
    expect(await service.verifyEmail('bob@example.com', code, null, t0).catch(status)).toBe(401);
  });

  it('limits how many codes one address can request', async () => {
    const { service } = setup();
    for (let i = 0; i < CODES_PER_WINDOW; i++) await service.startEmail('cy@example.com', at(i * MIN));
    expect(await service.startEmail('cy@example.com', at(5 * MIN)).catch(status)).toBe(429);
    await expect(service.startEmail('cy@example.com', at(20 * MIN))).resolves.toBeUndefined();
  });

  it('refuses email sign-in when no mail provider is configured', async () => {
    const { service } = setup(new DisabledMailer());
    expect(await service.startEmail('dee@example.com', t0).catch(status)).toBe(503);
  });

  it('rotates refresh tokens and treats late reuse of an old one as theft', async () => {
    const { service, mailer } = setup();
    await service.startEmail('eve@example.com', t0);
    const first = await service.verifyEmail('eve@example.com', mailer.lastCode(), null, t0);

    const second = await service.refresh(first.refreshToken, at(MIN));
    expect(second.refreshToken).not.toBe(first.refreshToken);
    // A second tab refreshing with the same token moments later is tolerated.
    const sibling = await service.refresh(first.refreshToken, at(MIN + 5_000));
    expect(sibling.user.id).toBe(first.user.id);

    expect(await service.refresh(first.refreshToken, at(2 * MIN)).catch(status)).toBe(401);
    expect(await service.refresh(second.refreshToken, at(2 * MIN)).catch(status)).toBe(401);
    expect(await service.refresh(sibling.refreshToken, at(2 * MIN)).catch(status)).toBe(401);
  });

  it('ends the session family on logout and rejects expired refresh tokens', async () => {
    const { service, mailer } = setup();
    await service.startEmail('fay@example.com', t0);
    const session = await service.verifyEmail('fay@example.com', mailer.lastCode(), null, t0);
    await service.logout(session.refreshToken, at(MIN));
    expect(await service.refresh(session.refreshToken, at(MIN)).catch(status)).toBe(401);

    await service.startEmail('fay@example.com', at(2 * MIN));
    const again = await service.verifyEmail('fay@example.com', mailer.lastCode(), null, at(2 * MIN));
    expect(await service.refresh(again.refreshToken, at(31 * 24 * 60 * MIN)).catch(status)).toBe(401);
  });

  it('adopts the device learner for a new account and merges another device into it', async () => {
    const { service, mailer, progress, auth } = setup();
    const phone = '11111111-1111-4111-8111-111111111111';
    const laptop = '22222222-2222-4222-8222-222222222222';
    const event = (id: string) => ({
      id,
      at: t0.toISOString(),
      type: 'predict.answered' as const,
      algorithmId: 'binary-search',
      patternId: 'binary-search',
      correct: true,
    });
    await progress.append(phone, [event('evt-phone-1')]);
    await progress.append(laptop, [event('evt-laptop-1')]);

    await service.startEmail('gus@example.com', t0);
    const fromPhone = await service.verifyEmail('gus@example.com', mailer.lastCode(), phone, t0);
    expect(fromPhone.learnerId).toBe(phone);

    await service.startEmail('gus@example.com', at(MIN));
    const fromLaptop = await service.verifyEmail('gus@example.com', mailer.lastCode(), laptop, at(MIN));
    expect(fromLaptop.learnerId).toBe(phone);
    expect((await progress.list(phone)).map((e) => e.id).sort()).toEqual(['evt-laptop-1', 'evt-phone-1']);
    expect(await progress.list(laptop)).toEqual([]);
    expect((await auth.userByLearner(phone))?.email).toBe('gus@example.com');
  });
});

describe('TokenService', () => {
  it('rejects expired, tampered and foreign tokens', async () => {
    const tokens = new TokenService(SECRET);
    const token = await tokens.sign({ userId: 'u1', learnerId: 'l1' }, t0);
    await expect(tokens.verify(token, at(14 * MIN))).resolves.toEqual({ userId: 'u1', learnerId: 'l1' });
    await expect(tokens.verify(token, at(16 * MIN))).rejects.toThrow('Token expired');
    await expect(tokens.verify(`${token.slice(0, -2)}xx`, t0)).rejects.toThrow('Invalid token');
    await expect(new TokenService(`${SECRET}-other`).verify(token, t0)).rejects.toThrow('Invalid token');
  });
});
