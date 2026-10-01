import { describe, expect, it } from 'vitest';
import { COMPETENCY_CATALOG } from '../behavioral/catalog.js';
import { EMPTY_STAR_DRAFT } from '../behavioral/star-check.js';
import type { Story } from '../behavioral/stories.js';
import { CODING_CATALOG } from '../coding/catalog.js';
import { PATTERN_CATALOG } from '../curriculum/catalog.js';
import type { StoredEvent } from '../srs/events.js';
import { emptyProgress, replay, type ProgressState } from '../srs/progress.js';
import { CASE_CATALOG } from '../sysdesign/case-catalog.js';
import { PLAN_MAX_DAYS, PLAN_MINUTES, normalizePlan, type StudyPlanInput } from './options.js';
import { buildStudyPlan, type StudyPlan } from './study-plan.js';

const DAY = 86_400_000;
const now = new Date('2026-10-01T09:00:00Z');
let seq = 0;
const id = () => `evt-${String(++seq).padStart(7, '0')}`;
const at = (ms: number) => new Date(ms).toISOString();

const input = (change: Partial<StudyPlanInput> = {}): StudyPlanInput => ({
  interviewDate: '2026-10-15',
  minutesPerDay: 60,
  rounds: ['coding', 'design', 'behavioral'],
  level: 'new',
  ...change,
});
const solved = (problemId: string, when: number): StoredEvent => ({
  id: id(),
  at: at(when),
  type: 'code.submitted',
  problemId,
  language: 'javascript',
  passed: 3,
  total: 3,
});
const caseDone = (caseId: string, when: number): StoredEvent => ({
  id: id(),
  at: at(when),
  type: 'case.completed',
  caseId,
  topics: [...CASE_CATALOG.find((c) => c.id === caseId)!.topics],
  bestChoices: 1,
  decisions: 1,
  closeEstimates: 1,
  estimates: 1,
});
const story = (competencyIds: string[], updatedAt = '2026-09-01T00:00:00.000Z', storyId = competencyIds.join('+')): Story => ({
  id: storyId,
  title: storyId,
  competencyIds,
  draft: { ...EMPTY_STAR_DRAFT, action: 'I did it.' },
  updatedAt,
  rehearsal: { step: 4, told: 5, due: '2027-01-01T00:00:00.000Z' },
});
const everything = (): { state: ProgressState; stories: Story[] } => {
  const events = [
    ...PATTERN_CATALOG.map((p) => solved(CODING_CATALOG.find((c) => c.patternIds.includes(p.id))!.id, now.getTime() - 10 * DAY)),
    ...CASE_CATALOG.map((c) => caseDone(c.id, now.getTime() - 10 * DAY)),
  ];
  return {
    state: replay(events),
    stories: [story(COMPETENCY_CATALOG.map((c) => c.id).slice(0, 3)), ...COMPETENCY_CATALOG.map((c) => story([c.id]))],
  };
};

const plan = (change: Partial<StudyPlanInput> = {}, state = emptyProgress(), opts: { stories?: Story[]; tz?: number; now?: Date } = {}) =>
  buildStudyPlan(input(change), state, { now: opts.now ?? now, tzOffsetMinutes: opts.tz ?? 0, stories: opts.stories ?? [] });

const learning = (p: StudyPlan, day = 0) => p.days[day].slices.reduce((s, x) => s + x.minutes, 0);
const scheduledIds = (p: StudyPlan) => new Set(p.days.flatMap((d) => d.slices.map((s) => s.unit.id)));

describe('study plan dates', () => {
  it('plans every day from today up to the day before the interview, in the learner’s calendar', () => {
    const p = plan();
    expect(p.today).toBe('2026-10-01');
    expect(p.daysLeft).toBe(14);
    expect(p.days.map((d) => d.date)).toEqual(Array.from({ length: 14 }, (_, i) => `2026-10-${String(i + 1).padStart(2, '0')}`));
  });

  it('uses the local day, not the UTC day, at either side of midnight', () => {
    const lateUtc = new Date('2026-10-01T03:30:00Z');
    expect(plan({}, emptyProgress(), { now: lateUtc, tz: 420 }).today).toBe('2026-09-30');
    expect(plan({}, emptyProgress(), { now: lateUtc, tz: 420 }).daysLeft).toBe(15);
    expect(plan({}, emptyProgress(), { now: lateUtc, tz: -540 }).today).toBe('2026-10-01');
    expect(plan({}, emptyProgress(), { now: new Date('2026-10-01T23:30:00Z'), tz: -60 }).today).toBe('2026-10-02');
  });

  it('counts calendar days across a daylight saving change, whichever offset the clock reports', () => {
    const before = plan({ interviewDate: '2026-03-09' }, emptyProgress(), { now: new Date('2026-03-07T15:00:00Z'), tz: 300 });
    expect(before.daysLeft).toBe(2);
    expect(before.days.map((d) => d.date)).toEqual(['2026-03-07', '2026-03-08']);
    const after = plan({ interviewDate: '2026-03-09' }, emptyProgress(), { now: new Date('2026-03-08T04:30:00Z'), tz: 240 });
    expect(after.today).toBe('2026-03-08');
    expect(after.days.map((d) => d.date)).toEqual(['2026-03-08']);
    const fall = plan({ interviewDate: '2026-11-02' }, emptyProgress(), { now: new Date('2026-10-31T23:59:00Z'), tz: 240 });
    expect(fall.days.map((d) => d.date)).toEqual(['2026-10-31', '2026-11-01']);
  });

  it('an interview tomorrow leaves today as the one study day, used in full', () => {
    const p = plan({ interviewDate: '2026-10-02' });
    expect(p.daysLeft).toBe(1);
    expect(p.days).toHaveLength(1);
    expect(p.days[0].taper).toBe(false);
    expect(p.days[0].review).toBeGreaterThan(0);
    expect(learning(p) + p.days[0].review).toBe(60);
    expect(p.status).toBe('tight');
  });

  it('an interview a year away fits everything, ends new work well before and keeps the last day for review', () => {
    const p = plan({ interviewDate: '2027-10-01' });
    expect(p.days).toHaveLength(365);
    expect(p.status).toBe('on-track');
    expect(p.unscheduled).toEqual([]);
    expect(p.finishDate! < '2027-03-01').toBe(true);
    expect(p.days.at(-1)!.taper).toBe(true);
    expect(p.days.at(-1)!.slices).toEqual([]);
  });

  it('never plans more than a year of days, even for a date further out', () => {
    expect(plan({ interviewDate: '2031-01-01' }).days).toHaveLength(PLAN_MAX_DAYS);
  });

  it('on the day itself plans no study, and after it says the date has passed', () => {
    const today = plan({ interviewDate: '2026-10-01' });
    expect(today.status).toBe('interview-day');
    expect(today.days).toEqual([]);
    const past = plan({ interviewDate: '2026-09-20' });
    expect(past.status).toBe('past');
    expect(past.daysLeft).toBe(-11);
    expect(past.days).toEqual([]);
    expect(past.unscheduled).toEqual([]);
  });
});

describe('study plan units', () => {
  it('covers every pattern, case study and competency for a new learner, coding in curriculum order', () => {
    const p = plan({ interviewDate: '2027-10-01' });
    const units = p.units;
    expect(units.filter((u) => u.round === 'coding').map((u) => u.patternId)).toEqual(PATTERN_CATALOG.map((x) => x.id));
    expect(units.filter((u) => u.round === 'design')).toHaveLength(CASE_CATALOG.length);
    expect(units.filter((u) => u.round === 'behavioral')).toHaveLength(COMPETENCY_CATALOG.length);
    const design = units.filter((u) => u.round === 'design').map((u) => CASE_CATALOG.find((c) => c.id === u.caseId)!.level);
    expect(design.indexOf('advanced')).toBeGreaterThan(design.lastIndexOf('core'));
  });

  it('with only a behavioral round plans only stories', () => {
    const p = plan({ rounds: ['behavioral'] });
    expect(p.units.every((u) => u.round === 'behavioral')).toBe(true);
    expect(p.status).toBe('on-track');
    expect(p.remaining).toEqual({ coding: null, design: null, behavioral: { units: COMPETENCY_CATALOG.length, minutes: 260 } });
  });

  it('suggests the first unsolved problem of each pattern, primary ones first', () => {
    const first = plan().units[0];
    expect(first).toMatchObject({ kind: 'pattern', patternId: 'hashing', problemId: 'two-sum', minutes: 30 });
    const after = plan({}, replay([solved('pair-sum-sorted', now.getTime() - 2 * DAY)])).units;
    expect(after.some((u) => u.patternId === 'two-pointers')).toBe(false);
  });

  it('scales unit time with the level, in five minute steps', () => {
    expect(plan({ level: 'rusty' }).units[0].minutes).toBe(25);
    expect(plan({ level: 'confident' }).units[0].minutes).toBe(15);
    expect(plan({ level: 'confident' }).units.every((u) => u.minutes >= 5 && u.minutes % 5 === 0)).toBe(true);
  });

  it('moves patterns the placement check found strong to the end, and counts them covered once confident', () => {
    const state = replay([
      {
        id: id(),
        at: at(now.getTime() - DAY),
        type: 'diagnostic.completed',
        answers: [{ itemId: 'rec:h1', outcome: 'correct', durationMs: 5000 }],
      },
    ]);
    expect(state.placement['hashing']).toBe('strong');
    const coding = (level: StudyPlanInput['level']) => plan({ level }, state).units.filter((u) => u.round === 'coding');
    expect(coding('new').at(-1)!.patternId).toBe('hashing');
    expect(coding('confident').some((u) => u.patternId === 'hashing')).toBe(false);
  });

  it('puts patterns an interview flagged first, and asks for a fresh solve when one was solved before the flag', () => {
    const flag = (when: number, weakPatterns: string[]): StoredEvent => ({
      id: id(),
      at: at(when),
      type: 'interview.scored',
      sessionId: 's1',
      track: 'coding',
      verdict: 'lean-no-hire',
      weakPatterns,
    });
    const base = [solved('two-sum', now.getTime() - 5 * DAY), flag(now.getTime() - 2 * DAY, ['hashing', 'heap'])];
    const units = plan({}, replay(base)).units;
    expect(units[0]).toMatchObject({ kind: 'retry', patternId: 'hashing', problemId: 'longest-consecutive-sequence', flagged: true });
    expect(units[1]).toMatchObject({ kind: 'pattern', patternId: 'heap', flagged: true });
    const retried = plan({}, replay([...base, solved('group-anagrams', now.getTime() - DAY)])).units;
    expect(retried.some((u) => u.patternId === 'hashing')).toBe(false);
  });

  it('a case study is done once finished, and a competency once a written, tagged story covers it', () => {
    const state = replay([caseDone('url-shortener', now.getTime() - DAY)]);
    const p = plan({}, state, { stories: [story(['ownership', 'delivery']), { ...story(['conflict']), draft: { ...EMPTY_STAR_DRAFT } }] });
    expect(p.units.some((u) => u.caseId === 'url-shortener')).toBe(false);
    const competencies = p.units.filter((u) => u.round === 'behavioral').map((u) => u.competencyId);
    expect(competencies).not.toContain('ownership');
    expect(competencies).not.toContain('delivery');
    expect(competencies).toContain('conflict');
  });

  it('puts competencies an interview flagged first', () => {
    const state = replay([
      {
        id: id(),
        at: at(now.getTime() - DAY),
        type: 'interview.scored',
        sessionId: 's2',
        track: 'behavioral',
        verdict: 'lean-no-hire',
        weakPatterns: [],
        competencyId: 'tradeoffs',
        weakCompetencies: ['tradeoffs'],
      },
    ]);
    const first = plan({ rounds: ['behavioral'] }, state).units[0];
    expect(first).toMatchObject({ competencyId: 'tradeoffs', flagged: true });
  });

  it('when everything is covered, says so and keeps only reviews', () => {
    const { state, stories } = everything();
    const p = plan({}, state, { stories });
    expect(p.status).toBe('covered');
    expect(p.units).toEqual([]);
    expect(p.days.every((d) => d.slices.length === 0)).toBe(true);
    expect(p.finishDate).toBeNull();
  });
});

describe('study plan schedule', () => {
  it('never schedules more learning in a day than the time left after review', () => {
    for (const minutesPerDay of PLAN_MINUTES) {
      for (const interviewDate of ['2026-10-02', '2026-10-05', '2026-11-20']) {
        const p = plan({ minutesPerDay, interviewDate });
        for (const d of p.days) expect(learning(p, p.days.indexOf(d)) + d.review).toBeLessThanOrEqual(minutesPerDay);
      }
    }
  });

  it('gives each unit its whole time across consecutive parts, numbered in order', () => {
    const p = plan({ minutesPerDay: 15, interviewDate: '2027-06-01' });
    const byUnit = new Map<string, { minutes: number; parts: number[]; total: number; days: number[] }>();
    p.days.forEach((d, i) =>
      d.slices.forEach((s) => {
        const e = byUnit.get(s.unit.id) ?? { minutes: 0, parts: [], total: s.parts, days: [] };
        e.minutes += s.minutes;
        e.parts.push(s.part);
        e.days.push(i);
        byUnit.set(s.unit.id, e);
      }),
    );
    expect(byUnit.size).toBe(p.units.length);
    for (const unit of p.units) {
      const e = byUnit.get(unit.id)!;
      expect(e.minutes).toBe(unit.minutes);
      expect(e.parts).toEqual(Array.from({ length: e.total }, (_, i) => i + 1));
    }
    expect([...byUnit.values()].some((e) => e.total > 1)).toBe(true);
  });

  it('advances every round from the first day instead of one round after another', () => {
    const p = plan({ minutesPerDay: 120 });
    expect(new Set(p.days[0].slices.map((s) => s.unit.round))).toEqual(new Set(['coding', 'design', 'behavioral']));
  });

  it('with zero minutes schedules nothing and says how many minutes would fit it all', () => {
    const p = plan({ minutesPerDay: 0, interviewDate: '2027-06-01' });
    expect(p.status).toBe('no-time');
    expect(p.days.every((d) => d.slices.length === 0 && d.review === 0)).toBe(true);
    expect(p.unscheduled).toHaveLength(p.units.length);
    expect(PLAN_MINUTES).toContain(p.minutesToFit);
  });

  it('when time is short, schedules the most important first and names the daily time that would fit everything', () => {
    const p = plan({ minutesPerDay: 30, interviewDate: '2026-10-30' });
    expect(p.status).toBe('tight');
    expect(p.unscheduled.length).toBeGreaterThan(0);
    expect(scheduledIds(p).has(p.units[0].id)).toBe(true);
    expect(p.minutesToFit).toBe(PLAN_MINUTES.find((m) => plan({ minutesPerDay: m, interviewDate: '2026-10-30' }).unscheduled.length === 0));
    expect(plan({ minutesPerDay: p.minutesToFit!, interviewDate: '2026-10-30' }).status).toBe('on-track');
    expect(plan({ minutesPerDay: 15, interviewDate: '2026-10-03' }).minutesToFit).toBeNull();
  });

  it('a missed day just spreads what is left over the days that remain', () => {
    const early = plan({ minutesPerDay: 60, interviewDate: '2026-12-01' });
    const later = plan({ minutesPerDay: 60, interviewDate: '2026-12-01' }, emptyProgress(), { now: new Date(now.getTime() + 3 * DAY) });
    expect(later.days[0].date).toBe('2026-10-04');
    expect(later.days[0].slices.map((s) => s.unit.id)).toEqual(early.days[0].slices.map((s) => s.unit.id));
  });

  it('keeps what was finished today on today’s list, ticked, so today does not refill', () => {
    const before = plan();
    const first = before.days[0].slices[0];
    const done = plan({}, replay([solved(first.unit.problemId!, now.getTime() + 60_000)]), { now: new Date(now.getTime() + 120_000) });
    expect(done.days[0].slices.map((s) => s.unit.id)).toEqual(before.days[0].slices.map((s) => s.unit.id));
    expect(done.days[0].slices[0].done).toBe(true);
    expect(done.days[0].slices.slice(1).every((s) => !s.done)).toBe(true);
    const yesterday = plan({}, replay([solved(first.unit.problemId!, now.getTime() - DAY)]));
    expect(yesterday.units.some((u) => u.id === first.unit.id)).toBe(false);
  });

  it('a story written today counts as done today', () => {
    const p = plan({ rounds: ['behavioral'] }, emptyProgress(), { stories: [story(['ownership'], now.toISOString())] });
    expect(p.days[0].slices.find((s) => s.unit.competencyId === 'ownership')?.done).toBe(true);
  });

  it('makes room for due reviews today, but never more than half the day', () => {
    const reviewed = Array.from({ length: 30 }, (_, i) => i).flatMap((i) => {
      const itemId = `rec:${['h1', 'h2', 'h3', 'tp1', 'tp2', 'sw1'][i % 6]}`;
      return [
        {
          id: id(),
          at: at(now.getTime() - 20 * DAY + i),
          type: 'review.graded',
          itemId,
          rating: 1,
          correct: false,
          durationMs: 9000,
        } as StoredEvent,
      ];
    });
    const state = replay(reviewed);
    const p = plan({}, state);
    expect(p.todayReview.cards).toBeGreaterThan(0);
    expect(p.days[0].review).toBeGreaterThan(0);
    expect(p.days[0].review).toBeLessThanOrEqual(30);
    expect(learning(p) + p.days[0].review).toBeLessThanOrEqual(60);
  });

  it('counts story rehearsals due today only when the interview has a behavioral round', () => {
    const due = { ...story(['ownership']), rehearsal: { step: 0, told: 1, due: '2026-09-30T00:00:00.000Z' } };
    expect(plan({}, emptyProgress(), { stories: [due] }).todayReview.stories).toBe(1);
    expect(plan({ rounds: ['coding'] }, emptyProgress(), { stories: [due] }).todayReview.stories).toBe(0);
  });

  it('is deterministic', () => {
    expect(plan({ minutesPerDay: 45 })).toEqual(plan({ minutesPerDay: 45 }));
  });
});

describe('plan inputs', () => {
  it('accepts only offered options and a real calendar date', () => {
    expect(normalizePlan(input())).toEqual(input());
    expect(normalizePlan(input({ rounds: ['design', 'coding', 'design'] }))?.rounds).toEqual(['coding', 'design']);
    expect(normalizePlan(input({ interviewDate: '2026-02-30' }))).toBeNull();
    expect(normalizePlan(input({ interviewDate: '2026-1-5' }))).toBeNull();
    expect(normalizePlan(input({ minutesPerDay: 7 }))).toBeNull();
    expect(normalizePlan(input({ rounds: [] }))).toBeNull();
    expect(normalizePlan({ ...input(), level: 'expert' } as unknown as StudyPlanInput)).toBeNull();
    expect(normalizePlan(null)).toBeNull();
  });

  it('is set and cleared by events, without counting toward the streak', () => {
    const set: StoredEvent = { id: id(), at: at(now.getTime()), type: 'plan.set', plan: input() };
    const state = replay([set]);
    expect(state.plan).toEqual(input());
    expect(state.streak.current).toBe(0);
    expect(replay([set, { id: id(), at: at(now.getTime() + 1), type: 'plan.set', plan: null }]).plan).toBeNull();
    expect(replay([{ ...set, plan: { ...input(), minutesPerDay: 7 } }]).plan).toBeNull();
  });
});
