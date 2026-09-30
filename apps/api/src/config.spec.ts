import { ConfigError, isMissingProductionDatabase, loadConfig } from './config.js';

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
      JWT_SECRET: 'a-very-long-secret-used-only-in-this-test-000',
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

  it('takes the release and environment from Vercel unless set explicitly', () => {
    const vercel = { VERCEL_ENV: 'preview', VERCEL_GIT_COMMIT_SHA: '0123456789abcdef0123456789abcdef01234567' };
    expect(loadConfig(vercel)).toMatchObject({ release: '0123456', sentryEnvironment: 'preview' });
    expect(loadConfig({ ...vercel, RELEASE: 'v1.2.3', SENTRY_ENVIRONMENT: 'staging' })).toMatchObject({
      release: 'v1.2.3',
      sentryEnvironment: 'staging',
    });
  });

  it('requires a JWT secret and database URL in production only', () => {
    expect(() => loadConfig({ NODE_ENV: 'production' })).toThrow(/JWT_SECRET: is required in production/);
    expect(() => loadConfig({ NODE_ENV: 'production', JWT_SECRET: 'a-very-long-secret-used-only-in-this-test-000' })).toThrow(
      /DATABASE_URL: is required in production/,
    );
    expect(() =>
      loadConfig({ NODE_ENV: 'production', JWT_SECRET: 'a-very-long-secret-used-only-in-this-test-000', DATABASE_URL: '' }),
    ).toThrow(/DATABASE_URL: is required in production/);
    expect(loadConfig({ NODE_ENV: 'development' }).jwtSecret).toBeNull();
    expect(() => loadConfig({ JWT_SECRET: 'short' })).toThrow(/JWT_SECRET/);
  });

  it('identifies missing production database configuration at both server entries', () => {
    expect(isMissingProductionDatabase({ NODE_ENV: 'production' })).toBe(true);
    expect(isMissingProductionDatabase({ NODE_ENV: 'production', DATABASE_URL: '  ' })).toBe(true);
    expect(isMissingProductionDatabase({ NODE_ENV: 'production', DATABASE_URL: 'postgres://localhost/grasp' })).toBe(false);
    expect(isMissingProductionDatabase({ NODE_ENV: 'development' })).toBe(false);
  });

  it('treats empty strings as unset, as .env files often contain them', () => {
    expect(
      loadConfig({
        ANTHROPIC_API_KEY: '',
        AI_DAILY_BUDGET_USD: '',
        DATABASE_URL: '',
        GOOGLE_WEB_CLIENT_ID: '',
        OAUTH_GITHUB_ID: '',
        OAUTH_GITHUB_SECRET: '',
        OAUTH_GITHUB_URL: '',
      }),
    ).toMatchObject({
      anthropicApiKey: null,
      aiDailyBudgetUsd: null,
      databaseUrl: null,
      google: null,
      github: null,
    });
  });

  it('trims the sign-in client ids and secret, and treats blank ones as unset', () => {
    expect(
      loadConfig({
        GOOGLE_WEB_CLIENT_ID: ' web \n',
        GOOGLE_IOS_CLIENT_ID: '  ',
        OAUTH_GITHUB_ID: ' Ov23li ',
        OAUTH_GITHUB_SECRET: 'shh\n',
      }),
    ).toMatchObject({
      google: { webClientId: 'web', iosClientId: null },
      github: { clientId: 'Ov23li', clientSecret: 'shh' },
    });
    expect(loadConfig({ GOOGLE_WEB_CLIENT_ID: ' ', OAUTH_GITHUB_ID: '\t', OAUTH_GITHUB_SECRET: '  ' })).toMatchObject({
      google: null,
      github: null,
    });
    expect(() => loadConfig({ OAUTH_GITHUB_ID: 'Ov23li', OAUTH_GITHUB_SECRET: ' ' })).toThrow(/OAUTH_GITHUB_ID/);
  });

  it('turns sign-in providers on only when their client ids are set', () => {
    expect(loadConfig({})).toMatchObject({ google: null, github: null });
    expect(loadConfig({ GOOGLE_WEB_CLIENT_ID: 'web.apps.googleusercontent.com' }).google).toEqual({
      webClientId: 'web.apps.googleusercontent.com',
      iosClientId: null,
    });
    expect(loadConfig({ GOOGLE_WEB_CLIENT_ID: 'web', GOOGLE_IOS_CLIENT_ID: 'ios' }).google).toEqual({
      webClientId: 'web',
      iosClientId: 'ios',
    });
    expect(loadConfig({ GOOGLE_IOS_CLIENT_ID: 'ios' }).google).toBeNull();
  });

  it('configures GitHub from the OAuth app id and secret, with overridable GitHub URLs', () => {
    expect(loadConfig({ OAUTH_GITHUB_ID: 'Ov23li', OAUTH_GITHUB_SECRET: 'shh' }).github).toEqual({
      clientId: 'Ov23li',
      clientSecret: 'shh',
      webUrl: 'https://github.com',
      apiUrl: 'https://api.github.com',
    });
    const enterprise = loadConfig({
      OAUTH_GITHUB_ID: 'Ov23li',
      OAUTH_GITHUB_SECRET: 'shh',
      OAUTH_GITHUB_URL: 'https://github.example.com/',
      OAUTH_GITHUB_API_URL: 'https://github.example.com/api/v3/',
    });
    expect(enterprise.github).toMatchObject({ webUrl: 'https://github.example.com', apiUrl: 'https://github.example.com/api/v3' });
  });

  it('requires the GitHub id and secret together, and web URLs for GitHub', () => {
    expect(() => loadConfig({ OAUTH_GITHUB_ID: 'Ov23li' })).toThrow(/OAUTH_GITHUB_ID: must be set together with OAUTH_GITHUB_SECRET/);
    expect(() => loadConfig({ OAUTH_GITHUB_SECRET: 'shh' })).toThrow(/OAUTH_GITHUB_ID/);
    expect(() => loadConfig({ OAUTH_GITHUB_ID: 'a', OAUTH_GITHUB_SECRET: 'b', OAUTH_GITHUB_URL: 'javascript:alert(1)' })).toThrow(
      /OAUTH_GITHUB_URL/,
    );
  });

  it('ignores the retired email sign-in settings', () => {
    expect(loadConfig({ RESEND_API_KEY: 're_0123456789', MAIL_FROM: 'Grasp <login@grasp.dev>' })).not.toHaveProperty('mail');
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

  it('keeps the interview deadlines inside the 300 s serverless function limit', () => {
    expect(loadConfig({})).toMatchObject({ interviewReplyDeadlineMs: 90_000, interviewScoreDeadlineMs: 180_000 });
    for (const key of ['INTERVIEW_REPLY_DEADLINE_MS', 'INTERVIEW_SCORE_DEADLINE_MS']) {
      expect(() => loadConfig({ [key]: '280001' })).toThrow(new RegExp(key));
      expect(() => loadConfig({ [key]: '999' })).toThrow(new RegExp(key));
    }
    expect(loadConfig({ INTERVIEW_REPLY_DEADLINE_MS: '280000', INTERVIEW_SCORE_DEADLINE_MS: '280000' })).toMatchObject({
      interviewReplyDeadlineMs: 280_000,
      interviewScoreDeadlineMs: 280_000,
    });
  });

  it('rejects a budget that cannot be represented safely in microdollars', () => {
    expect(() => loadConfig({ AI_DAILY_BUDGET_USD: '9007199255' })).toThrow(/AI_DAILY_BUDGET_USD/);
    expect(() => loadConfig({ AI_DAILY_BUDGET_USD: String(Number.MAX_SAFE_INTEGER / 1_000_000) })).toThrow(/AI_DAILY_BUDGET_USD/);
    expect(loadConfig({ AI_DAILY_BUDGET_USD: '9007199254' }).aiDailyBudgetUsd).toBe(9_007_199_254);
  });
});
