import { describe, expect, it } from 'vitest';
import { getPattern } from '../curriculum/patterns.js';
import { CODING_CATALOG } from './catalog.js';
import { matchingCues } from './hints.js';
import { getCodingProblem } from './problems/index.js';

const match = (problemId: string) => {
  const problem = getCodingProblem(problemId)!;
  return matchingCues(getPattern(problem.patternIds[0])!.cues, problem.statement.join(' '));
};

describe('the cues a statement echoes', () => {
  it('finds the cues that share a word with the statement, and the words they share', () => {
    expect(match('search-rotated-array')).toEqual({ cues: ['Sorted input', 'Rotated sorted array'], words: ['sorted', 'rotated'] });
    expect(match('koko-bananas').cues).toEqual(['"Minimum capacity / speed / days such that…"']);
    expect(match('course-schedule').cues).toEqual(['Prerequisites / build order', '"Can all courses be finished?"']);
    expect(match('daily-temperatures').words).toEqual(['temperatures', 'days', 'warmer']);
  });

  it('takes a cue only when the statement says a word it leads with, or all of its words', () => {
    const binary = getPattern('binary-search')!.cues;
    const matrix = getCodingProblem('kth-smallest-sorted-matrix')!.statement.join(' ');
    expect(matchingCues(binary, matrix).cues).not.toContain('Rotated sorted array');
    expect(match('network-delay').cues).not.toContain('Network delay time');
    expect(matchingCues(getPattern('topo-sort')!.cues, 'Return the tasks in any order.').cues).toEqual([]);
    expect(matchingCues(['Word search in a grid'], 'Return the longest word.').cues).toEqual([]);
  });

  it('matches word stems, not common words', () => {
    expect(matchingCues(['Pairs that complement each other'], 'Find a pair.')).toEqual({
      cues: ['Pairs that complement each other'],
      words: ['pair'],
    });
    expect(matchingCues(['Given an array'], 'Given an array of numbers, return each value.')).toEqual({ cues: [], words: [] });
  });

  it('finds an echo for most problems', () => {
    const echoed = CODING_CATALOG.filter((p) => match(p.id).cues.length);
    expect(echoed.length / CODING_CATALOG.length).toBeGreaterThan(0.4);
  });
});
