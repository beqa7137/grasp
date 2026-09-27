import { DrizzleQueryError } from 'drizzle-orm/errors';
import { createApp } from './create-app.js';

vi.mock('node:fs', () => ({ existsSync: () => false }));
vi.mock('./create-app.js', () => ({ createApp: vi.fn() }));
vi.mock('./config.js', () => ({
  ConfigError: class ConfigError extends Error {},
  isMissingProductionDatabase: () => false,
  loadConfig: () => ({}),
}));
vi.mock('./observability/error-reporting.js', () => ({ flushErrorReporting: vi.fn() }));

describe('API startup failure', () => {
  afterEach(() => vi.restoreAllMocks());

  it('exits with safe diagnostics instead of an unhandled rejection', async () => {
    const stop = new Error('test exit');
    const exit = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw stop;
    });
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.mocked(createApp).mockRejectedValue(new DrizzleQueryError('private query', ['private learner text'], new Error('private token')));

    await expect(import('./main.js')).rejects.toBe(stop);

    expect(exit).toHaveBeenCalledWith(1);
    expect(logged).toHaveBeenCalledExactlyOnceWith('Failed to start the API:', { category: 'database', code: 'unknown' });
  });
});
