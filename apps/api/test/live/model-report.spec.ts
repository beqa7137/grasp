import { markdownReport, median, summarize, type ComparisonRun, type ModelRun } from './model-report.js';
import type { ScenarioResult } from './run-scenario.js';

function result(scenario: string, costUsd: number | null, replyMs: number[], overrides: Partial<ScenarioResult> = {}): ScenarioResult {
  return {
    scenario,
    track: 'coding',
    quality: 'strong',
    model: 'm',
    scorecard: { verdict: 'hire', summary: 's', dimensions: [], strengths: [], improvements: [], weakPatterns: [], mode: 'ai' },
    average: 3.2,
    usage: { calls: 3, inputTokens: 1000, outputTokens: 200, cacheReadTokens: 500, cacheWriteTokens: 0, costUsd },
    replies: replyMs.map((ms) => ({ words: 40, firstTokenMs: ms / 2, totalMs: ms, cacheReadTokens: 100 })),
    scoreMs: 4000,
    transcript: [],
    warnings: [],
    ...overrides,
  };
}

const sonnet: ModelRun = {
  model: 'anthropic/claude-sonnet-5.5',
  scoreFormat: 'json_schema',
  effort: { reply: 'low', score: 'medium' },
  scenarios: [
    {
      scenario: 'coding / strong',
      result: result('coding / strong', 0.02, [1000, 3000]),
      checks: [
        { name: 'AI scorecard', pass: true },
        { name: 'strong verdict', pass: true },
      ],
      billedCostUsd: 0.021,
    },
    {
      scenario: 'coding / weak',
      result: result('coding / weak', 0.04, [2000], { warnings: ['Reply 1 is 180 words'] }),
      checks: [
        { name: 'AI scorecard', pass: true },
        { name: 'weak verdict', pass: false },
      ],
      billedCostUsd: null,
    },
  ],
  separation: [{ name: 'separates strong from weak (coding)', pass: false }],
};

const qwen: ModelRun = {
  model: 'alibaba/qwen3.7-plus',
  scoreFormat: 'text',
  effort: { reply: 'low', score: 'medium' },
  scenarios: [
    {
      scenario: 'coding / strong',
      checks: [{ name: 'completed', pass: false }],
      billedCostUsd: null,
      error: 'BadRequestError: 400 bad | input',
    },
  ],
  separation: [],
};

const run: ComparisonRun = {
  startedAt: '2026-09-30T10:00:00.000Z',
  finishedAt: '2026-09-30T10:20:00.000Z',
  budgetUsd: 3,
  spentUsd: 0.25,
  stoppedForBudget: false,
  models: [sonnet, qwen, { model: 'acme/missing', scenarios: [], separation: [], error: 'Not in the gateway model catalog' }],
};

describe('median', () => {
  it('takes the middle value, or the mean of the middle two', () => {
    expect(median([])).toBeNull();
    expect(median([5, 1, 3])).toBe(3);
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });
});

describe('summarize', () => {
  it('counts every check, averages known costs and takes latency medians over replies', () => {
    expect(summarize(sonnet)).toEqual({
      model: 'anthropic/claude-sonnet-5.5',
      passed: 3,
      checks: 5,
      meanCostUsd: expect.closeTo(0.03, 12),
      meanBilledUsd: 0.021,
      p50FirstTokenMs: 1000,
      p50ReplyMs: 2000,
      errors: 0,
    });
  });

  it('counts a failed scenario as an error and a failed check', () => {
    expect(summarize(qwen)).toMatchObject({ passed: 0, checks: 1, meanCostUsd: null, p50ReplyMs: null, errors: 1 });
  });
});

describe('markdownReport', () => {
  const report = markdownReport(run);

  it('opens with the spend and a summary row per model', () => {
    expect(report).toContain('Spent $0.2500 of a $3.0000 budget.');
    expect(report).toContain(
      '| anthropic/claude-sonnet-5.5 | json_schema | low / medium | 60% (3/5) | $0.0300 | $0.0210 | 1000 ms | 2000 ms | 0 |',
    );
    expect(report).toContain('| alibaba/qwen3.7-plus | text | low / medium | 0% (0/1) | n/a | n/a | n/a | n/a | 1 |');
    expect(report).toContain('| acme/missing | Error: Not in the gateway model catalog | - | n/a |');
    expect(report).toContain('- anthropic/claude-sonnet-5.5: 0/1 (failed: separates strong from weak (coding))');
    expect(report).not.toContain('Stopped early');
  });

  it('has a table per scenario naming failed checks, warnings and escaped errors', () => {
    expect(report).toContain('## coding / strong');
    expect(report).toContain('## coding / weak');
    expect(report).toContain(
      '| anthropic/claude-sonnet-5.5 | hire (ai) | 3.2 | 1/2 (failed: weak verdict) | 1000 / 500 / 200 | $0.0400 | n/a | 1000 ms | 4000 ms | Reply 1 is 180 words |',
    );
    expect(report).toContain(
      '| alibaba/qwen3.7-plus | - | - | 0/1 (failed: completed) | - | - | - | - | - | Error: BadRequestError: 400 bad \\| input |',
    );
  });

  it('says when the budget stopped the run', () => {
    expect(markdownReport({ ...run, stoppedForBudget: true })).toContain('Stopped early');
  });
});
