import { asNumber, asNumbers, randInt } from './input.js';
import type { AlgorithmDef, Frame } from './types.js';

type Input = { nums: number[]; target: number };

const CHOICES = ['Found: return [l, r]', 'l++ (need a bigger sum)', 'r-- (need a smaller sum)'];

export const pairSum: AlgorithmDef<Input> = {
  id: 'pair-sum-sorted',
  title: 'Pair Sum in a Sorted Array',
  patternId: 'two-pointers',
  difficulty: 'easy',
  summary: 'Squeeze two pointers inward; the sorted order tells you which one to move.',
  complexity: { time: 'O(n)', space: 'O(1)' },
  code: [
    'function pairSum(nums, target) {',
    '  let l = 0, r = nums.length - 1;',
    '  while (l < r) {',
    '    const sum = nums[l] + nums[r];',
    '    if (sum === target) return [l, r];',
    '    if (sum < target) l++;',
    '    else r--;',
    '  }',
    '  return null;',
    '}',
  ],
  fields: [
    { key: 'nums', label: 'Sorted numbers', kind: 'sortedNumbers', hint: 'Sorted automatically' },
    { key: 'target', label: 'Target sum', kind: 'number' },
  ],
  defaultInput: { nums: [1, 3, 4, 6, 8, 11, 14, 17], target: 20 },

  randomInput(rand = Math.random) {
    const size = randInt(rand, 7, 11);
    const nums = Array.from({ length: size }, () => randInt(rand, 1, 30)).sort((a, b) => a - b);
    const i = randInt(rand, 0, size - 2);
    const j = randInt(rand, i + 1, size - 1);
    return { nums, target: rand() < 0.85 ? nums[i] + nums[j] : 61 };
  },

  validate(input) {
    const raw = (input ?? {}) as Record<string, unknown>;
    const nums = asNumbers(raw['nums'], 'nums', { sorted: true });
    return { nums, target: asNumber(raw['target'], 'target') };
  },

  trace({ nums, target }) {
    const frames: Frame[] = [];
    let l = 0;
    let r = nums.length - 1;

    const snap = (line: number, note: string, extra: Partial<Frame> = {}) => {
      const settled = nums.map((_, i) => i).filter((i) => i < l || i > r);
      frames.push({
        line,
        note,
        vars: { target, l, r, sum: l < r ? nums[l] + nums[r] : null },
        array: { values: [...nums], pointers: { l, r }, window: [l, r], settled, active: [l, r] },
        ...extra,
      });
    };

    snap(2, 'Start with the smallest (l) and largest (r) values. Every pair is either inside this window or ruled out.');

    while (l < r) {
      const sum = nums[l] + nums[r];
      snap(4, `${nums[l]} + ${nums[r]} = ${sum}.`);
      const answer = sum === target ? 0 : sum < target ? 1 : 2;
      snap(5, `Compare sum ${sum} with target ${target}.`, {
        predict: {
          prompt: `\`sum = ${sum}\`, \`target = ${target}\`. Which move is safe?`,
          choices: CHOICES,
          ordered: true,
          answer,
          explain:
            answer === 0
              ? 'Exact match.'
              : answer === 1
                ? `Too small. \`nums[${l}] = ${nums[l]}\` paired with the largest remaining value still falls short, so it can never be in a valid pair: drop it.`
                : `Too big. \`nums[${r}] = ${nums[r]}\` paired with the smallest remaining value already overshoots, so it can never be in a valid pair: drop it.`,
        },
      });
      if (answer === 0) {
        const last = frames[frames.length - 1];
        frames.push({
          ...last,
          predict: undefined,
          note: `Found it: \`nums[${l}] + nums[${r}]\` = ${target}. Each step discarded one value, so this took at most n − 1 steps.`,
          vars: { ...last.vars, result: `[${l}, ${r}]` },
          array: { ...last.array!, found: [l, r] },
        });
        return frames;
      }
      if (answer === 1) {
        l++;
        snap(6, `${sum} < ${target}: move l right to ${l} to increase the sum.`);
      } else {
        r--;
        snap(7, `${sum} > ${target}: move r left to ${r} to decrease the sum.`);
      }
    }

    snap(9, 'Pointers met without a match: no pair sums to the target.');
    frames[frames.length - 1].vars['result'] = null;
    return frames;
  },
};
