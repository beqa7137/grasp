import { asNumber, asNumbers, randInt } from './input.js';
import type { AlgorithmDef, Frame } from './types.js';

type Input = { nums: number[]; target: number };

const CHOICES = ['Found it — return mid', 'Go right: lo = mid + 1', 'Go left: hi = mid − 1'];

function range(from: number, to: number): number[] {
  const out: number[] = [];
  for (let i = from; i <= to; i++) out.push(i);
  return out;
}

export const binarySearch: AlgorithmDef<Input> = {
  id: 'binary-search',
  title: 'Binary Search',
  patternId: 'binary-search',
  difficulty: 'easy',
  summary: 'Halve a sorted search space every step by comparing against the middle element.',
  complexity: { time: 'O(log n)', space: 'O(1)' },
  code: [
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
  ],
  fields: [
    { key: 'nums', label: 'Sorted numbers', kind: 'sortedNumbers', hint: 'Sorted automatically' },
    { key: 'target', label: 'Target', kind: 'number' },
  ],
  defaultInput: { nums: [2, 5, 8, 12, 16, 23, 38, 56, 72, 91], target: 23 },

  randomInput(rand = Math.random) {
    const nums = new Set<number>();
    const size = randInt(rand, 8, 14);
    while (nums.size < size) nums.add(randInt(rand, 1, 99));
    const sorted = [...nums].sort((a, b) => a - b);
    const target = rand() < 0.8 ? sorted[randInt(rand, 0, sorted.length - 1)] : randInt(rand, 1, 99);
    return { nums: sorted, target };
  },

  validate(input) {
    const raw = (input ?? {}) as Record<string, unknown>;
    return { nums: asNumbers(raw['nums'], 'nums', { sorted: true }), target: asNumber(raw['target'], 'target') };
  },

  trace({ nums, target }) {
    const frames: Frame[] = [];
    let lo = 0;
    let hi = nums.length - 1;

    const snap = (line: number, note: string, extra: Partial<Frame> = {}, mid?: number) => {
      const eliminated = range(0, nums.length - 1).filter((i) => i < lo || i > hi);
      const pointers: Record<string, number> = {};
      if (lo < nums.length) pointers['lo'] = lo;
      if (hi >= 0) pointers['hi'] = hi;
      if (mid !== undefined) pointers['mid'] = mid;
      frames.push({
        line,
        note,
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

    snap(2, `Search space is the whole array: indices 0…${hi}. We are looking for ${target}.`);

    while (lo <= hi) {
      snap(3, `lo (${lo}) ≤ hi (${hi}), so ${hi - lo + 1} candidate${hi === lo ? '' : 's'} remain.`);
      const mid = lo + ((hi - lo) >> 1);
      snap(4, `Middle of [${lo}, ${hi}] is index ${mid}, holding ${nums[mid]}.`, {}, mid);

      const answer = nums[mid] === target ? 0 : nums[mid] < target ? 1 : 2;
      snap(
        5,
        `Compare nums[mid] = ${nums[mid]} with target ${target}.`,
        {
          predict: {
            prompt: `nums[mid] = ${nums[mid]}, target = ${target}. What happens next?`,
            choices: CHOICES,
            answer,
            explain:
              answer === 0
                ? 'Equal values — the search is over.'
                : answer === 1
                  ? `${nums[mid]} < ${target}. Since the array is sorted, everything at or left of mid is too small, so discard it.`
                  : `${nums[mid]} > ${target}. Everything at or right of mid is too big, so discard it.`,
          },
        },
        mid,
      );

      if (answer === 0) {
        frames.push({
          ...frames[frames.length - 1],
          predict: undefined,
          line: 5,
          vars: { ...frames[frames.length - 1].vars, result: mid },
          note: `Found ${target} at index ${mid} after ${frames.filter((f) => f.line === 4).length} comparisons.`,
          array: { ...frames[frames.length - 1].array!, found: [mid] },
        });
        return frames;
      }
      if (answer === 1) {
        lo = mid + 1;
        snap(6, `${nums[mid]} < ${target}: discard the left half. lo moves to ${lo}.`);
      } else {
        hi = mid - 1;
        snap(7, `${nums[mid]} > ${target}: discard the right half. hi moves to ${hi}.`);
      }
    }

    snap(9, `lo (${lo}) passed hi (${hi}). ${target} is not in the array — return -1.`);
    frames[frames.length - 1].vars['result'] = -1;
    return frames;
  },
};
