import type { Check, ScenarioResult } from './run-scenario.js';

export interface ScenarioRun {
  scenario: string;
  result?: ScenarioResult;
  checks: Check[];
  /** What the gateway says it charged across the scenario's calls; null when any call did not say. */
  billedCostUsd: number | null;
  error?: string;
}

export interface ModelRun {
  model: string;
  scoreFormat?: 'json_schema' | 'text';
  effort?: { reply?: string; score?: string };
  scenarios: ScenarioRun[];
  separation: Check[];
  error?: string;
}

export interface ComparisonRun {
  startedAt: string;
  finishedAt: string;
  budgetUsd: number;
  spentUsd: number;
  stoppedForBudget: boolean;
  models: ModelRun[];
}

export interface ModelSummary {
  model: string;
  passed: number;
  /** Checks that could be judged: one the provider gave no data for counts neither way. */
  checks: number;
  /** Summed over its AI-scored behavioral scenarios; null when there were none. */
  inventedNumbers: number | null;
  meanCostUsd: number | null;
  meanBilledUsd: number | null;
  p50FirstTokenMs: number | null;
  p50ReplyMs: number | null;
  errors: number;
}

export function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

const mean = (values: number[]) => (values.length ? values.reduce((s, v) => s + v, 0) / values.length : null);
const known = (values: (number | null | undefined)[]) => values.filter((v): v is number => typeof v === 'number');

export function summarize(run: ModelRun): ModelSummary {
  const checks = [...run.scenarios.flatMap((s) => s.checks), ...run.separation];
  const results = run.scenarios.flatMap((s) => (s.result ? [s.result] : []));
  const replies = results.flatMap((r) => r.replies);
  const invented = known(results.map((r) => r.inventedNumbers));
  return {
    model: run.model,
    passed: checks.filter((c) => c.pass === true).length,
    checks: checks.filter((c) => c.pass !== null).length,
    inventedNumbers: invented.length ? invented.reduce((sum, n) => sum + n, 0) : null,
    meanCostUsd: mean(known(results.map((r) => r.usage.costUsd))),
    meanBilledUsd: mean(known(run.scenarios.filter((s) => s.result).map((s) => s.billedCostUsd))),
    p50FirstTokenMs: median(replies.map((r) => r.firstTokenMs).filter((ms) => ms >= 0)),
    p50ReplyMs: median(replies.map((r) => r.totalMs)),
    errors: run.scenarios.filter((s) => s.error).length + (run.error ? 1 : 0),
  };
}

const usd = (value: number | null | undefined) => (typeof value === 'number' ? `$${value.toFixed(4)}` : 'n/a');
const ms = (value: number | null) => (value === null ? 'n/a' : `${Math.round(value)} ms`);
const cell = (text: string) => text.replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim() || '-';
const row = (cells: string[]) => `| ${cells.map(cell).join(' | ')} |`;
const table = (header: string[], rows: string[][]) => [row(header), `| ${header.map(() => '---').join(' | ')} |`, ...rows.map(row)];

function checkCell(checks: Check[]): string {
  if (!checks.length) return '-';
  const names = (pass: boolean | null) => checks.filter((c) => c.pass === pass).map((c) => c.name);
  const [failed, notReported] = [names(false), names(null)];
  const notes = [
    ...(failed.length ? [`failed: ${failed.join(', ')}`] : []),
    ...(notReported.length ? [`not reported: ${notReported.join(', ')}`] : []),
  ];
  const judged = checks.length - notReported.length;
  return `${judged - failed.length}/${judged}${notes.length ? ` (${notes.join('; ')})` : ''}`;
}

const count = (value: number | null | undefined) => (typeof value === 'number' ? String(value) : '-');

function scenarioRow(model: string, run: ScenarioRun): string[] {
  const r = run.result;
  if (!r) return [model, '-', '-', checkCell(run.checks), '-', '-', '-', '-', '-', '-', `Error: ${run.error ?? 'unknown'}`];
  const u = r.usage;
  return [
    model,
    `${r.scorecard.verdict} (${r.scorecard.mode})`,
    r.average.toFixed(1),
    checkCell(run.checks),
    count(r.inventedNumbers),
    `${u.inputTokens} / ${u.cacheReadTokens} / ${u.outputTokens}`,
    usd(u.costUsd),
    usd(run.billedCostUsd),
    ms(median(r.replies.map((x) => x.firstTokenMs).filter((x) => x >= 0))),
    ms(r.scoreMs),
    r.warnings.join('; '),
  ];
}

export function markdownReport(run: ComparisonRun): string {
  const summaries = run.models.map(summarize);
  const summary = table(
    [
      'Model',
      'Scoring',
      'Effort (reply / score)',
      'Pass rate',
      'Invented numbers',
      'Mean cost / session',
      'Mean billed / session',
      'p50 first token',
      'p50 reply',
      'Errors',
    ],
    run.models.map((m, i) => {
      const s = summaries[i];
      return [
        m.model,
        m.error ? `Error: ${m.error}` : (m.scoreFormat ?? '-'),
        m.effort ? `${m.effort.reply ?? 'default'} / ${m.effort.score ?? 'default'}` : '-',
        s.checks ? `${Math.round((s.passed / s.checks) * 100)}% (${s.passed}/${s.checks})` : 'n/a',
        count(s.inventedNumbers),
        usd(s.meanCostUsd),
        usd(s.meanBilledUsd),
        ms(s.p50FirstTokenMs),
        ms(s.p50ReplyMs),
        String(s.errors),
      ];
    }),
  );
  const names = [...new Set(run.models.flatMap((m) => m.scenarios.map((s) => s.scenario)))];
  const scenarios = names.flatMap((name) => [
    '',
    `## ${name}`,
    '',
    ...table(
      [
        'Model',
        'Verdict',
        'Avg',
        'Checks',
        'Invented numbers',
        'Tokens in / cache read / out',
        'Cost',
        'Billed',
        'p50 first token',
        'Score time',
        'Notes',
      ],
      run.models.flatMap((m) => m.scenarios.filter((s) => s.scenario === name).map((s) => scenarioRow(m.model, s))),
    ),
  ]);
  const separation = run.models.filter((m) => m.separation.length).map((m) => `- ${m.model}: ${checkCell(m.separation)}`);
  return [
    '# Interviewer model comparison',
    '',
    `Run ${run.startedAt} to ${run.finishedAt}. Spent ${usd(run.spentUsd)} of a ${usd(run.budgetUsd)} budget.`,
    ...(run.stoppedForBudget ? ['', 'Stopped early: the next call could have passed the budget, so later scenarios did not run.'] : []),
    '',
    'Cost is computed from the gateway catalog prices and the reported tokens; Billed is what the gateway reported charging, when it did.',
    '',
    'Invented numbers counts the numbers a behavioral scorecard put in a fix, improvement or summary that the candidate never said (each shown to the learner as [number]). A check is not reported, and counts neither way, when the gateway reported no cache reads for any of the model’s calls.',
    '',
    '## Summary',
    '',
    ...summary,
    ...(separation.length ? ['', 'Strong and weak averages at least a point apart:', '', ...separation] : []),
    ...scenarios,
    '',
  ].join('\n');
}
