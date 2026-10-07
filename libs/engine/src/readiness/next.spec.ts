import { describe, expect, it } from 'vitest';
import type { Story } from '../behavioral/stories.js';
import { addCalendarDays, type StudyPlanInput } from '../plan/options.js';
import { buildStudyPlan } from '../plan/study-plan.js';
import { itemsForTopic } from '../review/catalog.js';
import type { LearningEvent } from '../srs/events.js';
import { replay } from '../srs/progress.js';
import { LEVEL_PROFILES, problemsAtBar } from './levels.js';
import { loopReadiness } from './readiness.js';
import { roundsByWeakness, upNext, type DeviceWork, type UpNextInput } from './next.js';
import { READY_RULES } from './status.js';

const now = new Date('2026-09-10T09:00:00.000Z');
const t0 = now.getTime() - 3_600_000;
let seq = 0;
type Body = LearningEvent extends infer E ? (E extends unknown ? Omit<E, 'id' | 'at'> : never) : never;
const ev = (body: Body, ms = t0) => ({ id: `next-${++seq}`, at: new Date(ms).toISOString(), ...body }) as LearningEvent;
const input = (events: LearningEvent[], extra: Partial<UpNextInput> = {}): UpNextInput => ({
  state: replay(events),
  stories: [],
  now,
  plan: null,
  online: false,
  ...extra,
});
const solve = (problemId: string, ms = t0) => ev({ type: 'code.submitted', problemId, language: 'python', passed: 3, total: 3 }, ms);
const DAY = 86_400_000;
const readyPattern = (patternId: string) => [
  solve(problemsAtBar(patternId, 'medium')[0].id, t0 - 2 * DAY),
  solve(problemsAtBar(patternId, 'medium')[1].id, t0 - DAY),
  ...itemsForTopic(patternId)
    .filter((i) => i.kind !== 'predict')
    .slice(0, READY_RULES.patternPassing)
    .map((i, k) => ev({ type: 'review.graded', itemId: i.id, rating: 3, correct: true, durationMs: 9000 }, t0 + 1000 + k)),
];
const work = (round: DeviceWork['round'], id: string): DeviceWork => ({
  id,
  round,
  title: `Continue ${id}`,
  detail: 'you stopped at stage 3 of 9',
  minutes: 20,
});

describe('Up next', () => {
  it('starts a fresh learner on the weakest round: Coding counts twice', () => {
    const card = upNext(input([]))!;
    expect(card).toMatchObject({
      rule: 6,
      round: 'coding',
      id: 'pattern:hashing',
      title: 'Learn Arrays & Hashing',
      fromState: 'new',
      toState: 'learning',
      action: { kind: 'pattern', patternId: 'hashing' },
    });
    expect(card.reason).toBe('Coding counts twice in your loop and Arrays & Hashing is New. Its lesson makes it Learning.');
  });

  it('orders rounds by count × (100 − score)', () => {
    const r = loopReadiness(replay([]), [], now);
    expect(roundsByWeakness(r)).toEqual(['coding', 'design', 'behavioral']);
  });

  describe('rule 1: the interview is close', () => {
    const plan = (daysAhead: number) => {
      const p: StudyPlanInput = {
        interviewDate: addCalendarDays('2026-09-10', daysAhead),
        minutesPerDay: 45,
        rounds: ['coding'],
        level: 'new',
      };
      return buildStudyPlan(p, replay([]), { now });
    };

    it('points at Review the day before, and says rest on the day', () => {
      expect(upNext(input([], { plan: plan(1) }))).toMatchObject({
        rule: 1,
        id: 'review',
        title: 'Interview tomorrow: review only',
        action: { kind: 'review' },
      });
      expect(upNext(input([], { plan: plan(0) }))).toMatchObject({ rule: 1, id: 'rest', title: 'Rest. Nothing new today.' });
    });

    it('stays out of the way with more days left', () => {
      expect(upNext(input([], { plan: plan(10) }))!.rule).toBe(2);
    });
  });

  describe('rule 2: the plan', () => {
    const plan = buildStudyPlan(
      { interviewDate: '2026-10-03', minutesPerDay: 120, rounds: ['coding', 'design', 'behavioral'], level: 'confident' },
      replay([]),
      { now, target: { level: 'mid', rounds: { coding: 2, design: 1, behavioral: 1 } } },
    );
    const today = plan.days[0].slices;

    it('offers the first undone slice of today, with its place in the list', () => {
      expect(today.length).toBeGreaterThan(2);
      expect(upNext(input([], { plan }))).toMatchObject({
        rule: 2,
        id: `plan:${today[0].unit.id}`,
        title: today[0].unit.title,
        reason: `From your plan · 1 of ${today.length} today`,
        minutes: today[0].minutes,
      });
    });

    it('skips a slice hidden for today, leaving it in the plan', () => {
      const card = upNext(input([], { plan, hidden: new Set([`plan:${today[0].unit.id}`]) }))!;
      expect(card).toMatchObject({ id: `plan:${today[1].unit.id}`, reason: `From your plan · 2 of ${today.length} today` });
      expect(plan.days[0].slices[0].done).toBe(false);
    });
  });

  describe('rule 3: an unresolved flag', () => {
    it('asks for a fresh solve at the level bar of the newest flagged pattern', () => {
      const flag = ev({ type: 'interview.scored', sessionId: 's', track: 'coding', verdict: 'no-hire', weakPatterns: ['binary-search'] });
      const card = upNext(input([flag]))!;
      expect(card).toMatchObject({
        rule: 3,
        id: 'flag:binary-search',
        round: 'coding',
        action: { kind: 'problem', patternId: 'binary-search' },
      });
      const problem = problemsAtBar('binary-search', 'medium')[0];
      expect(card.title).toBe(`Solve ${problem.title}`);
    });

    it('asks for a story for a flagged competency, or a rehearsal once one can be told', () => {
      const flag = ev({
        type: 'interview.scored',
        sessionId: 'b',
        track: 'behavioral',
        verdict: 'no-hire',
        weakPatterns: [],
        competencyId: 'conflict',
        weakCompetencies: ['conflict'],
      });
      const behavioralOnly = ev({ type: 'target.set', target: { level: 'mid', rounds: { coding: 0, design: 0, behavioral: 1 } } });
      expect(upNext(input([behavioralOnly, flag]))).toMatchObject({ rule: 3, title: 'Write a story for Conflict & Disagreement' });
      const story: Story = {
        id: 'st',
        title: 'Disagreement',
        competencyIds: ['conflict'],
        draft: { situation: 'S', task: '', action: '', result: '', reflection: '' },
        updatedAt: new Date(t0).toISOString(),
      };
      expect(upNext({ ...input([behavioralOnly, flag]), stories: [story] })).toMatchObject({
        rule: 3,
        title: 'Rehearse your story for Conflict & Disagreement',
        action: { kind: 'rehearse', storyId: 'st' },
      });
    });
  });

  describe('rule 4: work saved on this device', () => {
    it('continues it, trying the next weakest round when the weakest has none', () => {
      const card = upNext(input([], { deviceWork: [work('design', 'case:url-shortener')] }))!;
      expect(card).toMatchObject({
        rule: 4,
        round: 'design',
        id: 'case:url-shortener',
        reason: 'You stopped at stage 3 of 9. Saved on this device.',
      });
      expect(upNext(input([], { deviceWork: [work('design', 'a'), work('coding', 'b')] }))!.id).toBe('b');
      expect(upNext(input([], { deviceWork: [{ ...work('coding', 'c'), detail: '' }] }))!.reason).toBe('Saved on this device.');
    });
  });

  describe('rule 5: a mock', () => {
    const codingOnly = ev({ type: 'target.set', target: { level: 'early', rounds: { coding: 1, design: 0, behavioral: 0 } } });
    const strong = LEVEL_PROFILES.early.patterns.required.slice(0, 9).flatMap((p) => readyPattern(p));

    it('offers a mock round of a round at 60 or more, online only, until one is fresh', () => {
      expect(upNext(input([codingOnly, ...strong], { online: true }))!.reason).toMatch(/^Coding coverage is \d+/);
      expect(upNext(input([codingOnly, ...strong], { online: true }))).toMatchObject({
        rule: 5,
        id: 'mock:coding',
        title: 'Coding mock round, 45 min',
      });
      expect(upNext(input([codingOnly, ...strong]))!.rule).toBe(6);
      const recent = ev(
        { type: 'interview.scored', sessionId: 'm', track: 'coding', verdict: 'lean-hire', weakPatterns: [] },
        now.getTime() - 3 * 86_400_000,
      );
      expect(upNext(input([codingOnly, ...strong, recent], { online: true }))!.rule).toBe(6);
    });

    it('offers the full loop at 70 or more, and a stretch skill once every required one is Ready', () => {
      const all = LEVEL_PROFILES.early.patterns.required.flatMap((p) => readyPattern(p));
      expect(upNext(input([codingOnly, ...all], { online: true }))).toMatchObject({ rule: 5, id: 'mock:loop', title: 'Full mock loop' });
      expect(upNext(input([codingOnly, ...all]))).toMatchObject({ rule: 6, id: 'pattern:topo-sort', title: 'Learn Topological Sort' });
    });
  });

  describe('rule 6: the lowest required skill, one state up', () => {
    it('solves the easiest unsolved member at the bar for a Learning pattern', () => {
      const learning = LEVEL_PROFILES.mid.patterns.required.map((p) =>
        ev({ type: 'predict.answered', algorithmId: 'binary-search', patternId: p, correct: true }),
      );
      const card = upNext(input(learning))!;
      const problem = problemsAtBar('hashing', 'medium')[0];
      expect(card).toMatchObject({ rule: 6, fromState: 'learning', toState: 'practiced', title: `Solve ${problem.title}`, minutes: 35 });
      expect(card.reason).toBe('Coding counts twice in your loop and Arrays & Hashing is Learning. One medium solve makes it Practiced.');
    });

    it('asks for a second solve on another day, never promising Ready while the recall check falls short', () => {
      const codingOnly = ev({ type: 'target.set', target: { level: 'mid', rounds: { coding: 1, design: 0, behavioral: 0 } } });
      const practiced = LEVEL_PROFILES.mid.patterns.required.map((p) => solve(problemsAtBar(p, 'medium')[0].id));
      const card = upNext(input([codingOnly, ...practiced]))!;
      expect(card).toMatchObject({
        title: `Solve ${problemsAtBar('hashing', 'medium')[1].title}`,
        fromState: 'practiced',
        toState: 'ready',
      });
      expect(card.reason).toBe(
        'Arrays & Hashing is Practiced. A medium solve on another day brings it closer to Ready: 3 more of its review cards must also pass your recall target.',
      );
    });

    it('drills a pattern whose solves are done, naming the review cards it still needs', () => {
      const codingOnly = ev({ type: 'target.set', target: { level: 'mid', rounds: { coding: 1, design: 0, behavioral: 0 } } });
      const solves = LEVEL_PROFILES.mid.patterns.required.flatMap((p) => readyPattern(p).slice(0, 2));
      const card = upNext(input([codingOnly, ...solves]))!;
      expect(card).toMatchObject({ title: 'Drill: Arrays & Hashing', fromState: 'practiced', toState: 'ready' });
      expect(card.reason).toContain('It needs 3 more of its review cards above your recall target to be Ready.');
    });

    it('sends a Learning topic to the first unfinished mission that lists it', () => {
      const designOnly = ev({ type: 'target.set', target: { level: 'mid', rounds: { coding: 0, design: 1, behavioral: 0 } } });
      const introduced = LEVEL_PROFILES.mid.topics.required.map((t) =>
        ev({ type: 'practice.answered', itemId: itemsForTopic(t)[0].id, correct: true, durationMs: 5000 }),
      );
      expect(upNext(input([designOnly, ...introduced]))).toMatchObject({ title: 'Work through URL Shortener', fromState: 'new' });
      const casesHidden = new Set(LEVEL_PROFILES.mid.cases.required.map((id) => `case:${id}`));
      expect(upNext(input([designOnly, ...introduced], { hidden: casesHidden }))).toMatchObject({
        round: 'design',
        title: 'Build Your First Scale-Up in the Lab',
        action: { kind: 'mission', scenarioId: 'first-scale-up' },
      });
    });

    it('hides a skill with Not today and offers the next one', () => {
      expect(upNext(input([], { hidden: new Set(['pattern:hashing']) }))!.id).toBe('pattern:two-pointers');
    });

    it('looks at one round alone for the other-rounds list', () => {
      expect(upNext(input([]), 'behavioral')).toMatchObject({ round: 'behavioral', title: 'Read the Ownership guide' });
      expect(upNext(input([]), 'design')).toMatchObject({ round: 'design', title: 'Learn Latency & Queueing' });
    });
  });
});
