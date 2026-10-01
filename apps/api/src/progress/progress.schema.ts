import {
  ALGORITHMS,
  CASE_CATALOG,
  CODING_CATALOG,
  COMPETENCY_CATALOG,
  DIAGNOSTIC_OUTCOMES,
  DRILL_CARDS,
  INTERVIEW_TRACKS,
  LANGUAGES,
  PATTERNS,
  PLAN_LEVELS,
  PLAN_MINUTES,
  PLAN_ROUNDS,
  SCENARIOS,
  STUDY_OPTIONS,
  SD_TOPICS,
  VERDICTS,
  getReviewItem,
  isCalendarDate,
  isDiagnosticItem,
} from '@grasp/engine';
import { z } from 'zod';

const cardIds = new Set(DRILL_CARDS.map((c) => c.id));
const patternIds = new Set(PATTERNS.map((p) => p.id));
const algorithmIds = new Set(ALGORITHMS.map((a) => a.id));
const scenarioIds = new Set(SCENARIOS.map((s) => s.id));
const problemIds = new Set<string>(CODING_CATALOG.map((p) => p.id));
const competencyIds = new Set(COMPETENCY_CATALOG.map((c) => c.id));
const caseIds = new Set(CASE_CATALOG.map((c) => c.id));
const sdTopicIds = new Set(SD_TOPICS.map((t) => t.id));

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
const competencyId = z.string().refine((id) => competencyIds.has(id), 'Unknown competency');
const durationMs = z.number().int().min(0).max(3_600_000);
const caseCount = z.number().int().min(0).max(50);
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
  // Counts are bounded rather than matched to the case's current questions, and topics the catalog no longer has are
  // dropped, so a later content edit alone does not reject an event recorded before it.
  z
    .object({
      ...base,
      type: z.literal('case.completed'),
      caseId: z.string().refine((id) => caseIds.has(id), 'Unknown case study'),
      topics: z
        .array(z.string().max(80))
        .max(50)
        .transform((topics) => [...new Set(topics.filter((id) => sdTopicIds.has(id)))])
        .refine((topics) => topics.length > 0, 'A case names at least one known design topic'),
      bestChoices: caseCount,
      decisions: caseCount,
      closeEstimates: caseCount,
      estimates: caseCount,
    })
    .refine(
      (e) => e.bestChoices <= e.decisions && e.closeEstimates <= e.estimates,
      'A case outcome cannot have more right answers than questions',
    ),
  z
    .object({
      ...base,
      type: z.literal('interview.scored'),
      sessionId: z.string().max(64),
      track: z.enum(['coding', 'system-design', 'behavioral']),
      verdict: z.string().max(32),
      weakPatterns: z.array(z.string().refine((id) => patternIds.has(id), 'Unknown pattern')).max(20),
      competencyId: competencyId.optional(),
      weakCompetencies: z.array(competencyId).max(COMPETENCY_CATALOG.length).optional(),
    })
    .refine(
      (e) => (e.track === 'behavioral' ? e.weakPatterns.length === 0 : e.competencyId === undefined && e.weakCompetencies === undefined),
      'Behavioral interviews name weak competencies, and the other tracks weak patterns',
    ),
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
    type: z.literal('plan.set'),
    plan: z
      .strictObject({
        interviewDate: z.string().refine(isCalendarDate, 'Must be a calendar date as YYYY-MM-DD'),
        minutesPerDay: oneOf(PLAN_MINUTES),
        rounds: z
          .array(z.enum(PLAN_ROUNDS))
          .min(1)
          .max(PLAN_ROUNDS.length)
          .refine((rounds) => new Set(rounds).size === rounds.length, 'Each round once'),
        level: z.enum(PLAN_LEVELS),
      })
      .nullable(),
  }),
  z.object({
    ...base,
    type: z.literal('mock.completed'),
    loopId: base.id,
    verdict: z.enum(VERDICTS),
    rounds: z
      .array(
        z.object({
          track: z.enum(INTERVIEW_TRACKS),
          sessionId: z.string().max(64),
          verdict: z.enum(VERDICTS),
          at: base.at,
        }),
      )
      .min(1)
      .max(INTERVIEW_TRACKS.length)
      .refine((rounds) => new Set(rounds.map((r) => r.track)).size === rounds.length, 'One round per track'),
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
