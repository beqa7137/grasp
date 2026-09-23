import { index, jsonb, pgTable, smallint, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const learners = pgTable('learners', {
  id: uuid('id').primaryKey(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

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
  (t) => [index('learning_events_learner_time').on(t.learnerId, t.occurredAt)],
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
