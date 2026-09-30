import { ANSWER_FLAWS, COMPETENCY_CATALOG, countWords, type AnswerFlaw } from '@grasp/engine';
import { Logger } from '@nestjs/common';
import { z } from 'zod';
import type { BehavioralFlaw, InterviewSession, Scorecard } from './interview.types.js';
import { replaceInventedNumbers } from './invented-numbers.js';
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
const MIN_QUOTE_WORDS = 2;
const MIN_QUOTE_CHARACTERS = 8;
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

const WORD_CHARACTER = /[\p{L}\p{N}]/u;
const isWordCharacter = (char: string | undefined) => char !== undefined && WORD_CHARACTER.test(char);

/** Whole words only: a quote may not start or end inside one of the candidate's words. */
function containsWords(text: string, quote: string): boolean {
  for (let at = text.indexOf(quote); at >= 0; at = text.indexOf(quote, at + 1)) {
    const cutsStart = isWordCharacter(text[at - 1]) && isWordCharacter(quote[0]);
    const cutsEnd = isWordCharacter(text[at + quote.length]) && isWordCharacter(quote.at(-1));
    if (!cutsStart && !cutsEnd) return true;
  }
  return false;
}

function truncateWords(text: string, limit: number): string {
  const chars = [...text];
  if (chars.length <= limit) return text;
  const cut = chars.slice(0, limit).join('');
  return (isWordCharacter(chars[limit]) ? cut.replace(/[\p{L}\p{N}]+$/u, '') : cut).trimEnd();
}

/** A quote counts when it is at least a short phrase of whole words from one STAR part or one follow-up answer. */
function verifiedQuote(quote: string | null, answers: readonly string[]): string | null {
  const text = (quote ?? '').trim().replace(/^["'‘’“”]+|["'‘’“”]+$/g, '');
  const folded = fold(text);
  if (countWords(folded) < MIN_QUOTE_WORDS || folded.length < MIN_QUOTE_CHARACTERS) return null;
  return answers.some((answer) => containsWords(answer, folded)) ? truncateWords(text, QUOTE_LIMIT) : null;
}

/** The verdict the model gave, moved to within one level of the one the dimension average implies. */
function clampVerdict(verdict: Scorecard['verdict'], dimensions: Scorecard['dimensions']): Scorecard['verdict'] {
  const derived = VERDICTS.indexOf(verdictForAverage(dimensions.reduce((sum, d) => sum + d.score, 0) / dimensions.length));
  const given = VERDICTS.indexOf(verdict);
  return VERDICTS[Math.min(derived + 1, Math.max(derived - 1, given))];
}

/**
 * Repairs a behavioral scorecard as normalizeScorecard does, and also keeps its claims about the candidate honest:
 * a quote that is not in their own words is dropped (the flaw stays), a number they never said in a fix, improvement
 * or the summary becomes [number] (counted in `inventedNumbers`), and the verdict cannot stray from the scores.
 */
export function normalizeBehavioralScorecard(
  session: InterviewSession,
  json: string,
): { scorecard: Omit<Scorecard, 'mode'>; inventedNumbers: number } {
  const card = parseScorecard(json, rawBehavioralScorecard);
  const core = scorecardCore('behavioral', card);
  // The raw STAR parts, not the labelled turn text, so a quote cannot be one of the server's own labels or span two parts.
  const answers = session.messages
    .filter((m) => m.role === 'candidate')
    .flatMap((m) => (m.star ? Object.values(m.star) : [m.content]))
    .map(fold);
  let inventedNumbers = 0;
  const ownNumbers = (text: string) => {
    const checked = replaceInventedNumbers(text, answers);
    inventedNumbers += checked.invented;
    return checked.text;
  };
  const flawId = lookup(ANSWER_FLAWS.map((f) => f.id));
  const flaws = new Map<AnswerFlaw, BehavioralFlaw>();
  for (const raw of card.flaws) {
    const id = flawId(raw.id);
    if (!id || flaws.has(id)) continue;
    const quote = verifiedQuote(raw.quote, answers);
    if (quote === null) log.warn({ operation: 'interview.unquoted-flaw', flaw: id });
    flaws.set(id, { id, quote, fix: truncate(ownNumbers(raw.fix.trim()), FIX_LIMIT) });
  }
  const competencyId = lookup(COMPETENCY_CATALOG.map((c) => c.id));
  const scorecard = {
    ...core,
    summary: ownNumbers(core.summary),
    verdict: clampVerdict(core.verdict, core.dimensions),
    strengths: cleanList(card.strengths),
    improvements: cleanList(card.improvements).map(ownNumbers),
    weakPatterns: [],
    flaws: [...flaws.values()],
    weakCompetencies: [...new Set(card.weakCompetencies.map(competencyId).filter((id): id is string => !!id))],
  };
  if (inventedNumbers) log.warn({ operation: 'interview.invented-numbers', count: inventedNumbers });
  return { scorecard, inventedNumbers };
}
