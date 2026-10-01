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

/** Whether an interview has flagged a pattern not yet re-solved, or a competency, so the loop has something to aim at. */
export function hasInterviewFlags(state: ProgressState): boolean {
  return Object.values(state.weakPatterns).some((w) => !w.resolvedAt) || Object.values(state.behavioral).some((c) => Boolean(c.weakSince));
}

/**
 * One round per track, in loop order. Coding prefers a problem the learner has not had, on a pattern an interview
 * flagged and not yet re-solved, then any problem not had, then a flagged one; design a problem not had; behavioral a
 * flagged competency, then one never asked. `seen` holds the problem ids of the learner's earlier interviews.
 */
export function pickLoop(
  problems: readonly LoopProblem[],
  state: ProgressState,
  rand: Rand,
  rounds: readonly PlanRound[] = PLAN_ROUNDS,
  seen: ReadonlySet<string> = new Set(),
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
    const fresh = (list: LoopProblem[]) => list.filter((p) => !seen.has(p.id));
    const [chosen, reason]: [LoopProblem[], LoopPickReason] = fresh(flagged).length
      ? [fresh(flagged), 'flagged']
      : fresh(pool).length
        ? [fresh(pool), 'any']
        : flagged.length
          ? [flagged, 'flagged']
          : [pool, 'any'];
    picks.push({ track, problemId: pick(rand, chosen).id, reason });
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
