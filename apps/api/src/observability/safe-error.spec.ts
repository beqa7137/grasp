import { DrizzleQueryError } from 'drizzle-orm/errors';
import pg from 'pg';
import { safeErrorDetails } from './safe-error.js';

describe('safeErrorDetails', () => {
  it('retains the database category and known code without query details', () => {
    const cause = new pg.DatabaseError('private token', 0, 'error');
    cause.code = '23505';
    cause.detail = 'private learner';
    const error = new DrizzleQueryError('insert private transcript', ['private learner'], cause);
    expect(safeErrorDetails(error)).toEqual({ category: 'database', code: '23505' });
  });

  it('uses known runtime categories without retaining their messages or custom names', () => {
    const failure = new TypeError('private transcript');
    failure.name = 'private learner';
    expect(safeErrorDetails(failure)).toEqual({ category: 'type', code: 'unknown' });
    expect(safeErrorDetails(new RangeError('private transcript'))).toEqual({ category: 'range', code: 'unknown' });
    expect(safeErrorDetails(new SyntaxError('private transcript'))).toEqual({ category: 'syntax', code: 'unknown' });
    expect(safeErrorDetails({ code: 'private token', message: 'private transcript' })).toEqual({ category: 'unknown', code: 'unknown' });
  });

  it('bounds cyclic causes and never invokes a thrown value stringifier', () => {
    const failure = {
      cause: null as unknown,
      toString: () => {
        throw new Error('must not stringify');
      },
    };
    failure.cause = failure;
    expect(safeErrorDetails(failure)).toEqual({ category: 'unknown', code: 'unknown' });
    expect(safeErrorDetails(null)).toEqual({ category: 'unknown', code: 'unknown' });
    expect(safeErrorDetails('private token')).toEqual({ category: 'unknown', code: 'unknown' });
  });
});
