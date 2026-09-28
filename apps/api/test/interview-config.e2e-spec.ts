import { Logger } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Interviewer } from '../src/interview/interviewer.js';
import { createTestApp } from './support/app.js';

describe('paid interviewer configuration', () => {
  let app: NestExpressApplication | undefined;

  beforeEach(() => {
    vi.stubEnv('ANTHROPIC_BASE_URL', undefined);
    vi.stubEnv('ANTHROPIC_CUSTOM_HEADERS', undefined);
  });

  afterEach(async () => {
    await app?.close();
    app = undefined;
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('starts with a verified model and the official endpoint without making a paid request', async () => {
    vi.stubEnv('ANTHROPIC_BASE_URL', 'https://api.anthropic.com/');
    app = await createTestApp({ ANTHROPIC_API_KEY: 'test-only-no-provider-request', ANTHROPIC_MODEL: 'claude-haiku-4-5' });
    expect(app.get(Interviewer).mode).toBe('ai');
  });

  it.each([
    ['ANTHROPIC_MODEL', 'unpriced-model', 'ANTHROPIC_MODEL must have verified pricing'],
    ['ANTHROPIC_BASE_URL', 'https://another-provider.example', 'ANTHROPIC_BASE_URL must use the standard Anthropic endpoint'],
    ['ANTHROPIC_CUSTOM_HEADERS', 'anthropic-beta: fast-mode', 'ANTHROPIC_CUSTOM_HEADERS is incompatible'],
  ])('falls back to offline practice and logs when %s could change billing', async (key, value, message) => {
    const error = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    vi.stubEnv(key, value);
    app = await createTestApp({ ANTHROPIC_API_KEY: 'test-only-no-provider-request', [key]: value });
    expect(app.get(Interviewer).mode).toBe('offline');
    expect(error).toHaveBeenCalledWith(expect.stringContaining(message));
  });

  it('keeps offline practice available without paid provider configuration', async () => {
    vi.stubEnv('ANTHROPIC_BASE_URL', 'https://another-provider.example');
    vi.stubEnv('ANTHROPIC_CUSTOM_HEADERS', 'anthropic-beta: fast-mode');
    app = await createTestApp({ ANTHROPIC_MODEL: 'unpriced-model', AI_DAILY_BUDGET_USD: '0.000001' });
    expect(app.get(Interviewer).mode).toBe('offline');
  });
});
