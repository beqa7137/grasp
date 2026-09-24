import { describe, expect, it } from 'vitest';
import { formatField, mulberry32, parseField } from './input.js';
import { mergeIntervals } from './merge-intervals.js';
import { InputError, type Frame } from './types.js';

type Interval = [number, number];

const EM_DASH = '\u2014';
const OVERLAPS = 'Overlaps: merge it into last';
const NO_OVERLAP = 'No overlap: push it as a new interval';

const traceOf = (input: unknown) => mergeIntervals.trace(mergeIntervals.validate(input));
const resultOf = (frames: Frame[]) => frames[frames.length - 1].vars['result'];
const correctChoices = (frames: Frame[]) => frames.flatMap((f) => (f.predict ? [f.predict.choices[f.predict.answer]] : []));
const endOf = (last: unknown) => (JSON.parse(String(last)) as Interval)[1];

const cellsInRange = (frames: Frame[]) =>
  frames.every(({ table }) => {
    const { cells, active, deps = [], path = [] } = table!;
    return [...(active ? [active] : []), ...deps, ...path].every(([r, c]) => r >= 0 && r < cells.length && (c === 0 || c === 1));
  });

/** Also checks that the highlighted deps cell holds last[1]. */
const answersMatchTheTrace = (frames: Frame[]) =>
  frames.every((f, k) => {
    if (!f.predict) return true;
    const [[r, c]] = f.table!.deps!;
    const next = frames[k + 1];
    const chosen = f.predict.choices[f.predict.answer];
    const confirmed = f.predict.prompt.endsWith('Does it overlap last?')
      ? next.line === (chosen === OVERLAPS ? 6 : 7)
      : endOf(next.vars['last']) === Number(chosen);
    return confirmed && f.table!.cells[r][c] === endOf(f.vars['last']);
  });

describe('merge-intervals', () => {
  it('merges the default input and asks both kinds of question', () => {
    const frames = traceOf(mergeIntervals.defaultInput);
    expect(cellsInRange(frames)).toBe(true);
    expect(answersMatchTheTrace(frames)).toBe(true);
    expect(resultOf(frames)).toBe('[[1, 6], [8, 10], [15, 20]]');
    expect(frames[0].table!.cells).toEqual(mergeIntervals.defaultInput.intervals);
    expect(frames[1].table!.cells).toEqual([
      [1, 3],
      [2, 6],
      [4, 5],
      [8, 10],
      [15, 18],
      [18, 20],
    ]);
    expect(correctChoices(frames)).toEqual([OVERLAPS, '6', OVERLAPS, '6', NO_OVERLAP, NO_OVERLAP, OVERLAPS, '20']);
    const { cells, path } = frames[frames.length - 1].table!;
    expect(path!.map(([r, c]) => cells[r][c])).toEqual([1, 6, 8, 10, 15, 20]);
    expect(frames[frames.length - 1].output!.items).toEqual(['[1, 6]', '[8, 10]', '[15, 20]']);
  });

  it('asks on every random input, answers what the next frame shows and covers every branch', () => {
    const rand = mulberry32(2026);
    const seen = new Set<string>();
    for (let n = 0; n < 60; n++) {
      const frames = traceOf(mergeIntervals.randomInput(rand));
      expect(frames.some((f) => f.predict) && cellsInRange(frames) && answersMatchTheTrace(frames)).toBe(true);
      for (const { choices, answer, explain } of frames.flatMap((f) => f.predict ?? [])) {
        if (choices[answer] === NO_OVERLAP) seen.add('gap');
        else if (choices[answer] === OVERLAPS) seen.add(explain.includes('touching') ? 'touching' : 'overlap');
        else seen.add(answer === 0 ? 'contained' : 'extends');
      }
    }
    expect([...seen].sort()).toEqual(['contained', 'extends', 'gap', 'overlap', 'touching']);
  });

  it('handles a single interval, duplicates and nesting', () => {
    const single = traceOf({ intervals: [[4, 5]] });
    expect(resultOf(single)).toBe('[[4, 5]]');
    expect(single.some((f) => f.predict)).toBe(false);

    const duplicates = traceOf({
      intervals: [
        [2, 2],
        [2, 2],
      ],
    });
    expect(resultOf(duplicates)).toBe('[[2, 2]]');
    expect(correctChoices(duplicates)).toEqual([OVERLAPS]);

    const nested = traceOf({
      intervals: [
        [3, 4],
        [0, 9],
        [1, 2],
      ],
    });
    expect(answersMatchTheTrace(nested)).toBe(true);
    expect(resultOf(nested)).toBe('[[0, 9]]');
    expect(correctChoices(nested)).toEqual([OVERLAPS, '9', OVERLAPS, '9']);
    expect([single, duplicates, nested].every(cellsInRange)).toBe(true);
  });

  it('never mutates its input', () => {
    const input = structuredClone(mergeIntervals.defaultInput);
    mergeIntervals.trace(input);
    expect(input).toEqual(mergeIntervals.defaultInput);
  });

  it('rejects bad input with clear InputErrors', () => {
    const rejects = (intervals: unknown, message: RegExp) => {
      expect(() => mergeIntervals.validate({ intervals })).toThrow(InputError);
      expect(() => mergeIntervals.validate({ intervals })).toThrow(message);
    };
    rejects(undefined, /must list at least one interval/);
    rejects([], /must list at least one interval/);
    rejects('1-3, 2-6', /must list at least one interval/);
    rejects(
      Array.from({ length: 11 }, (_, i) => [i, i + 1]),
      /at most 10 intervals/,
    );
    rejects([[1]], /write each interval as start-end/);
    rejects([[1, 2, 3]], /write each interval as start-end/);
    rejects([['a', 3]], /write each interval as start-end/);
    rejects([[1.5, 3]], /write each interval as start-end/);
    rejects([[-1, 3]], /values go from 0 to 99/);
    rejects([[1, 100]], /values go from 0 to 99/);
    rejects([[5, 2]], /5-2 starts after it ends/);
    rejects(parseField('intervals', '1-3, 3'), /write each interval as start-end/);
    rejects(parseField('intervals', ''), /must list at least one interval/);
  });

  it('writes intervals as start-end text and reads loosely typed text back', () => {
    expect(formatField('intervals', mergeIntervals.defaultInput.intervals)).toBe('1-3, 8-10, 2-6, 15-18, 18-20, 4-5');
    expect(mergeIntervals.validate({ intervals: parseField('intervals', ' 4-5,1-3 ; 2 - 6\n8-10') }).intervals).toEqual([
      [4, 5],
      [1, 3],
      [2, 6],
      [8, 10],
    ]);
  });

  it('never shows an em dash', () => {
    const rand = mulberry32(1);
    const traces = [mergeIntervals.defaultInput, ...Array.from({ length: 20 }, () => mergeIntervals.randomInput(rand))].map(traceOf);
    expect(JSON.stringify([mergeIntervals, traces])).not.toContain(EM_DASH);
  });
});
