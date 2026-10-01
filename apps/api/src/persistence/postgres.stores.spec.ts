import type { User } from '../auth/auth.types.js';
import { reportSignal } from '../observability/error-reporting.js';
import { PostgresAuthStore, type Db } from './postgres.stores.js';

vi.mock('../observability/error-reporting.js', () => ({ reportSignal: vi.fn() }));

describe('PostgresAuthStore transaction connection', () => {
  const user: User = {
    id: 'user-1',
    email: 'learner@example.com',
    learnerId: 'learner-1',
    createdAt: '2026-09-26T00:00:00.000Z',
    lastLoginAt: null,
  };

  const signals = () => vi.mocked(reportSignal).mock.calls.map(([report]) => report.signal);
  beforeEach(() => vi.mocked(reportSignal).mockClear());

  it('returns a 503 for a direct driver connection failure, signalling the outage once', async () => {
    const failure = Object.assign(new Error('database private detail'), { code: 'ECONNREFUSED' });
    const store = new PostgresAuthStore({ transaction: () => Promise.reject(failure) } as unknown as Db);

    await expect(store.createUser(user)).rejects.toMatchObject({ status: 503 });
    expect(signals()).toEqual(['db.unavailable']);
  });

  it('returns a 503 for a pool connect timeout, signalling it as a database timeout', async () => {
    const store = new PostgresAuthStore({
      transaction: () => Promise.reject(new Error('timeout exceeded when trying to connect')),
    } as unknown as Db);

    await expect(store.createUser(user)).rejects.toMatchObject({ status: 503 });
    expect(signals()).toEqual(['db.timeout']);
  });

  it('preserves unexpected transaction failures', async () => {
    const failure = Object.assign(new Error('unexpected failure'), { code: '23505' });
    const store = new PostgresAuthStore({ transaction: () => Promise.reject(failure) } as unknown as Db);

    await expect(store.createUser(user)).rejects.toBe(failure);
    expect(reportSignal).not.toHaveBeenCalled();
  });
});
