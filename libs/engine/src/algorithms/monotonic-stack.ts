import { spansOf } from './annotate.js';
import { fixedChoices } from './choices.js';
import { asNumbers } from './input.js';
import { randInt } from './random.js';
import type { AlgorithmDefinition, Frame } from './types.js';

type Input = { nums: number[] };

const CHOICES = ['Pop: nums[i] is its next greater', 'Stop popping, push i'];

const CODE = [
  'function nextGreater(nums) {',
  '  const res = new Array(nums.length).fill(-1);',
  '  const stack = []; // indices, values decreasing',
  '  for (let i = 0; i < nums.length; i++) {',
  '    while (stack.length && nums[stack.at(-1)] < nums[i]) {',
  '      res[stack.pop()] = nums[i];',
  '    }',
  '    stack.push(i);',
  '  }',
  '  return res;',
  '}',
];

const SPANS = spansOf(CODE, {
  3: 'const stack = []',
  5: 'nums[stack.at(-1)] < nums[i]',
  6: 'res[stack.pop()] = nums[i]',
  8: 'stack.push(i)',
  10: 'return res',
});

export const nextGreater: AlgorithmDefinition<Input> = {
  code: CODE,
  fields: [{ key: 'nums', label: 'Numbers', kind: 'numbers' }],
  defaultInput: { nums: [4, 2, 1, 5, 3, 3, 7, 6] },
  presets: [
    { label: 'Falling: nothing resolves', input: { nums: [9, 7, 5, 3, 1] } },
    { label: 'Rising: each resolves at once', input: { nums: [1, 3, 5, 7, 9] } },
    { label: 'One big value resolves many', input: { nums: [5, 4, 3, 2, 8, 1] } },
  ],

  randomInput(rand = Math.random) {
    return { nums: Array.from({ length: randInt(rand, 7, 11) }, () => randInt(rand, 1, 9)) };
  },

  validate(input) {
    const raw = (input ?? {}) as Record<string, unknown>;
    return { nums: asNumbers(raw['nums'], 'nums') };
  },

  trace({ nums }) {
    const frames: Frame[] = [];
    const res: number[] = nums.map(() => -1);
    const stack: number[] = [];
    let i = -1;
    let chapter = 'Set up';

    const snap = (line: number, caption: string, note: string, extra: Partial<Frame> = {}) => {
      const top = stack.length ? stack[stack.length - 1] : null;
      const pointers: Record<string, number> = {};
      if (i >= 0 && i < nums.length) pointers['i'] = i;
      if (top !== null) pointers['top'] = top;
      frames.push({
        line,
        caption,
        note,
        chapter,
        span: SPANS[line],
        vars: { i: i >= 0 ? i : null, 'nums[i]': i >= 0 && i < nums.length ? nums[i] : null, top: top !== null ? nums[top] : null },
        array: {
          values: [...nums],
          pointers,
          active: i >= 0 && i < nums.length ? [i] : [],
          settled: res.map((v, idx) => (v !== -1 ? idx : -1)).filter((idx) => idx >= 0),
        },
        stack: { label: 'stack (value@index)', items: stack.map((idx) => `${nums[idx]}@${idx}`) },
        output: { label: 'res', items: [...res] },
        ...extra,
      });
    };

    snap(
      3,
      'The stack keeps indices still waiting for a bigger value to their right.',
      'The stack holds indices whose next greater element we have not seen yet. Values on it never increase from bottom to top.',
    );

    for (i = 0; i < nums.length; i++) {
      chapter = `nums[${i}] = ${nums[i]}`;
      let asked = false;
      while (stack.length) {
        const top = stack[stack.length - 1];
        const pop = nums[top] < nums[i];
        snap(
          5,
          `${nums[i]} meets the top of the stack, ${nums[top]}.`,
          `Compare \`nums[i] = ${nums[i]}\` with top of stack ${nums[top]}.`,
          asked
            ? { lens: `${nums[top]} < ${nums[i]} → ${pop}` }
            : {
                predict: {
                  prompt: `Incoming ${nums[i]}, stack top is ${nums[top]}. Pop or push?`,
                  ...fixedChoices(CHOICES, pop ? 0 : 1),
                  explain: pop
                    ? `${nums[i]} > ${nums[top]}, so ${nums[i]} is the first bigger value to the right of index ${top}. Resolve it and pop.`
                    : `${nums[i]} ≤ ${nums[top]}. It cannot resolve the top or anything below it, since those values are at least as large. Push and move on.`,
                  skill: 'pop-push',
                },
              },
        );
        asked = true;
        if (!pop) break;
        stack.pop();
        res[top] = nums[i];
        snap(
          6,
          `${nums[i]} is the first bigger value right of index ${top}: pop it.`,
          `\`res[${top}] = ${nums[i]}\`. Index ${top} is resolved and leaves the stack.`,
          {
            lens: `res[${top}] = ${nums[i]}`,
          },
        );
      }
      const below = stack.length ? nums[stack[stack.length - 1]] : null;
      stack.push(i);
      snap(
        8,
        below === nums[i]
          ? `Push index ${i}: ${nums[i]} is not bigger than ${below}, so both ${below}s wait.`
          : `Push index ${i}: ${nums[i]} now waits for something bigger.`,
        `Push index ${i} (${nums[i]}). It now waits for something bigger.`,
        {
          lens: `stack.push(${i})`,
        },
      );
    }

    i = nums.length;
    chapter = 'Result';
    const left = stack.length;
    snap(
      10,
      `${left} ${left === 1 ? 'index' : 'indices'} never met a bigger value and keep${left === 1 ? 's' : ''} -1.`,
      `Done. ${left} ${left === 1 ? 'index' : 'indices'} never found a bigger value and keep -1. Every index was pushed and popped at most once → O(n).`,
    );
    frames[frames.length - 1].vars['result'] = `[${res.join(', ')}]`;
    return frames;
  },
};
