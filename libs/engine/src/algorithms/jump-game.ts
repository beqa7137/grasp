import { spansOf } from './annotate.js';
import { fixedChoices, rotatedChoices } from './choices.js';
import { asNumbers, rangeOf } from './input.js';
import { randInt } from './random.js';
import type { AlgorithmDefinition, Frame } from './types.js';

type Input = { nums: number[] };

const CHECK = ['Continue: this index is reachable', 'Return false: nothing reaches this index'];

const CODE = [
  'function canJump(nums) {',
  '  let reach = 0; // farthest index reachable so far',
  '  for (let i = 0; i < nums.length; i++) {',
  '    if (i > reach) return false;',
  '    reach = Math.max(reach, i + nums[i]);',
  '  }',
  '  return true;',
  '}',
];

const SPANS = spansOf(CODE, {
  2: 'let reach = 0',
  4: 'i > reach',
  5: 'reach = Math.max(reach, i + nums[i])',
  7: 'return true',
});
const STUCK_SPAN = spansOf(CODE, { 4: 'return false' })[4];

export const jumpGame: AlgorithmDefinition<Input> = {
  code: CODE,
  fields: [{ key: 'nums', label: 'Jump lengths', kind: 'numbers', hint: 'Max jump from each index, 0 or more' }],
  defaultInput: { nums: [2, 3, 1, 1, 4] },
  presets: [
    { label: 'A zero blocks the way', input: { nums: [3, 2, 1, 0, 4] } },
    { label: 'Jump over the zeros', input: { nums: [3, 0, 0, 1] } },
    { label: 'Every jump just enough', input: { nums: [1, 1, 1, 1] } },
  ],

  randomInput(rand = Math.random) {
    const size = randInt(rand, 6, 10);
    return { nums: Array.from({ length: size }, (_, i) => (i > 0 && rand() < 0.25 ? 0 : randInt(rand, 1, 3))) };
  },

  validate(input) {
    const raw = (input ?? {}) as Record<string, unknown>;
    return { nums: asNumbers(raw['nums'], 'nums', { minValue: 0 }) };
  },

  trace({ nums }) {
    const frames: Frame[] = [];
    const last = nums.length - 1;
    let reach = 0;
    let i = -1;

    let chapter = 'Set up';
    const snap = (line: number, caption: string, note: string, extra: Partial<Frame> = {}) => {
      const scanning = i >= 0 && i <= last;
      const pointers: Record<string, number> = {};
      if (scanning) pointers['i'] = i;
      pointers['reach'] = Math.min(reach, last);
      frames.push({
        line,
        caption,
        note,
        chapter,
        span: SPANS[line],
        vars: { i: i >= 0 ? i : null, 'nums[i]': scanning ? nums[i] : null, reach, 'last index': last },
        array: {
          values: [...nums],
          pointers,
          window: [0, Math.min(reach, last)],
          active: scanning ? [i] : [],
          settled: rangeOf(0, i - 1),
          found: reach >= last ? [last] : [],
        },
        ...extra,
      });
    };

    const standNote = () => {
      if (i === 0) return 'Index 0 is where you start, so it is always reachable.';
      const base = `${i} ≤ reach ${reach}, so a jump lands on index ${i} and you can stand here.`;
      if (reach >= last) return `${base} The last index is already covered; the loop just finishes the scan.`;
      if (nums[i] === 0) return `${base} Its 0 adds no reach, but it does not stop the scan either.`;
      return base;
    };

    snap(
      2,
      'reach starts at 0: you stand on index 0 before any jump.',
      'reach is the farthest index you can get to so far. A jump may be shorter than `nums[i]`, so every index up to reach is reachable too, and this one number is all you need to track.',
    );

    for (i = 0; i < nums.length; i++) {
      chapter = `i = ${i}`;
      const stuck = i > reach;
      if (i > 0 && (i >= reach || nums[i] === 0)) {
        const zero = nums[i] === 0 ? ' The 0 here does not stop you by itself; the check never reads `nums[i]`.' : '';
        snap(4, `Compare index ${i} with reach ${reach}.`, `Compare index ${i} with reach ${reach}.`, {
          predict: {
            prompt: `\`i = ${i}\`, \`reach = ${reach}\`, \`nums[${i}] = ${nums[i]}\`. Can you still continue?`,
            ...fixedChoices(CHECK, stuck ? 1 : 0),
            explain: stuck
              ? `${i} > ${reach}: no index before ${i} jumps this far, so you can never get here. Return false.`
              : i === reach
                ? `${i} = ${reach}: a jump lands exactly on index ${i}, which is enough to stand here. Only \`i > reach\` means stuck.${zero}`
                : `${i} < ${reach}: index ${i} is inside the reachable prefix, so you can stand here.${zero}`,
          },
        });
      }
      if (stuck) {
        chapter = 'Stuck';
        snap(
          4,
          `Index ${i} is past reach ${reach}: no jump lands here, so return false.`,
          `Stuck: index ${i} is past reach ${reach}, so no jump lands here or anywhere beyond. Return false. Each index was checked at most once: O(n) time, O(1) space.`,
          { span: STUCK_SPAN, lens: `${i} > ${reach} → true` },
        );
        frames[frames.length - 1].vars['result'] = false;
        return frames;
      }
      snap(
        4,
        i === 0
          ? 'Index 0 is where you start, so it is always reachable.'
          : reach >= last
            ? `Index ${i} is within reach ${reach}, and so is the last index.`
            : `Index ${i} is within reach ${reach}, so some jump lands on it.`,
        standNote(),
        { lens: `${i} > ${reach} → false` },
      );

      const prev = reach;
      const jump = i + nums[i];
      const next = Math.max(reach, jump);
      const options = rotatedChoices(
        `\`i = ${i}\`, \`nums[${i}] = ${nums[i]}\`, \`reach = ${reach}\`. What is the new farthest reach?`,
        String(next),
        [jump, reach + nums[i], Math.max(reach, nums[i]), reach].map(String),
      );
      if (i > 0 && options.choices.length > 1) {
        snap(5, `Update reach with the jump from index ${i}.`, `Update reach using the jump from index ${i}.`, {
          predict: {
            ...options,
            explain:
              jump > reach
                ? `From index ${i} you can jump to ${i} + ${nums[i]} = ${jump}, past ${reach}. \`Math.max\` keeps the farther point, so reach becomes ${jump}.`
                : `From index ${i} you get at most to ${i} + ${nums[i]} = ${jump}, not past ${reach}. \`Math.max\` keeps ${reach}: reach never shrinks.`,
          },
        });
      }
      reach = next;
      snap(
        5,
        reach > prev
          ? `From index ${i} a jump reaches index ${jump}, past reach ${prev}: reach grows to ${reach}.`
          : nums[i] === 0
            ? `nums[${i}] is 0, so index ${i} adds no reach: it stays ${reach}.`
            : `From index ${i} a jump reaches only index ${jump}, so reach stays ${reach}.`,
        reach > prev
          ? `From index ${i} you can land anywhere up to ${jump}, past the old reach ${prev}. reach grows to ${reach}.${prev < last && reach >= last ? ' That covers the last index.' : ''}`
          : nums[i] === 0
            ? `\`nums[${i}]\` is 0, so you cannot jump from index ${i}. reach stays ${reach}.`
            : `From index ${i} you land at most at ${jump}, which is not past ${reach}. reach stays ${reach}: the farthest point already covers every shorter jump.`,
        { lens: `max(${prev}, ${i} + ${nums[i]}) = ${reach}` },
      );
    }

    chapter = 'Reach the end';
    snap(
      7,
      `reach ${reach} covers the last index (index ${last}), so return true.`,
      `The scan never got stuck, and reach ${reach} covers the last index ${last}. Return true after one pass: O(n) time, O(1) space.`,
    );
    frames[frames.length - 1].vars['result'] = true;
    return frames;
  },
};
