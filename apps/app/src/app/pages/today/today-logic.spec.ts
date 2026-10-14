import type { PlanCoverage, ProgressState, StudyPlan, StudyPlanInput } from '@grasp/engine';
import { coverageLine, shareWords } from './coverage-line';
import { levelCounts, loopEvents, type LoopForm } from './loop-events';
import { loopLine as lineParts, loopSource } from './loop-line';

const loopLine = (...args: Parameters<typeof lineParts>) => lineParts(...args).join(' · ');

const plan: StudyPlanInput = { interviewDate: '2026-11-04', minutesPerDay: 45, rounds: ['coding', 'design', 'behavioral'], level: 'new' };
const mid = { level: 'mid' as const, rounds: { coding: 2, design: 1, behavioral: 1 } };
const state = (s: Partial<Pick<ProgressState, 'target' | 'plan'>>) =>
  ({ target: null, plan: null, ...s }) as Pick<ProgressState, 'target' | 'plan'>;
const day = (date: string) => `on ${date}`;

describe('the target line', () => {
  it('reads the Target, the date, the days left and the time a day', () => {
    expect(loopLine(state({ target: mid, plan }), '2026-10-14', day)).toBe('Mid-level loop · on 2026-11-04 · 21 days left · 45 min a day');
    expect(loopLine(state({ target: { ...mid, level: 'senior' }, plan: { ...plan, minutesPerDay: 90 } }), '2026-11-03', day)).toBe(
      'Senior loop · on 2026-11-04 · interview tomorrow · 1 h 30 min a day',
    );
    expect(loopLine(state({ target: mid, plan }), '2026-11-04', day)).toBe('Mid-level loop · on 2026-11-04 · interview today');
    expect(loopLine(state({ target: mid, plan }), '2026-11-05', day)).toBe('Mid-level loop · on 2026-11-04 · date passed');
    expect(loopLine(state({ target: mid }), '2026-10-14', day)).toBe('Mid-level loop · no date yet');
  });

  it('marks a loop derived from a plan as assumed, and says what it assumes without either', () => {
    expect(loopSource(state({ plan }))).toBe('derived');
    expect(loopLine(state({ plan }), '2026-10-14', day)).toMatch(/^Mid-level loop \(assumed\) · /);
    expect(loopSource(state({}))).toBe('assumed');
    expect(loopLine(state({}), '2026-10-14', day)).toBe('Assuming a Mid-level loop');
  });
});

describe('saving the loop', () => {
  const form: LoopForm = { level: 'mid', rounds: mid.rounds, date: '2026-11-04', minutesPerDay: 45, startingPoint: 'new' };

  it('writes the Target and the plan, with the plan rounds those counted once or more', () => {
    expect(loopEvents({ ...form, rounds: { coding: 2, design: 0, behavioral: 1 } }, state({}))).toEqual([
      { type: 'target.set', target: { level: 'mid', rounds: { coding: 2, design: 0, behavioral: 1 } } },
      { type: 'plan.set', plan: { ...plan, rounds: ['coding', 'behavioral'] } },
    ]);
  });

  it('writes only what changed, keeps the company, and clears the plan for "No date yet"', () => {
    expect(loopEvents(form, state({ target: mid, plan }))).toEqual([]);
    expect(loopEvents({ ...form, minutesPerDay: 60 }, state({ target: mid, plan }))).toEqual([
      { type: 'plan.set', plan: { ...plan, minutesPerDay: 60 } },
    ]);
    expect(loopEvents({ ...form, level: 'senior', date: null }, state({ target: { ...mid, company: 'amazon' }, plan }))).toEqual([
      { type: 'target.set', target: { level: 'senior', rounds: mid.rounds, company: 'amazon' } },
      { type: 'plan.set', plan: null },
    ]);
    expect(loopEvents({ ...form, date: null }, state({ target: mid }))).toEqual([]);
  });

  it("gives the pilot level row the plan's rounds at the level's counts, at least one each", () => {
    expect(levelCounts('early', ['coding', 'design'])).toEqual({ coding: 2, design: 1, behavioral: 0 });
    expect(levelCounts('senior', ['behavioral'])).toEqual({ coding: 0, design: 0, behavioral: 1 });
  });
});

describe('the coverage line', () => {
  const at = (c: Partial<PlanCoverage>, rest: Partial<Pick<StudyPlan, 'status' | 'daysLeft'>> = {}) => ({
    coverage: { minutesPerDay: 150, share: 0.27, daysToFit: 40, ...c },
    status: 'tight' as const,
    daysLeft: 21,
    ...rest,
  });

  it('says the share in words and what it all needs, and offers more time and a later date', () => {
    expect(coverageLine(at({ minutesPerDay: 80 }), plan, '2026-10-14', day)).toEqual({
      text: 'At 45 min a day, this plan covers about a quarter of your loop by on 2026-11-04. All of it needs about 1 h 20 min a day.',
      minutes: { value: 90, label: 'Use 1 h 30 min a day' },
      date: '2026-11-23',
    });
  });

  it('says so when even the most a plan allows falls short, and offers that as the most', () => {
    expect(coverageLine(at({}), plan, '2026-10-14', day)).toEqual({
      text: 'At 45 min a day, this plan covers about a quarter of your loop by on 2026-11-04. All of it needs about 2 h 30 min a day, more than the 2 h a plan allows.',
      minutes: { value: 120, label: 'Use 2 h a day, the most' },
      date: '2026-11-23',
    });
    expect(coverageLine(at({ daysToFit: null }), { ...plan, minutesPerDay: 120 }, '2026-10-14', day)).toMatchObject({
      minutes: null,
      date: null,
    });
  });

  it('asks for a later date, not an impossible day, when no daily time fits', () => {
    expect(coverageLine(at({ minutesPerDay: null }), plan, '2026-10-14', day)).toEqual({
      text: 'At 45 min a day, this plan covers about a quarter of your loop by on 2026-11-04. All of it needs a later date.',
      minutes: null,
      date: '2026-11-23',
    });
  });

  it('stays silent when the time covers it all, and from the day before the interview', () => {
    expect(coverageLine(at({ share: 1, daysToFit: null }), plan, '2026-10-14', day)).toBeNull();
    expect(coverageLine({ coverage: undefined, status: 'tight', daysLeft: 21 }, plan, '2026-10-14', day)).toBeNull();
    expect(coverageLine(at({}, { status: 'eve', daysLeft: 1 }), plan, '2026-10-14', day)).toBeNull();
    expect(coverageLine(at({}, { status: 'interview-day', daysLeft: 0 }), plan, '2026-10-14', day)).toBeNull();
    expect(coverageLine(at({}, { daysLeft: 1 }), plan, '2026-10-14', day)).toBeNull();
  });

  it('never claims more than the share holds', () => {
    expect([0.1, 0.25, 0.35, 0.5, 0.65, 0.8, 0.95].map(shareWords)).toEqual([
      'less than a fifth',
      'about a quarter',
      'about a third',
      'about half',
      'about two thirds',
      'about three quarters',
      'most',
    ]);
  });
});
