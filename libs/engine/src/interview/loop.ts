import { COMPETENCY_CATALOG } from '../behavioral/catalog.js';
import { PLAN_ROUNDS, type PlanRound } from '../plan/options.js';
import { pick, type Rand } from '../review/random.js';
import type { ProgressState } from '../srs/progress.js';
import type { InterviewTrack } from './rubrics.js';

export const PLAN_ROUND_TRACK: Record<PlanRound, InterviewTrack> = { coding: 'coding', design: 'system-design', behavioral: 'behavioral' };

/** About how long each round runs, as the interviewers pace it; a loop's rounds keep this order. */
export const LOOP_ROUND_MINUTES: Record<InterviewTrack, number> = { coding: 45, 'system-design': 45, behavioral: 20 };

/** A finished loop counts as the study plan's mock this long; an older one is practice, not a dress rehearsal. */
export const LOOP_FRESH_DAYS = 14;

/** What the loop needs of an interview problem from the interview catalog. */
export interface LoopProblem {
  id: string;
  track: InterviewTrack;
  patternIds: readonly string[];
}

/** 'flagged': an interview flagged its pattern or competency; 'new': a competency no interview has asked about yet. */
export type LoopPickReason = 'flagged' | 'new' | 'any';

export interface LoopPick {
  track: InterviewTrack;
  /** A coding or design problem id, or for behavioral a competency id, which the API turns into one of its questions. */
  problemId: string;
  reason: LoopPickReason;
}

/**
 * One round per track, in loop order. Coding prefers a problem on a pattern an interview flagged and not yet re-solved;
 * behavioral a flagged competency, then one never asked; design has no flags, so any problem.
 */
export function pickLoop(
  problems: readonly LoopProblem[],
  state: ProgressState,
  rand: Rand,
  rounds: readonly PlanRound[] = PLAN_ROUNDS,
): LoopPick[] {
  const picks: LoopPick[] = [];
  for (const round of PLAN_ROUNDS.filter((r) => rounds.includes(r))) {
    const track = PLAN_ROUND_TRACK[round];
    if (track === 'behavioral') {
      picks.push(pickCompetency(state, rand));
      continue;
    }
    const pool = problems.filter((p) => p.track === track);
    if (!pool.length) continue;
    const flagged = pool.filter((p) => p.patternIds.some((id) => state.weakPatterns[id] && !state.weakPatterns[id].resolvedAt));
    picks.push({ track, problemId: pick(rand, flagged.length ? flagged : pool).id, reason: flagged.length ? 'flagged' : 'any' });
  }
  return picks;
}

function pickCompetency(state: ProgressState, rand: Rand): LoopPick {
  const ids = COMPETENCY_CATALOG.map((c) => c.id);
  const flagged = ids.filter((id) => state.behavioral[id]?.weakSince);
  const unasked = ids.filter((id) => !state.behavioral[id]?.lastAt);
  const [pool, reason]: [string[], LoopPickReason] = flagged.length
    ? [flagged, 'flagged']
    : unasked.length
      ? [unasked, 'new']
      : [ids, 'any'];
  return { track: 'behavioral', problemId: pick(rand, pool), reason };
}
