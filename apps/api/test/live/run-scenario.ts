import type { Interviewer } from '../../src/interview/interviewer.js';
import type { InterviewSession, Scorecard, SessionUsage } from '../../src/interview/interview.types.js';
import { addUsage } from '../../src/interview/pricing.js';
import { BEHAVIORAL_CLOSING, BEHAVIORAL_FOLLOW_UPS, starText } from '../../src/interview/behavioral.prompts.js';
import { pickProblem } from '../../src/interview/problems.js';
import type { Scenario } from './scenarios.js';

export interface ScenarioResult {
  scenario: string;
  track: Scenario['track'];
  quality: Scenario['quality'];
  model: string;
  scorecard: Scorecard;
  average: number;
  usage: SessionUsage;
  replies: { words: number; firstTokenMs: number; totalMs: number; cacheReadTokens: number }[];
  scoreMs: number;
  /** Behavioral AI scoring only: numbers the scorer invented, before the normalizer replaced them. */
  inventedNumbers?: number;
  transcript: InterviewSession['messages'];
  warnings: string[];
}

export interface Check {
  name: string;
  /** Null when the provider does not report what the check measures: it then counts neither way. */
  pass: boolean | null;
}

export async function runScenario(scenario: Scenario, interviewer: Interviewer, model: string): Promise<ScenarioResult> {
  const problem = pickProblem(scenario.track, scenario.problemId)!;
  const session: InterviewSession = {
    id: crypto.randomUUID(),
    learnerId: 'eval',
    track: scenario.track,
    problem,
    messages: [{ role: 'interviewer', content: problem.opening, at: new Date().toISOString() }],
    hintsUsed: 0,
    status: 'active',
    createdAt: new Date().toISOString(),
    ...(scenario.level ? { level: scenario.level } : {}),
  };
  let usage: SessionUsage | undefined;
  const replies: ScenarioResult['replies'] = [];
  const warnings: string[] = [];

  const turns = scenario.star ? [{ content: starText(scenario.star), star: scenario.star }, ...scenario.turns] : scenario.turns;
  for (const [index, turn] of turns.entries()) {
    session.messages.push({ role: 'candidate', at: new Date().toISOString(), ...turn });
    if ('hint' in turn && turn.hint) session.hintsUsed += 1;
    // The service answers the last behavioral follow-up with a fixed closing, not a model call.
    if (scenario.star && index === BEHAVIORAL_FOLLOW_UPS) {
      session.messages.push({ role: 'interviewer', content: BEHAVIORAL_CLOSING, at: new Date().toISOString() });
      break;
    }
    const started = Date.now();
    let firstTokenMs = -1;
    const reply = await interviewer.reply(
      session,
      () => {
        if (firstTokenMs < 0) firstTokenMs = Date.now() - started;
      },
      new AbortController().signal,
    );
    usage = addUsage(usage, reply.usage!);
    const words = reply.text.split(/\s+/).filter(Boolean).length;
    replies.push({ words, firstTokenMs, totalMs: Date.now() - started, cacheReadTokens: reply.usage!.cacheReadTokens });
    if (/^#{1,6}\s/m.test(reply.text)) warnings.push(`Markdown heading in reply ${replies.length}`);
    if (words > (scenario.star ? 60 : 150)) warnings.push(`Reply ${replies.length} is ${words} words`);
    if (/st\.pop\(\)|stack\.pop\(\)/.test(reply.text) && scenario.quality === 'weak')
      warnings.push(`Reply ${replies.length} may leak the solution`);
    session.messages.push({ role: 'interviewer', content: reply.text, at: new Date().toISOString() });
  }

  const scoreStarted = Date.now();
  const scored = await interviewer.score(session);
  const scoreMs = Date.now() - scoreStarted;
  for (const u of scored.usage ?? []) usage = addUsage(usage, u);
  const average = scored.scorecard.dimensions.reduce((s, d) => s + d.score, 0) / scored.scorecard.dimensions.length;
  return {
    scenario: scenario.name,
    track: scenario.track,
    quality: scenario.quality,
    model,
    scorecard: scored.scorecard,
    average,
    usage: usage!,
    replies,
    scoreMs,
    inventedNumbers: scored.inventedNumbers,
    transcript: session.messages,
    warnings,
  };
}

/**
 * Whether cache reads can be judged: the gateway reports none at all for some models (Gemini 3 Flash, Haiku 4.5 in
 * the first run) although the catalog prices cache reads for every one, so a model counts as reporting them only
 * when at least one of its calls did.
 */
export const reportsCacheReads = (results: ScenarioResult[]) => results.some((r) => r.usage.cacheReadTokens > 0);

export function scenarioChecks(scenario: Scenario, result: ScenarioResult, cacheReadsReported = true): Check[] {
  const { verdict, weakPatterns, mode, flaws, weakCompetencies } = result.scorecard;
  const expected = scenario.verdicts ?? (scenario.quality === 'weak' ? ['no-hire', 'lean-no-hire'] : ['strong-hire', 'hire', 'lean-hire']);
  return [
    { name: 'AI scorecard', pass: mode === 'ai' },
    { name: `${scenario.quality} verdict`, pass: expected.includes(verdict) },
    ...(scenario.expectWeakPatterns ?? []).map((id) => ({ name: `weak pattern ${id}`, pass: weakPatterns.includes(id) })),
    ...(scenario.expectFlaws ?? []).map((id) => ({ name: `flaw ${id}`, pass: !!flaws?.some((f) => f.id === id) })),
    ...(scenario.expectWeakCompetencies ?? []).map((id) => ({ name: `weak competency ${id}`, pass: !!weakCompetencies?.includes(id) })),
    ...(scenario.track === 'behavioral' ? [{ name: 'fixes invent no numbers', pass: !result.inventedNumbers }] : []),
    // Beyond the first turn the conversation prefix is well past the cache minimum, so reads must appear.
    {
      name: 'cache reads from reply 3',
      pass: cacheReadsReported ? result.replies.slice(2).some((r) => r.cacheReadTokens > 0) : null,
    },
  ];
}

/** Strong and weak averages at least a point apart on every track that has both. */
export function separationChecks(results: ScenarioResult[]): Check[] {
  const average = (track: string, quality: Scenario['quality']) => results.find((r) => r.track === track && r.quality === quality)?.average;
  return [...new Set(results.map((r) => r.track))].flatMap((track) => {
    const strong = average(track, 'strong');
    const weak = average(track, 'weak');
    return strong === undefined || weak === undefined ? [] : [{ name: `separates strong from weak (${track})`, pass: strong - weak >= 1 }];
  });
}
