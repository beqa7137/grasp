import {
  ALGORITHMS,
  CODING_CATALOG,
  DIAGNOSTIC_OUTCOMES,
  DRILL_CARDS,
  LANGUAGES,
  PATTERNS,
  SCENARIOS,
  STUDY_OPTIONS,
  getReviewItem,
  isDiagnosticItem,
} from '@grasp/engine';
import { z } from 'zod';

const cardIds = new Set(DRILL_CARDS.map((c) => c.id));
const patternIds = new Set(PATTERNS.map((p) => p.id));
const algorithmIds = new Set(ALGORITHMS.map((a) => a.id));
const scenarioIds = new Set(SCENARIOS.map((s) => s.id));
const problemIds = new Set<string>(CODING_CATALOG.map((p) => p.id));

const base = {
  id: z
    .string()
    .min(8)
    .max(80)
    .regex(/^[\w-]+$/),
  at: z.iso.datetime({ offset: true }).transform((s) => new Date(s).toISOString()),
};

const itemId = z
  .string()
  .max(80)
  .refine((id) => Boolean(getReviewItem(id)), 'Unknown review item');
const durationMs = z.number().int().min(0).max(3_600_000);
const oneOf = (options: readonly number[]) => z.number().refine((v) => options.includes(v), `Must be one of ${options.join(', ')}`);

export const learningEventSchema = z.discriminatedUnion('type', [
  z.object({
    ...base,
    type: z.literal('review.graded'),
    itemId,
    rating: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
    correct: z.boolean(),
    durationMs,
    seed: z.number().int().nonnegative().optional(),
  }),
  z.object({
    ...base,
    type: z.literal('practice.answered'),
    itemId,
    correct: z.boolean(),
    durationMs,
  }),
  z.object({
    ...base,
    type: z.literal('predict.answered'),
    algorithmId: z.string().refine((id) => algorithmIds.has(id), 'Unknown algorithm'),
    patternId: z.string().refine((id) => patternIds.has(id), 'Unknown pattern'),
    correct: z.boolean(),
  }),
  z.object({
    ...base,
    type: z.literal('scenario.completed'),
    scenarioId: z.string().refine((id) => scenarioIds.has(id), 'Unknown scenario'),
    monthlyCost: z.number().nonnegative(),
    variant: z.number().int().min(1).max(10).optional(),
  }),
  z.object({
    ...base,
    type: z.literal('interview.scored'),
    sessionId: z.string().max(64),
    track: z.enum(['coding', 'system-design']),
    verdict: z.string().max(32),
    weakPatterns: z.array(z.string().refine((id) => patternIds.has(id), 'Unknown pattern')).max(20),
  }),
  z
    .object({
      ...base,
      type: z.literal('code.submitted'),
      problemId: z.string().refine((id) => problemIds.has(id), 'Unknown coding problem'),
      language: z.enum(LANGUAGES),
      passed: z.number().int().min(0).max(1_000),
      total: z.number().int().min(1).max(1_000),
    })
    .refine((e) => e.passed <= e.total, 'passed cannot exceed total'),
  z.object({
    ...base,
    type: z.literal('settings.changed'),
    settings: z
      .strictObject({
        retention: oneOf(STUDY_OPTIONS.retention),
        budgetMinutes: oneOf(STUDY_OPTIONS.budgetMinutes),
        newPerDay: oneOf(STUDY_OPTIONS.newPerDay),
      })
      .partial()
      .refine((change) => Object.keys(change).length > 0, 'Empty settings change'),
  }),
  z.object({
    ...base,
    type: z.literal('diagnostic.completed'),
    answers: z
      .array(
        z.object({
          itemId: z.string().max(80).refine(isDiagnosticItem, 'Not a placement check item'),
          outcome: z.enum(DIAGNOSTIC_OUTCOMES),
          durationMs,
        }),
      )
      .min(1)
      .refine((answers) => new Set(answers.map((a) => a.itemId)).size === answers.length, 'Each item can be answered once'),
  }),
  z.object({
    ...base,
    type: z.literal('drill.reviewed'),
    cardId: z.string().refine((id) => cardIds.has(id), 'Unknown card'),
    grade: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
  }),
]);

export const appendEventsSchema = z.object({
  events: z
    .array(learningEventSchema)
    .max(500)
    .refine((events) => new Set(events.map((event) => event.id)).size === events.length, 'Event IDs must be unique within a request'),
});

export type AppendEventsDto = z.infer<typeof appendEventsSchema>;

export const sinceSchema = z.iso.datetime({ offset: true }).optional();
