import type { CodingProblemSummary } from '../coding/catalog.js';
import { PATTERN_CATALOG } from '../curriculum/catalog.js';
import { getSdTopic, SD_TOPICS } from '../curriculum/sd-topics.js';
import { problemsAtBar } from '../readiness/bar.js';
import type { LevelProfile } from '../readiness/levels.js';
import { solvesReady } from '../readiness/status.js';
import { dayKey, type ProgressState } from '../srs/progress.js';
import { CASE_CATALOG, type CaseSummary } from '../sysdesign/case-catalog.js';
import { SCENARIO_CATALOG } from '../sysdesign/scenario-catalog.js';
import { minutesFor } from './minutes.js';
import { addCalendarDays, PLAN_ROUNDS, type PlanLevel, type PlanRound, type RoundCounts } from './options.js';
import type { PlanUnit } from './study-plan.js';

/** A pattern's second solve waits this many days after its first, so the two land on different days as Ready asks. */
export const SECOND_SOLVE_GAP_DAYS = 2;
/** The mission every design plan opens with: it builds the Foundations shelf the cases lean on. */
const FIRST_MISSION = 'first-scale-up';

/**
 * Readiness a finished unit adds, before its round's weight: the state weights it moves its skill across (New to
 * Practiced 0.6, Practiced to Ready 0.4, New to Learning 0.25), and for a case or mission the topics it newly covers.
 */
export const UNIT_GAIN = { pattern: 0.6, solve: 0.4, retry: 0.4, lesson: 0.25, case: 0.6, coveredTopic: 0.35, story: 1 };

const sortedTimes = (times: (string | null | undefined)[]) =>
  times.filter((t): t is string => Boolean(t)).sort((a, b) => Date.parse(a) - Date.parse(b));
const earliest = (times: (string | null | undefined)[]) => sortedTimes(times)[0] ?? null;

export interface TargetUnitsContext {
  state: ProgressState;
  profile: LevelProfile;
  counts: RoundCounts;
  startingPoint: PlanLevel;
  tzOffsetMinutes: number;
}

/** Each round's share of loop readiness per required skill, so a unit's value is its gain times this. */
export function skillWeight(round: PlanRound, counts: RoundCounts, skills: number): number {
  const total = PLAN_ROUNDS.reduce((sum, r) => sum + counts[r], 0);
  return total && skills ? counts[round] / total / skills : 0;
}

/**
 * The coding units of a Target level: each required pattern's lesson and first solve, then a second solve of another of
 * its own problems at the level bar a few days later. Flagged patterns come first and patterns placed strong last.
 */
export function targetCodingUnits(ctx: TargetUnitsContext): PlanUnit[] {
  const { state, profile, startingPoint } = ctx;
  const weight = skillWeight('coding', ctx.counts, profile.patterns.required.length);
  const solvedAt = (p: CodingProblemSummary) => state.coding[p.id]?.solvedAt ?? null;
  const groups: Record<'flagged' | 'rest' | 'strong', PlanUnit[]> = { flagged: [], rest: [], strong: [] };
  for (const pattern of PATTERN_CATALOG.filter((p) => profile.patterns.required.includes(p.id))) {
    const own = problemsAtBar(pattern.id, 'easy');
    const atBar = problemsAtBar(pattern.id, profile.bar);
    const firstSolve = earliest(own.map(solvedAt));
    const placedStrong = state.placement[pattern.id] === 'strong';
    const weak = state.weakPatterns[pattern.id];
    const flag = weak && !(placedStrong && state.diagnosedAt && Date.parse(state.diagnosedAt) > Date.parse(weak.flaggedAt)) ? weak : null;
    if (flag && firstSolve && Date.parse(firstSolve) < Date.parse(flag.flaggedAt)) {
      const target = atBar.find((p) => !solvedAt(p)) ?? atBar[0];
      groups.flagged.push({
        id: `retry:${pattern.id}`,
        round: 'coding',
        kind: 'retry',
        title: `${pattern.name}, again`,
        detail: `An interview flagged this pattern. Solve ${target.title}${solvedAt(target) ? ' again, from a blank editor' : ', one you have not solved before'}.`,
        minutes: minutesFor({ kind: 'retry', difficulty: target.difficulty }, startingPoint),
        flagged: true,
        patternId: pattern.id,
        problemId: target.id,
        doneAt: flag.resolvedAt,
        value: weight * UNIT_GAIN.retry,
      });
      continue;
    }
    if (startingPoint === 'confident' && placedStrong && !firstSolve && !flag) continue;
    const startBar = startingPoint === 'new' ? profile.startBar : profile.bar;
    const startable = problemsAtBar(pattern.id, startBar);
    const first = (firstSolve && own.find((p) => solvedAt(p) === firstSolve)) || (startable.find((p) => !solvedAt(p)) ?? startable[0]);
    const second = atBar.find((p) => p !== first && !solvedAt(p)) ?? atBar.find((p) => p !== first)!;
    const patternUnit: PlanUnit = {
      id: `pattern:${pattern.id}`,
      round: 'coding',
      kind: 'pattern',
      title: `Learn ${pattern.name}`,
      detail: `${flag ? 'An interview flagged this pattern. ' : ''}Read the pattern, then solve a problem with it.`,
      minutes: minutesFor({ kind: 'pattern', difficulty: first.difficulty }, startingPoint),
      flagged: Boolean(flag),
      patternId: pattern.id,
      problemId: first.id,
      doneAt: firstSolve,
      value: weight * UNIT_GAIN.pattern,
    };
    const ready = solvesReady(pattern.id, state, profile);
    const solveUnit: PlanUnit = {
      id: `solve:${pattern.id}`,
      round: 'coding',
      kind: 'solve',
      title: `${pattern.name}: a second solve`,
      detail: `Solve ${second.title} on another day, to show the pattern sticks.`,
      minutes: minutesFor({ kind: 'problem', difficulty: second.difficulty }, startingPoint),
      flagged: false,
      patternId: pattern.id,
      problemId: second.id,
      doneAt: ready ? (sortedTimes(own.map(solvedAt)).at(-1) ?? null) : null,
      value: weight * UNIT_GAIN.solve,
      ...(firstSolve
        ? { notBefore: addCalendarDays(dayKey(new Date(firstSolve), ctx.tzOffsetMinutes), SECOND_SOLVE_GAP_DAYS) }
        : { after: { unitId: patternUnit.id, days: SECOND_SOLVE_GAP_DAYS } }),
    };
    groups[flag ? 'flagged' : placedStrong ? 'strong' : 'rest'].push(patternUnit, solveUnit);
  }
  return [...groups.flagged, ...groups.rest, ...groups.strong];
}

/**
 * Required topics count only once a finished mission or case covers them, so the plan adds the fewest missions
 * (greedily, in catalog order on ties) that cover the required topics the given cases leave out.
 */
export function coveringMissions(topicIds: readonly string[], cases: readonly CaseSummary[]): string[] {
  const open = new Set(topicIds.filter((t) => !cases.some((c) => c.topics.includes(t))));
  const covers = (scenarioId: string) => SD_TOPICS.filter((t) => open.has(t.id) && t.scenarioIds.includes(scenarioId));
  const picked: string[] = [];
  while (open.size) {
    const best = SCENARIO_CATALOG.reduce((a, b) => (covers(b.id).length > covers(a.id).length ? b : a));
    const covered = covers(best.id);
    if (!covered.length) break;
    covered.forEach((t) => open.delete(t.id));
    picked.push(best.id);
  }
  return picked;
}

type DesignStep = { case: CaseSummary } | { mission: string };

/**
 * The design round of a Target level: Your First Scale-Up first, then each required case followed by a mission that
 * fills the required topics the cases leave out, each preceded by the lessons of the required topics it covers first.
 */
export function targetDesignUnits(ctx: TargetUnitsContext): PlanUnit[] {
  const { state, profile, startingPoint } = ctx;
  const required = profile.topics.required;
  const weight = skillWeight('design', ctx.counts, required.length + profile.cases.required.length);
  const cases = profile.cases.required.map((id) => CASE_CATALOG.find((c) => c.id === id)!);
  const first = SD_TOPICS.filter((t) => t.scenarioIds.includes(FIRST_MISSION)).map((t) => t.id);
  const missions = coveringMissions(
    required.filter((t) => !first.includes(t)),
    cases,
  );
  const steps: DesignStep[] = [{ mission: FIRST_MISSION }];
  cases.forEach((c, i) => steps.push({ case: c }, ...(missions[i] ? [{ mission: missions[i] }] : [])));
  steps.push(...missions.slice(cases.length).map((mission) => ({ mission })));

  const lessoned = new Set<string>();
  const covered = new Set<string>();
  const units: PlanUnit[] = [];
  for (const step of steps) {
    const topics = 'case' in step ? step.case.topics : SD_TOPICS.filter((t) => t.scenarioIds.includes(step.mission)).map((t) => t.id);
    const fresh = topics.filter((t) => required.includes(t) && !covered.has(t));
    const lessons = fresh.filter((t) => !lessoned.has(t));
    for (const topicId of lessons) {
      lessoned.add(topicId);
      units.push({
        id: `lesson:${topicId}`,
        round: 'design',
        kind: 'lesson',
        title: `Learn ${getSdTopic(topicId)!.name}`,
        detail: 'Read the lesson and answer its quick check before you build with it.',
        minutes: minutesFor({ kind: 'lesson' }, startingPoint),
        flagged: false,
        topicId,
        doneAt: state.introduced[topicId] ?? null,
        value: weight * UNIT_GAIN.lesson,
      });
    }
    fresh.forEach((t) => covered.add(t));
    const value = weight * UNIT_GAIN.coveredTopic * fresh.length;
    const requires = lessons.map((t) => `lesson:${t}`);
    if ('case' in step) {
      const c = step.case;
      units.push({
        id: `case:${c.id}`,
        round: 'design',
        kind: 'case',
        title: `${c.title} case study`,
        detail: 'Work through it stage by stage, estimates and trade-offs included.',
        minutes: minutesFor({ kind: 'case', stages: c.stages }, startingPoint),
        flagged: false,
        caseId: c.id,
        doneAt: state.cases[c.id]?.firstCompletedAt ?? null,
        value: value + weight * UNIT_GAIN.case,
        requires,
      });
    } else {
      const scenario = SCENARIO_CATALOG.find((m) => m.id === step.mission)!;
      units.push({
        id: `mission:${scenario.id}`,
        round: 'design',
        kind: 'mission',
        title: `${scenario.title} mission`,
        detail: 'Build it in the Lab until it passes. It covers design topics your loop asks about.',
        minutes: minutesFor({ kind: 'mission' }, startingPoint),
        flagged: false,
        scenarioId: scenario.id,
        doneAt: state.missions[scenario.id]?.firstCompletedAt ?? null,
        value,
        requires,
      });
    }
  }
  return units;
}
