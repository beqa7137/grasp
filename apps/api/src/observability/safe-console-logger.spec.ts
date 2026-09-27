import { Logger, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DrizzleQueryError } from 'drizzle-orm/errors';
import { SafeConsoleLogger } from './safe-console-logger.js';

const PRIVATE_TEXT = 'private-startup-learner-text';
const PRIVATE_TOKEN = 'private-startup-token';
const PRIVATE_ID = '7d252dab-97c9-47bb-8c51-847c3a333ffc';

function databaseError() {
  return new DrizzleQueryError(
    'insert into feedback values ($1, $2)',
    [PRIVATE_TEXT, PRIVATE_ID],
    Object.assign(new Error(PRIVATE_TOKEN), { code: '23505' }),
  );
}

describe('SafeConsoleLogger', () => {
  afterEach(() => {
    Logger.overrideLogger(false);
    vi.restoreAllMocks();
  });

  it.each([false, true])('hides provider startup exceptions with json=%s', async (json) => {
    const written = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    const failure = databaseError();
    @Module({ providers: [{ provide: 'failing', useFactory: () => Promise.reject(failure) }] })
    class FailingModule {}

    await expect(
      NestFactory.create(FailingModule, {
        logger: new SafeConsoleLogger({ json, colors: false, logLevels: ['error'] }),
        abortOnError: false,
      }),
    ).rejects.toBe(failure);

    const output = written.mock.calls.map(([chunk]) => String(chunk)).join('');
    expect(output).toContain('database');
    for (const value of [PRIVATE_TEXT, PRIVATE_TOKEN, PRIVATE_ID, 'insert into feedback']) expect(output).not.toContain(value);
  });

  it.each([PRIVATE_TOKEN, { secret: PRIVATE_TOKEN }])('hides non-Error failures caught by Nest', async (failure) => {
    const written = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    @Module({ providers: [{ provide: 'failing', useFactory: () => Promise.reject(failure) }] })
    class FailingModule {}

    await expect(
      NestFactory.create(FailingModule, {
        logger: new SafeConsoleLogger({ json: true, logLevels: ['error'] }),
        abortOnError: false,
      }),
    ).rejects.toBe(failure);

    const output = written.mock.calls.map(([chunk]) => String(chunk)).join('');
    expect(output).toContain('Unexpected failure');
    expect(output).not.toContain(PRIVATE_TOKEN);
  });

  it.each(['error', 'fatal'] as const)('drops attached exception metadata from %s logs', (level) => {
    const stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    const stdout = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    const logger = new SafeConsoleLogger({ json: true });

    logger[level](databaseError(), { token: PRIVATE_TOKEN }, PRIVATE_TEXT);

    const output = [...stderr.mock.calls, ...stdout.mock.calls].map(([chunk]) => String(chunk)).join('');
    expect(output).toContain('database');
    for (const value of [PRIVATE_TEXT, PRIVATE_TOKEN, PRIVATE_ID]) expect(output).not.toContain(value);
  });

  it('keeps structured application diagnostics intact', () => {
    const written = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    const logger = new SafeConsoleLogger({ json: true });

    logger.error({ message: 'Database unavailable', category: 'connection', code: 'ECONNRESET' }, 'Persistence');

    const output = JSON.parse(String(written.mock.calls[0]![0]));
    expect(output).toMatchObject({
      context: 'Persistence',
      message: { message: 'Database unavailable', category: 'connection', code: 'ECONNRESET' },
    });
  });
});
