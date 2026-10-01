import { CASE_CATALOG } from '../sysdesign/case-catalog.js';
import { INTERVIEW_RUBRICS, INTERVIEW_TRACKS, VERDICTS, type InterviewTrack, type Verdict } from './rubrics.js';

/** What the debrief reads from one round's scorecard and its problem. */
export interface LoopRoundCard {
  track: InterviewTrack;
  sessionId: string;
  problemId: string;
  patternIds: readonly string[];
  competencyId?: string;
  mode: 'ai' | 'offline';
  verdict: string;
  dimensions: readonly { name: string; score: number }[];
  weakPatterns: readonly string[];
}

export type FocusTarget =
  | { kind: 'pattern'; patternId: string }
  | { kind: 'design-topic'; topicId: string }
  | { kind: 'case'; caseId: string }
  | { kind: 'competency'; competencyId: string }
  | { kind: 'round'; sessionId: string };

export interface LoopFocus {
  track: InterviewTrack;
  dimension: string;
  score: number;
  lookFor: string;
  target: FocusTarget;
}

export interface LoopDebrief {
  /** A practice read from the rounds' own verdicts by a simple rule; never a hiring prediction. */
  verdict: Verdict;
  /** The round whose verdict held the read below the rounds' average, if one did. */
  heldBy: InterviewTrack | null;
  /** The first round scored no hire, when the read itself is not: the first thing to fix. */
  noHire: InterviewTrack | null;
  /** How many rounds scripted practice scored, which checks coverage rather than correctness. */
  scripted: number;
  /** Up to three rubric dimensions to work on, lowest score first, from different rounds where they can be. */
  focus: LoopFocus[];
}

export const LOOP_FOCUS_ITEMS = 3;
const MAX_SCORE = 4;
/** Scripted practice checks coverage, not quality, so it never scores a rubric area above this. */
const SCRIPTED_MAX_SCORE = 3;
const [, APPROACH, COMPLEXITY, CORRECTNESS] = INTERVIEW_RUBRICS.coding.map((r) => r.name);
const ESTIMATION = INTERVIEW_RUBRICS['system-design'][1].name;
/** The interview's design problems and the case study on the same system, where there is one. */
const DESIGN_CASES: Record<string, string> = {
  'url-shortener': 'url-shortener',
  'news-feed': 'news-feed',
  'rate-limiter': 'rate-limiter',
  'chat-service': 'chat',
};

/**
 * A simple practice rule, not how any one company decides: the rounds' average level, rounded down, and never more
 * than one level above the weakest round. Deterministic, so it costs no AI call.
 */
export function debriefLoop(rounds: readonly LoopRoundCard[]): LoopDebrief {
  if (!rounds.length) throw new Error('A loop debrief needs at least one scored round');
  const levels = rounds.map((r) => Math.max(0, VERDICTS.indexOf(r.verdict as Verdict)));
  const average = Math.floor(levels.reduce((sum, l) => sum + l, 0) / levels.length);
  const weakest = Math.min(...levels);
  const level = Math.min(average, weakest + 1);
  return {
    verdict: VERDICTS[level],
    heldBy: level < average ? rounds[levels.indexOf(weakest)].track : null,
    noHire: level > 0 && weakest === 0 ? rounds[levels.indexOf(0)].track : null,
    scripted: rounds.filter((r) => r.mode === 'offline').length,
    focus: focusOf(rounds),
  };
}

function focusOf(rounds: readonly LoopRoundCard[]): LoopFocus[] {
  const order = (t: InterviewTrack) => INTERVIEW_TRACKS.indexOf(t);
  const candidates = rounds
    .flatMap((round) => round.dimensions.map((d, i) => ({ round, d, i })))
    .filter(({ round, d }) => d.score < (round.mode === 'offline' ? SCRIPTED_MAX_SCORE : MAX_SCORE))
    .sort((a, b) => a.d.score - b.d.score || order(a.round.track) - order(b.round.track) || a.i - b.i);
  const chosen: typeof candidates = [];
  for (const c of candidates) {
    if (chosen.length < LOOP_FOCUS_ITEMS && !chosen.some((x) => x.round === c.round)) chosen.push(c);
  }
  for (const c of candidates) if (chosen.length < LOOP_FOCUS_ITEMS && !chosen.includes(c)) chosen.push(c);
  return chosen
    .sort((a, b) => candidates.indexOf(a) - candidates.indexOf(b))
    .map(({ round, d }) => ({
      track: round.track,
      dimension: d.name,
      score: d.score,
      lookFor: INTERVIEW_RUBRICS[round.track].find((r) => r.name === d.name)?.lookFor ?? '',
      target: targetFor(round, d.name),
    }));
}

function targetFor(round: LoopRoundCard, dimension: string): FocusTarget {
  if (round.track === 'behavioral' && round.competencyId) return { kind: 'competency', competencyId: round.competencyId };
  if (round.track === 'coding' && [APPROACH, COMPLEXITY, CORRECTNESS].includes(dimension)) {
    const patternId = round.weakPatterns[0] ?? round.patternIds[0];
    if (patternId) return { kind: 'pattern', patternId };
  }
  if (round.track === 'system-design') {
    if (dimension === ESTIMATION) return { kind: 'design-topic', topicId: 'sd-estimation' };
    const caseId = DESIGN_CASES[round.problemId];
    if (caseId && CASE_CATALOG.some((c) => c.id === caseId)) return { kind: 'case', caseId };
  }
  return { kind: 'round', sessionId: round.sessionId };
}
