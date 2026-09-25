import { fixedChoices } from './choices.js';
import { asNumbers, randInt } from './input.js';
import type { AlgorithmDef, Frame } from './types.js';

type Input = { nums: number[] };

const CHOICES = ['Pop: nums[i] is its next greater', 'Stop popping, push i'];

export const nextGreater: AlgorithmDef<Input> = {
  id: 'next-greater-element',
  title: 'Next Greater Element',
  patternId: 'monotonic-stack',
  difficulty: 'medium',
  summary: 'Keep a stack of indices still waiting for a bigger value; each new value resolves everyone smaller than it.',
  complexity: { time: 'O(n)', space: 'O(n)' },
  code: [
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
  ],
  fields: [{ key: 'nums', label: 'Numbers', kind: 'numbers' }],
  defaultInput: { nums: [4, 2, 1, 5, 3, 3, 7, 6] },

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

    const snap = (line: number, note: string, extra: Partial<Frame> = {}) => {
      const top = stack.length ? stack[stack.length - 1] : null;
      const pointers: Record<string, number> = {};
      if (i >= 0 && i < nums.length) pointers['i'] = i;
      if (top !== null) pointers['top'] = top;
      frames.push({
        line,
        note,
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

    snap(3, 'The stack holds indices whose next greater element we have not seen yet. Values on it only decrease.');

    for (i = 0; i < nums.length; i++) {
      let asked = false;
      while (stack.length) {
        const top = stack[stack.length - 1];
        const pop = nums[top] < nums[i];
        snap(
          5,
          `Compare \`nums[i] = ${nums[i]}\` with top of stack ${nums[top]}.`,
          asked
            ? {}
            : {
                predict: {
                  prompt: `Incoming ${nums[i]}, stack top is ${nums[top]}. Pop or push?`,
                  ...fixedChoices(CHOICES, pop ? 0 : 1),
                  explain: pop
                    ? `${nums[i]} > ${nums[top]}, so ${nums[i]} is the first bigger value to the right of index ${top}. Resolve it and pop.`
                    : `${nums[i]} ≤ ${nums[top]}. It cannot resolve the top or anything below it, since those values are at least as large. Push and move on.`,
                },
              },
        );
        asked = true;
        if (!pop) break;
        stack.pop();
        res[top] = nums[i];
        snap(6, `\`res[${top}] = ${nums[i]}\`. Index ${top} is resolved and leaves the stack.`);
      }
      stack.push(i);
      snap(8, `Push index ${i} (${nums[i]}). It now waits for something bigger.`);
    }

    i = nums.length;
    snap(
      10,
      `Done. ${stack.length} index${stack.length === 1 ? '' : 'es'} never found a bigger value and keep -1. Every index was pushed and popped at most once → O(n).`,
    );
    frames[frames.length - 1].vars['result'] = `[${res.join(', ')}]`;
    return frames;
  },
};
