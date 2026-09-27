import type { User } from '../auth/auth.types.js';
import { PostgresAuthStore, type Db } from './postgres.stores.js';

describe('PostgresAuthStore transaction connection', () => {
  const user: User = {
    id: 'user-1',
    email: 'learner@example.com',
    learnerId: 'learner-1',
    createdAt: '2026-09-26T00:00:00.000Z',
    lastLoginAt: null,
  };

  it('returns a 503 for a direct driver connection failure', async () => {
    const failure = Object.assign(new Error('database private detail'), { code: 'ECONNREFUSED' });
    const store = new PostgresAuthStore({ transaction: () => Promise.reject(failure) } as unknown as Db);

    await expect(store.createUser(user)).rejects.toMatchObject({ status: 503 });
  });

  it('preserves unexpected transaction failures', async () => {
    const failure = Object.assign(new Error('unexpected failure'), { code: '23505' });
    const store = new PostgresAuthStore({ transaction: () => Promise.reject(failure) } as unknown as Db);

    await expect(store.createUser(user)).rejects.toBe(failure);
  });
});
