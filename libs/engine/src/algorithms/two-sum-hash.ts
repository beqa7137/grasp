import { spansOf } from './annotate.js';
import { cellsFor, fixedChoices, rotatedChoices } from './choices.js';
import { asNumber, asNumbers, rangeOf } from './input.js';
import { randInt, shuffle } from './random.js';
import type { AlgorithmDefinition, Frame, SetView } from './types.js';

type Input = { nums: number[]; target: number };

const LOOKUP = ['Yes: return the pair', 'No: store x and keep scanning'];

const entry = (value: number, index: number) => `${value} → ${index}`;

const CODE = [
  'function twoSum(nums, target) {',
  '  const seen = new Map(); // value -> index',
  '  for (const [i, x] of nums.entries()) {',
  '    const need = target - x;',
  '    if (seen.has(need)) return [seen.get(need), i];',
  '    seen.set(x, i); // only after the check',
  '  }',
  '  return [];',
  '}',
];

const SPANS = spansOf(CODE, {
  2: 'const seen = new Map()',
  3: 'const [i, x] of nums.entries()',
  4: 'const need = target - x',
  5: 'seen.has(need)',
  6: 'seen.set(x, i)',
  8: 'return []',
});
const RETURN_SPAN = spansOf(CODE, { 5: 'return [seen.get(need), i]' })[5];

const STORE_WHY = 'So x can never pair with itself';
const STORE_DISTRACTORS = [
  'So seen stays sorted by value',
  'Because a lookup is faster on a smaller map',
  'So the scan can stop at the first hit',
];

export const twoSumHash: AlgorithmDefinition<Input> = {
  code: CODE,
  fields: [
    { key: 'nums', label: 'Numbers', kind: 'numbers' },
    { key: 'target', label: 'Target sum', kind: 'number' },
  ],
  defaultInput: { nums: [3, 8, 11, 5, 7, 2], target: 16 },
  presets: [
    { label: 'No pair adds up', input: { nums: [1, 2, 4, 9], target: 20 } },
    { label: 'Half the target, twice', input: { nums: [8, 3, 8], target: 16 } },
    { label: 'The pair is the last two', input: { nums: [2, 7, 11, 15], target: 26 } },
  ],

  randomInput(rand = Math.random) {
    const target = randInt(rand, 10, 20);
    const size = randInt(rand, 5, 8);
    const first = randInt(rand, 1, target - 1);
    const nums = rand() < 0.8 ? [first, target - first] : [];
    const used = new Set(nums);
    const pool = Array.from({ length: target + 4 }, (_, k) => k + 1);
    for (const value of shuffle(rand, pool)) {
      if (nums.length === size) break;
      if (used.has(value) || used.has(target - value)) continue;
      used.add(value);
      nums.push(value);
    }
    return { nums: shuffle(rand, nums), target };
  },

  validate(input) {
    const raw = (input ?? {}) as Record<string, unknown>;
    return { nums: asNumbers(raw['nums'], 'nums'), target: asNumber(raw['target'], 'target') };
  },

  trace({ nums, target }) {
    const frames: Frame[] = [];
    const seen = new Map<number, number>();
    let i = -1;
    let need: number | null = null;
    let stored = 0;
    let pair: [number, number] | null = null;
    let askedPlainMiss = false;
    let chapter = 'Set up';

    const entries = () => [...seen].map(([value, index]) => entry(value, index));
    const mapText = () => `{${entries().join(', ')}}`;
    const seenView = (active?: string): SetView => ({ label: 'seen (value → index)', entries: entries(), active });

    const snap = (line: number, caption: string, note: string, extra: Partial<Frame> = {}) => {
      const scanning = i >= 0 && i < nums.length;
      frames.push({
        line,
        caption,
        note,
        chapter,
        span: SPANS[line],
        vars: { target, i: scanning ? i : null, x: scanning ? nums[i] : null, need },
        array: {
          values: [...nums],
          pointers: scanning ? { i } : {},
          window: stored > 0 ? [0, stored - 1] : undefined,
          active: scanning ? [i] : [],
          settled: pair ? rangeOf(i + 1, nums.length - 1) : [],
          found: pair ? [...pair] : [],
        },
        set: seenView(),
        ...extra,
      });
    };

    const lookupExplain = (x: number, complement: number) => {
      if (seen.has(complement)) {
        return `${complement} is a key in seen, stored when the scan passed an earlier ${complement}. ${complement} + ${x} = ${target}, so the pair is complete.`;
      }
      const later = nums.indexOf(complement, i + 1);
      if (complement === x) {
        const partner = later >= 0 ? ` The ${x} at index ${later} will find this one when the scan gets there.` : '';
        return `need equals x, but seen only holds numbers before index ${i}, and x is stored after this check. Checking first keeps ${x} from pairing with itself.${partner}`;
      }
      if (later >= 0) {
        return `${complement} is in nums, but at index ${later}, after \`i = ${i}\`. seen only holds numbers the scan has passed, so the ${complement} will find this ${x} once the scan reaches it.`;
      }
      return `${complement} is not a key in seen, so no number before index ${i} pairs with ${x}.`;
    };

    snap(
      2,
      `seen will map each number the scan passes to its index. Target: ${target}.`,
      `seen maps every number the scan has passed to its index, so asking "did my partner come earlier?" is one O(1) lookup instead of a scan back. Target: ${target}.`,
    );

    for (i = 0; i < nums.length; i++) {
      const x = nums[i];
      need = null;
      chapter = `nums[${i}] = ${x}`;
      snap(
        3,
        i === 0 ? `The scan starts at index 0, where x is ${x}.` : `Move to index ${i}, where x is ${x}.`,
        i === 0 ? `The scan starts at \`i = 0\` with \`x = ${x}\`.` : `Move to \`i = ${i}\`: \`x = ${x}\`.`,
        { lens: `i = ${i}, x = ${x}` },
      );
      need = target - x;
      snap(
        4,
        `${x} needs a partner of ${target} - ${x} = ${need}.`,
        `\`x = ${x}\` needs a partner of \`target - x\` = ${target} - ${x} = ${need}.`,
        {
          lens: `${target} - ${x} = ${need}`,
        },
      );

      const j = seen.get(need);
      const partnerInNums = nums.includes(need);
      // Ask every lookup whose partner is in nums (already seen, x itself, or later), but only one plain miss.
      if (i > 0 && (partnerInNums || !askedPlainMiss)) {
        askedPlainMiss ||= !partnerInNums;
        snap(5, `Look up ${need} in seen.`, `Look up \`need = ${need}\` in seen.`, {
          predict: {
            prompt: `\`target = ${target}\`, \`x = nums[${i}] = ${x}\`, so \`need = ${need}\`. seen = ${mapText()}. Is ${need} in seen?`,
            ...fixedChoices(LOOKUP, j !== undefined ? 0 : 1),
            explain: lookupExplain(x, need),
            skill: 'lookup',
            // The prompt prints seen, which answers it, and the found lookup sits next to the return ask, so whatever the
            // answer, the player asks it only when a run has nothing else.
            tier: 1,
          },
        });
      }

      if (j !== undefined) {
        const answer = `[${j}, ${i}]`;
        const ask = rotatedChoices(
          `\`target = ${target}\`, \`x = nums[${i}] = ${x}\`, and \`need = ${need}\` is in seen = ${mapText()}. What does twoSum return?`,
          answer,
          [`[${need}, ${x}]`, `[${need}, ${i}]`, `[${i}, ${i}]`],
        );
        snap(
          5,
          `${need} is in seen: an earlier number completes the pair.`,
          `\`seen.has(${need})\` is true: an earlier number completes the pair.`,
          {
            span: RETURN_SPAN,
            predict: {
              ...ask,
              explain: `\`seen.get(${need}) = ${j}\` is the index where ${need} was stored, and \`i = ${i}\` is the index of x. twoSum returns indices, not values: ${answer}.`,
              skill: 'return',
              pick: {
                on: 'cell',
                ask: 'Tap the two indices it returns.',
                // Only the answer stands for indices: [need, x] is values and [need, i] mixes them.
                cells: cellsFor(ask.choices, [[answer, [j, i]]]),
                count: 2,
              },
            },
          },
        );
        pair = [j, i];
        snap(
          5,
          `Return ${answer}: ${need} + ${x} = ${target}.`,
          `Return ${answer}: \`nums[${j}] + nums[${i}]\` = ${need} + ${x} = ${target}.${i < nums.length - 1 ? ' The scan stops here, so the rest of nums is never read.' : ''} Each step was one O(1) lookup and at most one O(1) store: O(n) time, O(n) space.`,
          { set: seenView(entry(need, j)), span: RETURN_SPAN, lens: `seen.get(${need}) = ${j}` },
        );
        frames[frames.length - 1].vars['result'] = answer;
        return frames;
      }

      snap(
        5,
        i === 0 ? `seen is empty, so nothing can pair with ${x} yet.` : `${need} is not in seen: no earlier number pairs with ${x}.`,
        i === 0
          ? `seen is empty, so ${need} is not there: nothing can pair with ${x} yet.${need === x ? ` Checking before storing is what stops ${x} from pairing with itself.` : ''}`
          : `\`seen.has(${need})\` is false: no number before index ${i} is ${need}.`,
        { lens: `seen.has(${need}) → false` },
      );
      if (i === 0) {
        snap(6, `Store ${x} in seen, after the lookup.`, 'No partner yet, so remember x for the numbers still to come.', {
          predict: {
            ...rotatedChoices(
              `\`target = ${target}\`, \`x = nums[0] = ${x}\`. Why does twoSum store x in seen only after the lookup?`,
              STORE_WHY,
              STORE_DISTRACTORS,
            ),
            explain: `seen must hold only the numbers before i. Stored first, a number that is half of target would find itself and return [i, i]${
              need === x ? `: here ${x} + ${x} = ${target}` : ''
            }.`,
            skill: 'store-order',
          },
        });
      }

      const previous = seen.get(x);
      seen.set(x, i);
      stored = i + 1;
      snap(
        6,
        previous !== undefined
          ? `${x} is already a key: its index moves from ${previous} to ${i}.`
          : `Store ${entry(x, i)}, so a later number that needs ${x} finds it.`,
        previous !== undefined
          ? `${x} is already a key, so set replaces its index ${previous} with ${i}. Either copy pairs the same way; a hit returns the newer index.`
          : `Store ${entry(x, i)}, so a later number that needs ${x} finds it in O(1).${i === 0 ? ' The shaded band marks the numbers seen holds.' : ''}`,
        { set: seenView(entry(x, i)), lens: `seen.set(${x}, ${i})` },
      );
    }

    need = null;
    chapter = 'No pair';
    snap(
      8,
      `The scan ended without a hit: no pair sums to ${target}, so return [].`,
      `The scan reached the end without a hit: no two numbers add up to ${target}, so return []. Each number cost one O(1) lookup and one O(1) store: O(n) time, O(n) space.`,
    );
    frames[frames.length - 1].vars['result'] = '[]';
    return frames;
  },
};
