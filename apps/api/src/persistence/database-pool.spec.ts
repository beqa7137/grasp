import { createDatabasePool } from './database-pool.js';

describe('Postgres pool', () => {
  it('bounds connection and query waits and logs idle disconnects without error details', async () => {
    const warn = vi.fn();
    const pool = createDatabasePool('postgresql://user:secret@127.0.0.1:5590/grasp_test', { warn });
    expect(pool.options).toMatchObject({ connectionTimeoutMillis: 4_000, query_timeout: 3_000 });

    pool.emit('error', Object.assign(new Error('private learner data'), { code: '57P01' }));
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]![0]).toContain('code=57P01');
    expect(warn.mock.calls[0]![0]).not.toContain('private learner data');
    expect(warn.mock.calls[0]![0]).not.toContain('secret');
    await pool.end();
  });
});
