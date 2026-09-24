import { describe, expect, it } from 'vitest';
import { codeSpanProblems, codeSpans } from './code-spans.js';

describe('codeSpans', () => {
  it('marks the text between backticks as code and keeps the spaces around it in the prose', () => {
    expect(codeSpans('What is x after `x ^= n`?')).toEqual([
      { text: 'What is x after ', code: false },
      { text: 'x ^= n', code: true },
      { text: '?', code: false },
    ]);
  });

  it('drops the empty parts a span at either end or two spans in a row leave', () => {
    expect(codeSpans('`p - k``dp[i]` fills')).toEqual([
      { text: 'p - k', code: true },
      { text: 'dp[i]', code: true },
      { text: ' fills', code: false },
    ]);
    expect(codeSpans('')).toEqual([]);
    expect(codeSpans('``')).toEqual([]);
  });

  it('returns text without backticks as one prose part', () => {
    expect(codeSpans('Scan once.')).toEqual([{ text: 'Scan once.', code: false }]);
  });

  it('shows an unbalanced backtick literally instead of guessing where the code ends', () => {
    expect(codeSpans('a `b` c`d')).toEqual([{ text: 'a `b` c`d', code: false }]);
    expect(codeSpans('`')).toEqual([{ text: '`', code: false }]);
  });
});

describe('codeSpanProblems', () => {
  it('passes prose and code spans of up to 24 characters', () => {
    expect(codeSpanProblems('What is x after `x ^= n`?')).toEqual([]);
    expect(codeSpanProblems(`\`${'x'.repeat(24)}\``)).toEqual([]);
    expect(codeSpanProblems('Scan once.')).toEqual([]);
  });

  it('reports an unbalanced backtick and every code span too long to fit the line', () => {
    expect(codeSpanProblems('a `b` c`d')).toEqual(['an unbalanced backtick']);
    expect(codeSpanProblems('`nums.slice(0, i).reduce(add)` or `nums.slice(i).reduce(add, 0)`')).toEqual([
      'a code span over 24 characters: nums.slice(0, i).reduce(add)',
      'a code span over 24 characters: nums.slice(i).reduce(add, 0)',
    ]);
  });
});
