import { COMPETENCY_CATALOG } from '../behavioral/catalog.js';
import { dueStories, isRehearsable } from '../behavioral/rehearsal.js';
import type { Story } from '../behavioral/stories.js';
import { problemsForPattern } from '../coding/catalog.js';
import { PATTERN_CATALOG } from '../curriculum/catalog.js';
import { dayKey, type ProgressState } from '../srs/progress.js';
import { buildSession } from '../srs/session.js';
import { CASE_CATALOG } from '../sysdesign/case-catalog.js';
import {
  PLAN_MAX_DAYS,
  PLAN_MINUTES,
  PLAN_ROUNDS,
  addCalendarDays,
  calendarDaysBetween,
  type PlanLevel,
  type PlanRound,
  type StudyPlanInput,
} from './options.js';

/** Rough sittings for a unit at the "new" level; the page always says "about". */
const UNIT_MINUTES = { pattern: 30, retry: 20, story: 20, caseStage: 4 };
const LEVEL_FACTOR: Record<PlanLevel, number> = { new: 1, rusty: 0.75, confident: 0.5 };
/** Later days keep this share for reviews, which grow as new material turns into cards. */
const REVIEW_SHARE = 0.2;
/** Today's reviews take at most this share, so new material still moves forward. */
const TODAY_REVIEW_CAP = 0.5;
export const REHEARSAL_MINUTES = 3;
/** A unit is not split into a piece shorter than this unless the piece finishes it. */
const MIN_SLICE = 10;
/** With at least this many study days, the last one is kept for review. */
const TAPER_FROM_DAYS = 3;

export type PlanUnitKind = 'pattern' | 'retry' | 'case' | 'story';

export interface PlanUnit {
  id: string;
  round: PlanRound;
  kind: PlanUnitKind;
  title: string;
  detail: string;
  minutes: number;
  /** An interview scorecard flagged its pattern or competency. */
  flagged: boolean;
  patternId?: string;
  problemId?: string;
  caseId?: string;
  competencyId?: string;
  /** Set when it was finished today; units finished before today are left out of the plan. */
  doneAt: string | null;
}

export interface PlanSlice {
  unit: PlanUnit;
  minutes: number;
  part: number;
  parts: number;
  done: boolean;
}

export interface PlanDay {
  date: string;
  /** Minutes kept for reviews and story rehearsals. */
  review: number;
  slices: PlanSlice[];
  /** The last study day before the interview, kept for review. */
  taper: boolean;
}

export type PlanStatus = 'on-track' | 'tight' | 'covered' | 'no-time' | 'interview-day' | 'past';

export interface StudyPlan {
  status: PlanStatus;
  today: string;
  interviewDate: string;
  daysLeft: number;
  days: PlanDay[];
  /** What is left to do, in priority order per round, with anything finished today. */
  units: PlanUnit[];
  /** Units that do not fit, wholly or in part, before the interview. */
  unscheduled: PlanUnit[];
  /** The last day with new material, or null when there is none. */
  finishDate: string | null;
  /** The smallest offered daily time that fits everything, when the current one does not; null if none does. */
  minutesToFit: number | null;
  /** Cards ready in today's review and story rehearsals due, each with its estimated minutes. */
  todayReview: { cards: number; cardMinutes: number; stories: number; minutes: number };
  remaining: Record<PlanRound, { units: number; minutes: number } | null>;
}

export interface PlanContext {
  now: Date;
  tzOffsetMinutes?: number;
  /** The learner's live stories, which live outside the progress log. */
  stories?: readonly Story[];
}

const roundTo5 = (minutes: number) => Math.max(5, Math.round(minutes / 5) * 5);
const earliest = (times: (string | null | undefined)[]) =>
  times.filter((t): t is string => Boolean(t)).sort((a, b) => Date.parse(a) - Date.parse(b))[0] ?? null;

/**
 * Turns the learner's interview date, daily time and rounds into dated sessions from today, recomputed from actual
 * progress each time, so missed days, finished work and interview flags reshape what is left.
 */
export function buildStudyPlan(input: StudyPlanInput, state: ProgressState, ctx: PlanContext): StudyPlan {
  const tz = ctx.tzOffsetMinutes ?? 0;
  const today = dayKey(ctx.now, tz);
  const daysLeft = calendarDaysBetween(today, input.interviewDate);
  const stories = ctx.stories ?? [];
  const todayReview = reviewToday(input, state, ctx.now, tz, stories);
  const remainingOf = (units: PlanUnit[]) =>
    Object.fromEntries(
      PLAN_ROUNDS.map((r) => {
        const open = units.filter((u) => u.round === r && !u.doneAt);
        return [r, input.rounds.includes(r) ? { units: open.length, minutes: open.reduce((s, u) => s + u.minutes, 0) } : null];
      }),
    ) as StudyPlan['remaining'];
  const base = { today, interviewDate: input.interviewDate, daysLeft, todayReview, finishDate: null, minutesToFit: null };
  if (daysLeft <= 0) {
    return { ...base, status: daysLeft === 0 ? 'interview-day' : 'past', days: [], units: [], unscheduled: [], remaining: remainingOf([]) };
  }

  const units = planUnits(input, state, stories).filter((u) => !u.doneAt || dayKey(new Date(u.doneAt), tz) >= today);
  const dates = Array.from({ length: Math.min(daysLeft, PLAN_MAX_DAYS) }, (_, i) => addCalendarDays(today, i));
  const fit = (minutesPerDay: number) =>
    schedule(units, dates, minutesPerDay, Math.min(todayReview.minutes, Math.floor(minutesPerDay * TODAY_REVIEW_CAP)));
  const { days, unscheduled } = fit(input.minutesPerDay);
  const covered = units.every((u) => u.doneAt);
  const status: PlanStatus = covered ? 'covered' : input.minutesPerDay <= 0 ? 'no-time' : unscheduled.length ? 'tight' : 'on-track';
  return {
    ...base,
    status,
    days,
    units,
    unscheduled,
    finishDate: days.filter((d) => d.slices.some((s) => !s.done)).at(-1)?.date ?? null,
    minutesToFit: status === 'tight' || status === 'no-time' ? (PLAN_MINUTES.find((m) => !fit(m).unscheduled.length) ?? null) : null,
    remaining: remainingOf(units),
  };
}

function reviewToday(input: StudyPlanInput, state: ProgressState, now: Date, tz: number, stories: readonly Story[]) {
  const cap = Math.max(0, Math.floor(input.minutesPerDay * TODAY_REVIEW_CAP));
  const session = buildSession(state, { now, tzOffsetMinutes: tz, budgetMinutes: cap });
  const due = input.rounds.includes('behavioral') ? dueStories(stories, now, state.behavioral).length : 0;
  const cardMinutes = session.items.length ? session.estimatedMinutes : 0;
  return { cards: session.items.length, cardMinutes, stories: due, minutes: cardMinutes + due * REHEARSAL_MINUTES };
}

function planUnits(input: StudyPlanInput, state: ProgressState, stories: readonly Story[]): PlanUnit[] {
  const factor = LEVEL_FACTOR[input.level];
  const units: PlanUnit[] = [];
  if (input.rounds.includes('coding')) units.push(...codingUnits(state, input.level, factor));
  if (input.rounds.includes('design')) units.push(...designUnits(state, factor));
  if (input.rounds.includes('behavioral')) units.push(...behavioralUnits(state, stories, factor));
  return units;
}

function codingUnits(state: ProgressState, level: PlanLevel, factor: number): PlanUnit[] {
  const solvedAt = (problemId: string) => state.coding[problemId]?.solvedAt ?? null;
  const flagged: PlanUnit[] = [];
  const rest: PlanUnit[] = [];
  const strong: PlanUnit[] = [];
  for (const pattern of PATTERN_CATALOG) {
    const all = problemsForPattern(pattern.id);
    const problems = [...all.filter((p) => p.patternIds[0] === pattern.id), ...all.filter((p) => p.patternIds[0] !== pattern.id)];
    if (!problems.length) continue;
    const firstSolve = earliest(problems.map((p) => solvedAt(p.id)));
    const placedStrong = state.placement[pattern.id] === 'strong';
    const flaggedAt = state.weakPatterns[pattern.id];
    const unsolved = problems.find((p) => !solvedAt(p.id));
    if (flaggedAt && firstSolve && Date.parse(firstSolve) < Date.parse(flaggedAt)) {
      const retried = problems.find((p) => solvedAt(p.id) && Date.parse(solvedAt(p.id)!) > Date.parse(flaggedAt));
      const target = retried ?? unsolved;
      if (target) {
        flagged.push({
          id: `retry:${pattern.id}`,
          round: 'coding',
          kind: 'retry',
          title: `${pattern.name}, again`,
          detail: `An interview flagged this pattern. Solve ${target.title}, one you have not solved before.`,
          minutes: roundTo5(UNIT_MINUTES.retry * factor),
          flagged: true,
          patternId: pattern.id,
          problemId: target.id,
          doneAt: retried ? solvedAt(retried.id) : null,
        });
      }
      continue;
    }
    if (level === 'confident' && placedStrong && !firstSolve) continue;
    const target = problems.find((p) => solvedAt(p.id) === firstSolve) ?? unsolved ?? problems[0];
    const unit: PlanUnit = {
      id: `pattern:${pattern.id}`,
      round: 'coding',
      kind: 'pattern',
      title: `Learn ${pattern.name}`,
      detail: `${flaggedAt ? 'An interview flagged this pattern. ' : ''}Read the pattern, then solve a problem with it.`,
      minutes: roundTo5(UNIT_MINUTES.pattern * factor),
      flagged: Boolean(flaggedAt),
      patternId: pattern.id,
      problemId: target.id,
      doneAt: firstSolve,
    };
    (flaggedAt ? flagged : placedStrong ? strong : rest).push(unit);
  }
  return [...flagged, ...rest, ...strong];
}

function designUnits(state: ProgressState, factor: number): PlanUnit[] {
  const ordered = [...CASE_CATALOG.filter((c) => c.level === 'core'), ...CASE_CATALOG.filter((c) => c.level !== 'core')];
  return ordered.map((c) => ({
    id: `case:${c.id}`,
    round: 'design',
    kind: 'case',
    title: `${c.title} case study`,
    detail: 'Work through it stage by stage, estimates and trade-offs included.',
    minutes: roundTo5(c.stages * UNIT_MINUTES.caseStage * factor),
    flagged: false,
    caseId: c.id,
    doneAt: state.cases[c.id]?.firstCompletedAt ?? null,
  }));
}

function behavioralUnits(state: ProgressState, stories: readonly Story[], factor: number): PlanUnit[] {
  const told = stories.filter((s) => !s.deleted && isRehearsable(s));
  const units = COMPETENCY_CATALOG.map((c): PlanUnit => {
    const flagged = Boolean(state.behavioral[c.id]?.weakSince);
    return {
      id: `story:${c.id}`,
      round: 'behavioral',
      kind: 'story',
      title: `A story for ${c.name}`,
      detail: `${flagged ? 'An interview flagged this competency. ' : ''}Read what interviewers look for, then write a story in your bank and tag it.`,
      minutes: roundTo5(UNIT_MINUTES.story * factor),
      flagged,
      competencyId: c.id,
      // Stories keep no creation time, so the oldest last change among those covering it stands in for when it was covered.
      doneAt: earliest(told.filter((s) => s.competencyIds.includes(c.id)).map((s) => s.updatedAt)),
    };
  });
  return [...units.filter((u) => u.flagged), ...units.filter((u) => !u.flagged)];
}

/** Fills each day after its review time, taking the next unit from whichever round is furthest behind its share. */
function schedule(units: PlanUnit[], dates: string[], minutesPerDay: number, todayReview: number) {
  const sum = (list: PlanUnit[]) => list.reduce((s, u) => s + u.minutes, 0);
  const ofRound = (r: PlanRound) => units.filter((u) => u.round === r);
  const queues = new Map(PLAN_ROUNDS.map((r) => [r, ofRound(r).filter((u) => !u.doneAt)]));
  // Work finished today counts as placed, so finishing it does not hand its round's share to another round.
  const total = new Map(PLAN_ROUNDS.map((r) => [r, sum(ofRound(r))]));
  const placed = new Map(PLAN_ROUNDS.map((r) => [r, sum(ofRound(r).filter((u) => u.doneAt))]));
  const left = new Map(units.map((u) => [u.id, u.minutes]));
  const next = () =>
    PLAN_ROUNDS.filter((r) => queues.get(r)!.length).sort((a, b) => placed.get(a)! / total.get(a)! - placed.get(b)! / total.get(b)!)[0];
  const taperDay = dates.length >= TAPER_FROM_DAYS ? dates.length - 1 : -1;
  const later = Math.round(Math.max(0, minutesPerDay) * REVIEW_SHARE);

  const days: PlanDay[] = dates.map((date, i) => {
    const day: PlanDay = { date, review: i === 0 ? todayReview : later, slices: [], taper: i === taperDay };
    let free = minutesPerDay - day.review;
    if (i === 0) {
      for (const unit of units.filter((u) => u.doneAt)) {
        day.slices.push({ unit, minutes: unit.minutes, part: 1, parts: 1, done: true });
        free -= unit.minutes;
      }
    }
    while (!day.taper && free > 0) {
      const round = next();
      if (!round) break;
      const unit = queues.get(round)![0];
      const rest = left.get(unit.id)!;
      const take = Math.min(free, rest);
      if (take < rest && take < MIN_SLICE && day.slices.some((s) => !s.done)) break;
      day.slices.push({ unit, minutes: take, part: 0, parts: 0, done: false });
      left.set(unit.id, rest - take);
      placed.set(round, placed.get(round)! + take);
      free -= take;
      if (take === rest) queues.get(round)!.shift();
    }
    return day;
  });

  const pieces = days.flatMap((d) => d.slices.filter((s) => !s.done));
  for (const unit of units) {
    const own = pieces.filter((s) => s.unit === unit);
    own.forEach((s, i) => Object.assign(s, { part: i + 1, parts: own.length }));
  }
  return { days, unscheduled: units.filter((u) => !u.doneAt && left.get(u.id)! > 0) };
}
