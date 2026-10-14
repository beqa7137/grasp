import { describe, expect, it } from 'vitest';
import { ALGORITHM_CATALOG } from '../algorithms/catalog.js';
import { ALGORITHM_STRUCTURE_NAMES, ALGORITHM_STRUCTURES } from '../algorithms/structures.js';
import { PATTERN_CATALOG } from '../curriculum/catalog.js';
import type { CodingRecord } from '../srs/progress.js';
import { startHerePattern } from '../srs/diagnostic.js';
import { CODING_CATALOG } from './catalog.js';
import {
  EMPTY_LIBRARY_QUERY,
  byDifficulty,
  currentPattern,
  isFiltered,
  libraryQueryParams,
  librarySummary,
  parseLibraryQuery,
  problemState,
  queryLibrary,
  type LibraryQuery,
} from './library.js';

const solved = (at = '2026-10-01T10:00:00.000Z'): CodingRecord => ({ attempts: 1, solvedAt: at, bestPassed: 5, total: 5, lastAt: at });
const attempted = (at = '2026-10-02T10:00:00.000Z'): CodingRecord => ({ attempts: 2, solvedAt: null, bestPassed: 3, total: 5, lastAt: at });
const query = (q: Partial<LibraryQuery>): LibraryQuery => ({ ...EMPTY_LIBRARY_QUERY, ...q });

describe('the problem library', () => {
  it('lists every problem once, and 187 rows under the 23 patterns', () => {
    const { problems, groups } = queryLibrary(EMPTY_LIBRARY_QUERY, {});
    expect(problems).toHaveLength(164);
    expect(groups.map((g) => g.pattern.id)).toEqual(PATTERN_CATALOG.map((p) => p.id));
    expect(groups.reduce((n, g) => n + g.rows.length, 0)).toBe(187);
  });

  it('shows Graphs & trees as 51 problems in 57 rows under its 7 patterns (journey 2)', () => {
    const { problems, groups, counts } = queryLibrary(query({ track: ['graphs'] }), {});
    expect(problems).toHaveLength(51);
    expect(groups).toHaveLength(7);
    expect(groups.reduce((n, g) => n + g.rows.length, 0)).toBe(57);
    expect(counts.track).toEqual({ foundations: 36, core: 44, graphs: 51, advanced: 46 });
  });

  it('counts a pattern by membership: Binary Search has 9, whatever else a member lists', () => {
    const { counts, groups } = queryLibrary(EMPTY_LIBRARY_QUERY, {});
    expect(counts.pattern['binary-search']).toBe(9);
    expect(groups.find((g) => g.pattern.id === 'binary-search')).toMatchObject({ members: 9, solved: 0 });
  });

  it("counts each facet without its own selection, and with every other facet's", () => {
    const coding = { 'two-sum': solved(), 'three-sum': attempted() };
    const { counts, problems } = queryLibrary(query({ status: ['solved'], difficulty: ['medium'] }), coding);
    expect(problems).toEqual([]);
    expect(counts.status).toEqual({ unsolved: 121, attempted: 1, solved: 0 });
    expect(counts.difficulty).toEqual({ easy: 1, medium: 0, hard: 0 });
    expect(Object.values(queryLibrary(EMPTY_LIBRARY_QUERY, coding).counts.status).reduce((a, b) => a + b)).toBe(164);
  });

  it('gives a pattern outside the chosen tracks a count of 0, and a track outside the chosen patterns too', () => {
    const { counts } = queryLibrary(query({ track: ['foundations'], pattern: ['bfs'] }), {});
    expect(counts.pattern['bfs']).toBe(0);
    expect(counts.pattern['binary-search']).toBe(9);
    expect(counts.track.graphs).toBe(10);
    expect(counts.track.foundations).toBe(0);
  });

  it('matches every search word inside a title, in any case', () => {
    const { problems } = queryLibrary(query({ q: '  TWO sum ' }), {});
    expect(problems.map((p) => p.id)).toContain('two-sum');
    expect(problems.every((p) => /two/i.test(p.title) && /sum/i.test(p.title))).toBe(true);
    expect(queryLibrary(query({ q: 'zzzz' }), {}).groups).toEqual([]);
  });

  it('has three exclusive states', () => {
    expect([problemState(undefined), problemState(attempted()), problemState(solved())]).toEqual(['unsolved', 'attempted', 'solved']);
  });

  it('round-trips the URL, drops unknown values and keeps the catalog order', () => {
    const parsed = parseLibraryQuery({ track: 'graphs,nope,foundations', difficulty: 'hard,easy', status: 'solved', q: ' koko ' });
    expect(parsed).toEqual({ q: 'koko', status: ['solved'], difficulty: ['easy', 'hard'], track: ['foundations', 'graphs'], pattern: [] });
    expect(libraryQueryParams(parsed)).toEqual({
      q: 'koko',
      status: 'solved',
      difficulty: 'easy,hard',
      track: 'foundations,graphs',
      pattern: null,
    });
    expect(parseLibraryQuery({})).toEqual(EMPTY_LIBRARY_QUERY);
    expect(isFiltered(parseLibraryQuery({}))).toBe(false);
    expect(isFiltered(parsed)).toBe(true);
    expect(isFiltered({ ...EMPTY_LIBRARY_QUERY, track: ['graphs'] })).toBe(true);
    expect(Object.values(libraryQueryParams(EMPTY_LIBRARY_QUERY)).every((v) => v === null)).toBe(true);
  });

  it('orders the Mixed view easiest first and keeps the catalog order within a difficulty', () => {
    const mixed = byDifficulty(CODING_CATALOG);
    expect(mixed.map((p) => p.difficulty).slice(0, 15)).toEqual(Array(15).fill('easy'));
    expect(mixed[mixed.length - 1].difficulty).toBe('hard');
    expect(mixed.filter((p) => p.difficulty === 'medium')).toEqual(CODING_CATALOG.filter((p) => p.difficulty === 'medium'));
  });

  it('sums the solved problems overall and per difficulty', () => {
    const summary = librarySummary({ 'two-sum': solved(), 'three-sum': attempted() });
    expect(summary).toMatchObject({ solved: 1, total: 164 });
    expect(summary.byDifficulty).toEqual({
      easy: { solved: 1, total: 15 },
      medium: { solved: 0, total: 122 },
      hard: { solved: 0, total: 27 },
    });
  });

  it('opens on the latest worked pattern, else where placement starts, else the first pattern', () => {
    expect(currentPattern({}, {})).toBe('hashing');
    expect(currentPattern({}, { hashing: 'strong', 'two-pointers': 'weak', bfs: 'weak' })).toBe('two-pointers');
    expect(startHerePattern({ hashing: 'strong' })).toBeNull();
    // Start here moves on once the learner has practised the first weak pattern.
    expect(startHerePattern({ 'two-pointers': 'weak', bfs: 'weak' }, (id) => id === 'two-pointers')).toBe('bfs');
    const coding = { 'two-sum': solved('2026-10-01T10:00:00.000Z'), 'three-sum': attempted('2026-10-03T10:00:00.000Z') };
    expect(currentPattern(coding, { bfs: 'weak' })).toBe(CODING_CATALOG.find((p) => p.id === 'three-sum')!.patternIds[0]);
  });
});

describe('visualizer structures', () => {
  it('names one structure for every visualizer, and every structure has one', () => {
    const structures = ALGORITHM_CATALOG.map((a) => ALGORITHM_STRUCTURES[a.id]);
    expect(structures.every(Boolean)).toBe(true);
    expect(new Set(structures)).toEqual(new Set(Object.keys(ALGORITHM_STRUCTURE_NAMES)));
  });
});
