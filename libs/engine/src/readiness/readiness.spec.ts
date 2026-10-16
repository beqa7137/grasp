import { describe, expect, it } from 'vitest';
import type { StoredEvent } from '../srs/events.js';
import { replay } from '../srs/progress.js';
import { simulateLearner } from './reachability.fixture.js';
import { PLAN_MINUTES, type PlanLevel } from '../plan/options.js';
import { loopReadiness, loopScore, readinessBand, roundScore, STATE_WEIGHTS, type LoopReadiness } from './readiness.js';
import type { SkillState } from './status.js';

const states = (counts: Partial<Record<SkillState, number>>, weight = 1) =>
  Object.entries(counts).flatMap(([state, n]) => Array.from({ length: n }, () => ({ state: state as SkillState, weight })));

describe('readiness arithmetic', () => {
  it('weighs New 0, Learning 0.25, Practiced 0.6 and Ready 1', () => {
    expect(STATE_WEIGHTS).toEqual({ new: 0, learning: 0.25, practiced: 0.6, ready: 1 });
  });

  it('scores a round as REDESIGN.md 2.3 works the example', () => {
    expect(roundScore(states({ ready: 3, practiced: 6, learning: 5, new: 7 }))).toBe(37);
    expect(
      loopScore([
        { count: 2, score: 37 },
        { count: 1, score: 22 },
        { count: 1, score: 27 },
      ]),
    ).toBe(31);
    expect(readinessBand(31)).toBe('building');
  });

  it('counts a double weight twice in both sums', () => {
    expect(roundScore([...states({ ready: 1 }, 2), ...states({ new: 2 })])).toBe(50);
  });

  it('bands Building 0 to 39, Getting there 40 to 74 and Loop-ready 75 to 100', () => {
    expect([0, 39, 40, 74, 75, 100].map(readinessBand)).toEqual([
      'building',
      'building',
      'getting-there',
      'getting-there',
      'loop-ready',
      'loop-ready',
    ]);
  });

  it('assumes a Mid-level loop with every round until a Target or plan says otherwise', () => {
    const fresh = loopReadiness(replay([]), [], new Date('2026-09-01T00:00:00Z'));
    expect(fresh).toMatchObject({ score: 0, band: 'building', source: 'assumed' });
    expect(fresh.rounds.map((r) => [r.round, r.count, r.skills.length])).toEqual([
      ['coding', 2, 20],
      ['design', 1, 21],
      ['behavioral', 1, 13],
    ]);
  });

  it('leaves out rounds the Target counts 0 times, and weighs the Senior competencies', () => {
    const event: StoredEvent = {
      id: 'target-senior',
      at: '2026-09-01T00:00:00.000Z',
      type: 'target.set',
      target: { level: 'senior', rounds: { coding: 0, design: 2, behavioral: 1 } },
    };
    const readiness = loopReadiness(replay([event]), [], new Date('2026-09-02T00:00:00Z'));
    expect(readiness.rounds.map((r) => [r.round, r.skills.length])).toEqual([
      ['design', 32 + 10],
      ['behavioral', 13],
    ]);
    expect(readiness.rounds[1].skills.reduce((sum, s) => sum + s.weight, 0)).toBe(18);
  });
});

/**
 * REDESIGN.md 2.3's reachability check: a Mid-level learner on the default plan (23 days) who works every slice and
 * grades every due review Good. Measured values are in docs/LOOP.md row 101.
 */
describe('reachability', () => {
  const run = (startingPoint: PlanLevel, minutesPerDay: number, reviewsOnly = false) =>
    simulateLearner({ level: 'mid', startingPoint, days: 23, minutesPerDay, reviewsOnly });
  const round = (r: LoopReadiness, name: string) => r.rounds.find((x) => x.round === name)!;

  it('tells a New learner at 45 minutes how much the required loop needs, and how much 45 minutes covers', () => {
    const { coverage } = run('new', 45);
    expect(coverage.minutesPerDay).toBe(155);
    expect(Math.round(coverage.share * 100)).toBe(27);
  });

  it.each(['rusty', 'confident'] as const)('makes the loop Loop-ready starting %s, at the offered daily time that covers it', (start) => {
    const needed = run(start, 45).coverage.minutesPerDay!;
    const budget = PLAN_MINUTES.find((m) => m >= needed)!;
    const { readiness, morning } = run(start, budget);
    expect(readinessBand(readiness.score)).toBe('loop-ready');
    expect(readinessBand(round(readiness, 'coding').score)).toBe('loop-ready');
    expect(readinessBand(morning.score), 'before the morning reviews').toBe('loop-ready');
  });

  it.each(['new', 'rusty', 'confident'] as const)(
    'gives every round at least one unit in the first week at 45 minutes, starting %s',
    (start) => {
      const { firstWeek } = run(start, 45);
      for (const name of ['coding', 'design', 'behavioral'] as const) expect(firstWeek[name], name).toBeGreaterThan(0);
    },
  );

  it('never takes a pattern past Learning for a learner who only reviews', () => {
    const reached = new Set(round(run('new', 45, true).readiness, 'coding').skills.map((s) => s.state));
    expect([...reached]).toEqual(['learning']);
  });
});
