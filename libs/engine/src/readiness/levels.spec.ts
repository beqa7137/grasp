import { describe, expect, it } from 'vitest';
import { COMPETENCY_CATALOG } from '../behavioral/catalog.js';
import { SENIORITY_LEVELS } from '../behavioral/types.js';
import { problemsForPattern } from '../coding/catalog.js';
import { PATTERN_CATALOG } from '../curriculum/catalog.js';
import { sdTopicLevel } from '../curriculum/sd-shelves.js';
import { SD_TOPICS } from '../curriculum/sd-topics.js';
import { CASE_CATALOG } from '../sysdesign/case-catalog.js';
import { problemsAtBar } from './bar.js';
import { LEVEL_PROFILES, meetsBar, shelfStretchAt } from './levels.js';
import { TARGET_LEVELS } from '../plan/options.js';

const names = (ids: readonly string[]) => ids.map((id) => PATTERN_CATALOG.find((p) => p.id === id)!.name);

describe('level profiles', () => {
  it('cover every level the Target can name', () => {
    expect(TARGET_LEVELS).toEqual(SENIORITY_LEVELS.map((l) => l.level));
    expect(Object.keys(LEVEL_PROFILES)).toEqual([...TARGET_LEVELS]);
  });

  it('split every pattern into required and stretch, as REDESIGN.md 2.2 lists them', () => {
    for (const p of Object.values(LEVEL_PROFILES)) {
      expect([...p.patterns.required, ...p.patterns.stretch].sort()).toEqual(PATTERN_CATALOG.map((x) => x.id).sort());
    }
    expect(names(LEVEL_PROFILES.early.patterns.required)).toEqual([
      'Arrays & Hashing',
      'Two Pointers',
      'Sliding Window',
      'Binary Search',
      'Prefix Sums',
      'Monotonic Stack',
      'Fast & Slow Pointers',
      'Linked List Reversal',
      'Intervals',
      'Heap / Top-K',
      'Breadth-First Search',
      'DFS & Backtracking',
      'Tree Traversal',
      '1-D Dynamic Programming',
    ]);
    expect(LEVEL_PROFILES.early.patterns.stretch).toHaveLength(9);
    expect(names(LEVEL_PROFILES.early.patterns.stretch)).toContain('Topological Sort');
    for (const level of ['mid', 'senior'] as const) {
      expect(LEVEL_PROFILES[level].patterns.required).toHaveLength(20);
      expect(LEVEL_PROFILES[level].patterns.required).toEqual(expect.arrayContaining(['greedy', 'trie', 'union-find']));
      expect(names(LEVEL_PROFILES[level].patterns.stretch)).toEqual(['Minimum Spanning Tree', 'Bit Manipulation', 'Bitmask DP']);
    }
  });

  it('require the 17 core topics below Senior, and all but Service Discovery and API Gateways at Senior', () => {
    const core = SD_TOPICS.filter((t) => sdTopicLevel(t.id) === 'core').map((t) => t.id);
    expect(core).toHaveLength(17);
    expect(LEVEL_PROFILES.mid.topics).toEqual({
      required: core,
      stretch: SD_TOPICS.filter((t) => sdTopicLevel(t.id) === 'advanced').map((t) => t.id),
    });
    expect(LEVEL_PROFILES.early.topics).toEqual(LEVEL_PROFILES.mid.topics);
    expect(LEVEL_PROFILES.senior.topics.stretch).toEqual(['sd-discovery', 'sd-gateway']);
    expect(LEVEL_PROFILES.senior.topics.required).toHaveLength(32);
    expect(LEVEL_PROFILES.senior.topics.required).toContain('sd-multi-region');
  });

  it('require 4 core cases below Senior, and the 9 core cases plus Ad Click Aggregator at Senior', () => {
    expect(LEVEL_PROFILES.mid.cases.required).toEqual(['url-shortener', 'rate-limiter', 'news-feed', 'chat']);
    const core = CASE_CATALOG.filter((c) => c.level === 'core').map((c) => c.id);
    expect([...LEVEL_PROFILES.senior.cases.required].sort()).toEqual([...core, 'ad-click-aggregator'].sort());
    // levels.ts lists them by hand, so it need not load the case catalog; they keep the catalog's order.
    const senior: readonly string[] = LEVEL_PROFILES.senior.cases.required;
    expect(senior).toEqual(CASE_CATALOG.filter((c) => senior.includes(c.id)).map((c) => c.id));
    for (const id of LEVEL_PROFILES.mid.cases.required) expect(core).toContain(id);
  });

  it('mark a shelf with no required topic as Stretch at that level', () => {
    expect(shelfStretchAt('coordination')).toEqual(['early', 'mid']);
    expect(shelfStretchAt('foundations')).toEqual([]);
  });

  it('weigh all 13 competencies, five of them double at Senior', () => {
    for (const p of Object.values(LEVEL_PROFILES)) expect(p.competencies.map((c) => c.id)).toEqual(COMPETENCY_CATALOG.map((c) => c.id));
    expect(LEVEL_PROFILES.mid.competencies.every((c) => c.weight === 1)).toBe(true);
    expect(LEVEL_PROFILES.senior.competencies.filter((c) => c.weight === 2).map((c) => c.id)).toEqual([
      'ambiguity',
      'influence',
      'leadership',
      'tradeoffs',
      'technical-depth',
    ]);
  });
});

describe('the level bar', () => {
  it('needs medium or harder for Ready at every level; only a New Early career start may begin on an easy problem', () => {
    for (const p of Object.values(LEVEL_PROFILES)) expect(p.bar).toBe('medium');
    expect(LEVEL_PROFILES.early.startBar).toBe('easy');
    expect(LEVEL_PROFILES.mid.startBar).toBe('medium');
    expect(meetsBar({ difficulty: 'easy' }, 'medium')).toBe(false);
    expect(meetsBar({ difficulty: 'hard' }, 'medium')).toBe(true);
  });

  it('is always reachable: every pattern has at least 2 problems of its own at medium or harder', () => {
    for (const p of PATTERN_CATALOG) expect(problemsAtBar(p.id, 'medium').length, p.id).toBeGreaterThanOrEqual(2);
  });

  it('never needs hard: these patterns have no hard member', () => {
    const noHard = PATTERN_CATALOG.filter((p) => !problemsForPattern(p.id).some((x) => x.difficulty === 'hard')).map((p) => p.id);
    expect(noHard).toEqual(['hashing', 'prefix-sum', 'fast-slow', 'intervals', 'dp-1d']);
  });

  it('lists only the pattern own problems at the bar, easiest first: a cross-listed problem never counts', () => {
    const list = problemsAtBar('binary-search', 'medium');
    expect(list.every((p) => p.patternIds[0] === 'binary-search' && p.difficulty !== 'easy')).toBe(true);
    const ranks = list.map((p) => ['easy', 'medium', 'hard'].indexOf(p.difficulty));
    expect(ranks).toEqual([...ranks].sort());
    expect(problemsAtBar('greedy', 'easy').some((p) => p.id === 'ship-within-days')).toBe(false);
  });
});
