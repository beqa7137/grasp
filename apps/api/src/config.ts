import { z } from 'zod';

const LOG_LEVELS = ['fatal', 'error', 'warn', 'log', 'debug', 'verbose'] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

const optional = <T extends z.ZodType>(schema: T) => z.preprocess((v) => (v === '' ? undefined : v), schema.optional());
const list = z.string().transform((s) =>
  s
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean),
);

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  CORS_ORIGINS: list.default([
    'http://localhost:4200',
    'capacitor://localhost',
    'http://localhost',
    'https://localhost',
    'ionic://localhost',
  ]),
  TRUST_PROXY: z.coerce.number().int().min(0).max(10).default(0),
  RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(300),
  LOG_LEVEL: z.enum(LOG_LEVELS).default('log'),
  LOG_FORMAT: optional(z.enum(['json', 'pretty'])),
  WEB_DIST_DIR: optional(z.string()),
  RELEASE: optional(z.string().max(64)),

  DATABASE_URL: optional(z.url({ protocol: /^postgres(ql)?$/ })),

  ANTHROPIC_API_KEY: optional(z.string().min(20)),
  ANTHROPIC_MODEL: z.string().min(1).default('claude-sonnet-5'),
  ANTHROPIC_TIMEOUT_MS: z.coerce.number().int().min(1_000).default(60_000),
  ANTHROPIC_MAX_RETRIES: z.coerce.number().int().min(0).max(10).default(2),
  AI_DAILY_BUDGET_USD: optional(z.coerce.number().positive()),
  INTERVIEW_MESSAGES_PER_HOUR: z.coerce.number().int().positive().default(120),

  SENTRY_DSN: optional(z.url()),
  SENTRY_WEB_DSN: optional(z.url()),
  SENTRY_ENVIRONMENT: optional(z.string()),
});

export interface AppConfig {
  env: 'development' | 'production' | 'test';
  port: number;
  corsOrigins: string[];
  /** Number of reverse-proxy hops to trust for the client IP (Express `trust proxy`). */
  trustProxy: number;
  rateLimitPerMinute: number;
  logLevel: LogLevel;
  logFormat: 'json' | 'pretty';
  /** Built web app to serve at `/`; unset for API-only deployments. */
  webDistDir: string | null;
  release: string | null;
  databaseUrl: string | null;
  anthropicApiKey: string | null;
  anthropicModel: string;
  anthropicTimeoutMs: number;
  anthropicMaxRetries: number;
  /** Null means no daily ceiling. */
  aiDailyBudgetUsd: number | null;
  interviewMessagesPerHour: number;
  sentryDsn: string | null;
  sentryEnvironment: string;
  /** Values the served web app receives through `/config.json`. */
  web: { sentryDsn: string | null };
}

export class ConfigError extends Error {}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new ConfigError(`Invalid environment configuration:\n${problems}`);
  }
  const e = parsed.data;
  return {
    env: e.NODE_ENV,
    port: e.PORT,
    corsOrigins: e.CORS_ORIGINS,
    trustProxy: e.TRUST_PROXY,
    rateLimitPerMinute: e.RATE_LIMIT_PER_MINUTE,
    logLevel: e.LOG_LEVEL,
    logFormat: e.LOG_FORMAT ?? (e.NODE_ENV === 'production' ? 'json' : 'pretty'),
    webDistDir: e.WEB_DIST_DIR ?? null,
    release: e.RELEASE ?? null,
    databaseUrl: e.DATABASE_URL ?? null,
    anthropicApiKey: e.ANTHROPIC_API_KEY ?? null,
    anthropicModel: e.ANTHROPIC_MODEL,
    anthropicTimeoutMs: e.ANTHROPIC_TIMEOUT_MS,
    anthropicMaxRetries: e.ANTHROPIC_MAX_RETRIES,
    aiDailyBudgetUsd: e.AI_DAILY_BUDGET_USD ?? null,
    interviewMessagesPerHour: e.INTERVIEW_MESSAGES_PER_HOUR,
    sentryDsn: e.SENTRY_DSN ?? null,
    sentryEnvironment: e.SENTRY_ENVIRONMENT ?? e.NODE_ENV,
    web: { sentryDsn: e.SENTRY_WEB_DSN ?? null },
  };
}

export const APP_CONFIG = Symbol('APP_CONFIG');
