import { PATTERNS } from '@grasp/engine';
import { z } from 'zod';
import type { InterviewTrack, Scorecard, ScoreDimension, Verdict } from './interview.types.js';
import { RUBRICS } from './prompts.js';

export const VERDICTS = ['strong-hire', 'hire', 'lean-hire', 'lean-no-hire', 'no-hire'] as const satisfies readonly Verdict[];
export const MAX_LIST_ITEMS = 6;

/**
 * Hand-written rather than derived from zod: the SDK's zod helper demotes `enum` to a description,
 * and here the enums are what keep rubric names, scores and pattern ids valid.
 * Only keywords structured outputs support are used (no minimum/maximum/minLength/maxLength).
 */
export function scorecardJsonSchema(track: InterviewTrack) {
  const properties = {
    ...scorecardProperties(track),
    weakPatterns: { type: 'array', items: { type: 'string', enum: PATTERNS.map((p) => p.id) } },
  };
  return { type: 'object', additionalProperties: false, required: Object.keys(properties), properties };
}

/** What every track's scorecard schema holds: verdict, summary, rubric dimensions, strengths and improvements. */
export function scorecardProperties(track: InterviewTrack) {
  const text = { type: 'string' };
  return {
    verdict: { type: 'string', enum: [...VERDICTS] },
    summary: { type: 'string', description: 'Two to four sentences addressed to the candidate.' },
    dimensions: {
      type: 'array',
      description: 'Exactly one entry per rubric dimension, in rubric order.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'score', 'evidence'],
        properties: {
          name: { type: 'string', enum: RUBRICS[track].map((r) => r.name) },
          score: { type: 'integer', enum: [1, 2, 3, 4] },
          evidence: { type: 'string', description: 'Specific moments from the transcript that justify the score.' },
        },
      },
    },
    strengths: { type: 'array', items: text, description: `At most ${MAX_LIST_ITEMS}.` },
    improvements: { type: 'array', items: text, description: `At most ${MAX_LIST_ITEMS}, each one concrete and actionable.` },
  };
}

export const rawDimensions = z.array(z.object({ name: z.string(), score: z.number(), evidence: z.string() }));

const rawScorecard = z.object({
  verdict: z.string(),
  summary: z.string(),
  dimensions: rawDimensions,
  strengths: z.array(z.string()),
  improvements: z.array(z.string()),
  weakPatterns: z.array(z.string()),
});

export class InvalidScorecardError extends Error {}

export const lookup = <T extends string>(values: readonly T[]) => {
  const byKey = new Map(values.map((v) => [v.toLowerCase(), v]));
  return (value: string) => byKey.get(value.trim().toLowerCase());
};

export const cleanList = (items: string[]) =>
  items
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, MAX_LIST_ITEMS);

export const verdictForAverage = (average: number): Verdict =>
  average >= 3.5 ? 'strong-hire' : average >= 3 ? 'hire' : average >= 2.6 ? 'lean-hire' : average >= 2 ? 'lean-no-hire' : 'no-hire';

export function parseScorecard<T>(json: string, shape: z.ZodType<T>): T {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    throw new InvalidScorecardError('Scorecard is not valid JSON');
  }
  const parsed = shape.safeParse(data);
  if (!parsed.success) throw new InvalidScorecardError(`Scorecard has the wrong shape: ${parsed.error.issues[0]?.message}`);
  return parsed.data;
}

/** The verdict, summary and one dimension per rubric entry in rubric order, or InvalidScorecardError. */
export function scorecardCore(
  track: InterviewTrack,
  card: { verdict: string; summary: string; dimensions: z.infer<typeof rawDimensions> },
) {
  const verdict = lookup(VERDICTS)(card.verdict);
  if (!verdict) throw new InvalidScorecardError(`Unknown verdict "${card.verdict}"`);
  if (!card.summary.trim()) throw new InvalidScorecardError('Scorecard summary is empty');

  const rubricNames = RUBRICS[track].map((r) => r.name);
  const rubricName = lookup(rubricNames);
  const byName = new Map<string, ScoreDimension>();
  for (const d of card.dimensions) {
    const name = rubricName(d.name);
    if (!name || byName.has(name)) continue;
    byName.set(name, { name, score: Math.min(4, Math.max(1, Math.round(d.score))), evidence: d.evidence.trim() });
  }
  const missing = rubricNames.filter((n) => !byName.has(n));
  if (missing.length) throw new InvalidScorecardError(`Scorecard is missing dimensions: ${missing.join(', ')}`);
  return { verdict, summary: card.summary.trim(), dimensions: rubricNames.map((n) => byName.get(n)!) };
}

/**
 * Validates model output against the rubric. Enum casing is not guaranteed by structured outputs,
 * so matching is case-insensitive; anything that cannot be repaired throws InvalidScorecardError.
 */
export function normalizeScorecard(track: InterviewTrack, json: string): Omit<Scorecard, 'mode'> {
  const card = parseScorecard(json, rawScorecard);
  const patternId = lookup(PATTERNS.map((p) => p.id));
  return {
    ...scorecardCore(track, card),
    strengths: cleanList(card.strengths),
    improvements: cleanList(card.improvements),
    weakPatterns: [...new Set(card.weakPatterns.map(patternId).filter((p): p is string => !!p))],
  };
}
