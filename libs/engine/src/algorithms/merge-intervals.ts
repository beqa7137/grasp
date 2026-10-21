import { spansOf } from './annotate.js';
import { VALUE, fixedChoices, rotatedChoices } from './choices.js';
import { InputError } from './types.js';
import { randInt, shuffle } from './random.js';
import type { AlgorithmDefinition, Frame, TableLegend, TableView } from './types.js';

type Interval = [number, number];
type Input = { intervals: Interval[] };

const MAX_INTERVALS = 10;
const MAX_VALUE = 99;
const OVERLAP = ['Overlaps: merge it into last', 'No overlap: push it as a new interval'];
const LEGEND: TableLegend = { active: 'current interval', deps: 'last[1]', path: 'out so far' };

const show = ([s, e]: Interval) => `[${s}, ${e}]`;

function asIntervals(value: unknown, key: string): Interval[] {
  const items = Array.isArray(value) ? value : null;
  if (!items || items.length === 0) throw new InputError(`${key} must list at least one interval, like 1-3, 2-6`);
  if (items.length > MAX_INTERVALS) throw new InputError(`${key} can hold at most ${MAX_INTERVALS} intervals`);
  return items.map((raw) => {
    const pair = Array.isArray(raw) ? raw.map(Number) : null;
    if (!pair || pair.length !== 2 || pair.some((n) => !Number.isInteger(n))) {
      throw new InputError(`${key}: write each interval as start-end, like 1-3`);
    }
    if (pair.some((n) => n < 0 || n > MAX_VALUE)) throw new InputError(`${key}: values go from 0 to ${MAX_VALUE}`);
    const [s, e] = pair;
    if (s > e) throw new InputError(`${key}: ${s}-${e} starts after it ends`);
    return [s, e];
  });
}

const CODE = [
  'function merge(intervals) {',
  '  intervals.sort((a, b) => a[0] - b[0]);',
  '  const out = [[...intervals[0]]];',
  '  let last = out[0];',
  '  for (const [s, e] of intervals.slice(1)) {',
  '    if (s <= last[1]) last[1] = Math.max(last[1], e);',
  '    else out.push(last = [s, e]);',
  '  }',
  '  return out;',
  '}',
];

const SPANS = spansOf(CODE, {
  2: 'intervals.sort((a, b) => a[0] - b[0])',
  3: 'const out = [[...intervals[0]]]',
  4: 'let last = out[0]',
  5: 'const [s, e] of intervals.slice(1)',
  6: 's <= last[1]',
  7: 'out.push(last = [s, e])',
  9: 'return out',
});
const MERGE_SPAN = spansOf(CODE, { 6: 'last[1] = Math.max(last[1], e)' })[6];

export const mergeIntervals: AlgorithmDefinition<Input> = {
  code: CODE,
  fields: [{ key: 'intervals', label: 'Intervals', kind: 'intervals', hint: 'Like 1-3, 2-6, in any order' }],
  defaultInput: {
    intervals: [
      [1, 3],
      [8, 10],
      [2, 6],
      [15, 18],
      [18, 20],
      [4, 5],
    ],
  },
  presets: [
    {
      label: 'Touching ends merge',
      input: {
        intervals: [
          [1, 2],
          [2, 3],
          [3, 4],
        ],
      },
    },
    {
      label: 'One interval holds the rest',
      input: {
        intervals: [
          [2, 3],
          [1, 10],
          [4, 5],
        ],
      },
    },
    {
      label: 'Nothing overlaps',
      input: {
        intervals: [
          [5, 6],
          [1, 2],
          [3, 4],
        ],
      },
    },
  ],

  randomInput(rand = Math.random) {
    const intervals: Interval[] = [];
    let start = randInt(rand, 0, 4);
    for (let left = randInt(rand, 5, 8); left > 0; left--) {
      const end = start + randInt(rand, 0, 6);
      intervals.push([start, end]);
      start = rand() < 0.55 ? randInt(rand, start, end) : end + randInt(rand, 0, 4);
    }
    return { intervals: shuffle(rand, intervals) };
  },

  validate(input) {
    const raw = (input ?? {}) as Record<string, unknown>;
    return { intervals: asIntervals(raw['intervals'], 'intervals') };
  },

  trace({ intervals }) {
    const frames: Frame[] = [];
    let rows = intervals;
    const out: Interval[] = [];
    let last: Interval | null = null;
    const outRows: [startRow: number, endRow: number][] = [];
    let i = -1;
    let chapter = 'Sort';

    const table = (focus: Partial<TableView> = {}): TableView => ({
      rowLabels: rows.map((_, r) => String(r)),
      colLabels: ['start', 'end'],
      cells: rows.map(([s, e]) => [s, e]),
      path: outRows.flatMap(([startRow, endRow]): [number, number][] => [
        [startRow, 0],
        [endRow, 1],
      ]),
      active: i > 0 && i < rows.length ? [i, 0] : undefined,
      legend: LEGEND,
      ...focus,
    });

    const snap = (line: number, caption: string, note: string, extra: Partial<Frame> = {}) => {
      const current = i > 0 && i < rows.length ? rows[i] : null;
      frames.push({
        line,
        caption,
        note,
        chapter,
        span: SPANS[line],
        vars: { s: current ? current[0] : null, e: current ? current[1] : null, last: last ? show(last) : null },
        table: table(),
        output: { label: 'out', items: out.map(show) },
        ...extra,
      });
    };

    snap(
      2,
      'The intervals as given. Sort them by start first.',
      'The intervals as given. Sort them by start first, so that overlapping intervals end up next to each other.',
    );
    const wasSorted = rows.every((row, r) => r === 0 || rows[r - 1][0] <= row[0]);
    rows = [...rows].sort((a, b) => a[0] - b[0]);
    snap(
      2,
      `${wasSorted ? 'Already sorted' : 'Sorted'} by start: overlaps now sit next to each other.`,
      `${wasSorted ? 'Already sorted' : 'Sorted'} by start. Now an interval can only overlap the most recent merged one, never an earlier one.`,
    );

    out.push([...rows[0]]);
    outRows.push([0, 0]);
    chapter = 'Set up';
    snap(
      3,
      `out starts with a copy of ${show(rows[0])}.`,
      `out starts with a copy of ${show(rows[0])}. It is a copy because merging will edit it in place.`,
    );
    last = out[0];
    snap(
      4,
      'last points at the newest interval in out.',
      'last points at the newest entry of out. It is the only merged interval a later one can still reach.',
    );

    for (i = 1; i < rows.length; i++) {
      const [s, e] = rows[i];
      const [start, end] = last;
      const source = outRows[outRows.length - 1];
      const endCell: [number, number] = [source[1], 1];
      const overlaps = s <= end;

      chapter = `Interval ${i}: ${show(rows[i])}`;
      snap(5, `Next comes ${show(rows[i])}.`, `Next interval: ${show(rows[i])}.`, { lens: `s = ${s}, e = ${e}` });
      snap(6, `Compare its start, ${s}, with the end of last, ${end}.`, `Compare \`s = ${s}\` with \`last[1] = ${end}\`.`, {
        table: table({ deps: [endCell] }),
        predict: {
          prompt: `\`last = [${start}, ${end}]\`, next interval [${s}, ${e}]. Does it overlap last?`,
          ...fixedChoices(OVERLAP, overlaps ? 0 : 1),
          explain: overlaps
            ? `${s} ≤ ${end}: it starts ${s === end ? 'exactly where last ends, and touching endpoints count as overlapping' : 'before last ends'}. Sorting already guarantees ${s} ≥ ${start}, so checking the end is enough.`
            : `${s} > ${end}: it starts after last ends. Every later interval starts at ${s} or later, so nothing can reach last again: it is final.`,
          skill: 'overlap',
        },
      });

      if (!overlaps) {
        last = [s, e];
        out.push(last);
        outRows.push([i, i]);
        snap(
          7,
          `${s} > ${end}: no overlap, so [${s}, ${e}] goes in as the new last.`,
          `${s} > ${end}: no overlap. Push [${s}, ${e}]; it becomes the new last.`,
          {
            lens: `last = [${s}, ${e}]`,
          },
        );
        continue;
      }

      const merged = Math.max(end, e);
      if (e !== end) {
        snap(
          6,
          'They overlap, so settle the end of the merged interval.',
          `${s} ≤ ${end}: they overlap, so [${s}, ${e}] merges into last. Now settle its end.`,
          {
            span: MERGE_SPAN,
            table: table({ active: [i, 1], deps: [endCell] }),
            predict: {
              ...rotatedChoices(
                `[${s}, ${e}] overlaps \`last = [${start}, ${end}]\`. What is the merged end after this step?`,
                String(merged),
                [String(merged === end ? e : end)],
              ),
              explain:
                e < end
                  ? `\`max(${end}, ${e}) = ${end}\`. [${s}, ${e}] sits inside last, so setting \`last[1] = e\` would wrongly shrink [${start}, ${end}] to [${start}, ${e}].`
                  : `\`max(${end}, ${e}) = ${e}\`. [${s}, ${e}] reaches past last, so the merged interval grows to ${e}.`,
              skill: 'merge-end',
              pick: VALUE,
            },
          },
        );
      }
      last[1] = merged;
      if (e > end) source[1] = i;
      snap(
        6,
        merged === end ? `[${s}, ${e}] fits inside last, so last stays [${start}, ${end}].` : `last grows to [${start}, ${merged}].`,
        `\`last[1] = max(${end}, ${e})\` = ${merged}, so last is now [${start}, ${merged}].`,
        {
          table: table({ active: [i, 1] }),
          span: MERGE_SPAN,
          lens: `max(${end}, ${e}) = ${merged}`,
        },
      );
    }

    chapter = 'Result';
    snap(
      9,
      rows.length === 1
        ? 'Done: one interval, so nothing to merge.'
        : out.length === rows.length
          ? `Done: none of the ${rows.length} intervals overlap.`
          : `Done: ${rows.length} intervals merged into ${out.length}.`,
      `Done: ${rows.length} interval${rows.length === 1 ? '' : 's'} merged into ${out.length}. Sorting costs O(n log n) and the sweep visits each interval once, so O(n log n) overall.`,
    );
    frames[frames.length - 1].vars['result'] = `[${out.map(show).join(', ')}]`;
    return frames;
  },
};
