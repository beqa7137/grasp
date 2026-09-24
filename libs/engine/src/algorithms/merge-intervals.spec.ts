import { describe, expect, it } from 'vitest';
import { formatField, mulberry32, parseField } from './input.js';
import { mergeIntervals } from './merge-intervals.js';
import { InputError, type Frame } from './types.js';

type Interval = [number, number];

const EM_DASH = String.fromCharCode(0x2014);
const OVERLAPS = 'Overlaps: merge it into last';
const NO_OVERLAP = 'No overlap: push it as a new interval';

// Walks the number line in half steps instead of sorting, so [1, 3] and [3, 5] join while [1, 3] and [4, 5] stay apart.
function reference(intervals: Interval[]): string {
  const covered = (x: number) => intervals.some(([s, e]) => s <= x && x <= e);
  const merged: string[] = [];
  for (let x = 0; x <= 99; x += 0.5) {
    if (!covered(x) || covered(x - 0.5)) continue;
    let end = x;
    while (covered(end + 0.5)) end += 0.5;
    merged.push(`[${x}, ${end}]`);
  }
  return `[${merged.join(', ')}]`;
}

const traceOf = (input: unknown) => mergeIntervals.trace(mergeIntervals.validate(input));
const resultOf = (frames: Frame[]) => frames[frames.length - 1].vars['result'];
const correctChoices = (frames: Frame[]) => frames.flatMap((f) => (f.predict ? [f.predict.choices[f.predict.answer]] : []));
const endOf = (last: unknown) => (JSON.parse(String(last)) as Interval)[1];

function expectWellFormed(frames: Frame[]) {
  expect(frames.length).toBeGreaterThan(1);
  expect(frames.length).toBeLessThan(600);
  expect(frames[frames.length - 1].predict).toBeUndefined();
  expect(JSON.parse(JSON.stringify(frames))).toEqual(frames);
  expect(JSON.stringify(frames)).not.toContain(EM_DASH);
  for (const f of frames) {
    expect(f.line).toBeGreaterThanOrEqual(1);
    expect(f.line).toBeLessThanOrEqual(mergeIntervals.code.length);
    expect(f.note.length).toBeGreaterThan(0);
    const { cells, active, deps = [], path = [] } = f.table!;
    for (const [r, c] of [...(active ? [active] : []), ...deps, ...path]) {
      expect(r >= 0 && r < cells.length && (c === 0 || c === 1)).toBe(true);
    }
    if (f.predict) {
      const { prompt, choices, answer, explain } = f.predict;
      expect(prompt.length).toBeGreaterThan(10);
      expect(explain.length).toBeGreaterThan(10);
      expect(choices.length).toBeGreaterThanOrEqual(2);
      expect(choices.length).toBeLessThanOrEqual(4);
      expect(new Set(choices).size).toBe(choices.length);
      expect(answer).toBeGreaterThanOrEqual(0);
      expect(answer).toBeLessThan(choices.length);
    }
  }
}

/** Each answer must match what the next frame shows, and the highlighted "reads from" cell must hold last[1]. */
function expectAnswersMatchTheTrace(frames: Frame[]) {
  frames.forEach((f, k) => {
    if (!f.predict) return;
    const { cells, deps } = f.table!;
    const [[r, c]] = deps!;
    expect(cells[r][c]).toBe(endOf(f.vars['last']));
    const next = frames[k + 1];
    const chosen = f.predict.choices[f.predict.answer];
    if (f.predict.prompt.endsWith('Does it overlap last?')) expect(next.line).toBe(chosen === OVERLAPS ? 6 : 7);
    else expect(endOf(next.vars['last'])).toBe(Number(chosen));
  });
}

describe('merge-intervals', () => {
  it('merges the default input and asks both kinds of question', () => {
    const frames = traceOf(mergeIntervals.defaultInput);
    expectWellFormed(frames);
    expectAnswersMatchTheTrace(frames);
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

  it('matches an independent reference on 300 seeded random inputs and covers every branch', () => {
    const rand = mulberry32(2026);
    const seen = new Set<string>();
    for (let n = 0; n < 300; n++) {
      const input = mergeIntervals.randomInput(rand);
      const frames = traceOf(input);
      expectWellFormed(frames);
      expectAnswersMatchTheTrace(frames);
      expect(resultOf(frames)).toBe(reference(mergeIntervals.validate(input).intervals));
      expect(frames.some((f) => f.predict)).toBe(true);
      for (const f of frames.filter((frame) => frame.predict)) {
        const { choices, answer, explain } = f.predict!;
        if (choices[answer] === NO_OVERLAP) seen.add('gap');
        else if (choices[answer] === OVERLAPS) seen.add(explain.includes('touching') ? 'touching' : 'overlap');
        else seen.add(answer === 0 ? 'contained' : 'extends');
      }
    }
    expect([...seen].sort()).toEqual(['contained', 'extends', 'gap', 'overlap', 'touching']);
  });

  it('handles a single interval, duplicates and nesting', () => {
    const single = traceOf({ intervals: [[4, 5]] });
    expectWellFormed(single);
    expect(resultOf(single)).toBe('[[4, 5]]');
    expect(single.some((f) => f.predict)).toBe(false);

    const duplicates = traceOf({
      intervals: [
        [2, 2],
        [2, 2],
      ],
    });
    expectWellFormed(duplicates);
    expect(resultOf(duplicates)).toBe('[[2, 2]]');
    expect(correctChoices(duplicates)).toEqual([OVERLAPS]);

    const nested = traceOf({
      intervals: [
        [3, 4],
        [0, 9],
        [1, 2],
      ],
    });
    expectWellFormed(nested);
    expectAnswersMatchTheTrace(nested);
    expect(resultOf(nested)).toBe('[[0, 9]]');
    expect(correctChoices(nested)).toEqual([OVERLAPS, '9', OVERLAPS, '9']);
  });

  it('is deterministic and never mutates its input', () => {
    expect(mergeIntervals.randomInput(mulberry32(7))).toEqual(mergeIntervals.randomInput(mulberry32(7)));
    const input = structuredClone(mergeIntervals.defaultInput);
    const first = mergeIntervals.trace(input);
    expect(input).toEqual(mergeIntervals.defaultInput);
    expect(mergeIntervals.trace(input)).toEqual(first);
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

  it('round-trips the text the input box shows', () => {
    const text = formatField('intervals', mergeIntervals.defaultInput.intervals);
    expect(text).toBe('1-3, 8-10, 2-6, 15-18, 18-20, 4-5');
    expect(mergeIntervals.validate({ intervals: parseField('intervals', text) })).toEqual(mergeIntervals.defaultInput);
    expect(mergeIntervals.validate({ intervals: parseField('intervals', ' 4-5,1-3 ; 2 - 6\n8-10') }).intervals).toEqual([
      [4, 5],
      [1, 3],
      [2, 6],
      [8, 10],
    ]);
  });
});
