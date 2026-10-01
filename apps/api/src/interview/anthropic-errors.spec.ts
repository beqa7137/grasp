import Anthropic from '@anthropic-ai/sdk';
import { BadRequestException, Logger } from '@nestjs/common';
import { recordFailure } from '../observability/failure-signals.js';
import { deadlineExceeded, toHttpError } from './anthropic-errors.js';

vi.mock('../observability/failure-signals.js', () => ({ recordFailure: vi.fn() }));

const log = new Logger('test');
const failed = (status: number, type?: string) =>
  Anthropic.APIError.generate(status, type ? { error: { type } } : undefined, undefined, new Headers());

beforeEach(() => {
  vi.mocked(recordFailure).mockClear();
  vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
  vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

it.each([
  ['a rate limit', failed(429), 'ai.busy'],
  ['an overload', failed(529), 'ai.busy'],
  ['a provider outage', failed(500), 'ai.unavailable'],
  ['a dropped connection', new Anthropic.APIConnectionError({ message: 'gone' }), 'ai.unavailable'],
  ['a per-try timeout', new Anthropic.APIConnectionTimeoutError(), 'ai.timeout'],
  ['a refused key', failed(401), 'ai.rejected'],
  ['a refused request', failed(400, 'invalid_request_error'), 'ai.rejected'],
  ['an unexpected failure', new TypeError('private learner answer'), 'ai.failed'],
] as const)('signals %s in its own group', (_name, error, signal) => {
  toHttpError(error, log);
  expect(vi.mocked(recordFailure).mock.calls).toEqual([[signal, error]]);
});

it('signals a whole-call deadline', () => {
  deadlineExceeded(log, 'interview.reply-deadline');
  deadlineExceeded(log, 'interview.score-deadline');
  expect(vi.mocked(recordFailure).mock.calls).toEqual([['ai.deadline'], ['ai.deadline']]);
});

it('does not signal a disconnect or a failure already turned into a response', () => {
  toHttpError(new Anthropic.APIUserAbortError(), log);
  toHttpError(new BadRequestException(), log);
  expect(recordFailure).not.toHaveBeenCalled();
});
