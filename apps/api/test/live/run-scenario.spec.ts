import { reportsCacheReads, scenarioChecks, type ScenarioResult } from './run-scenario.js';
import { SCENARIOS } from './scenarios.js';

const scenario = (name: string) => SCENARIOS.find((s) => s.name === name)!;

function result(cacheReads: number[], inventedNumbers?: number): ScenarioResult {
  return {
    scenario: 's',
    track: 'behavioral',
    quality: 'weak',
    model: 'm',
    scorecard: {
      verdict: 'no-hire',
      summary: 's',
      dimensions: [],
      strengths: [],
      improvements: [],
      weakPatterns: [],
      mode: 'ai',
      flaws: [{ id: 'we-not-i', quote: null, fix: 'f' }],
    },
    average: 1.5,
    usage: {
      calls: 4,
      inputTokens: 1000,
      outputTokens: 200,
      cacheReadTokens: cacheReads.reduce((s, n) => s + n, 0),
      cacheWriteTokens: 0,
      costUsd: 0.01,
    },
    replies: cacheReads.map((cacheReadTokens) => ({ words: 30, firstTokenMs: 500, totalMs: 1000, cacheReadTokens })),
    scoreMs: 3000,
    ...(inventedNumbers === undefined ? {} : { inventedNumbers }),
    transcript: [],
    warnings: [],
  };
}

const check = (checks: { name: string; pass: boolean | null }[], name: string) => checks.find((c) => c.name === name)?.pass;

describe('scenarioChecks', () => {
  it('fails a behavioral scorecard whose feedback invented numbers, and passes one that invented none', () => {
    const weHeavy = scenario('behavioral / we-heavy');
    expect(check(scenarioChecks(weHeavy, result([0, 900, 1000], 2)), 'fixes invent no numbers')).toBe(false);
    expect(check(scenarioChecks(weHeavy, result([0, 900, 1000], 0)), 'fixes invent no numbers')).toBe(true);
  });

  it('checks invented numbers on the behavioral track only', () => {
    expect(
      check(scenarioChecks(scenario('coding / strong'), { ...result([0, 900, 1000]), track: 'coding' }), 'fixes invent no numbers'),
    ).toBeUndefined();
  });

  it('judges cache reads only when the model reports them, and otherwise marks the check not reported', () => {
    const weHeavy = scenario('behavioral / we-heavy');
    expect(check(scenarioChecks(weHeavy, result([0, 0, 0], 0)), 'cache reads from reply 3')).toBe(false);
    expect(check(scenarioChecks(weHeavy, result([0, 0, 1000], 0)), 'cache reads from reply 3')).toBe(true);
    expect(check(scenarioChecks(weHeavy, result([0, 0, 0], 0), false), 'cache reads from reply 3')).toBeNull();
  });
});

describe('reportsCacheReads', () => {
  it('holds once any call of the model reported a cache read', () => {
    expect(reportsCacheReads([result([0, 0, 0]), result([0, 0, 0])])).toBe(false);
    expect(reportsCacheReads([result([0, 0, 0]), result([0, 64, 0])])).toBe(true);
    expect(reportsCacheReads([])).toBe(false);
  });
});
