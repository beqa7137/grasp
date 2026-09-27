import { AuthRateLimitService } from './auth-rate-limit.service.js';
import { HttpException, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { MemoryErasureStore, MemoryLearnerState } from '../persistence/erasure.stores.js';
import {
  MemoryAuthStore,
  MemoryCoordinationStore,
  MemoryFeedbackStore,
  MemoryInterviewStore,
  MemoryProgressStore,
} from '../persistence/memory.stores.js';
import { AccountService } from './account.service.js';
import type { User, VerifiedIdentity } from './auth.types.js';
import { SessionService } from './session.service.js';
import { TokenService } from './tokens.js';

const t0 = new Date('2026-09-20T10:00:00Z');
const at = (ms: number) => new Date(t0.getTime() + ms);
const phone = '11111111-1111-4111-8111-111111111111';
const laptop = '22222222-2222-4222-8222-222222222222';

function setup() {
  const state = new MemoryLearnerState();
  const progress = new MemoryProgressStore(state);
  const stores = {
    auth: new MemoryAuthStore(state),
    progress,
    interviews: new MemoryInterviewStore(state, progress),
    feedback: new MemoryFeedbackStore(state),
  };
  const erasure = new MemoryErasureStore(state, stores.progress, stores.interviews, stores.feedback, stores.auth);
  const sessions = new SessionService(
    stores.auth,
    new TokenService('unit-test-secret-0123456789abcdef-0123456789'),
    new AuthRateLimitService(new MemoryCoordinationStore(() => t0.getTime(), stores.auth)),
  );
  const accounts = new AccountService(stores.auth, sessions, erasure);
  return { accounts, erasure, ...stores };
}

const google = (subject: string, email: string | null, authoritative = email?.endsWith('@gmail.com') ?? false): VerifiedIdentity => ({
  provider: 'google',
  subject,
  email,
  authoritative,
});
const github = (subject: string, email: string | null): VerifiedIdentity => ({ provider: 'github', subject, email, authoritative: false });

/** An account from the earlier email-code sign-in, which has no linked sign-in method. */
async function emailCodeAccount(auth: MemoryAuthStore, email: string): Promise<User> {
  const user: User = { id: randomUUID(), email, learnerId: randomUUID(), createdAt: t0.toISOString(), lastLoginAt: null };
  await auth.createUser(user);
  return user;
}

const rejection = async (promise: Promise<unknown>) => {
  const e = await promise.then(
    () => null,
    (error: unknown) => error,
  );
  if (!(e instanceof HttpException)) throw new Error(`Expected an HTTP error, got ${String(e)}`);
  return { status: e.getStatus(), ...(e.getResponse() as object) } as {
    status: number;
    code?: string;
    message?: string;
    providers?: string[];
  };
};

const event = (id: string) => ({
  id,
  at: t0.toISOString(),
  type: 'predict.answered' as const,
  algorithmId: 'binary-search',
  patternId: 'binary-search',
  correct: true,
});

beforeAll(() => Logger.overrideLogger(false));

describe('AccountService sign-in', () => {
  it('starts a fresh learner after the device learner was erased', async () => {
    const { accounts, erasure } = setup();
    await erasure.erase(phone);
    const session = await accounts.signIn(github('erased-device', 'new@example.com'), phone, t0);
    expect(session.learnerId).not.toBe(phone);
    expect(session.deviceLearnerErased).toBe(true);
  });

  it('creates an account for a new identity with its verified email, normalized, and adopts the device learner', async () => {
    const { accounts, auth } = setup();
    const session = await accounts.signIn(github('101', '  Ada@Example.COM '), phone, t0);
    expect(session.user.email).toBe('ada@example.com');
    expect(session.learnerId).toBe(phone);
    expect(session.deviceLearnerErased).toBeUndefined();
    expect(await auth.identitiesForUser(session.user.id)).toEqual([
      expect.objectContaining({ provider: 'github', subject: '101', email: 'ada@example.com', lastLoginAt: t0.toISOString() }),
    ]);
    expect((await auth.userById(session.user.id))?.lastLoginAt).toBe(t0.toISOString());
  });

  it('signs a linked identity in to its account, never re-matching by email, and refreshes what it knows', async () => {
    const { accounts, auth } = setup();
    const first = await accounts.signIn(github('101', 'ada@example.com'), null, t0);
    await accounts.signIn(google('g-bob', 'bob@gmail.com'), null, t0);

    const again = await accounts.signIn(github('101', 'bob@gmail.com'), null, at(60_000));
    expect(again.user).toEqual({ id: first.user.id, email: 'ada@example.com' });
    const [identity] = await auth.identitiesForUser(first.user.id);
    expect(identity).toMatchObject({ email: 'bob@gmail.com', lastLoginAt: at(60_000).toISOString(), createdAt: t0.toISOString() });

    await accounts.signIn(github('101', null), null, at(120_000));
    expect((await auth.identity('github', '101'))?.email).toBe('bob@gmail.com');
  });

  it('refuses a new identity without a verified email and stores nothing', async () => {
    const { accounts, auth } = setup();
    expect(await rejection(accounts.signIn(github('202', null), phone, t0))).toMatchObject({ status: 403, code: 'email_unverified' });
    expect(await auth.userByLearner(phone)).toBeNull();
    expect(await auth.identity('github', '202')).toBeNull();
  });

  it('links an authoritative Google email to an account from the earlier email sign-in', async () => {
    const { accounts, auth } = setup();
    const legacy = await emailCodeAccount(auth, 'cy@gmail.com');
    const viaGoogle = await accounts.signIn(google('g-cy', 'CY@gmail.com'), laptop, at(1_000));
    expect(viaGoogle.user.id).toBe(legacy.id);
    expect(viaGoogle.learnerId).toBe(legacy.learnerId);
    expect((await auth.identitiesForUser(legacy.id)).map((i) => i.provider)).toEqual(['google']);

    const workspace = await emailCodeAccount(auth, 'dee@school.edu');
    const viaWorkspace = await accounts.signIn(google('g-dee', 'dee@school.edu', true), null, at(1_000));
    expect(viaWorkspace.user.id).toBe(workspace.id);
  });

  it('never joins an account that has a sign-in method by email, even for an authoritative Google address', async () => {
    const { accounts, auth } = setup();
    const viaGitHub = await accounts.signIn(github('101', 'cy@gmail.com'), null, t0);
    await accounts.signIn(github('102', 'dee@school.edu'), null, t0);

    const gmail = await rejection(accounts.signIn(google('g-cy', 'cy@gmail.com'), laptop, at(1_000)));
    expect(gmail).toMatchObject({ status: 409, code: 'account_exists', providers: ['github'] });
    const workspace = await rejection(accounts.signIn(google('g-dee', 'dee@school.edu', true), null, at(1_000)));
    expect(workspace).toMatchObject({ status: 409, code: 'account_exists', providers: ['github'] });

    expect(await auth.identity('google', 'g-cy')).toBeNull();
    expect(await auth.userByLearner(laptop)).toBeNull();
    expect((await auth.identitiesForUser(viaGitHub.user.id)).map((i) => i.provider)).toEqual(['github']);
  });

  it('tells the owner of an email-code account that only Google with that address recovers it', async () => {
    const { accounts, auth } = setup();
    const legacy = await emailCodeAccount(auth, 'gil@example.com');
    for (const attempt of [github('505', 'gil@example.com'), google('g-gil', 'gil@example.com', false)]) {
      expect(await rejection(accounts.signIn(attempt, null, t0))).toEqual({
        status: 409,
        statusCode: 409,
        code: 'account_exists',
        providers: [],
        message: 'This email belongs to an account from the earlier email sign-in. Sign in with Google using this address to recover it.',
      });
    }
    expect(await auth.identitiesForUser(legacy.id)).toEqual([]);
  });

  it('refuses to link a non-authoritative email to an existing account, naming the providers it has', async () => {
    const { accounts, auth } = setup();
    const existing = await accounts.signIn(google('g-eve', 'eve@gmail.com'), null, t0);

    const viaGitHub = await rejection(accounts.signIn(github('303', 'Eve@gmail.com'), laptop, at(1_000)));
    expect(viaGitHub).toMatchObject({ status: 409, code: 'account_exists', providers: ['google'] });

    await accounts.signIn(github('304', 'fay@corp.example'), null, t0);
    const viaGoogle = await rejection(accounts.signIn(google('g-fay', 'fay@corp.example', false), null, at(1_000)));
    expect(viaGoogle).toMatchObject({ status: 409, code: 'account_exists', providers: ['github'] });

    expect(await auth.identity('github', '303')).toBeNull();
    expect(await auth.userByLearner(laptop)).toBeNull();
    expect((await auth.identitiesForUser(existing.user.id)).map((i) => i.provider)).toEqual(['google']);
  });

  it('does not let a device learner that already belongs to an account be taken over', async () => {
    const { accounts } = setup();
    await accounts.signIn(google('g-gus', 'gus@gmail.com'), phone, t0);
    const other = await accounts.signIn(github('404', 'hal@example.com'), phone, at(1_000));
    expect(other.learnerId).not.toBe(phone);
  });

  it('adopts the device learner for a new account and merges another device into it', async () => {
    const { accounts, progress } = setup();
    await progress.append(phone, [event('evt-phone-1')]);
    await progress.append(laptop, [event('evt-laptop-1')]);

    const fromPhone = await accounts.signIn(google('g-ida', 'ida@gmail.com'), phone, t0);
    expect(fromPhone.learnerId).toBe(phone);

    const fromLaptop = await accounts.signIn(google('g-ida', 'ida@gmail.com'), laptop, at(60_000));
    expect(fromLaptop.learnerId).toBe(phone);
    expect((await progress.list(phone)).map((e) => e.id).sort()).toEqual(['evt-laptop-1', 'evt-phone-1']);
    expect(await progress.list(laptop)).toEqual([]);
  });

  it('lets concurrent first sign-ins with the same identity land in one account', async () => {
    for (const identity of [google('g-jo', 'jo@gmail.com'), github('606', 'jo@example.com')]) {
      const { accounts, auth } = setup();
      const sessions = await Promise.all([accounts.signIn(identity, phone, t0), accounts.signIn(identity, laptop, t0)]);
      expect(sessions[0].user.id).toBe(sessions[1].user.id);
      expect(await auth.identitiesForUser(sessions[0].user.id)).toHaveLength(1);
    }
  });

  it('lands a sign-in in the account a concurrent first sign-in with the same identity just created', async () => {
    const { accounts, auth } = setup();
    const kay = github('707', 'kay@example.com');
    const first = await accounts.signIn(kay, phone, t0);

    // As if the other sign-in stored the account between this one's identity lookup and its email lookup.
    vi.spyOn(auth, 'identity').mockResolvedValueOnce(null);
    expect((await accounts.signIn(kay, laptop, t0)).user.id).toBe(first.user.id);

    // As if it stored the account after both lookups, so this one's own create gives way.
    vi.spyOn(auth, 'identity').mockResolvedValueOnce(null);
    vi.spyOn(auth, 'userByEmail').mockResolvedValueOnce(null);
    expect((await accounts.signIn(kay, laptop, t0)).user.id).toBe(first.user.id);

    expect(await auth.identitiesForUser(first.user.id)).toHaveLength(1);
  });

  it('stores a new account and its sign-in method together, so a failed first sign-in can simply be retried', async () => {
    const { accounts, auth } = setup();
    vi.spyOn(auth, 'createUser').mockRejectedValueOnce(new Error('connection reset'));
    await expect(accounts.signIn(github('808', 'lou@example.com'), phone, t0)).rejects.toThrow('connection reset');

    const retried = await accounts.signIn(github('808', 'lou@example.com'), phone, at(1_000));
    expect(retried).toMatchObject({ user: { email: 'lou@example.com' }, learnerId: phone });
    expect(await auth.identitiesForUser(retried.user.id)).toEqual([expect.objectContaining({ provider: 'github', subject: '808' })]);
  });
});

describe('AccountService linking', () => {
  async function signedIn(accounts: AccountService, email = 'kim@example.com'): Promise<string> {
    return (await accounts.signIn(github(`gh-${email}`, email), null, t0)).user.id;
  }

  it('connects another provider to the signed-in account, even without a verified email', async () => {
    const { accounts } = setup();
    const userId = await signedIn(accounts);
    const identities = await accounts.link(userId, google('g-kim', null), at(1_000));
    expect(identities).toEqual([
      { provider: 'github', email: 'kim@example.com', linkedAt: t0.toISOString() },
      { provider: 'google', email: null, linkedAt: at(1_000).toISOString() },
    ]);
    expect((await accounts.me(userId)).identities).toEqual(identities);
  });

  it('refuses an identity that belongs to a different account', async () => {
    const { accounts, auth } = setup();
    const owner = await signedIn(accounts, 'lee@example.com');
    const other = await signedIn(accounts, 'max@example.com');
    const taken = await rejection(accounts.link(other, github('gh-lee@example.com', 'lee@example.com'), at(1_000)));
    expect(taken).toMatchObject({ status: 409, code: 'identity_in_use' });
    expect((await auth.identity('github', 'gh-lee@example.com'))?.userId).toBe(owner);
  });

  it('is idempotent, also when the same link arrives twice at once', async () => {
    const { accounts, auth } = setup();
    const userId = await signedIn(accounts);
    const [a, b] = await Promise.all([
      accounts.link(userId, google('g-kim', 'kim@gmail.com'), at(1_000)),
      accounts.link(userId, google('g-kim', 'kim@gmail.com'), at(1_000)),
    ]);
    expect(a).toEqual(b);
    await accounts.link(userId, google('g-kim', 'kim@gmail.com'), at(2_000));
    expect((await auth.identitiesForUser(userId)).filter((i) => i.provider === 'google')).toHaveLength(1);
  });

  it('refuses to link to an account that no longer exists', async () => {
    const { accounts, auth } = setup();
    const user: User = { id: 'gone', email: 'gone@example.com', learnerId: phone, createdAt: t0.toISOString(), lastLoginAt: null };
    await auth.createUser(user);
    await auth.deleteByLearner(phone);
    expect((await rejection(accounts.link('gone', google('g-gone', null), t0))).status).toBe(401);
  });
});
