import { describe, expect, it } from 'vitest';
import type { StudyPlanInput, TargetInput } from './options.js';
import type { StoredEvent } from '../srs/events.js';
import { replay } from '../srs/progress.js';
import { currentTarget } from '../readiness/levels.js';

const t0 = Date.parse('2026-09-01T09:00:00.000Z');
const DAY = 86_400_000;
let seq = 0;
const at = (ms: number) => new Date(ms).toISOString();
const target = (ms: number, value: TargetInput): StoredEvent => ({ id: `target-${++seq}`, at: at(ms), type: 'target.set', target: value });
const plan = (ms: number, value: StudyPlanInput | null): StoredEvent => ({
  id: `plan-${++seq}`,
  at: at(ms),
  type: 'plan.set',
  plan: value,
});
const senior: TargetInput = { level: 'senior', rounds: { coding: 2, design: 2, behavioral: 1 }, company: 'amazon' };
const studyPlan = (rounds: StudyPlanInput['rounds']): StudyPlanInput => ({
  interviewDate: '2026-10-01',
  minutesPerDay: 45,
  rounds,
  level: 'rusty',
});

describe('target.set', () => {
  it('sets the Target, latest wins, and never counts as a study day', () => {
    const state = replay([target(t0, senior), target(t0 + DAY, { level: 'early', rounds: { coding: 3, design: 0, behavioral: 1 } })]);
    expect(state.target).toEqual({ level: 'early', rounds: { coding: 3, design: 0, behavioral: 1 } });
    expect(state.streak).toEqual({ current: 0, longest: 0, lastDay: null });
    expect(state.eventCount).toBe(2);
  });

  it('keeps the previous Target when one holds an option this client does not know', () => {
    const before = replay([target(t0, senior)]);
    const unknown = [
      { ...senior, level: 'staff' },
      { ...senior, rounds: { coding: 4, design: 0, behavioral: 0 } },
      { ...senior, rounds: { coding: 0, design: 0, behavioral: 0 } },
      { ...senior, company: 'initech' },
    ] as TargetInput[];
    for (const value of unknown) expect(replay([target(t0 + DAY, value)], before).target).toEqual(senior);
  });

  it('survives clearing the plan', () => {
    expect(replay([target(t0, senior), plan(t0 + 1, studyPlan(['coding', 'design', 'behavioral'])), plan(t0 + 2, null)]).target).toEqual(
      senior,
    );
  });
});

describe('an older app editing the plan', () => {
  it('leaves the counts alone when the plan keeps the same rounds', () => {
    expect(replay([target(t0, senior), plan(t0 + 1, studyPlan(['behavioral', 'coding', 'design']))]).target).toEqual(senior);
  });

  it('gives an added round the level default, at least 1, and a removed round 0', () => {
    const early: TargetInput = { level: 'early', rounds: { coding: 2, design: 0, behavioral: 1 } };
    expect(replay([target(t0, early), plan(t0 + 1, studyPlan(['coding', 'design']))]).target).toEqual({
      level: 'early',
      rounds: { coding: 2, design: 1, behavioral: 0 },
    });
    expect(replay([target(t0, senior), plan(t0 + 1, studyPlan(['design']))]).target).toEqual({
      ...senior,
      rounds: { coding: 0, design: 2, behavioral: 0 },
    });
    const mid: TargetInput = { level: 'mid', rounds: { coding: 3, design: 0, behavioral: 0 } };
    expect(replay([target(t0, mid), plan(t0 + 1, studyPlan(['coding', 'design']))]).target!.rounds).toEqual({
      coding: 3,
      design: 1,
      behavioral: 0,
    });
  });

  it('does not touch a Target set after the plan', () => {
    expect(replay([plan(t0, studyPlan(['coding'])), target(t0 + 1, senior)]).target).toEqual(senior);
  });
});

describe('the current Target', () => {
  it('is the learner own once set', () => {
    expect(currentTarget(replay([target(t0, senior)]))).toEqual({ target: senior, source: 'set' });
  });

  it('is derived as Mid-level with default counts for a plan made before Targets existed', () => {
    expect(currentTarget(replay([plan(t0, studyPlan(['coding', 'behavioral']))]))).toEqual({
      target: { level: 'mid', rounds: { coding: 2, design: 0, behavioral: 1 } },
      source: 'derived',
    });
  });

  it('is assumed Mid-level with every round when there is neither', () => {
    expect(currentTarget(replay([]))).toEqual({
      target: { level: 'mid', rounds: { coding: 2, design: 1, behavioral: 1 } },
      source: 'assumed',
    });
  });
});
