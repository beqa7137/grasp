import { InputError } from './types.js';
import { spansOf } from './annotate.js';
import { rotatedChoices } from './choices.js';
import { asNumber, asNumbers, rangeOf } from './input.js';
import { randInt } from './random.js';
import type { AlgorithmDefinition, Frame, Prediction, TableLegend, TableView } from './types.js';

type Input = { nums: number[]; k: number };

/** What a frame highlights: the count cell read, the count cell written, and the start of the subarray on show. */
interface Focus {
  read?: number;
  wrote?: number;
  start?: number;
}

const MAX_NUMS = 8;
// One-digit values keep every prefix sum short enough for a count column on a phone.
const VALUE_RANGE = { minValue: -9, maxValue: 9 };
const LEGEND: TableLegend = { deps: 'count[p - k], read', active: 'count[p], updated' };

const sumOf = (terms: number[]) => terms.reduce((a, b) => a + b, 0);
const addition = (terms: number[]) => terms.map((x, t) => (t === 0 ? String(x) : x < 0 ? `- ${-x}` : `+ ${x}`)).join(' ');
const plus = (x: number) => (x < 0 ? `(${x})` : String(x));

const CODE = [
  'function subarraySum(nums, k) {',
  '  const count = { 0: 1 }; // pre[0] = 0, the empty prefix',
  '  let p = 0, total = 0;',
  '  for (let i = 0; i < nums.length; i++) {',
  '    p += nums[i]; // p = pre[i + 1]',
  '    total += count[p - k] ?? 0; // sum(j..i) = p - pre[j]',
  '    count[p] = (count[p] ?? 0) + 1;',
  '  }',
  '  return total;',
  '}',
];

const SPANS = spansOf(CODE, {
  2: 'const count = { 0: 1 }',
  3: 'let p = 0, total = 0',
  5: 'p += nums[i]',
  6: 'total += count[p - k] ?? 0',
  7: 'count[p] = (count[p] ?? 0) + 1',
  9: 'return total',
});

export const subarraySumPrefix: AlgorithmDefinition<Input> = {
  code: CODE,
  fields: [
    { key: 'nums', label: 'Numbers', kind: 'numbers', hint: `Up to ${MAX_NUMS}, from ${VALUE_RANGE.minValue} to ${VALUE_RANGE.maxValue}` },
    { key: 'k', label: 'Target k', kind: 'number' },
  ],
  defaultInput: { nums: [1, 2, 1, -1, 2, 1], k: 3 },
  presets: [
    { label: 'k = 0: runs that cancel out', input: { nums: [3, -3, 3, -3], k: 0 } },
    { label: 'All ones', input: { nums: [1, 1, 1, 1], k: 2 } },
    { label: 'No subarray hits k', input: { nums: [1, 2, 3], k: 7 } },
  ],

  randomInput(rand = Math.random) {
    const nums = Array.from({ length: randInt(rand, 5, MAX_NUMS) }, () => (rand() < 0.3 ? randInt(rand, -3, -1) : randInt(rand, 0, 4)));
    const from = randInt(rand, 0, nums.length - 1);
    return { nums, k: sumOf(nums.slice(from, randInt(rand, from, nums.length - 1) + 1)) };
  },

  validate(input) {
    const raw = (input ?? {}) as Record<string, unknown>;
    const nums = asNumbers(raw['nums'], 'nums', VALUE_RANGE);
    if (nums.length > MAX_NUMS) throw new InputError(`nums can hold at most ${MAX_NUMS} numbers, so the count map fits on screen`);
    return { nums, k: asNumber(raw['k'], 'k') };
  },

  trace({ nums, k }) {
    const frames: Frame[] = [];
    // Keeps every j per prefix, not just the count the algorithm needs, so the trace can show which subarrays it counted.
    const startsOf = new Map<number, number[]>([[0, [0]]]);
    const countOf = (value: number) => startsOf.get(value)?.length ?? 0;
    const found: string[] = [];
    let p = 0;
    let total = 0;
    let key: number | null = null;
    let i = -1;
    let chapter = 'Set up';

    const table = ({ read, wrote }: Focus): TableView => {
      const keys = [...startsOf.keys()].sort((a, b) => a - b);
      const cell = (value: number): [number, number] => [0, keys.indexOf(value)];
      return {
        rowLabels: ['cnt'],
        colLabels: keys.map(String),
        cells: [keys.map(countOf)],
        active: wrote === undefined ? undefined : cell(wrote),
        deps: read === undefined ? [] : [cell(read)],
        legend: LEGEND,
      };
    };

    const snap = (line: number, caption: string, note: string, focus: Focus = {}, extra: Partial<Frame> = {}) => {
      const reading = i >= 0 && i < nums.length;
      const { start } = focus;
      frames.push({
        line,
        caption,
        note,
        chapter,
        span: SPANS[line],
        vars: { k, i: i >= 0 ? i : null, 'nums[i]': reading ? nums[i] : null, p, 'p - k': key, total },
        array: {
          values: [...nums],
          pointers: reading ? { i } : {},
          window: start === undefined ? undefined : [start, i],
          active: reading ? [i] : [],
          settled: rangeOf(i + 1, nums.length - 1),
          found: start === undefined ? [] : rangeOf(start, i),
        },
        table: table(focus),
        output: { label: 'subarrays found', items: [...found] },
        ...extra,
      });
    };

    const zeroRun = (value: number) => {
      const j = startsOf.get(value)?.at(-1);
      if (j === undefined) return null;
      return `p was ${value} ${j === 0 ? 'before any number was read' : `after index ${j - 1}`} too, so \`nums[${j}..${i}]\` sums to 0.`;
    };

    const prefixQuestion = (x: number): Prediction => {
      const next = p + x;
      const repeat = zeroRun(next);
      const j = startsOf.get(next)?.at(-1);
      if (repeat && j !== undefined) {
        const zero = `\`nums[${j}..${i}]\` sums to 0`;
        return {
          ...rotatedChoices(`\`p += nums[${i}]\` takes p back to ${next}, a prefix seen before. What does that mean?`, zero, [
            `\`nums[${i}]\` is 0`,
            `\`nums[${j}..${i}]\` sums to ${k}`,
            ...(next === 0 ? [] : [`\`nums[0..${i}]\` sums to 0`]),
            `\`count[${next}]\` starts again at 0`,
          ]),
          explain: `${p} + ${plus(x)} = ${next}. ${repeat} Equal prefixes mean the numbers between them add up to nothing.`,
        };
      }
      return {
        ...rotatedChoices(
          `\`p = ${p}\` ${i === 0 ? 'before any number' : `after index ${i - 1}`}, and \`nums[${i}] = ${x}\`. What is p after \`p += nums[${i}]\`?`,
          String(next),
          [p - x, x, p].map(String),
        ),
        explain:
          x < 0
            ? `${p} + ${plus(x)} = ${next}. A negative number pulls p down, so prefix sums are not sorted and a sliding window cannot find these subarrays. The count map can.`
            : `${p} + ${x} = ${next}. p always holds the sum of \`nums[0..${i}]\`, carried forward one number at a time instead of re-adding the prefix.`,
      };
    };

    const countQuestion = (lookup: number, matches: number): Prediction => {
      const rule = `\`nums[j..${i}]\` sums to \`p - pre[j]\`, so it equals ${k} exactly when \`pre[j]\` = ${p} - ${plus(k)} = ${lookup}.`;
      // Likely slips first, since only three distinct distractors are kept: dropping the seed, looking up p itself, subtracting the wrong way round.
      const distractors = [lookup === 0 ? matches - 1 : -1, countOf(p), countOf(k - p), matches + 1, matches - 1, matches + 2];
      return {
        ...rotatedChoices(
          `\`p = ${p}\` after index ${i}, and \`k = ${k}\`. How many subarrays ending at index ${i} sum to k?`,
          String(matches),
          distractors.filter((d) => d >= 0).map(String),
        ),
        explain:
          matches === 0
            ? `${rule} No prefix so far was ${lookup}, so \`count[${lookup}]\` is missing and adds 0.`
            : lookup === 0
              ? `${rule} \`count[0] = ${matches}\`${matches === 1 ? ': only the seed, which stands for the subarray that starts at index 0' : ', and the seed is the one for the subarray that starts at index 0'}.`
              : `${rule} Prefix ${lookup} has appeared ${matches === 1 ? 'once' : `${matches} times, each the start of a different subarray`}, so \`count[${lookup}] = ${matches}\`.`,
      };
    };

    const matchNote = (lookup: number, j: number, m: number, matches: number) => {
      const origin = j === 0 ? ', counted by the seed since it starts at index 0' : `, since p was ${lookup} after index ${j - 1}`;
      const sentence = `\`nums[${j}..${i}]\` = ${addition(nums.slice(j, i + 1))} = ${k}${origin}.`;
      if (matches === 1) return `\`total += count[${lookup}]\` = 1, so total is ${total}. ${sentence}`;
      if (m === 0) return `\`total += count[${lookup}]\` = ${matches}, so total is ${total}. Subarray 1 of ${matches}: ${sentence}`;
      const last = m === matches - 1 ? ` The map never stored these ranges, only that prefix ${lookup} appeared ${matches} times.` : '';
      return `Subarray ${m + 1} of ${matches}: ${sentence}${last}`;
    };

    snap(
      2,
      'count starts as {0: 1}: the empty prefix before any number.',
      'count maps each prefix sum to how many times it has appeared. The seed `count[0] = 1` is the empty prefix before `nums[0]`: a subarray starting at index 0 sums to `p - 0`, so without it those subarrays would be missed.',
      { wrote: 0 },
      { lens: 'count[0] = 1' },
    );
    snap(
      3,
      'The running sum p and the count total both start at 0.',
      'p is the running prefix sum and total counts the subarrays found so far. Both start at 0.',
      {},
      {
        lens: 'p = 0, total = 0',
      },
    );

    for (i = 0; i < nums.length; i++) {
      const x = nums[i];
      key = null;
      chapter = `nums[${i}] = ${x}`;
      if (x < 0 || (i === 1 && x > 0)) {
        snap(5, `Add ${x} to the running sum p.`, `Add \`nums[${i}] = ${x}\` to the running prefix.`, {}, { predict: prefixQuestion(x) });
      }
      const before = p;
      p += x;
      const repeat = zeroRun(p);
      snap(
        5,
        `p is now ${p}, the sum of nums[0..${i}].`,
        `\`p = ${before} + ${plus(x)} = ${p}\`, the sum of \`nums[0..${i}]\`.${repeat ? ` ${repeat}` : ''}`,
        {},
        { lens: `${before} + ${plus(x)} = ${p}` },
      );

      const lookup = p - k;
      const starts = startsOf.get(lookup) ?? [];
      const matches = starts.length;
      snap(
        6,
        `Count the earlier prefixes that pair with p = ${p}.`,
        `Look up how many earlier prefixes pair with \`p = ${p}\`.`,
        {},
        { predict: countQuestion(lookup, matches) },
      );
      key = lookup;
      total += matches;
      found.push(...starts.map((j) => `${j}..${i}`));
      if (matches === 0) {
        snap(
          6,
          `No earlier prefix was ${lookup}, so no subarray ends here; total stays ${total}.`,
          `\`p - k\` = ${p} - ${plus(k)} = ${lookup}, and no earlier prefix was ${lookup}. No subarray ending at index ${i} sums to ${k}; total stays ${total}.`,
          {},
          { lens: `count[${lookup}] ?? 0 → 0` },
        );
      }
      starts.forEach((j, m) =>
        snap(
          6,
          matches === 1
            ? `nums[${j}..${i}] sums to ${k}: total is now ${total}.`
            : m === 0
              ? `${matches} earlier prefixes were ${lookup}, so total is now ${total}: first nums[${j}..${i}].`
              : `nums[${j}..${i}] sums to ${k} too.`,
          matchNote(lookup, j, m, matches),
          { read: lookup, start: j },
          { lens: `count[${lookup}] = ${matches}` },
        ),
      );

      const seen = countOf(p);
      startsOf.set(p, [...(startsOf.get(p) ?? []), i + 1]);
      const keepsNonEmpty = i === 0 ? ' Updating after the lookup keeps every counted subarray non-empty.' : '';
      snap(
        7,
        seen === 0 ? `Record prefix ${p}: count[${p}] is 1.` : `Prefix ${p} again: count[${p}] rises to ${seen + 1}.`,
        seen === 0
          ? `\`count[${p}] = 1\`: prefix ${p} is recorded, so a later index whose \`p - k\` is ${p} can pair with it.${keepsNonEmpty}`
          : `Prefix ${p} appeared before, so \`count[${p}]\` rises to ${seen + 1}. A later index that looks up ${p} counts ${seen + 1} subarrays at once.${keepsNonEmpty}`,
        { wrote: p },
        { lens: `count[${p}] = ${seen + 1}` },
      );
    }

    key = null;
    chapter = 'Result';
    snap(
      9,
      `${total} subarray${total === 1 ? '' : 's'} sum${total === 1 ? 's' : ''} to ${k}.`,
      `${total} subarray${total === 1 ? '' : 's'} sum to ${k}. Each number cost one lookup and one update, so O(n) time, plus O(n) space for count.`,
    );
    frames[frames.length - 1].vars['result'] = total;
    return frames;
  },
};
