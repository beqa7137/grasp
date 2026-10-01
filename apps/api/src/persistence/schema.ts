import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

export const learners = pgTable('learners', {
  id: uuid('id').primaryKey(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const erasedLearners = pgTable(
  'erased_learners',
  {
    learnerId: uuid('learner_id').primaryKey(),
    mergedInto: uuid('merged_into'),
    erasedAt: timestamp('erased_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('erased_learners_merged_into')
      .on(t.mergedInto)
      .where(sql`${t.mergedInto} is not null`),
  ],
);

/** Immutable, client-generated events. State is derived by replaying them through @grasp/engine. */
export const learningEvents = pgTable(
  'learning_events',
  {
    id: text('id').primaryKey(),
    learnerId: uuid('learner_id')
      .notNull()
      .references(() => learners.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    payload: jsonb('payload').notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true, mode: 'string' }).notNull(),
    receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('learning_events_learner_time').on(t.learnerId, t.occurredAt),
    index('learning_events_learner_received').on(t.learnerId, t.receivedAt),
  ],
);

export const interviewSessions = pgTable(
  'interview_sessions',
  {
    id: uuid('id').primaryKey(),
    learnerId: uuid('learner_id')
      .notNull()
      .references(() => learners.id, { onDelete: 'cascade' }),
    track: text('track').notNull(),
    problemId: text('problem_id').notNull(),
    status: text('status').notNull(),
    session: jsonb('session').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('interview_sessions_learner_time').on(t.learnerId, t.createdAt)],
);

export const feedback = pgTable(
  'feedback',
  {
    id: uuid('id').primaryKey(),
    learnerId: uuid('learner_id')
      .notNull()
      .references(() => learners.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    message: text('message').notNull(),
    rating: smallint('rating'),
    context: jsonb('context').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull(),
  },
  (t) => [index('feedback_created_at').on(t.createdAt)],
);

/** Behavioral stories of signed-in accounts: the learner's own writing, exported with their data and erased with it. */
export const stories = pgTable(
  'stories',
  {
    learnerId: uuid('learner_id')
      .notNull()
      .references(() => learners.id, { onDelete: 'cascade' }),
    id: text('id').notNull(),
    title: text('title').notNull(),
    competencyIds: text('competency_ids').array().notNull(),
    draft: jsonb('draft').notNull(),
    rehearsal: jsonb('rehearsal'),
    deleted: boolean('deleted').notNull().default(false),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }),
  },
  (t) => [primaryKey({ columns: [t.learnerId, t.id] })],
);

export const users = pgTable('users', {
  id: uuid('id').primaryKey(),
  email: text('email').notNull().unique(),
  learnerId: uuid('learner_id')
    .notNull()
    .unique()
    .references(() => learners.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull(),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true, mode: 'string' }),
});

export const sessionFamilies = pgTable(
  'session_families',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    revokedAt: timestamp('revoked_at', { withTimezone: true, mode: 'string' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull(),
  },
  (t) => [index('session_families_user').on(t.userId)],
);

/** Unused since email sign-in was removed; kept for the release still running during a deploy, drop it in a later release. */
export const loginCodes = pgTable(
  'login_codes',
  {
    id: uuid('id').primaryKey(),
    email: text('email').notNull(),
    codeHash: text('code_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'string' }).notNull(),
    attempts: integer('attempts').notNull().default(0),
    consumedAt: timestamp('consumed_at', { withTimezone: true, mode: 'string' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull(),
  },
  (t) => [index('login_codes_email_time').on(t.email, t.createdAt)],
);

export const authIdentities = pgTable(
  'auth_identities',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull(),
    subject: text('subject').notNull(),
    email: text('email'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull(),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true, mode: 'string' }),
  },
  (t) => [unique('auth_identities_provider_subject').on(t.provider, t.subject), index('auth_identities_user').on(t.userId)],
);

/** Google sign-in nonces and GitHub sign-in tickets. */
export const authOneTime = pgTable(
  'auth_one_time',
  {
    hash: text('hash').primaryKey(),
    purpose: text('purpose').notNull(),
    payload: jsonb('payload'),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'string' }).notNull(),
    consumedAt: timestamp('consumed_at', { withTimezone: true, mode: 'string' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull(),
  },
  (t) => [index('auth_one_time_expires_at').on(t.expiresAt)],
);

export const refreshTokens = pgTable(
  'refresh_tokens',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    familyId: uuid('family_id').notNull(),
    tokenHash: text('token_hash').notNull().unique(),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'string' }).notNull(),
    rotatedAt: timestamp('rotated_at', { withTimezone: true, mode: 'string' }),
    revokedAt: timestamp('revoked_at', { withTimezone: true, mode: 'string' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull(),
  },
  (t) => [index('refresh_tokens_user').on(t.userId), index('refresh_tokens_family').on(t.familyId)],
);

/**
 * Totals per fixed time window, shared by every API instance: AI spend per UTC day, interview quotas,
 * request rate limits. Keys are opaque; rate-limit keys are hashes, so no IP address is stored.
 */
export const counters = pgTable(
  'counters',
  {
    key: text('key').notNull(),
    windowStart: timestamp('window_start', { withTimezone: true }).notNull(),
    total: doublePrecision('total').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.key, t.windowStart] }), index('counters_expires_at').on(t.expiresAt)],
);

/** Short exclusive holds with an expiry, so a crashed instance cannot keep one forever. */
export const leases = pgTable(
  'leases',
  {
    key: text('key').primaryKey(),
    holder: text('holder').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (t) => [index('leases_expires_at').on(t.expiresAt)],
);

export const aiSpendDays = pgTable(
  'ai_spend_days',
  {
    day: date('day', { mode: 'string' }).primaryKey(),
    legacyMicros: bigint('legacy_micros', { mode: 'bigint' })
      .notNull()
      .default(sql`0`),
    settledMicros: bigint('settled_micros', { mode: 'bigint' })
      .notNull()
      .default(sql`0`),
    reservedMicros: bigint('reserved_micros', { mode: 'bigint' })
      .notNull()
      .default(sql`0`),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (t) => [
    index('ai_spend_days_expires_at').on(t.expiresAt),
    check('ai_spend_days_legacy_range', sql`${t.legacyMicros} between 0 and 9007199254740991`),
    check('ai_spend_days_settled_nonnegative', sql`${t.settledMicros} >= 0`),
    check('ai_spend_days_reserved_nonnegative', sql`${t.reservedMicros} >= 0`),
  ],
);

export const aiSpendReservations = pgTable(
  'ai_spend_reservations',
  {
    id: uuid('id').primaryKey(),
    day: date('day', { mode: 'string' })
      .notNull()
      .references(() => aiSpendDays.day, { onDelete: 'cascade' }),
    reservedMicros: bigint('reserved_micros', { mode: 'bigint' }).notNull(),
    actualMicros: bigint('actual_micros', { mode: 'bigint' }),
  },
  (t) => [
    index('ai_spend_reservations_day').on(t.day),
    check('ai_spend_reservations_reserved_range', sql`${t.reservedMicros} between 1 and 9007199254740991`),
    check('ai_spend_reservations_actual_range', sql`${t.actualMicros} between 0 and 9007199254740991`),
  ],
);
