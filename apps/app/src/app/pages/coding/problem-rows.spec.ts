import { getProblemSummary, type CodingRecord } from '@grasp/engine';
import { problemRow } from './problem-rows';

const record = (solved: boolean): CodingRecord => ({
  attempts: 2,
  solvedAt: solved ? '2026-10-01T10:00:00.000Z' : null,
  bestPassed: 3,
  total: 5,
  lastAt: '2026-10-01T10:00:00.000Z',
});

describe('problemRow', () => {
  it('names the state, difficulty and best score a row shows', () => {
    const p = getProblemSummary('container-most-water')!;
    expect(problemRow.status(undefined).label).toBe('Unsolved');
    expect(problemRow.status(record(false)).label).toBe('Attempted');
    expect(problemRow.status(record(true))).toMatchObject({ label: 'Solved', tone: 'success' });
    expect([problemRow.level(p), problemRow.levelLabel(p)]).toEqual([2, 'Medium']);
    expect(problemRow.best(record(false))).toEqual(['best 3/5']);
    expect(problemRow.best(record(true))).toEqual([]);
  });

  it("names a problem's other patterns, never the list's own", () => {
    const p = getProblemSummary('container-most-water')!;
    expect(problemRow.alsoIn(p, 'two-pointers')).toEqual(['also in Greedy']);
    expect(problemRow.alsoIn(p, 'greedy')).toEqual(['also in Two Pointers']);
    expect(problemRow.alsoIn(getProblemSummary('two-sum')!, 'hashing')).toEqual([]);
  });
});
