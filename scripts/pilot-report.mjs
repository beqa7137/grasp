// Fetches /api/admin/metrics and prints a Markdown pilot report with targets from docs/PILOT.md.
// Usage: ADMIN_TOKEN=... node scripts/pilot-report.mjs --url https://grasp.fly.dev [--out reports/week-1.md]
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { parseArgs } from 'node:util';

const { values } = parseArgs({ options: { url: { type: 'string', default: 'http://localhost:3000' }, out: { type: 'string' } } });
const token = process.env.ADMIN_TOKEN;
if (!token) {
  console.error('Set ADMIN_TOKEN to the value configured on the server.');
  process.exit(1);
}

const res = await fetch(new URL('/api/admin/metrics', values.url), { headers: { authorization: `Bearer ${token}` } });
if (!res.ok) {
  console.error(`GET /api/admin/metrics failed: ${res.status} ${await res.text()}`);
  process.exit(1);
}
const m = await res.json();

const pct = (r) => (r.rate === null ? 'n/a' : `${Math.round(r.rate * 100)}% (${r.count}/${r.of})`);
const num = (n, digits = 1) => (n === null || n === undefined ? 'n/a' : Number(n).toFixed(digits));
const usd = (n) => (n === null ? 'n/a' : `$${n.toFixed(n < 1 ? 3 : 2)}`);

const TARGETS = [
  ['D1 retention', m.retention.d1.rate, '≥ 50%', (v) => v >= 0.5],
  ['D7 retention', m.retention.d7.rate, '≥ 30%', (v) => v >= 0.3],
  ['Did a spaced review', m.activation.reviewed.rate, '≥ 80%', (v) => v >= 0.8],
  ['Finished a scored interview', m.activation.scoredInterview.rate, '≥ 50%', (v) => v >= 0.5],
  ['Active days / learner (7d)', m.engagement.activeDaysPerLearnerLast7d, '≥ 3', (v) => v >= 3],
  ['Recall after ≥ 1 day', m.reviews.recallAfterADay.rate, '≥ 80%', (v) => v >= 0.8],
  ['Interview completion', m.interviews.scored.rate, '≥ 60%', (v) => v >= 0.6],
  ['Average feedback rating', m.feedback.averageRating, '≥ 4.0', (v) => v >= 4],
  ['AI cost / scored interview', m.interviews.costPerScoredUsd, '≤ $0.25', (v) => v <= 0.25],
];
const fmtTarget = (label, v) =>
  v === null ? 'n/a' : /rating|days/i.test(label) ? num(v) : /cost/i.test(label) ? usd(v) : `${Math.round(v * 100)}%`;

const bar = (n, max) => '█'.repeat(max ? Math.round((n / max) * 20) : 0) || '·';
const maxActive = Math.max(...m.daily.map((d) => d.activeLearners), 0);

const lines = [
  `# Grasp pilot report`,
  '',
  `Generated ${m.generatedAt} from ${values.url}`,
  '',
  `**${m.learners.total} learner${m.learners.total === 1 ? '' : 's'}** · ${m.learners.active1d} active today · ${m.learners.active7d} active in the last 7 days · ${m.learners.newLast7d} new this week`,
  '',
  '## Targets',
  '',
  '| Metric | Now | Target | Status |',
  '| --- | --- | --- | --- |',
  ...TARGETS.map(
    ([label, v, target, ok]) => `| ${label} | ${fmtTarget(label, v)} | ${target} | ${v === null ? 'no data' : ok(v) ? 'met' : 'below'} |`,
  ),
  '',
  '## Activation funnel',
  '',
  '| Step | Learners |',
  '| --- | --- |',
  `| Did a spaced review | ${pct(m.activation.reviewed)} |`,
  `| Answered a visualizer prediction | ${pct(m.activation.predicted)} |`,
  `| Completed a Design Lab mission | ${pct(m.activation.completedMission)} |`,
  `| Started an interview | ${pct(m.activation.startedInterview)} |`,
  `| Finished a scored interview | ${pct(m.activation.scoredInterview)} |`,
  '',
  '## Learning',
  '',
  `- Reviews: ${m.reviews.total} total, ${m.reviews.last7d} in the last 7 days, ${pct(m.reviews.correct)} correct`,
  `- Ratings: again ${m.reviews.ratings.again} · hard ${m.reviews.ratings.hard} · good ${m.reviews.ratings.good} · easy ${m.reviews.ratings.easy}`,
  `- Recall on items seen at least a day earlier: ${pct(m.reviews.recallAfterADay)} (FSRS schedules for 90%)`,
  `- Predictions: ${m.predictions.total}, ${pct(m.predictions.correct)} correct`,
  `- Design Lab: ${m.missions.completions} missions completed, ${m.missions.revisits} revisits`,
  `- Median session length: ${num(m.engagement.medianSessionMinutes)} min`,
  '',
  '## Interviews',
  '',
  `- Started ${m.interviews.started}, scored ${pct(m.interviews.scored)}; by track: ${
    Object.entries(m.interviews.byTrack)
      .map(([k, v]) => `${k} ${v}`)
      .join(', ') || 'none'
  }`,
  `- Verdicts: ${
    Object.entries(m.interviews.verdicts)
      .map(([k, v]) => `${k} ${v}`)
      .join(', ') || 'none'
  }`,
  `- Average candidate turns ${num(m.interviews.averageCandidateTurns)}, hints per session ${num(m.interviews.hintsPerSession, 2)}`,
  `- Scored by AI ${m.interviews.aiScored}, by the fallback heuristic ${m.interviews.heuristicScored}`,
  `- AI spend ${usd(m.interviews.costUsd)} total, ${usd(m.interviews.costPerScoredUsd)} per scored interview, ${m.interviews.cacheReadShare === null ? 'n/a' : `${Math.round(m.interviews.cacheReadShare * 100)}%`} of prompt tokens served from cache`,
  '',
  '## Daily activity (UTC)',
  '',
  '| Date | Active | Reviews | Interview turns | |',
  '| --- | --- | --- | --- | --- |',
  ...m.daily.map((d) => `| ${d.date} | ${d.activeLearners} | ${d.reviews} | ${d.interviewTurns} | ${bar(d.activeLearners, maxActive)} |`),
  '',
  '## Feedback',
  '',
  `${m.feedback.total} notes (${
    Object.entries(m.feedback.byKind)
      .map(([k, v]) => `${k} ${v}`)
      .join(', ') || 'none'
  }), average rating ${num(m.feedback.averageRating)}`,
  '',
  ...m.feedback.recent.map(
    (f) => `- **${f.kind}**${f.rating ? ` (${f.rating}/5)` : ''}, ${f.createdAt.slice(0, 10)}: ${f.message.replace(/\s+/g, ' ')}`,
  ),
  '',
];

const report = lines.join('\n');
if (values.out) {
  mkdirSync(dirname(values.out), { recursive: true });
  writeFileSync(values.out, report);
  console.log(`Wrote ${values.out}`);
} else {
  process.stdout.write(report);
}
