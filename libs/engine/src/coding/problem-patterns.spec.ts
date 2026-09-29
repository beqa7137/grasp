import { describe, expect, it } from 'vitest';
import { ALGORITHM_CATALOG } from '../algorithms/catalog.js';
import { ALGORITHM_PATTERNS } from '../algorithms/patterns.js';
import { CODING_CATALOG } from './catalog.js';
import { PROBLEM_PATTERNS, problemPatterns } from './problem-patterns.js';

describe('pattern maps kept apart from the catalogs', () => {
  it('name exactly the problems and visualizers in their catalogs, in the same order', () => {
    expect(Object.keys(PROBLEM_PATTERNS)).toEqual(CODING_CATALOG.map((p) => p.id));
    expect(Object.keys(ALGORITHM_PATTERNS)).toEqual(ALGORITHM_CATALOG.map((a) => a.id));
  });

  it('look up a problem without mistaking an inherited key for one', () => {
    expect(problemPatterns('two-sum')).toEqual(['hashing']);
    expect(problemPatterns('constructor')).toBeUndefined();
  });
});
