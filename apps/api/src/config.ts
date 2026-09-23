export interface AppConfig {
  port: number;
  corsOrigins: string[];
  databaseUrl: string | null;
  anthropicApiKey: string | null;
  anthropicModel: string;
  anthropicTimeoutMs: number;
  anthropicMaxRetries: number;
  /** Null means no daily ceiling. */
  aiDailyBudgetUsd: number | null;
  interviewMessagesPerHour: number;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  return {
    port: Number(env['PORT'] ?? 3000),
    corsOrigins: (env['CORS_ORIGINS'] ?? 'http://localhost:4200,capacitor://localhost,http://localhost,ionic://localhost')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    databaseUrl: env['DATABASE_URL'] || null,
    anthropicApiKey: env['ANTHROPIC_API_KEY'] || null,
    anthropicModel: env['ANTHROPIC_MODEL'] || 'claude-sonnet-5',
    anthropicTimeoutMs: Number(env['ANTHROPIC_TIMEOUT_MS'] || 60_000),
    anthropicMaxRetries: Number(env['ANTHROPIC_MAX_RETRIES'] || 2),
    aiDailyBudgetUsd: env['AI_DAILY_BUDGET_USD'] ? Number(env['AI_DAILY_BUDGET_USD']) : null,
    interviewMessagesPerHour: Number(env['INTERVIEW_MESSAGES_PER_HOUR'] ?? 120),
  };
}

export const APP_CONFIG = Symbol('APP_CONFIG');
