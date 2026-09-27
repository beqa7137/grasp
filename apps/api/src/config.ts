import { z } from 'zod';

const LOG_LEVELS = ['fatal', 'error', 'warn', 'log', 'debug', 'verbose'] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

const optional = <T extends z.ZodType>(schema: T) => z.preprocess((v) => (v === '' ? undefined : v), schema.optional());
const trimmed = optional(z.string().trim()).transform((s) => s || undefined);
const list = z.string().transform((s) =>
  s
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean),
);

const envSchema = z
  .object({
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
    AI_DAILY_BUDGET_USD: optional(
      z.coerce
        .number()
        .positive()
        .refine((value) => Number.isSafeInteger(Math.floor(value * 1_000_000)), 'must fit a safe integer number of microdollars'),
    ),
    INTERVIEW_MESSAGES_PER_HOUR: z.coerce.number().int().positive().default(120),

    ADMIN_TOKEN: optional(z.string().min(32, 'must be at least 32 characters')),
    JWT_SECRET: optional(z.string().min(32, 'must be at least 32 characters')),
    GOOGLE_WEB_CLIENT_ID: trimmed,
    GOOGLE_IOS_CLIENT_ID: trimmed,
    OAUTH_GITHUB_ID: trimmed,
    OAUTH_GITHUB_SECRET: trimmed,
    OAUTH_GITHUB_URL: optional(z.url({ protocol: /^https?$/ })),
    OAUTH_GITHUB_API_URL: optional(z.url({ protocol: /^https?$/ })),

    SENTRY_DSN: optional(z.url()),
    SENTRY_WEB_DSN: optional(z.url()),
    SENTRY_ENVIRONMENT: optional(z.string()),

    // Set by Vercel on every deployment.
    VERCEL_ENV: optional(z.string()),
    VERCEL_GIT_COMMIT_SHA: optional(z.string()),
  })
  .refine((e) => e.NODE_ENV !== 'production' || e.JWT_SECRET, { path: ['JWT_SECRET'], message: 'is required in production' })
  .refine((e) => e.NODE_ENV !== 'production' || e.DATABASE_URL, {
    path: ['DATABASE_URL'],
    message: 'is required in production',
  })
  .refine((e) => !e.OAUTH_GITHUB_ID === !e.OAUTH_GITHUB_SECRET, {
    path: ['OAUTH_GITHUB_ID'],
    message: 'must be set together with OAUTH_GITHUB_SECRET',
  });

export interface AppConfig {
  env: 'development' | 'production' | 'test';
  port: number;
  corsOrigins: string[];
  /** Number of reverse-proxy hops to trust for the client IP and scheme (Express `trust proxy`). */
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
  /** Bearer token for /api/admin; admin routes are disabled when unset. */
  adminToken: string | null;
  /** Signs access tokens. Outside production a random per-process secret is used when unset. */
  jwtSecret: string | null;
  /** Google sign-in; null when GOOGLE_WEB_CLIENT_ID is unset. */
  google: { webClientId: string; iosClientId: string | null } | null;
  /** GitHub sign-in; null unless both the OAuth app id and secret are set. */
  github: { clientId: string; clientSecret: string; webUrl: string; apiUrl: string } | null;
  sentryDsn: string | null;
  sentryEnvironment: string;
  /** Values the served web app receives through `/config.json`. */
  web: { sentryDsn: string | null };
}

export class ConfigError extends Error {}

export function isMissingProductionDatabase(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.NODE_ENV === 'production' && !env.DATABASE_URL?.trim();
}

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
    release: e.RELEASE ?? e.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
    databaseUrl: e.DATABASE_URL ?? null,
    anthropicApiKey: e.ANTHROPIC_API_KEY ?? null,
    anthropicModel: e.ANTHROPIC_MODEL,
    anthropicTimeoutMs: e.ANTHROPIC_TIMEOUT_MS,
    anthropicMaxRetries: e.ANTHROPIC_MAX_RETRIES,
    aiDailyBudgetUsd: e.AI_DAILY_BUDGET_USD ?? null,
    interviewMessagesPerHour: e.INTERVIEW_MESSAGES_PER_HOUR,
    adminToken: e.ADMIN_TOKEN ?? null,
    jwtSecret: e.JWT_SECRET ?? null,
    google: e.GOOGLE_WEB_CLIENT_ID ? { webClientId: e.GOOGLE_WEB_CLIENT_ID, iosClientId: e.GOOGLE_IOS_CLIENT_ID ?? null } : null,
    github:
      e.OAUTH_GITHUB_ID && e.OAUTH_GITHUB_SECRET
        ? {
            clientId: e.OAUTH_GITHUB_ID,
            clientSecret: e.OAUTH_GITHUB_SECRET,
            webUrl: withoutTrailingSlash(e.OAUTH_GITHUB_URL ?? 'https://github.com'),
            apiUrl: withoutTrailingSlash(e.OAUTH_GITHUB_API_URL ?? 'https://api.github.com'),
          }
        : null,
    sentryDsn: e.SENTRY_DSN ?? null,
    sentryEnvironment: e.SENTRY_ENVIRONMENT ?? e.VERCEL_ENV ?? e.NODE_ENV,
    web: { sentryDsn: e.SENTRY_WEB_DSN ?? null },
  };
}

const withoutTrailingSlash = (url: string) => url.replace(/\/+$/, '');

export const APP_CONFIG = Symbol('APP_CONFIG');
