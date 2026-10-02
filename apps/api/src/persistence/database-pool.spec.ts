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

  it("warns when given Neon's direct endpoint instead of its pooler", async () => {
    const warn = vi.fn();
    const neon = (host: string) => createDatabasePool(`postgresql://user:secret@${host}/neondb?sslmode=require`, { warn });
    const pools = [
      neon('ep-cool-dawn-a1b2c3d4-pooler.us-east-1.aws.neon.tech'),
      neon('127.0.0.1:5590'),
      neon('ep-cool-dawn-a1b2c3d4.us-east-1.aws.neon.tech'),
    ];
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]![0]).toContain('-pooler');
    expect(warn.mock.calls[0]![0]).not.toContain('secret');
    await Promise.all(pools.map((pool) => pool.end()));
  });
});
