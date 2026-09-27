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
  });

  it('starts with a verified model and the official endpoint without making a paid request', async () => {
    vi.stubEnv('ANTHROPIC_BASE_URL', 'https://api.anthropic.com/');
    app = await createTestApp({ ANTHROPIC_API_KEY: 'test-only-no-provider-request', ANTHROPIC_MODEL: 'claude-haiku-4-5' });
    expect(app.get(Interviewer).mode).toBe('ai');
  });

  it('rejects models without a verified reservation bound', async () => {
    await expect(createTestApp({ ANTHROPIC_API_KEY: 'test-only-no-provider-request', ANTHROPIC_MODEL: 'unpriced-model' })).rejects.toThrow(
      'ANTHROPIC_MODEL must have verified pricing and request limits.',
    );
  });

  it.each([
    ['ANTHROPIC_BASE_URL', 'https://another-provider.example', 'ANTHROPIC_BASE_URL must use the standard Anthropic endpoint'],
    ['ANTHROPIC_CUSTOM_HEADERS', 'anthropic-beta: fast-mode', 'ANTHROPIC_CUSTOM_HEADERS is incompatible'],
  ])('rejects %s overrides that could change billing', async (key, value, message) => {
    vi.stubEnv(key, value);
    await expect(createTestApp({ ANTHROPIC_API_KEY: 'test-only-no-provider-request' })).rejects.toThrow(message);
  });

  it('keeps offline practice available without paid provider configuration', async () => {
    vi.stubEnv('ANTHROPIC_BASE_URL', 'https://another-provider.example');
    vi.stubEnv('ANTHROPIC_CUSTOM_HEADERS', 'anthropic-beta: fast-mode');
    app = await createTestApp({ ANTHROPIC_MODEL: 'unpriced-model', AI_DAILY_BUDGET_USD: '0.000001' });
    expect(app.get(Interviewer).mode).toBe('offline');
  });
});
