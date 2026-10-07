import { getCompetencySummary } from '../behavioral/catalog.js';
import { isRehearsable } from '../behavioral/rehearsal.js';
import type { Story } from '../behavioral/stories.js';
import { problemsForPattern, type CodingProblemSummary } from '../coding/catalog.js';
import { getPatternSummary } from '../curriculum/catalog.js';
import { getSdTopic } from '../curriculum/sd-topics.js';
import { LOOP_FRESH_DAYS, PLAN_ROUND_TRACK } from '../interview/loop.js';
import { MINUTES, minutesFor } from '../plan/minutes.js';
import { PLAN_ROUNDS, type PlanLevel, type PlanRound } from '../plan/options.js';
import type { PlanUnit, StudyPlan } from '../plan/study-plan.js';
import type { ProgressState } from '../srs/progress.js';
import { CASE_CATALOG } from '../sysdesign/case-catalog.js';
import { getScenarioSummary } from '../sysdesign/scenario-catalog.js';
import { LEVEL_PROFILES, problemsAtBar } from './levels.js';
import { loopReadiness, stretchSkills, type LoopReadiness, type RequiredSkill } from './readiness.js';
import {
  CASE_READY_RULE,
  READY_RULES,
  SKILL_STATES,
  recallShort,
  recallSummary,
  skillStatus,
  solvesReady,
  topicCovered,
  type SkillState,
  type StatusContext,
} from './status.js';

const DAY_MS = 86_400_000;
/** Rule 5 offers a mock once a round scores this much, or the loop this much, with none in LOOP_FRESH_DAYS. */
export const MOCK_ROUND_SCORE = 60;
export const MOCK_LOOP_SCORE = 70;

export type UpNextAction =
  | { kind: 'review' | 'rest' | 'mock-loop' }
  | { kind: 'mock-round'; round: PlanRound }
  | { kind: 'pattern' | 'drill-pattern'; patternId: string }
  | { kind: 'problem'; problemId: string; patternId: string }
  | { kind: 'topic' | 'drill-topic'; topicId: string }
  | { kind: 'mission'; scenarioId: string }
  | { kind: 'case'; caseId: string }
  | { kind: 'competency' | 'write-story'; competencyId: string }
  | { kind: 'rehearse'; storyId: string; competencyId: string }
  | { kind: 'plan-unit'; unit: PlanUnit }
  | { kind: 'device-work'; workId: string };

export interface UpNextCard {
  /** What "Not today" hides until the device's next calendar day. */
  id: string;
  /** The rule of REDESIGN.md 2.3 that chose it. */
  rule: 1 | 2 | 3 | 4 | 5 | 6;
  round: PlanRound | null;
  title: string;
  reason: string;
  minutes: number;
  fromState: SkillState | null;
  toState: SkillState | null;
  action: UpNextAction;
}

/** Unfinished work that only this device holds (drafts, saved designs, the mock loop). Never feeds readiness. */
export interface DeviceWork {
  id: string;
  round: PlanRound;
  /** "Continue URL Shortener" */
  title: string;
  /** "you stopped at stage 3 of 9" */
  detail: string;
  minutes: number;
}

export interface UpNextInput {
  state: ProgressState;
  stories: readonly Story[];
  now: Date;
  /** Today's plan, built with the Target's level, when the learner has one. */
  plan: StudyPlan | null;
  online: boolean;
  /** Newest first. */
  deviceWork?: readonly DeviceWork[];
  /** Card ids hidden with "Not today". */
  hidden?: ReadonlySet<string>;
}

const ROUND_NAMES: Record<PlanRound, string> = { coding: 'Coding', design: 'System design', behavioral: 'Behavioral' };
const STATE_NAMES: Record<SkillState, string> = { new: 'New', learning: 'Learning', practiced: 'Practiced', ready: 'Ready' };
const TIMES = ['', 'once', 'twice', 'three times'];
const up = (state: SkillState): SkillState => SKILL_STATES[Math.min(SKILL_STATES.indexOf(state) + 1, SKILL_STATES.length - 1)];

/** Rounds by how much readiness they hold back: the largest count × (100 − score) first. */
export function roundsByWeakness(readiness: LoopReadiness): PlanRound[] {
  const gap = (round: PlanRound) => {
    const r = readiness.rounds.find((x) => x.round === round)!;
    return r.count * (100 - r.score);
  };
  return readiness.rounds.map((r) => r.round).sort((a, b) => gap(b) - gap(a) || PLAN_ROUNDS.indexOf(a) - PLAN_ROUNDS.indexOf(b));
}

/**
 * The one thing to do next: the first rule of REDESIGN.md 2.3 that yields a card wins, and a rule tries the rounds from
 * the weakest before the next rule runs. With `only`, it looks at that round alone (the "Other rounds" list).
 */
export function upNext(input: UpNextInput, only?: PlanRound): UpNextCard | null {
  const { state, stories, now } = input;
  const hidden = input.hidden ?? new Set<string>();
  const readiness = loopReadiness(state, stories, now);
  const profile = LEVEL_PROFILES[readiness.target.level];
  const ctx: StepContext = { state, stories, now, profile, pace: state.plan?.level ?? 'new' };
  const rounds = roundsByWeakness(readiness).filter((r) => !only || r === only);
  const visible = (card: UpNextCard | null) => (card && !hidden.has(card.id) ? card : null);
  const firstInRounds = (rule: (round: PlanRound) => UpNextCard | null) => {
    for (const round of rounds) {
      const card = visible(rule(round));
      if (card) return card;
    }
    return null;
  };

  return (
    (only ? null : visible(interviewNear(input.plan))) ??
    planSlice(input.plan, hidden, only) ??
    firstInRounds((round) => flagged(round, ctx, hidden)) ??
    firstInRounds((round) => deviceWork(round, input.deviceWork ?? [], hidden)) ??
    (input.online ? mock(readiness, rounds, state, now, hidden, only) : null) ??
    firstInRounds((round) => lowestSkill(round, readiness.rounds.find((r) => r.round === round)!.skills, readiness, ctx, hidden)) ??
    firstInRounds((round) => {
      const stretch = stretchSkills(round, profile).map((s) => ({ ...s, state: skillStatus(s.kind, s.id, ctx).state }));
      return lowestSkill(round, stretch, readiness, ctx, hidden);
    }) ??
    (only ? null : visible(fullLoop('Every required skill in your loop is Ready. Rehearse the whole loop.', readiness)))
  );
}

function interviewNear(plan: StudyPlan | null): UpNextCard | null {
  if (!plan || (plan.status !== 'eve' && plan.status !== 'interview-day' && !(plan.daysLeft >= 0 && plan.daysLeft <= 1))) return null;
  const card = { rule: 1 as const, round: null, fromState: null, toState: null };
  return plan.daysLeft === 0
    ? { ...card, id: 'rest', title: 'Rest. Nothing new today.', reason: 'Your interview is today.', minutes: 0, action: { kind: 'rest' } }
    : {
        ...card,
        id: 'review',
        title: 'Interview tomorrow: review only',
        reason: 'Nothing new the day before. A short review keeps what you know fresh.',
        minutes: plan.todayReview.minutes,
        action: { kind: 'review' },
      };
}

function planSlice(plan: StudyPlan | null, hidden: ReadonlySet<string>, only?: PlanRound): UpNextCard | null {
  const slices = plan?.days[0]?.slices ?? [];
  const index = slices.findIndex((s) => !s.done && !hidden.has(`plan:${s.unit.id}`) && (!only || s.unit.round === only));
  if (index < 0) return null;
  const { unit, minutes } = slices[index];
  return {
    id: `plan:${unit.id}`,
    rule: 2,
    round: unit.round,
    title: unit.title,
    reason: `From your plan · ${index + 1} of ${slices.length} today`,
    minutes,
    fromState: null,
    toState: null,
    action: { kind: 'plan-unit', unit },
  };
}

const solved = (state: ProgressState, problem: CodingProblemSummary) => Boolean(state.coding[problem.id]?.solvedAt);

/** The flagged ids not hidden today, newest flag first. */
function newestFlags(flags: [id: string, since: string | null][], hidden: ReadonlySet<string>): string[] {
  return flags
    .filter((f): f is [string, string] => f[1] !== null && !hidden.has(`flag:${f[0]}`))
    .sort((a, b) => b[1].localeCompare(a[1]))
    .map(([id]) => id);
}

function flagged(round: PlanRound, ctx: StepContext, hidden: ReadonlySet<string>): UpNextCard | null {
  const { state, stories, profile } = ctx;
  if (round === 'coding') {
    const [patternId] = newestFlags(
      Object.entries(state.weakPatterns).map(([id, f]) => [id, f.resolvedAt ? null : f.flaggedAt]),
      hidden,
    );
    if (patternId) {
      const atBar = problemsAtBar(patternId, profile.bar);
      const problem = atBar.find((p) => !solved(state, p)) ?? problemsForPattern(patternId).find((p) => !solved(state, p)) ?? atBar[0];
      const name = getPatternSummary(patternId)?.name ?? patternId;
      const from = skillStatus('pattern', patternId, ctx).state;
      return {
        id: `flag:${patternId}`,
        rule: 3,
        round,
        title: `Solve ${problem.title}`,
        reason: `An interview flagged ${name}. A fresh solve clears the flag.`,
        minutes: minutesFor({ kind: 'retry', difficulty: problem.difficulty }, ctx.pace),
        fromState: from,
        toState: up(from),
        action: { kind: 'problem', problemId: problem.id, patternId },
      };
    }
  }
  if (round === 'behavioral') {
    const [competencyId] = newestFlags(
      Object.entries(state.behavioral).map(([id, c]) => [id, c.weakSince]),
      hidden,
    );
    if (competencyId) {
      const name = getCompetencySummary(competencyId)?.name ?? competencyId;
      const from = skillStatus('competency', competencyId, ctx).state;
      return {
        ...storyCard(competencyId, stories, `An interview flagged ${name}.`, ctx.pace),
        id: `flag:${competencyId}`,
        rule: 3,
        round,
        fromState: from,
        toState: up(from),
      };
    }
  }
  return null;
}

/** Rehearse the competency's story when one can be told, else write one. */
function storyCard(competencyId: string, stories: readonly Story[], why: string, pace: PlanLevel) {
  const name = getCompetencySummary(competencyId)?.name ?? competencyId;
  const story = stories.find((s) => !s.deleted && s.competencyIds.includes(competencyId) && isRehearsable(s));
  return story
    ? {
        title: `Rehearse your story for ${name}`,
        reason: `${why} Telling your story out loud makes it stick.`,
        minutes: MINUTES.rehearsal,
        action: { kind: 'rehearse', storyId: story.id, competencyId } as UpNextAction,
      }
    : {
        title: `Write a story for ${name}`,
        reason: `${why} A story you can tell covers it.`,
        minutes: minutesFor({ kind: 'story' }, pace),
        action: { kind: 'write-story', competencyId } as UpNextAction,
      };
}

function deviceWork(round: PlanRound, work: readonly DeviceWork[], hidden: ReadonlySet<string>): UpNextCard | null {
  const w = work.find((x) => x.round === round && !hidden.has(x.id));
  if (!w) return null;
  return {
    id: w.id,
    rule: 4,
    round,
    title: w.title,
    reason: w.detail ? `${w.detail[0].toUpperCase()}${w.detail.slice(1)}. Saved on this device.` : 'Saved on this device.',
    minutes: w.minutes,
    fromState: null,
    toState: null,
    action: { kind: 'device-work', workId: w.id },
  };
}

function mock(
  readiness: LoopReadiness,
  rounds: PlanRound[],
  state: ProgressState,
  now: Date,
  hidden: ReadonlySet<string>,
  only?: PlanRound,
): UpNextCard | null {
  const stale = (at: string | undefined) => !at || now.getTime() - Date.parse(at) > LOOP_FRESH_DAYS * DAY_MS;
  if (!only && readiness.score >= MOCK_LOOP_SCORE && stale(state.mockLoop?.completedAt) && !hidden.has('mock:loop'))
    return fullLoop(`Your loop coverage is ${readiness.score} and you have not run a mock loop in ${LOOP_FRESH_DAYS} days.`, readiness);
  for (const round of rounds) {
    const r = readiness.rounds.find((x) => x.round === round)!;
    const track = PLAN_ROUND_TRACK[round];
    if (r.score < MOCK_ROUND_SCORE || !stale(state.interviews.byTrack[track]?.at) || hidden.has(`mock:${round}`)) continue;
    const minutes = MINUTES.mockRound[track];
    return {
      id: `mock:${round}`,
      rule: 5,
      round,
      title: `${ROUND_NAMES[round]} mock round, ${minutes} min`,
      reason: `${ROUND_NAMES[round]} coverage is ${r.score} and you have not had a mock round of it in ${LOOP_FRESH_DAYS} days.`,
      minutes,
      fromState: null,
      toState: null,
      action: { kind: 'mock-round', round },
    };
  }
  return null;
}

function fullLoop(reason: string, readiness: LoopReadiness): UpNextCard {
  return {
    id: 'mock:loop',
    rule: 5,
    round: null,
    title: 'Full mock loop',
    reason,
    minutes: readiness.rounds.reduce((sum, r) => sum + MINUTES.mockRound[PLAN_ROUND_TRACK[r.round]], 0),
    fromState: null,
    toState: null,
    action: { kind: 'mock-loop' },
  };
}

/** Rule 6: the skill in the lowest state, with the action that moves it up one state. */
function lowestSkill(
  round: PlanRound,
  skills: readonly (RequiredSkill & { state: SkillState })[],
  readiness: LoopReadiness,
  ctx: StepContext,
  hidden: ReadonlySet<string>,
): UpNextCard | null {
  const rank = (s: SkillState) => SKILL_STATES.indexOf(s);
  const ranked = skills
    .filter((s) => s.state !== 'ready' && !hidden.has(`${s.kind}:${s.id}`))
    .sort((a, b) => rank(a.state) - rank(b.state));
  const count = readiness.rounds.find((r) => r.round === round)?.count ?? 0;
  for (const skill of ranked) {
    const step = nextStep(skill, ctx);
    if (!step) continue;
    const toState = up(skill.state);
    // A round counted once is the plain case; only a heavier weight is worth a mention.
    const why =
      count >= 2
        ? `${ROUND_NAMES[round]} counts ${TIMES[count]} in your loop and ${step.name} is ${STATE_NAMES[skill.state]}.`
        : `${step.name} is ${STATE_NAMES[skill.state]}.`;
    return {
      id: `${skill.kind}:${skill.id}`,
      rule: 6,
      round,
      title: step.title,
      reason: `${why} ${step.effect.replace('{state}', STATE_NAMES[toState])}`,
      minutes: step.minutes,
      fromState: skill.state,
      toState,
      action: step.action,
    };
  }
  return null;
}

/** What the steps read: the learner's state, plus the pace their plan's starting point sets for minutes. */
interface StepContext extends StatusContext {
  pace: PlanLevel;
}

interface Step {
  name: string;
  title: string;
  /** What doing it achieves; `{state}` becomes the state it leads to. */
  effect: string;
  minutes: number;
  action: UpNextAction;
}

function nextStep(skill: RequiredSkill & { state: SkillState }, ctx: StepContext): Step | null {
  switch (skill.kind) {
    case 'pattern':
      return patternStep(skill.id, skill.state, ctx);
    case 'topic':
      return topicStep(skill.id, skill.state, ctx);
    case 'case': {
      const c = CASE_CATALOG.find((x) => x.id === skill.id);
      if (!c) return null;
      const redo = skill.state === 'practiced';
      return {
        name: c.title,
        title: `${redo ? 'Redo' : 'Work through'} ${c.title}`,
        effect: redo ? `Ready needs ${CASE_READY_RULE[0].toLowerCase()}${CASE_READY_RULE.slice(1)}` : 'Finishing it makes it {state}.',
        minutes: minutesFor({ kind: 'case', stages: c.stages }, ctx.pace),
        action: { kind: 'case', caseId: c.id },
      };
    }
    case 'competency': {
      const name = getCompetencySummary(skill.id)?.name ?? skill.id;
      if (skill.state === 'new')
        return {
          name,
          title: `Read the ${name} guide`,
          effect: 'Knowing what interviewers look for makes it {state}.',
          minutes: minutesFor({ kind: 'lesson' }, ctx.pace),
          action: { kind: 'competency', competencyId: skill.id },
        };
      const card = storyCard(skill.id, ctx.stories, '', ctx.pace);
      return { name, ...card, effect: card.reason.trim() };
    }
  }
}

/** Copy for a step whose skill would reach Ready only if its recall check also holds. */
const towardReady = (done: string, short: number) =>
  short
    ? `${done} brings it closer to Ready: ${short} more of its review cards must also pass your recall target.`
    : `${done} makes it {state}.`;

function patternStep(id: string, state: SkillState, ctx: StepContext): Step | null {
  const { state: progress, profile, now, pace } = ctx;
  const name = getPatternSummary(id)?.name ?? id;
  if (state === 'new')
    return {
      name,
      title: `Learn ${name}`,
      effect: 'Its lesson makes it {state}.',
      minutes: minutesFor({ kind: 'lesson' }, pace),
      action: { kind: 'pattern', patternId: id },
    };
  const solve = (problem: CodingProblemSummary, effect: string): Step => ({
    name,
    title: `Solve ${problem.title}`,
    effect,
    minutes: minutesFor({ kind: 'problem', difficulty: problem.difficulty }, pace),
    action: { kind: 'problem', problemId: problem.id, patternId: id },
  });
  if (state === 'learning') {
    const start = problemsAtBar(id, pace === 'new' ? profile.startBar : profile.bar).find((p) => !solved(progress, p));
    return start ? solve(start, `One ${start.difficulty} solve makes it {state}.`) : null;
  }
  const short = recallShort(recallSummary(id, progress, now), READY_RULES.patternPassing);
  if (!solvesReady(id, progress, profile)) {
    const problem = problemsAtBar(id, profile.bar).find((p) => !solved(progress, p));
    return problem ? solve(problem, towardReady(`A ${problem.difficulty} solve on another day`, short)) : null;
  }
  return {
    name,
    title: `Drill: ${name}`,
    effect: `It needs ${short} more of its review cards above your recall target to be Ready. Your reviews bring them; a drill keeps them fresh.`,
    minutes: minutesFor({ kind: 'drill' }, pace),
    action: { kind: 'drill-pattern', patternId: id },
  };
}

function topicStep(id: string, state: SkillState, ctx: StepContext): Step | null {
  const { state: progress, profile, now, pace } = ctx;
  const topic = getSdTopic(id);
  if (!topic) return null;
  const name = topic.name;
  if (state === 'new')
    return {
      name,
      title: `Learn ${name}`,
      effect: 'Its lesson makes it {state}.',
      minutes: minutesFor({ kind: 'lesson' }, pace),
      action: { kind: 'topic', topicId: id },
    };
  const short = recallShort(recallSummary(id, progress, now), READY_RULES.topicPassing);
  if (!topicCovered(id, progress)) {
    // Covering a Learning topic makes it Practiced; a Practiced one becomes Ready only once its recall check holds too.
    const covers = (what: string) =>
      state === 'learning' || !short
        ? `${what} covers it and makes it {state}.`
        : `${what} covers it, which brings it closer to Ready: ${short} more of its review cards must also pass your recall target.`;
    const mission = topic.scenarioIds.find((m) => !progress.missions[m]);
    if (mission)
      return {
        name,
        title: `Build ${getScenarioSummary(mission)?.title ?? mission} in the Lab`,
        effect: covers('A passing build'),
        minutes: minutesFor({ kind: 'mission' }, pace),
        action: { kind: 'mission', scenarioId: mission },
      };
    const c = CASE_CATALOG.find((x) => profile.cases.required.includes(x.id) && x.topics.includes(id) && !progress.cases[x.id]);
    if (!c) return null;
    return {
      name,
      title: `Work through ${c.title}`,
      effect: covers('Finishing the case'),
      minutes: minutesFor({ kind: 'case', stages: c.stages }, pace),
      action: { kind: 'case', caseId: c.id },
    };
  }
  return {
    name,
    title: `Drill: ${name}`,
    effect: `It needs ${short} more of its review cards above your recall target to be Ready. Your reviews bring them; a drill keeps them fresh.`,
    minutes: minutesFor({ kind: 'drill' }, pace),
    action: { kind: 'drill-topic', topicId: id },
  };
}
