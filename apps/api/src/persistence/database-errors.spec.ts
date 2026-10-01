import { DrizzleQueryError } from 'drizzle-orm/errors';
import pg from 'pg';
import { recordDatabaseFailure } from '../observability/failure-signals.js';
import { databaseUnavailable, isDatabaseUnavailable, safeDatabaseErrorCategory, safeDatabaseErrorCode } from './database-errors.js';

vi.mock('../observability/failure-signals.js', () => ({ recordDatabaseFailure: vi.fn() }));

describe('database availability errors', () => {
  it('recognizes connection loss and read timeouts through wrapped query errors', () => {
    const connection = Object.assign(new Error('private learner data'), { code: 'ECONNRESET' });
    expect(isDatabaseUnavailable(new DrizzleQueryError('select 1', ['private learner data'], connection))).toBe(true);
    expect(isDatabaseUnavailable(new DrizzleQueryError('select 1', [], new Error('Query read timeout')))).toBe(true);
    const serverError = new pg.DatabaseError('server closed', 0, 'error');
    serverError.code = '57P01';
    expect(isDatabaseUnavailable(serverError)).toBe(true);
    expect(
      isDatabaseUnavailable(new DrizzleQueryError('select 1', [], Object.assign(new Error('connection exception'), { code: '08006' }))),
    ).toBe(true);
  });

  it('recognizes a pool connect timeout or refusal that no query wrapped, as a transaction raises it', () => {
    expect(isDatabaseUnavailable(new Error('timeout exceeded when trying to connect'))).toBe(true);
    expect(isDatabaseUnavailable(Object.assign(new Error('connect failed'), { code: 'ECONNREFUSED' }))).toBe(true);
    expect(isDatabaseUnavailable(new Error('Connection terminated unexpectedly'))).toBe(true);
  });

  it('signals the outage behind a 503 only when given its cause', () => {
    const cause = new Error('timeout exceeded when trying to connect');
    expect(databaseUnavailable(cause).getStatus()).toBe(503);
    expect(databaseUnavailable().getStatus()).toBe(503);
    expect(vi.mocked(recordDatabaseFailure).mock.calls).toEqual([[cause]]);
  });

  it('leaves unrelated query errors alone', () => {
    expect(isDatabaseUnavailable(new Error('bad input'))).toBe(false);
    expect(isDatabaseUnavailable(Object.assign(new Error('unique violation'), { code: '23505' }))).toBe(false);
    expect(
      isDatabaseUnavailable(new DrizzleQueryError('select 1', [], Object.assign(new Error('unique violation'), { code: '23505' }))),
    ).toBe(false);
    expect(isDatabaseUnavailable(new Error('other failure', { cause: new Error('private learner answer') }))).toBe(false);
  });

  it('returns only known codes, safe categories and a stable response', () => {
    expect(safeDatabaseErrorCode(Object.assign(new Error('secret'), { code: '57P01' }))).toBe('57P01');
    expect(
      safeDatabaseErrorCode(
        new DrizzleQueryError('select 1', ['private learner data'], Object.assign(new Error('secret'), { code: 'ECONNRESET' })),
      ),
    ).toBe('ECONNRESET');
    expect(safeDatabaseErrorCode({ code: 'learner-secret' })).toBe('unknown');
    expect(safeDatabaseErrorCategory(new Error('timeout exceeded when trying to connect'))).toBe('timeout');
    expect(safeDatabaseErrorCategory(Object.assign(new Error('secret'), { code: 'ETIMEDOUT' }))).toBe('timeout');
    expect(safeDatabaseErrorCategory(Object.assign(new Error('secret'), { code: 'ECONNRESET' }))).toBe('connection');
    expect(safeDatabaseErrorCategory({ code: 'learner-secret' })).toBe('unknown');
    expect(databaseUnavailable().getResponse()).toEqual({ status: 'unavailable', database: 'unreachable' });
  });
});
