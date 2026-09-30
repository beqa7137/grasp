import Anthropic from '@anthropic-ai/sdk';
import { ServiceUnavailableException } from '@nestjs/common';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fetchGatewayCatalog } from '../../src/interview/gateway-catalog.js';
import { GatewayClient } from '../../src/interview/gateway-client.js';
import { GatewayInterviewer } from '../../src/interview/gateway.interviewer.js';
import { SPEND_LIMIT_REACHED, SpendGuard } from '../../src/interview/spend-guard.js';
import { MemorySpendStore } from '../../src/persistence/memory-spend.store.js';
import { MemoryCoordinationStore } from '../../src/persistence/memory.stores.js';
import { markdownReport, summarize, type ComparisonRun, type ModelRun } from './model-report.js';
import { runScenario, scenarioChecks, separationChecks } from './run-scenario.js';
import { SCENARIOS } from './scenarios.js';

/**
 * Runs the live eval's scenarios against each model through the Vercel AI Gateway. Costs money.
 * Run with: AI_GATEWAY_API_KEY=... npm run eval:models (optional MODELS, BUDGET_USD, OUT)
 */

const DEFAULT_MODELS = [
  'anthropic/claude-sonnet-5.5',
  'google/gemini-3-flash',
  'openai/gpt-oss-120b',
  'deepseek/deepseek-v4-flash',
  'anthropic/claude-haiku-4.5',
  'alibaba/qwen3.7-plus',
];

function settings() {
  const apiKey = process.env['AI_GATEWAY_API_KEY'];
  if (!apiKey) throw new Error('Set AI_GATEWAY_API_KEY to compare interviewer models through the Vercel AI Gateway.');
  const models = (process.env['MODELS'] || DEFAULT_MODELS.join(','))
    .split(',')
    .map((m) => m.trim())
    .filter(Boolean);
  const budgetUsd = Number(process.env['BUDGET_USD'] || 3);
  if (!Number.isFinite(budgetUsd) || budgetUsd <= 0) throw new Error('BUDGET_USD must be a positive number of dollars.');
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const out = resolve(process.env['OUT'] || join(import.meta.dirname, '..', '..', 'eval-results', `models-${stamp}`));
  return { apiKey, models, budgetUsd, out };
}

/** Keeps the provider's own error text, which the interviewer turns into a learner-safe message. */
class RecordingClient extends GatewayClient {
  lastError: unknown;

  override async complete(...args: Parameters<GatewayClient['complete']>) {
    try {
      return await super.complete(...args);
    } catch (err) {
      this.lastError = err;
      throw err;
    }
  }

  override async stream(...args: Parameters<GatewayClient['stream']>) {
    try {
      return await super.stream(...args);
    } catch (err) {
      this.lastError = err;
      throw err;
    }
  }
}

const describeError = (err: unknown) => (err instanceof Error ? `${err.constructor.name}: ${err.message}` : String(err));

async function compare(): Promise<ComparisonRun> {
  const { apiKey, models, budgetUsd, out } = settings();
  const started = Date.now();
  const catalog = await fetchGatewayCatalog();
  const client = new RecordingClient(apiKey);
  // One fixed day, so the ledger cannot roll over at UTC midnight and grant the budget again.
  const spend = new SpendGuard(budgetUsd, new MemorySpendStore(new MemoryCoordinationStore(), () => started));
  const run: ComparisonRun = {
    startedAt: new Date(started).toISOString(),
    finishedAt: '',
    budgetUsd,
    spentUsd: 0,
    stoppedForBudget: false,
    models: [],
  };

  for (const id of models) {
    const model = catalog.get(id);
    if (!model) {
      run.models.push({ model: id, scenarios: [], separation: [], error: 'Not in the gateway model catalog' });
      continue;
    }
    let billed: (number | null)[] = [];
    const interviewer = new GatewayInterviewer(client, model, spend, { maxRetries: 3, onCall: (call) => billed.push(call.billedCostUsd) });
    const modelRun: ModelRun = {
      model: id,
      scoreFormat: interviewer.scoreFormat,
      effort: { reply: interviewer.replyEffort, score: interviewer.scoreEffort },
      scenarios: [],
      separation: [],
    };
    run.models.push(modelRun);
    for (const scenario of SCENARIOS) {
      billed = [];
      client.lastError = undefined;
      const billedCostUsd = () => (billed.length && billed.every((b) => b !== null) ? billed.reduce((s, b) => s + b!, 0) : null);
      try {
        const result = await runScenario(scenario, interviewer, id);
        modelRun.scenarios.push({
          scenario: scenario.name,
          result,
          checks: scenarioChecks(scenario, result),
          billedCostUsd: billedCostUsd(),
        });
      } catch (err) {
        if (client.lastError instanceof Anthropic.AuthenticationError)
          throw new Error('The gateway rejected AI_GATEWAY_API_KEY.', { cause: err });
        run.stoppedForBudget = err instanceof ServiceUnavailableException && err.message === SPEND_LIMIT_REACHED;
        modelRun.scenarios.push({
          scenario: scenario.name,
          checks: run.stoppedForBudget ? [] : [{ name: 'completed', pass: false }],
          billedCostUsd: billedCostUsd(),
          error: run.stoppedForBudget ? 'Stopped before its next call could pass the budget' : describeError(client.lastError ?? err),
        });
      }
      const last = modelRun.scenarios.at(-1)!;
      process.stdout.write(
        `${id} / ${scenario.name}: ${last.error ?? `${last.checks.filter((c) => c.pass).length}/${last.checks.length} checks`}\n`,
      );
      if (run.stoppedForBudget) break;
    }
    modelRun.separation = separationChecks(modelRun.scenarios.flatMap((s) => (s.result ? [s.result] : [])));
    if (run.stoppedForBudget) break;
  }

  run.spentUsd = await spend.spentToday();
  run.finishedAt = new Date().toISOString();
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, 'models.json'), JSON.stringify(run, null, 2));
  writeFileSync(join(out, 'models.md'), markdownReport(run));
  process.stdout.write(`\nReport: ${join(out, 'models.md')}\nTranscripts and scorecards: ${join(out, 'models.json')}\n`);
  return run;
}

describe('Interviewer model comparison', () => {
  it('runs every live-eval scenario against each gateway model', async () => {
    const run = await compare();
    for (const s of run.models.map(summarize)) {
      process.stdout.write(`${s.model}: ${s.passed}/${s.checks} checks, ${s.errors} errors\n`);
    }
  });
});
