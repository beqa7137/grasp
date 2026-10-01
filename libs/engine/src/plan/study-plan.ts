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
const UNIT_MINUTES = { pattern: 40, retry: 20, story: 20, caseStage: 4 };
const LEVEL_FACTOR: Record<PlanLevel, number> = { new: 1, rusty: 0.75, confident: 0.5 };
/** Later days keep this share for reviews, which grow as new material turns into cards. */
const REVIEW_SHARE = 0.2;
/** Today's reviews take at most this share, so new material still moves forward. */
const TODAY_REVIEW_CAP = 0.5;
export const REHEARSAL_MINUTES = 3;
/**
 * A unit is never split into a piece shorter than this unless the piece finishes it, and a day runs over by up to this
 * much to finish a unit rather than leave a short tail for another day.
 */
const MIN_SLICE = 10;
/** Stories saved before creation times were kept count as covered from long ago. */
const BEFORE_CREATION_TIMES = new Date(0).toISOString();

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
  /** The day before the interview, kept for review. */
  taper: boolean;
}

/** 'eve': the interview is tomorrow, so today is review only and nothing new is asked for. */
export type PlanStatus = 'on-track' | 'tight' | 'covered' | 'eve' | 'interview-day' | 'past';

export interface StudyPlan {
  status: PlanStatus;
  today: string;
  interviewDate: string;
  daysLeft: number;
  days: PlanDay[];
  /** What is left to do, in priority order per round, with anything finished today. */
  units: PlanUnit[];
  /** Units with no time at all before the interview; a unit only partly placed is not among them. */
  unscheduled: PlanUnit[];
  /** The last day with new material, or null when there is none. */
  finishDate: string | null;
  /** The smallest offered daily time that fits everything, when the current one does not; null if none does. */
  minutesToFit: number | null;
  /** Cards ready in today's review and story rehearsals due, with the minutes each gets within today's review time. */
  todayReview: { cards: number; cardMinutes: number; stories: number; storyMinutes: number; minutes: number };
  /** Null for a round the interview does not have, and for every round once the interview day has come. */
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
const reviewCap = (minutesPerDay: number) => Math.floor(Math.max(0, minutesPerDay) * TODAY_REVIEW_CAP);

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
  const base = { today, interviewDate: input.interviewDate, daysLeft, todayReview, finishDate: null, minutesToFit: null };
  if (daysLeft <= 0) {
    const remaining = Object.fromEntries(PLAN_ROUNDS.map((r) => [r, null])) as StudyPlan['remaining'];
    return { ...base, status: daysLeft === 0 ? 'interview-day' : 'past', days: [], units: [], unscheduled: [], remaining };
  }

  const units = planUnits(input, state, stories).filter((u) => !u.doneAt || dayKey(new Date(u.doneAt), tz) >= today);
  const dates = Array.from({ length: Math.min(daysLeft, PLAN_MAX_DAYS) }, (_, i) => addCalendarDays(today, i));
  const eve = daysLeft <= PLAN_MAX_DAYS ? dates.length - 1 : -1;
  const fit = (minutesPerDay: number) =>
    schedule(units, dates, eve, minutesPerDay, Math.min(todayReview.minutes, reviewCap(minutesPerDay)));
  const { days, unplaced, incomplete } = fit(input.minutesPerDay);
  const status: PlanStatus = days.every((d) => d.taper)
    ? 'eve'
    : units.every((u) => u.doneAt)
      ? 'covered'
      : incomplete.length
        ? 'tight'
        : 'on-track';
  return {
    ...base,
    status,
    days,
    units,
    unscheduled: unplaced,
    finishDate: days.filter((d) => d.slices.some((s) => !s.done)).at(-1)?.date ?? null,
    minutesToFit: status === 'tight' ? (PLAN_MINUTES.find((m) => !fit(m).incomplete.length) ?? null) : null,
    remaining: Object.fromEntries(
      PLAN_ROUNDS.map((r) => {
        const open = units.filter((u) => u.round === r && !u.doneAt);
        return [r, input.rounds.includes(r) ? { units: open.length, minutes: open.reduce((s, u) => s + u.minutes, 0) } : null];
      }),
    ) as StudyPlan['remaining'],
  };
}

/** Cards first, then story rehearsals, both within today's review time, so the lines the page shows add up to it. */
function reviewToday(input: StudyPlanInput, state: ProgressState, now: Date, tz: number, stories: readonly Story[]) {
  const cap = reviewCap(input.minutesPerDay);
  const session = buildSession(state, { now, tzOffsetMinutes: tz, budgetMinutes: cap });
  const due = input.rounds.includes('behavioral') ? dueStories(stories, now, state.behavioral).length : 0;
  const cardMinutes = Math.min(cap, session.items.length ? session.estimatedMinutes : 0);
  const storyMinutes = Math.min(cap - cardMinutes, due * REHEARSAL_MINUTES);
  return { cards: session.items.length, cardMinutes, stories: due, storyMinutes, minutes: cardMinutes + storyMinutes };
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
    const weak = state.weakPatterns[pattern.id];
    // Of an interview flag and a placement check calling the pattern strong, the newer one wins.
    const flag = weak && !(placedStrong && state.diagnosedAt && Date.parse(state.diagnosedAt) > Date.parse(weak.flaggedAt)) ? weak : null;
    const unsolved = problems.find((p) => !solvedAt(p.id));
    if (flag && firstSolve && Date.parse(firstSolve) < Date.parse(flag.flaggedAt)) {
      const target = unsolved ?? problems[0];
      flagged.push({
        id: `retry:${pattern.id}`,
        round: 'coding',
        kind: 'retry',
        title: `${pattern.name}, again`,
        detail: unsolved
          ? `An interview flagged this pattern. Solve ${target.title}, one you have not solved before.`
          : `An interview flagged this pattern. Solve ${target.title} again, from a blank editor.`,
        minutes: roundTo5(UNIT_MINUTES.retry * factor),
        flagged: true,
        patternId: pattern.id,
        problemId: target.id,
        doneAt: flag.resolvedAt,
      });
      continue;
    }
    if (level === 'confident' && placedStrong && !firstSolve && !flag) continue;
    const target = problems.find((p) => solvedAt(p.id) === firstSolve) ?? unsolved ?? problems[0];
    const unit: PlanUnit = {
      id: `pattern:${pattern.id}`,
      round: 'coding',
      kind: 'pattern',
      title: `Learn ${pattern.name}`,
      detail: `${flag ? 'An interview flagged this pattern. ' : ''}Read the pattern, then solve a problem with it.`,
      minutes: roundTo5(UNIT_MINUTES.pattern * factor),
      flagged: Boolean(flag),
      patternId: pattern.id,
      problemId: target.id,
      doneAt: firstSolve,
    };
    (flag ? flagged : placedStrong ? strong : rest).push(unit);
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
      detail: `${flagged ? 'An interview flagged this competency. ' : ''}Read what interviewers look for, then write a story in your story bank and tag it, or tag a story you already have.`,
      minutes: roundTo5(UNIT_MINUTES.story * factor),
      flagged,
      competencyId: c.id,
      // Creation, not the last change: rehearsing or editing a story must not make what it covered look new today.
      doneAt: earliest(told.filter((s) => s.competencyIds.includes(c.id)).map((s) => s.createdAt ?? BEFORE_CREATION_TIMES)),
    };
  });
  return [...units.filter((u) => u.flagged), ...units.filter((u) => !u.flagged)];
}

/**
 * Fills each day after its review time. A unit split the day before continues first; otherwise a unit that fits whole
 * is taken from whichever round is furthest behind its share, and only when none fits is the next one split.
 */
function schedule(units: PlanUnit[], dates: string[], eve: number, minutesPerDay: number, todayReview: number) {
  const sum = (list: PlanUnit[]) => list.reduce((s, u) => s + u.minutes, 0);
  const ofRound = (r: PlanRound) => units.filter((u) => u.round === r);
  const queues = new Map(PLAN_ROUNDS.map((r) => [r, ofRound(r).filter((u) => !u.doneAt)]));
  // Work finished today counts as placed, so finishing it does not hand its round's share to another round.
  const total = new Map(PLAN_ROUNDS.map((r) => [r, sum(ofRound(r))]));
  const placed = new Map(PLAN_ROUNDS.map((r) => [r, sum(ofRound(r).filter((u) => u.doneAt))]));
  const left = new Map(units.map((u) => [u.id, u.minutes]));
  const later = Math.round((Math.max(0, minutesPerDay) * REVIEW_SHARE) / 5) * 5;
  let split: PlanUnit | null = null;

  const days: PlanDay[] = dates.map((date, i) => {
    const day: PlanDay = { date, review: i === 0 ? todayReview : later, slices: [], taper: i === eve };
    let free = minutesPerDay - day.review;
    const place = (unit: PlanUnit, minutes: number) => {
      day.slices.push({ unit, minutes, part: 0, parts: 0, done: false });
      left.set(unit.id, left.get(unit.id)! - minutes);
      placed.set(unit.round, placed.get(unit.round)! + minutes);
      if (!left.get(unit.id)) queues.get(unit.round)!.shift();
      split = left.get(unit.id) ? unit : null;
      return minutes;
    };
    const whole = (unit: PlanUnit, overrun: boolean) => {
      const rest = left.get(unit.id)!;
      return free > 0 && (rest <= free || (overrun && rest - free <= MIN_SLICE));
    };
    if (i === 0) {
      for (const unit of units.filter((u) => u.doneAt)) {
        day.slices.push({ unit, minutes: unit.minutes, part: 1, parts: 1, done: true });
        free -= unit.minutes;
      }
    }
    if (day.taper) return day;
    if (split) {
      const unit: PlanUnit = split;
      if (whole(unit, true)) free -= place(unit, left.get(unit.id)!);
      else if (free >= MIN_SLICE) free -= place(unit, free);
      if (split) return day;
    }
    while (free > 0) {
      const heads = PLAN_ROUNDS.filter((r) => queues.get(r)!.length)
        .sort((a, b) => placed.get(a)! / total.get(a)! - placed.get(b)! / total.get(b)!)
        .map((r) => queues.get(r)![0]);
      const fits = heads.find((u) => whole(u, free >= MIN_SLICE));
      if (fits) free -= place(fits, left.get(fits.id)!);
      else if (heads.length && free >= MIN_SLICE) free -= place(heads[0], free);
      else break;
    }
    return day;
  });

  const pieces = days.flatMap((d) => d.slices.filter((s) => !s.done));
  for (const unit of units) {
    const own = pieces.filter((s) => s.unit === unit);
    own.forEach((s, i) => Object.assign(s, { part: i + 1, parts: own.length }));
  }
  const open = units.filter((u) => !u.doneAt);
  return {
    days,
    unplaced: open.filter((u) => left.get(u.id) === u.minutes),
    incomplete: open.filter((u) => left.get(u.id)! > 0),
  };
}
