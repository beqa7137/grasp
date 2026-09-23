import { ConfigError, loadConfig } from './config.js';

describe('loadConfig', () => {
  it('applies defaults for an empty environment', () => {
    const config = loadConfig({});
    expect(config).toMatchObject({
      env: 'development',
      port: 3000,
      trustProxy: 0,
      logFormat: 'pretty',
      databaseUrl: null,
      anthropicApiKey: null,
      anthropicModel: 'claude-sonnet-5',
      aiDailyBudgetUsd: null,
      webDistDir: null,
    });
    expect(config.corsOrigins).toContain('capacitor://localhost');
  });

  it('parses and normalizes production settings', () => {
    const config = loadConfig({
      NODE_ENV: 'production',
      PORT: '8080',
      CORS_ORIGINS: ' https://grasp.dev , capacitor://localhost ,',
      TRUST_PROXY: '1',
      DATABASE_URL: 'postgres://u:p@db.internal:5432/grasp',
      ANTHROPIC_API_KEY: 'sk-ant-api03-0123456789abcdef',
      AI_DAILY_BUDGET_USD: '12.5',
      AI_UNRELATED: 'ignored',
    });
    expect(config).toMatchObject({
      env: 'production',
      port: 8080,
      corsOrigins: ['https://grasp.dev', 'capacitor://localhost'],
      trustProxy: 1,
      logFormat: 'json',
      aiDailyBudgetUsd: 12.5,
      sentryEnvironment: 'production',
    });
  });

  it('treats empty strings as unset, as .env files often contain them', () => {
    expect(loadConfig({ ANTHROPIC_API_KEY: '', AI_DAILY_BUDGET_USD: '', DATABASE_URL: '' })).toMatchObject({
      anthropicApiKey: null,
      aiDailyBudgetUsd: null,
      databaseUrl: null,
    });
  });

  it('reports every invalid variable at once', () => {
    const attempt = () => loadConfig({ PORT: 'eighty', DATABASE_URL: 'mysql://x@y/z', LOG_LEVEL: 'loud', AI_DAILY_BUDGET_USD: '-1' });
    expect(attempt).toThrow(ConfigError);
    const message = (() => {
      try {
        attempt();
      } catch (e) {
        return (e as Error).message;
      }
    })();
    for (const key of ['PORT', 'DATABASE_URL', 'LOG_LEVEL', 'AI_DAILY_BUDGET_USD']) expect(message).toContain(key);
  });
});
