import { describe, expect, it } from 'vitest';
import { COMPETENCY_CATALOG } from '../behavioral/catalog.js';
import { seeded } from '../review/random.js';
import type { StoredEvent } from '../srs/events.js';
import { emptyProgress, replay } from '../srs/progress.js';
import { hasInterviewFlags, pickLoop, type LoopProblem } from './loop.js';

const PROBLEMS: LoopProblem[] = [
  { id: 'warmer-days', track: 'coding', patternIds: ['monotonic-stack'] },
  { id: 'shipping-capacity', track: 'coding', patternIds: ['binary-search', 'greedy'] },
  { id: 'course-order', track: 'coding', patternIds: ['topo-sort', 'bfs'] },
  { id: 'url-shortener', track: 'system-design', patternIds: [] },
  { id: 'news-feed', track: 'system-design', patternIds: [] },
  { id: 'conflict', track: 'behavioral', patternIds: [] },
];
const at = '2026-09-30T10:00:00.000Z';
const scored = (change: Partial<Extract<StoredEvent, { type: 'interview.scored' }>>): StoredEvent => ({
  id: `evt-${change.sessionId ?? 's'}-${change.track ?? 'coding'}`,
  at,
  type: 'interview.scored',
  sessionId: 's',
  track: 'coding',
  verdict: 'lean-no-hire',
  weakPatterns: [],
  ...change,
});

describe('mock loop rounds', () => {
  it('gives one round per track in loop order: coding, system design, behavioral', () => {
    const picks = pickLoop(PROBLEMS, emptyProgress(), seeded(1));
    expect(picks.map((p) => p.track)).toEqual(['coding', 'system-design', 'behavioral']);
    expect(PROBLEMS.filter((p) => p.track === 'coding').map((p) => p.id)).toContain(picks[0].problemId);
    expect(['url-shortener', 'news-feed']).toContain(picks[1].problemId);
    expect(COMPETENCY_CATALOG.map((c) => c.id)).toContain(picks[2].problemId);
  });

  it('is the same for the same seed, and varies across seeds', () => {
    expect(pickLoop(PROBLEMS, emptyProgress(), seeded(7))).toEqual(pickLoop(PROBLEMS, emptyProgress(), seeded(7)));
    const coding = new Set(Array.from({ length: 30 }, (_, i) => pickLoop(PROBLEMS, emptyProgress(), seeded(i))[0].problemId));
    expect(coding.size).toBe(3);
  });

  it('picks a coding problem on a pattern an interview flagged, until a fresh solve resolves the flag', () => {
    const state = replay([scored({ weakPatterns: ['topo-sort'] })]);
    for (let seed = 0; seed < 20; seed++) {
      expect(pickLoop(PROBLEMS, state, seeded(seed))[0]).toEqual({ track: 'coding', problemId: 'course-order', reason: 'flagged' });
    }
    const resolved = { ...state, weakPatterns: { 'topo-sort': { flaggedAt: at, resolvedAt: '2026-09-30T12:00:00.000Z' } } };
    expect(pickLoop(PROBLEMS, resolved, seeded(3))[0].reason).toBe('any');
  });

  it('asks a flagged competency first, then one no interview has asked about', () => {
    const flagged = replay([scored({ sessionId: 'b1', track: 'behavioral', competencyId: 'conflict', weakCompetencies: ['conflict'] })]);
    expect(pickLoop(PROBLEMS, flagged, seeded(2))[2]).toEqual({ track: 'behavioral', problemId: 'conflict', reason: 'flagged' });

    const asked = COMPETENCY_CATALOG.slice(1).map((c, i) =>
      scored({ sessionId: `b${i}`, track: 'behavioral', verdict: 'hire', competencyId: c.id, weakCompetencies: [] }),
    );
    const one = pickLoop(PROBLEMS, replay(asked), seeded(5))[2];
    expect(one).toEqual({ track: 'behavioral', problemId: COMPETENCY_CATALOG[0].id, reason: 'new' });

    const all = replay([
      ...asked,
      scored({ sessionId: 'last', track: 'behavioral', verdict: 'hire', competencyId: COMPETENCY_CATALOG[0].id }),
    ]);
    expect(pickLoop(PROBLEMS, all, seeded(5))[2].reason).toBe('any');
  });

  it('prefers a problem the learner has not had: flagged first, then any, then the flagged one again', () => {
    const state = replay([scored({ weakPatterns: ['topo-sort'] })]);
    const coding = (seen: string[], seed: number) => pickLoop(PROBLEMS, state, seeded(seed), ['coding'], new Set(seen))[0];
    expect(coding(['course-order'], 1).reason).toBe('any');
    for (let seed = 0; seed < 20; seed++) expect(coding(['course-order', 'warmer-days'], seed).problemId).toBe('shipping-capacity');
    expect(coding(['course-order', 'warmer-days', 'shipping-capacity'], 4)).toEqual({
      track: 'coding',
      problemId: 'course-order',
      reason: 'flagged',
    });
    for (let seed = 0; seed < 20; seed++) {
      expect(pickLoop(PROBLEMS, emptyProgress(), seeded(seed), ['design'], new Set(['url-shortener']))[0].problemId).toBe('news-feed');
    }
  });

  it('knows whether any interview flag is open', () => {
    expect(hasInterviewFlags(emptyProgress())).toBe(false);
    expect(hasInterviewFlags(replay([scored({ weakPatterns: ['topo-sort'] })]))).toBe(true);
    expect(hasInterviewFlags(replay([scored({ track: 'behavioral', competencyId: 'conflict', weakCompetencies: ['conflict'] })]))).toBe(
      true,
    );
  });

  it('runs only the rounds asked for, still in loop order, and skips a track the catalog has no problem for', () => {
    expect(pickLoop(PROBLEMS, emptyProgress(), seeded(1), ['behavioral', 'coding']).map((p) => p.track)).toEqual(['coding', 'behavioral']);
    const noDesign = PROBLEMS.filter((p) => p.track !== 'system-design');
    expect(pickLoop(noDesign, emptyProgress(), seeded(1)).map((p) => p.track)).toEqual(['coding', 'behavioral']);
  });
});
