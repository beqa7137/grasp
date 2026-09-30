import { ANSWER_FLAWS, COMPETENCY_CATALOG, type AnswerFlaw } from '@grasp/engine';
import { Logger } from '@nestjs/common';
import { z } from 'zod';
import type { BehavioralFlaw, InterviewSession, Scorecard } from './interview.types.js';
import {
  cleanList,
  lookup,
  parseScorecard,
  rawDimensions,
  scorecardCore,
  scorecardProperties,
  VERDICTS,
  verdictForAverage,
} from './scorecard.schema.js';

const QUOTE_LIMIT = 240;
const FIX_LIMIT = 400;
const log = new Logger('BehavioralScorecard');

/** The behavioral scorecard schema: flaws and weak competencies in place of weak patterns. Supported keywords only. */
export function behavioralScorecardJsonSchema() {
  const properties = {
    ...scorecardProperties('behavioral'),
    flaws: {
      type: 'array',
      description: 'Every flaw the answer or its follow-ups show, at most once each.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'quote', 'fix'],
        properties: {
          id: { type: 'string', enum: ANSWER_FLAWS.map((f) => f.id) },
          quote: { type: 'string', description: "The candidate's exact words that show the flaw, from one candidate turn." },
          fix: { type: 'string', description: "How that line could be said instead, in the candidate's voice, inventing no facts." },
        },
      },
    },
    weakCompetencies: { type: 'array', items: { type: 'string', enum: COMPETENCY_CATALOG.map((c) => c.id) } },
  };
  return { type: 'object', additionalProperties: false, required: Object.keys(properties), properties };
}

const rawBehavioralScorecard = z.object({
  verdict: z.string(),
  summary: z.string(),
  dimensions: rawDimensions,
  flaws: z.array(z.object({ id: z.string(), quote: z.string().nullable(), fix: z.string() })),
  strengths: z.array(z.string()),
  improvements: z.array(z.string()),
  weakCompetencies: z.array(z.string()),
});

const truncate = (text: string, limit: number) => [...text].slice(0, limit).join('');

/** Case, runs of whitespace and curly quotes are not the model's to get right when it quotes the candidate. */
const fold = (text: string) => text.replace(/[‘’‛]/g, "'").replace(/[“”‟]/g, '"').replace(/\s+/g, ' ').trim().toLowerCase();

function verifiedQuote(quote: string | null, turns: readonly string[]): string | null {
  const text = truncate((quote ?? '').trim().replace(/^["'‘’“”]+|["'‘’“”]+$/g, ''), QUOTE_LIMIT).trim();
  const folded = fold(text);
  return folded && turns.some((turn) => turn.includes(folded)) ? text : null;
}

/** The verdict the model gave, moved to within one level of the one the dimension average implies. */
function clampVerdict(verdict: Scorecard['verdict'], dimensions: Scorecard['dimensions']): Scorecard['verdict'] {
  const derived = VERDICTS.indexOf(verdictForAverage(dimensions.reduce((sum, d) => sum + d.score, 0) / dimensions.length));
  const given = VERDICTS.indexOf(verdict);
  return VERDICTS[Math.min(derived + 1, Math.max(derived - 1, given))];
}

/**
 * Repairs a behavioral scorecard as normalizeScorecard does, and also keeps its claims about the candidate honest:
 * a quote that is not in their own words is dropped (the flaw stays), and the verdict cannot stray from the scores.
 */
export function normalizeBehavioralScorecard(session: InterviewSession, json: string): Omit<Scorecard, 'mode'> {
  const card = parseScorecard(json, rawBehavioralScorecard);
  const core = scorecardCore('behavioral', card);
  const turns = session.messages.filter((m) => m.role === 'candidate').map((m) => fold(m.content));
  const flawId = lookup(ANSWER_FLAWS.map((f) => f.id));
  const flaws = new Map<AnswerFlaw, BehavioralFlaw>();
  for (const raw of card.flaws) {
    const id = flawId(raw.id);
    if (!id || flaws.has(id)) continue;
    const quote = verifiedQuote(raw.quote, turns);
    if (quote === null) log.warn({ operation: 'interview.unquoted-flaw', flaw: id });
    flaws.set(id, { id, quote, fix: truncate(raw.fix.trim(), FIX_LIMIT) });
  }
  const competencyId = lookup(COMPETENCY_CATALOG.map((c) => c.id));
  return {
    ...core,
    verdict: clampVerdict(core.verdict, core.dimensions),
    strengths: cleanList(card.strengths),
    improvements: cleanList(card.improvements),
    weakPatterns: [],
    flaws: [...flaws.values()],
    weakCompetencies: [...new Set(card.weakCompetencies.map(competencyId).filter((id): id is string => !!id))],
  };
}
