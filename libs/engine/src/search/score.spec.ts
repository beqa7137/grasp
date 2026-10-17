import { describe, expect, it } from 'vitest';
import { SCORES, editDistance, prepare, queryWords, scoreOf, suggestionDistance, wordsOf } from './score.js';

const item = prepare({
  title: 'K-th Largest Element',
  aliases: ['Kth Largest Element in an Array'],
  tagWords: wordsOf('Heap / Top-K'),
  blurbWords: wordsOf('Keep a min-heap of size k'),
});
const score = (query: string) => scoreOf(item, queryWords(query));

describe('search scoring', () => {
  it('reads hyphenated words both joined and apart, and folds case, accents and apostrophes', () => {
    expect(wordsOf('K-th Largest')).toEqual(['k', 'th', 'kth', 'largest']);
    expect(queryWords('  K-TH  Café’s ')).toEqual(['kth', 'cafes']);
  });

  it('scores each rule of 2.9, taking the best one met', () => {
    expect(score('k-th largest element')).toBe(SCORES.exact);
    expect(score('kth larg')).toBe(SCORES.titlePrefix);
    expect(score('kth largest element in')).toBe(SCORES.alias);
    expect(score('element')).toBe(SCORES.titleWord);
    expect(score('array')).toBe(SCORES.titleWord);
    expect(score('largest top')).toBe(SCORES.tag);
    expect(score('size')).toBe(SCORES.blurbWord);
    expect(score('largest queue')).toBe(0);
    expect(score('')).toBe(0);
  });

  it('measures edits and gives up past its limit', () => {
    expect(editDistance('ratelimter', 'ratelimiter')).toBe(1);
    expect(editDistance('kitten', 'sitting')).toBe(3);
    expect(editDistance('abc', 'abcdefgh', 2)).toBe(3);
  });

  it('suggests within two edits of a whole title or its start, and never for a very short query', () => {
    expect(suggestionDistance('ratelimtr', 'ratelimiter')).toBe(2);
    expect(suggestionDistance('dijsk', 'dijkstrasshortestpaths')).toBe(2);
    expect(suggestionDistance('cat', 'car')).toBe(1);
    expect(suggestionDistance('ct', 'cat')).toBeNull();
    expect(suggestionDistance('heap', 'trie')).toBeNull();
  });
});
