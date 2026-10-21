import { spansOf } from './annotate.js';
import { cellsFor, fixedChoices, rotatedChoices } from './choices.js';
import { asNumber, asNumbers } from './input.js';
import { distinctInts, randInt } from './random.js';
import type { AlgorithmDefinition, Frame, Prediction } from './types.js';

type Input = { nums: number[]; target: number };

const CHOICES = ['Found it: return mid', 'Go right: lo = mid + 1', 'Go left: hi = mid - 1'];

function range(from: number, to: number): number[] {
  const out: number[] = [];
  for (let i = from; i <= to; i++) out.push(i);
  return out;
}

const CODE = [
  'function binarySearch(nums, target) {',
  '  let lo = 0, hi = nums.length - 1;',
  '  while (lo <= hi) {',
  '    const mid = lo + ((hi - lo) >> 1);',
  '    if (nums[mid] === target) return mid;',
  '    if (nums[mid] < target) lo = mid + 1;',
  '    else hi = mid - 1;',
  '  }',
  '  return -1;',
  '}',
];

const SPANS = spansOf(CODE, {
  2: 'let lo = 0, hi = nums.length - 1',
  3: 'lo <= hi',
  4: 'const mid = lo + ((hi - lo) >> 1)',
  5: 'nums[mid] === target',
  6: 'lo = mid + 1',
  7: 'hi = mid - 1',
  9: 'return -1',
});
const RETURN_SPAN = spansOf(CODE, { 5: 'return mid' })[5];

export const binarySearch: AlgorithmDefinition<Input> = {
  code: CODE,
  fields: [
    { key: 'nums', label: 'Sorted numbers', kind: 'sortedNumbers', hint: 'Sorted automatically' },
    { key: 'target', label: 'Target', kind: 'number' },
  ],
  defaultInput: { nums: [2, 5, 8, 12, 16, 23, 38, 56, 72, 91], target: 23 },
  presets: [
    { label: 'Target not in the array', input: { nums: [2, 5, 8, 12, 16, 23, 38, 56, 72, 91], target: 40 } },
    { label: 'Target at the first index', input: { nums: [2, 5, 8, 12, 16, 23, 38, 56, 72, 91], target: 2 } },
    { label: 'Two numbers', input: { nums: [4, 9], target: 9 } },
  ],

  randomInput(rand = Math.random) {
    const nums = distinctInts(rand, randInt(rand, 8, 14), 1, 99).sort((a, b) => a - b);
    const target = rand() < 0.8 ? nums[randInt(rand, 0, nums.length - 1)] : randInt(rand, 1, 99);
    return { nums, target };
  },

  validate(input) {
    const raw = (input ?? {}) as Record<string, unknown>;
    return { nums: asNumbers(raw['nums'], 'nums', { sorted: true }), target: asNumber(raw['target'], 'target') };
  },

  trace({ nums, target }) {
    const frames: Frame[] = [];
    let lo = 0;
    let hi = nums.length - 1;
    let chapter = 'Set up';

    const snap = (line: number, caption: string, note: string, extra: Partial<Frame> = {}, mid?: number) => {
      const eliminated = range(0, nums.length - 1).filter((i) => i < lo || i > hi);
      const pointers: Record<string, number> = {};
      if (lo < nums.length) pointers['lo'] = lo;
      if (hi >= 0) pointers['hi'] = hi;
      if (mid !== undefined) pointers['mid'] = mid;
      frames.push({
        line,
        caption,
        note,
        chapter,
        span: SPANS[line],
        vars: { target, lo, hi, mid: mid ?? null, 'nums[mid]': mid !== undefined ? nums[mid] : null },
        array: {
          values: [...nums],
          pointers,
          window: lo <= hi ? [lo, hi] : undefined,
          settled: eliminated,
          active: mid !== undefined ? [mid] : [],
        },
        ...extra,
      });
    };

    const foundQuestion = (mid: number): Prediction => {
      const ask = rotatedChoices(`\`nums[mid] = ${nums[mid]}\` equals \`target\`. What does binarySearch return?`, String(mid), [
        String(target),
        String(lo),
        String(hi),
        String(mid + 1),
        'true',
      ]);
      return {
        ...ask,
        explain: `It returns the index, not the value: ${target} sits at \`mid = ${mid}\`, so the result is ${mid}.`,
        skill: 'return',
        pick: {
          on: 'cell',
          ask: 'Tap the index it returns.',
          cells: cellsFor(ask.choices, [
            [String(mid), [mid]],
            [String(lo), [lo]],
            [String(hi), [hi]],
            ...(mid + 1 < nums.length ? [[String(mid + 1), [mid + 1]] as const] : []),
          ]),
        },
      };
    };

    // Each move keeps one side of mid, so tapping a cell on a side chooses that move, and tapping mid chooses "Found it". When
    // either side has no cells left the ask stays a list: deciding by the answer's side alone would give the answer away.
    const stepQuestion = (mid: number, answer: 1 | 2): Prediction => {
      const sides = [[mid], range(mid + 1, hi), range(lo, mid - 1)];
      return {
        prompt: `\`nums[mid] = ${nums[mid]}\`, \`target = ${target}\`. What happens next?`,
        ...fixedChoices(CHOICES, answer),
        explain:
          answer === 1
            ? `${nums[mid]} < ${target}. Since the array is sorted, everything at or left of mid is too small, so discard it.`
            : `${nums[mid]} > ${target}. Everything at or right of mid is too big, so discard it.`,
        skill: 'halve',
        ...(sides[1].length && sides[2].length
          ? {
              pick: {
                on: 'cell',
                ask: 'Tap a cell the search keeps.',
                cells: sides.map((side) => side.map((at) => ({ view: 'array', at }))),
              },
            }
          : {}),
      };
    };

    snap(
      2,
      nums.length === 1
        ? `Search the one number, at index 0, for ${target}.`
        : nums.length === 2
          ? `Search both numbers, indices 0 and 1, for ${target}.`
          : `Search all ${nums.length} numbers, indices 0 to ${hi}, for ${target}.`,
      `Search space is the whole array: indices 0…${hi}. We are looking for ${target}.`,
      { lens: `lo = 0, hi = ${hi}` },
    );

    while (lo <= hi) {
      chapter = `Search [${lo}, ${hi}]`;
      const left = hi - lo + 1;
      snap(
        3,
        `${left} candidate${left === 1 ? '' : 's'} left, so keep searching.`,
        `lo (${lo}) ≤ hi (${hi}), so ${left} candidate${hi === lo ? '' : 's'} remain.`,
        {
          lens: `${lo} <= ${hi} → true`,
        },
      );
      const mid = lo + ((hi - lo) >> 1);
      snap(
        4,
        `mid lands on index ${mid}, which holds ${nums[mid]}.`,
        `Middle of [${lo}, ${hi}] is index ${mid}, holding ${nums[mid]}.`,
        { lens: `${lo} + ((${hi} - ${lo}) >> 1) = ${mid}` },
        mid,
      );

      const answer: 0 | 1 | 2 = nums[mid] === target ? 0 : nums[mid] < target ? 1 : 2;
      snap(
        5,
        `Compare ${nums[mid]} with the target ${target}.`,
        `Compare \`nums[mid] = ${nums[mid]}\` with target ${target}.`,
        {
          ...(answer === 0 ? { span: RETURN_SPAN } : {}),
          predict: answer === 0 ? foundQuestion(mid) : stepQuestion(mid, answer),
        },
        mid,
      );

      if (answer === 0) {
        frames.push({
          ...frames[frames.length - 1],
          predict: undefined,
          line: 5,
          caption: `${target} is at index ${mid}, so return ${mid}.`,
          lens: `return ${mid}`,
          vars: { ...frames[frames.length - 1].vars, result: mid },
          note: `Found ${target} at index ${mid} after ${frames.filter((f) => f.line === 4).length} comparisons.`,
          array: { ...frames[frames.length - 1].array!, found: [mid] },
        });
        return frames;
      }
      if (answer === 1) {
        const dropped = lo;
        lo = mid + 1;
        snap(
          6,
          `${nums[mid]} is too small: drop ${dropped === mid ? `index ${mid}` : `indices ${dropped} to ${mid}`}, lo moves to ${lo}.`,
          `${nums[mid]} < ${target}: discard the left half. lo moves to ${lo}.`,
          {
            lens: `${nums[mid]} < ${target} → lo = ${lo}`,
          },
        );
      } else {
        const dropped = hi;
        hi = mid - 1;
        snap(
          7,
          `${nums[mid]} is too big: drop ${dropped === mid ? `index ${mid}` : `indices ${mid} to ${dropped}`}, hi moves to ${hi}.`,
          `${nums[mid]} > ${target}: discard the right half. hi moves to ${hi}.`,
          {
            lens: `${nums[mid]} > ${target} → hi = ${hi}`,
          },
        );
      }
    }

    chapter = 'Not found';
    snap(
      9,
      `lo passed hi, so ${target} is not in the array: return -1.`,
      `lo (${lo}) passed hi (${hi}). ${target} is not in the array: return -1.`,
    );
    frames[frames.length - 1].vars['result'] = -1;
    return frames;
  },
};
