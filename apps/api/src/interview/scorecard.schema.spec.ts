import { InvalidScorecardError, normalizeScorecard } from './scorecard.schema.js';
import { RUBRICS } from './prompts.js';

const names = RUBRICS.coding.map((r) => r.name);
const card = (overrides: Record<string, unknown> = {}) =>
  JSON.stringify({
    verdict: 'lean-hire',
    summary: '  Solid start.  ',
    dimensions: names.map((name) => ({ name, score: 3, evidence: 'ok' })),
    strengths: ['a'],
    improvements: ['b'],
    weakPatterns: [],
    ...overrides,
  });

describe('normalizeScorecard', () => {
  it('repairs enum casing, duplicates, order and out-of-range scores', () => {
    const shuffled = [...names]
      .reverse()
      .map((name, i) => ({ name: i === 0 ? name.toUpperCase() : name, score: i === 1 ? 7 : 0.4, evidence: ' e ' }));
    const result = normalizeScorecard(
      'coding',
      card({
        verdict: 'Lean-Hire',
        dimensions: [...shuffled, { name: names[0], score: 1, evidence: 'duplicate' }],
        weakPatterns: ['Monotonic-Stack', 'monotonic-stack', 'not-a-pattern'],
        strengths: ['  one ', '', 'two', 'three', 'four', 'five', 'six', 'seven'],
      }),
    );
    expect(result.verdict).toBe('lean-hire');
    expect(result.summary).toBe('Solid start.');
    expect(result.dimensions.map((d) => d.name)).toEqual(names);
    expect(result.dimensions.map((d) => d.score)).toEqual([1, 1, 1, 4, 1]);
    expect(result.dimensions[0].evidence).toBe('e');
    expect(result.weakPatterns).toEqual(['monotonic-stack']);
    expect(result.strengths).toEqual(['one', 'two', 'three', 'four', 'five', 'six']);
  });

  it.each([
    ['non-JSON output', 'Sorry, here is the scorecard:'],
    ['a wrong shape', JSON.stringify({ verdict: 'hire' })],
    ['an unknown verdict', card({ verdict: 'maybe' })],
    ['an empty summary', card({ summary: ' ' })],
    ['a missing dimension', card({ dimensions: names.slice(1).map((name) => ({ name, score: 3, evidence: '' })) })],
  ])('rejects %s', (_label, json) => {
    expect(() => normalizeScorecard('coding', json)).toThrow(InvalidScorecardError);
  });
});
