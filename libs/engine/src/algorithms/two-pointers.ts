import { spansOf } from './annotate.js';
import { fixedChoices, rotatedChoices } from './choices.js';
import { asNumber, asNumbers } from './input.js';
import { randInt } from './random.js';
import type { AlgorithmDefinition, Frame } from './types.js';

type Input = { nums: number[]; target: number };

const CHOICES = ['Found: return [l, r]', 'l++ (need a bigger sum)', 'r-- (need a smaller sum)'];

const CODE = [
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
];

const SPANS = spansOf(CODE, {
  2: 'let l = 0, r = nums.length - 1',
  4: 'const sum = nums[l] + nums[r]',
  5: 'sum === target',
  6: 'l++',
  7: 'r--',
  9: 'return null',
});
const RETURN_SPAN = spansOf(CODE, { 5: 'return [l, r]' })[5];

export const pairSum: AlgorithmDefinition<Input> = {
  code: CODE,
  fields: [
    { key: 'nums', label: 'Sorted numbers', kind: 'sortedNumbers', hint: 'Sorted automatically' },
    { key: 'target', label: 'Target sum', kind: 'number' },
  ],
  defaultInput: { nums: [1, 3, 4, 6, 8, 11, 14, 17], target: 20 },
  presets: [
    { label: 'No pair adds up', input: { nums: [1, 3, 4, 6, 8, 11, 14, 17], target: 30 } },
    { label: 'The pair is both ends', input: { nums: [1, 3, 4, 6, 8, 11, 14, 17], target: 18 } },
    { label: 'Repeated values', input: { nums: [2, 2, 3, 5, 5, 9], target: 10 } },
  ],

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
    let chapter = 'Set up';

    const snap = (line: number, caption: string, note: string, extra: Partial<Frame> = {}) => {
      const settled = nums.map((_, i) => i).filter((i) => i < l || i > r);
      frames.push({
        line,
        caption,
        note,
        chapter,
        span: SPANS[line],
        vars: { target, l, r, sum: l < r ? nums[l] + nums[r] : null },
        array: { values: [...nums], pointers: { l, r }, window: [l, r], settled, active: [l, r] },
        ...extra,
      });
    };

    snap(
      2,
      'l starts on the smallest value and r on the largest.',
      'Start with the smallest (l) and largest (r) values. Every pair is either inside this window or ruled out.',
      { lens: `l = 0, r = ${r}` },
    );

    while (l < r) {
      const sum = nums[l] + nums[r];
      chapter = `l = ${l}, r = ${r}`;
      snap(4, `Add the two ends: ${nums[l]} + ${nums[r]} = ${sum}.`, `${nums[l]} + ${nums[r]} = ${sum}.`, {
        lens: `${nums[l]} + ${nums[r]} = ${sum}`,
      });
      const answer = sum === target ? 0 : sum < target ? 1 : 2;
      snap(5, `Compare the sum ${sum} with the target ${target}.`, `Compare sum ${sum} with target ${target}.`, {
        ...(answer === 0 ? { span: RETURN_SPAN } : {}),
        predict:
          answer === 0
            ? {
                ...rotatedChoices(`\`sum = ${sum}\` equals \`target\`. What does pairSum return?`, `[${l}, ${r}]`, [
                  `[${nums[l]}, ${nums[r]}]`,
                  `[${l}, ${r - 1}]`,
                  `[${l + 1}, ${r}]`,
                ]),
                explain: `pairSum returns the positions of the pair, \`l = ${l}\` and \`r = ${r}\`, not the values ${nums[l]} and ${nums[r]}.`,
              }
            : {
                prompt: `\`sum = ${sum}\`, \`target = ${target}\`. Which move is safe?`,
                ...fixedChoices(CHOICES, answer),
                explain:
                  answer === 1
                    ? `Too small. \`nums[${l}] = ${nums[l]}\` paired with the largest remaining value still falls short, so it can never be in a valid pair: drop it.`
                    : `Too big. \`nums[${r}] = ${nums[r]}\` paired with the smallest remaining value already overshoots, so it can never be in a valid pair: drop it.`,
              },
      });
      if (answer === 0) {
        const last = frames[frames.length - 1];
        frames.push({
          ...last,
          predict: undefined,
          caption: `${sum} is the target, so return [${l}, ${r}].`,
          lens: `return [${l}, ${r}]`,
          note: `Found it: \`nums[${l}] + nums[${r}]\` = ${target}. Each step discarded one value, so this took at most n − 1 steps.`,
          vars: { ...last.vars, result: `[${l}, ${r}]` },
          array: { ...last.array!, found: [l, r] },
        });
        return frames;
      }
      if (answer === 1) {
        const dropped = nums[l];
        l++;
        snap(
          6,
          `${dropped} + ${nums[r]} is too small, so ${dropped} pairs with nothing: l moves to index ${l}.`,
          `${sum} < ${target}: move l right to ${l} to increase the sum.`,
          {
            lens: `${sum} < ${target} → l = ${l}`,
          },
        );
      } else {
        const dropped = nums[r];
        r--;
        snap(
          7,
          `${nums[l]} + ${dropped} is too big, so ${dropped} pairs with nothing: r moves to index ${r}.`,
          `${sum} > ${target}: move r left to ${r} to decrease the sum.`,
          {
            lens: `${sum} > ${target} → r = ${r}`,
          },
        );
      }
    }

    chapter = 'No pair';
    snap(9, `l met r without a match: no pair sums to ${target}.`, 'Pointers met without a match: no pair sums to the target.');
    frames[frames.length - 1].vars['result'] = null;
    return frames;
  },
};
