import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { GatewayClient } from '../../src/interview/gateway-client.js';
import { loadGatewayModel } from '../../src/interview/gateway-model.js';
import { GatewayInterviewer } from '../../src/interview/gateway.interviewer.js';
import { SpendGuard } from '../../src/interview/spend-guard.js';
import { MemorySpendStore } from '../../src/persistence/memory-spend.store.js';
import { MemoryCoordinationStore } from '../../src/persistence/memory.stores.js';
import { runScenario, scenarioChecks, separationChecks, type ScenarioResult } from './run-scenario.js';
import { SCENARIOS } from './scenarios.js';

/**
 * Live evaluation of the production interviewer (GPT-6 Luna through the Vercel AI Gateway). Costs a few cents per run.
 * Run with: AI_GATEWAY_API_KEY=... npm run eval:interviewer (optional INTERVIEW_AI_MODEL)
 */

const apiKey = process.env['AI_GATEWAY_API_KEY'];
const model = process.env['INTERVIEW_AI_MODEL'] || 'openai/gpt-6-luna';
const results: ScenarioResult[] = [];

function report() {
  const dir = join(import.meta.dirname, '..', '..', 'eval-results');
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `interviewer-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  writeFileSync(file, JSON.stringify(results, null, 2));
  const rows = results.map((r) => {
    const u = r.usage;
    const ttft = Math.round(r.replies.reduce((s, x) => s + x.firstTokenMs, 0) / r.replies.length);
    return `| ${r.scenario} | ${r.scorecard.verdict} (${r.scorecard.mode}) | ${r.average.toFixed(1)} | ${u.inputTokens} / ${u.cacheReadTokens} / ${u.cacheWriteTokens} / ${u.outputTokens} | $${u.costUsd?.toFixed(4) ?? 'n/a'} | ${ttft} ms | ${r.warnings.join('; ') || '-'} |`;
  });
  const table = [
    `Interviewer eval (${model})`,
    '| Scenario | Verdict | Avg | Tokens in / cache read / cache write / out | Cost | Avg first token | Warnings |',
    '| --- | --- | --- | --- | --- | --- | --- |',
    ...rows,
  ];
  process.stdout.write(['', ...table, `Transcripts and scorecards: ${file}`, ''].join('\n'));
  if (process.env['GITHUB_STEP_SUMMARY']) appendFileSync(process.env['GITHUB_STEP_SUMMARY'], `### ${table.join('\n')}\n`);
  if (process.env['GITHUB_ACTIONS']) {
    for (const [i, r] of results.entries()) process.stdout.write(`::notice title=${r.scenario}::${rows[i].replaceAll('|', ' ').trim()}\n`);
  }
}

describe.runIf(apiKey)(`AI interviewer live eval (${model})`, () => {
  let interviewer: GatewayInterviewer;

  beforeAll(async () => {
    const loaded = await loadGatewayModel(model);
    if (!loaded.model) throw new Error(loaded.reason);
    const spend = new SpendGuard(null, new MemorySpendStore(new MemoryCoordinationStore()));
    interviewer = new GatewayInterviewer(new GatewayClient(() => apiKey!), loaded.model, spend, { maxRetries: 3 });
  });

  afterAll(() => {
    if (results.length) report();
  });

  it.each(SCENARIOS)('$name', async (scenario) => {
    const result = await runScenario(scenario, interviewer, model);
    results.push(result);
    expect(scenarioChecks(scenario, result).filter((c) => c.pass === false)).toEqual([]);
  });

  it('separates strong from weak candidates on each track', () => {
    expect(separationChecks(results).filter((c) => !c.pass)).toEqual([]);
  });
});

describe.skipIf(apiKey)('AI interviewer live eval', () => {
  it('needs AI_GATEWAY_API_KEY', () => {
    throw new Error('Set AI_GATEWAY_API_KEY (and optionally INTERVIEW_AI_MODEL) to run the live interviewer eval.');
  });
});
