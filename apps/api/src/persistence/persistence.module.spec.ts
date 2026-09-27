import { Logger } from '@nestjs/common';
import { DrizzleQueryError } from 'drizzle-orm/errors';
import { MemoryAuthStore, MemoryCoordinationStore } from './memory.stores.js';
import { ExpiredRowSweeper } from './persistence.module.js';

afterEach(() => vi.restoreAllMocks());

describe('ExpiredRowSweeper', () => {
  it.each(['coordination', 'auth'] as const)('keeps %s cleanup failures private and allows the next sweep', async (source) => {
    const logged = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    const coordination = new MemoryCoordinationStore();
    const auth = new MemoryAuthStore();
    const failure = new DrizzleQueryError(
      'delete from private_learner_rows where token = $1',
      ['private-token'],
      Object.assign(new Error('private-database-detail'), { code: '23503' }),
    );
    if (source === 'coordination') vi.spyOn(coordination, 'sweep').mockRejectedValueOnce(failure);
    else vi.spyOn(auth, 'sweepExpired').mockRejectedValueOnce(failure);
    const sweeper = new ExpiredRowSweeper(coordination, auth);

    await expect(sweeper.sweep()).resolves.toBeUndefined();
    await expect(sweeper.sweep()).resolves.toBeUndefined();

    expect(logged.mock.calls).toEqual([[{ operation: 'persistence.sweep', category: 'database', code: '23503' }]]);
  });
});
