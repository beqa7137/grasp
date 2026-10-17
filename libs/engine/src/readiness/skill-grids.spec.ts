import { describe, expect, it } from 'vitest';
import type { Story } from '../behavioral/stories.js';
import type { StoredEvent } from '../srs/events.js';
import { replay, type ProgressState } from '../srs/progress.js';
import { loopArithmetic, roundArithmetic } from './explain.js';
import { LEVEL_PROFILES } from './levels.js';
import { simulateLearner } from './reachability.fixture.js';
import { loopReadiness, READINESS_BAND_NAMES, STATE_WEIGHTS } from './readiness.js';
import { skillGrids } from './skill-grids.js';
import { SKILL_STATES, skillStatus, type SkillKind } from './status.js';

const senior: StoredEvent = {
  id: 'grid-senior',
  at: '2026-09-01T00:00:00.000Z',
  type: 'target.set',
  target: { level: 'senior', rounds: { coding: 2, design: 2, behavioral: 1 } },
};

/** A fresh learner, a Senior Target with nothing done, and two learners part way and all the way through a plan. */
function seeded(): { name: string; state: ProgressState; stories: readonly Story[]; now: Date }[] {
  const now = new Date('2026-10-02T12:00:00Z');
  const midway = simulateLearner({ level: 'mid', startingPoint: 'rusty', days: 9, minutesPerDay: 60 });
  const done = simulateLearner({ level: 'senior', startingPoint: 'confident', days: 23, minutesPerDay: 120 });
  return [
    { name: 'fresh', state: replay([]), stories: [], now },
    { name: 'senior target', state: replay([senior]), stories: [], now },
    { name: 'mid-level, 9 days in', state: midway.state, stories: midway.stories, now: new Date('2026-10-11T12:00:00Z') },
    { name: 'senior, interview day', state: done.state, stories: done.stories, now: new Date('2026-10-25T12:00:00Z') },
  ];
}

describe('skill grids', () => {
  it.each(seeded())('totals each state as the skill states do ($name)', ({ state, stories, now }) => {
    const profile = LEVEL_PROFILES[(state.target ?? { level: 'mid' }).level];
    const ctx = { state, stories, now, profile };
    for (const grid of skillGrids(state, stories, now)) {
      const all = [...grid.skills, ...grid.cases];
      for (const s of SKILL_STATES) {
        expect(grid.totals[s], `${grid.round} ${s}`).toBe(
          all.filter((x) => skillStatus(x.kind as SkillKind, x.id, ctx).state === s).length,
        );
      }
    }
  });

  it.each(seeded())('counts the required skills exactly as readiness does ($name)', ({ state, stories, now }) => {
    const readiness = loopReadiness(state, stories, now);
    const grids = skillGrids(state, stories, now);
    for (const round of readiness.rounds) {
      const grid = grids.find((g) => g.round === round.round)!;
      expect(grid.count).toBe(round.count);
      for (const s of SKILL_STATES) expect(grid.required[s], `${round.round} ${s}`).toBe(round.skills.filter((x) => x.state === s).length);
    }
  });

  it('draws 23 patterns, 34 topics with the level’s required cases, and 13 competencies', () => {
    const grids = skillGrids(replay([senior]), [], new Date('2026-09-02T00:00:00Z'));
    expect(grids.map((g) => [g.round, g.skills.length, g.cases.length])).toEqual([
      ['coding', 23, 0],
      ['design', 34, 10],
      ['behavioral', 13, 0],
    ]);
    expect(grids[0].skills.filter((s) => !s.required).map((s) => s.id)).toEqual([
      'minimum-spanning-tree',
      'bit-manipulation',
      'bitmask-dp',
    ]);
    expect(grids[2].skills.filter((s) => s.weight === 2)).toHaveLength(5);
  });
});

describe('readiness arithmetic as shown', () => {
  it('works REDESIGN.md 2.3’s example', () => {
    const rounds = [
      { round: 'coding' as const, count: 2, score: 37 },
      { round: 'design' as const, count: 1, score: 22 },
      { round: 'behavioral' as const, count: 1, score: 27 },
    ];
    expect(loopArithmetic({ rounds: rounds.map((r) => ({ ...r, skills: [] })), score: 31 }).text).toBe(
      '(2 × Coding 37 + System design 22 + Behavioral 27) / 4 = 31',
    );
    const skills = (['ready', 'practiced', 'learning', 'new'] as const).flatMap((state, i) =>
      Array.from({ length: [3, 6, 5, 7][i] }, (_, n) => ({
        kind: 'pattern' as const,
        id: `${state}${n}`,
        state,
        flagged: false,
        weight: 1,
      })),
    );
    expect(roundArithmetic({ round: 'coding', skills, score: 37 })).toBe(
      '21 required patterns: 3 Ready, 6 Practiced, 5 Learning, 7 New = 37',
    );
  });

  it.each(seeded())('equals the ring for every seeded learner ($name)', ({ state, stories, now }) => {
    const readiness = loopReadiness(state, stories, now);
    const shown = loopArithmetic(readiness);
    const computed = Math.round(shown.terms.reduce((sum, t) => sum + t.count * t.score, 0) / shown.divisor);
    expect(computed).toBe(readiness.score);
    expect(Number(shown.text.match(/(\d+)$/)![1])).toBe(readiness.score);
    for (const round of readiness.rounds) {
      const line = roundArithmetic(round);
      const parts = [...line.matchAll(/(\d+) (Ready|Practiced|Learning|New)/g)].map(([, n, s]) => [Number(n), s.toLowerCase()] as const);
      const weights = round.skills.reduce((sum, s) => sum + s.weight, 0);
      const earned = round.skills.reduce((sum, s) => sum + s.weight * STATE_WEIGHTS[s.state], 0);
      expect(Math.round((100 * earned) / weights)).toBe(round.score);
      expect(parts.reduce((sum, [n]) => sum + n, 0)).toBe(round.skills.length);
      expect(Number(line.match(/= (\d+)$/)![1])).toBe(round.score);
      if (round.skills.every((s) => s.weight === 1)) {
        const fromLine = Math.round(
          (100 * parts.reduce((sum, [n, s]) => sum + n * STATE_WEIGHTS[s as keyof typeof STATE_WEIGHTS], 0)) / weights,
        );
        expect(fromLine, round.round).toBe(round.score);
      }
    }
  });

  it('names the counted-twice competencies and the design round’s cases', () => {
    const readiness = loopReadiness(replay([senior]), [], new Date('2026-09-02T00:00:00Z'));
    expect(readiness.rounds.map(roundArithmetic)).toEqual([
      '20 required patterns: 20 New = 0',
      '32 required topics and 10 required cases: 42 New = 0',
      '13 competencies, 5 counted twice: 13 New = 0',
    ]);
    expect(loopArithmetic(readiness).text).toBe('(2 × Coding 0 + 2 × System design 0 + Behavioral 0) / 5 = 0');
  });

  it('names every band', () => {
    expect(READINESS_BAND_NAMES).toEqual({ building: 'Building', 'getting-there': 'Getting there', 'loop-ready': 'Loop-ready' });
  });
});
