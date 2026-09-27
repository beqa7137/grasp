import { DrizzleQueryError } from 'drizzle-orm/errors';
import pg from 'pg';
import { databaseUnavailable, isDatabaseUnavailable, safeDatabaseErrorCategory, safeDatabaseErrorCode } from './database-errors.js';

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

  it('leaves unrelated query errors alone', () => {
    expect(isDatabaseUnavailable(new Error('bad input'))).toBe(false);
    expect(isDatabaseUnavailable(Object.assign(new Error('unique violation'), { code: '23505' }))).toBe(false);
    expect(
      isDatabaseUnavailable(new DrizzleQueryError('select 1', [], Object.assign(new Error('unique violation'), { code: '23505' }))),
    ).toBe(false);
    expect(isDatabaseUnavailable(Object.assign(new Error('other network call failed'), { code: 'ECONNRESET' }))).toBe(false);
    expect(isDatabaseUnavailable(new Error('other network call failed', { cause: new Error('timeout expired') }))).toBe(false);
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
