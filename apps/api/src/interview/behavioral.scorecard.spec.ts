import { ANSWER_FLAWS, COMPETENCY_CATALOG } from '@grasp/engine';
import { Logger } from '@nestjs/common';
import { behavioralSession, STRONG_STAR } from '../../test/support/behavioral-session.js';
import { behavioralScorecardJsonSchema, normalizeBehavioralScorecard } from './behavioral.scorecard.js';
import { RUBRICS } from './prompts.js';
import { InvalidScorecardError } from './scorecard.schema.js';

const names = RUBRICS.behavioral.map((r) => r.name);
const FOLLOW_UP = 'I messaged the payments lead directly and we agreed I would own the client change until launch.';
const session = behavioralSession(STRONG_STAR, [FOLLOW_UP], ['Who did you tell first?']);

const card = (overrides: Record<string, unknown> = {}, scores = [3, 3, 3, 3, 3]) =>
  JSON.stringify({
    verdict: 'hire',
    summary: ' Clear ownership. ',
    dimensions: names.map((name, i) => ({ name, score: scores[i], evidence: 'seen' })),
    flaws: [],
    strengths: ['Named the fix'],
    improvements: ['Say what you set aside'],
    weakCompetencies: [],
    ...overrides,
  });

beforeAll(() => {
  Logger.overrideLogger(false);
});
afterEach(() => vi.restoreAllMocks());

describe('behavioralScorecardJsonSchema', () => {
  it('constrains dimensions, flaws and competencies to enums and asks for no weak patterns', () => {
    const schema = behavioralScorecardJsonSchema();
    expect(schema.required).toEqual(['verdict', 'summary', 'dimensions', 'strengths', 'improvements', 'flaws', 'weakCompetencies']);
    expect(schema.properties.dimensions.items.properties.name.enum).toEqual(names);
    expect(schema.properties.flaws.items.properties.id.enum).toEqual(ANSWER_FLAWS.map((f) => f.id));
    expect(schema.properties.weakCompetencies.items.enum).toEqual(COMPETENCY_CATALOG.map((c) => c.id));
    expect(schema.properties).not.toHaveProperty('weakPatterns');
  });
});

describe('normalizeBehavioralScorecard', () => {
  it('keeps a quote in the candidate words despite case, spacing and curly quotes, and returns it as the model wrote it', () => {
    const quote = '“I CAPPED  the retries and added a circuit breaker”';
    const result = normalizeBehavioralScorecard(session, card({ flaws: [{ id: 'vague', quote, fix: ' Say [number] retries. ' }] }));
    expect(result.flaws).toEqual([
      { id: 'vague', quote: 'I CAPPED  the retries and added a circuit breaker', fix: 'Say [number] retries.' },
    ]);
    expect(result.weakPatterns).toEqual([]);
    expect(result.summary).toBe('Clear ownership.');
  });

  it('keeps a quote from a follow-up answer, but not one from the interviewer or one the candidate never said', () => {
    const logged = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    const result = normalizeBehavioralScorecard(
      session,
      card({
        flaws: [
          { id: 'we-not-i', quote: 'we agreed I would own the client change', fix: 'I agreed with [name] that I would own it.' },
          { id: 'blame', quote: 'Who did you tell first?', fix: 'x' },
          { id: 'no-result', quote: 'The payments team broke it and never fixed it.', fix: 'y' },
        ],
      }),
    );
    expect(result.flaws!.map((f) => [f.id, f.quote])).toEqual([
      ['we-not-i', 'we agreed I would own the client change'],
      ['blame', null],
      ['no-result', null],
    ]);
    expect(logged.mock.calls).toEqual([
      [{ operation: 'interview.unquoted-flaw', flaw: 'blame' }],
      [{ operation: 'interview.unquoted-flaw', flaw: 'no-result' }],
    ]);
  });

  it.each([
    ['a single letter', 'a'],
    ['a fragment of a word', 'am'],
    ['one common word', 'we'],
    ['two words under eight characters', 'I wrote'],
    ['the server label of the STAR answer', '[STAR ANSWER]'],
    ['a part label', 'Result: Timeouts fell from 2%'],
    ['a span across two parts', 'before the next sale, two weeks out. Action: I traced the slow calls'],
    ['words cut inside other words', 'ed the slow cal'],
  ])('does not verify %s as a quote', (_label, quote) => {
    const result = normalizeBehavioralScorecard(session, card({ flaws: [{ id: 'vague', quote, fix: 'x' }] }));
    expect(result.flaws![0].quote).toBeNull();
  });

  it('verifies a quote of whole words from one STAR part or one follow-up answer', () => {
    for (const quote of ['Timeouts fell from 2% to 0.1%', 'the payments lead directly']) {
      const result = normalizeBehavioralScorecard(session, card({ flaws: [{ id: 'vague', quote, fix: 'x' }] }));
      expect(result.flaws![0].quote).toBe(quote);
    }
  });

  it('dedupes flaws by id, drops unknown ones, and bounds quotes and fixes', () => {
    const long = `${STRONG_STAR.action} ${STRONG_STAR.action}`;
    const s = behavioralSession({ ...STRONG_STAR, action: long });
    const result = normalizeBehavioralScorecard(
      s,
      card({
        flaws: [
          { id: 'VAGUE', quote: long, fix: 'f'.repeat(500) },
          { id: 'vague', quote: 'I traced', fix: 'second' },
          { id: 'rambling', quote: 'I traced', fix: 'unknown' },
          { id: 'no-reflection', quote: null, fix: 'Add what you learned.' },
        ],
      }),
    );
    expect(result.flaws!.map((f) => f.id)).toEqual(['vague', 'no-reflection']);
    const quote = result.flaws![0].quote!;
    expect(long.startsWith(quote)).toBe(true);
    expect(quote.length).toBeLessThanOrEqual(240);
    expect(quote.length).toBeGreaterThan(220);
    expect(long.slice(quote.length)).toMatch(/^\W/);
    expect(result.flaws![0].fix).toHaveLength(400);
    expect(result.flaws![1].quote).toBeNull();
  });

  it('keeps catalog competencies only, once each', () => {
    const result = normalizeBehavioralScorecard(session, card({ weakCompetencies: ['Ownership', 'ownership', 'grit', 'conflict'] }));
    expect(result.weakCompetencies).toEqual(['ownership', 'conflict']);
  });

  it.each([
    ['strong-hire', [1, 1, 1, 1, 1], 'lean-no-hire'],
    ['no-hire', [4, 4, 4, 4, 4], 'hire'],
    ['strong-hire', [3, 3, 3, 3, 3], 'strong-hire'],
    ['lean-no-hire', [3, 3, 3, 3, 3], 'lean-hire'],
    ['lean-hire', [3, 3, 3, 3, 3], 'lean-hire'],
  ])('moves a %s verdict to within one level of the scores %j', (verdict, scores, expected) => {
    expect(normalizeBehavioralScorecard(session, card({ verdict }, scores)).verdict).toBe(expected);
  });

  it.each([
    ['a missing dimension', card({ dimensions: [] })],
    ['a missing flaws list', JSON.stringify({ ...JSON.parse(card()), flaws: undefined })],
    ['an unknown verdict', card({ verdict: 'maybe' })],
  ])('rejects %s', (_label, json) => {
    expect(() => normalizeBehavioralScorecard(session, json)).toThrow(InvalidScorecardError);
  });
});
