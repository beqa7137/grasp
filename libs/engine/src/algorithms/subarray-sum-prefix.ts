import { InputError } from './types.js';
import { rotatedChoices } from './choices.js';
import { asNumber, asNumbers, randInt, rangeOf } from './input.js';
import type { AlgorithmDef, Frame, Prediction, TableLegend, TableView } from './types.js';

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

export const subarraySumPrefix: AlgorithmDef<Input> = {
  id: 'subarray-sum-prefix',
  title: 'Subarray Sum Equals K',
  patternId: 'prefix-sum',
  difficulty: 'medium',
  summary:
    'Keep a running prefix sum p and count how often each prefix appeared: the subarrays ending here that sum to k are the earlier prefixes equal to `p - k`.',
  complexity: { time: 'O(n)', space: 'O(n)' },
  code: [
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
  ],
  fields: [
    { key: 'nums', label: 'Numbers', kind: 'numbers', hint: `Up to ${MAX_NUMS}, from ${VALUE_RANGE.minValue} to ${VALUE_RANGE.maxValue}` },
    { key: 'k', label: 'Target k', kind: 'number' },
  ],
  defaultInput: { nums: [1, 2, 1, -1, 2, 1], k: 3 },

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
    let questions = 0;

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

    const snap = (line: number, note: string, focus: Focus = {}, extra: Partial<Frame> = {}) => {
      const reading = i >= 0 && i < nums.length;
      const { start } = focus;
      frames.push({
        line,
        note,
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
      return {
        prompt: `\`p = ${p}\` ${i === 0 ? 'before any number' : `after index ${i - 1}`}, and \`nums[${i}] = ${x}\`. What is p after \`p += nums[${i}]\`?`,
        ...rotatedChoices(String(next), [p - x, x, p].map(String), questions++),
        explain: repeat
          ? `${p} + ${plus(x)} = ${next}. ${repeat}`
          : x < 0
            ? `${p} + ${plus(x)} = ${next}. A negative number pulls p down, so prefix sums are not sorted and a sliding window cannot find these subarrays. The count map can.`
            : `${p} + ${x} = ${next}. p always holds the sum of \`nums[0..${i}]\`, carried forward one number at a time instead of re-adding the prefix.`,
      };
    };

    const countQuestion = (lookup: number, matches: number): Prediction => {
      const rule = `\`nums[j..${i}]\` sums to \`p - pre[j]\`, so it equals ${k} exactly when \`pre[j]\` = ${p} - ${plus(k)} = ${lookup}.`;
      // Likely slips first, since only three distinct distractors are kept: dropping the seed, looking up p itself, subtracting the wrong way round.
      const distractors = [lookup === 0 ? matches - 1 : -1, countOf(p), countOf(k - p), matches + 1, matches - 1, matches + 2];
      return {
        prompt: `\`p = ${p}\` after index ${i}, and \`k = ${k}\`. How many subarrays ending at index ${i} sum to k?`,
        ...rotatedChoices(String(matches), distractors.filter((d) => d >= 0).map(String), questions++),
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
      'count maps each prefix sum to how many times it has appeared. The seed `count[0] = 1` is the empty prefix before `nums[0]`: a subarray starting at index 0 sums to `p - 0`, so without it those subarrays would be missed.',
      { wrote: 0 },
    );
    snap(3, 'p is the running prefix sum and total counts the subarrays found so far. Both start at 0.');

    for (i = 0; i < nums.length; i++) {
      const x = nums[i];
      key = null;
      if (x < 0 || (i === 1 && x > 0)) {
        snap(5, `Add \`nums[${i}] = ${x}\` to the running prefix.`, {}, { predict: prefixQuestion(x) });
      }
      const before = p;
      p += x;
      const repeat = zeroRun(p);
      snap(5, `\`p = ${before} + ${plus(x)} = ${p}\`, the sum of \`nums[0..${i}]\`.${repeat ? ` ${repeat}` : ''}`);

      const lookup = p - k;
      const starts = startsOf.get(lookup) ?? [];
      const matches = starts.length;
      snap(6, `Look up how many earlier prefixes pair with \`p = ${p}\`.`, {}, { predict: countQuestion(lookup, matches) });
      key = lookup;
      total += matches;
      found.push(...starts.map((j) => `${j}..${i}`));
      if (matches === 0) {
        snap(
          6,
          `\`p - k\` = ${p} - ${plus(k)} = ${lookup}, and no earlier prefix was ${lookup}. No subarray ending at index ${i} sums to ${k}; total stays ${total}.`,
        );
      }
      starts.forEach((j, m) => snap(6, matchNote(lookup, j, m, matches), { read: lookup, start: j }));

      const seen = countOf(p);
      startsOf.set(p, [...(startsOf.get(p) ?? []), i + 1]);
      const keepsNonEmpty = i === 0 ? ' Updating after the lookup keeps every counted subarray non-empty.' : '';
      snap(
        7,
        seen === 0
          ? `\`count[${p}] = 1\`: prefix ${p} is recorded, so a later index whose \`p - k\` is ${p} can pair with it.${keepsNonEmpty}`
          : `Prefix ${p} appeared before, so \`count[${p}]\` rises to ${seen + 1}. A later index that looks up ${p} counts ${seen + 1} subarrays at once.${keepsNonEmpty}`,
        { wrote: p },
      );
    }

    key = null;
    snap(
      9,
      `${total} subarray${total === 1 ? '' : 's'} sum to ${k}. Each number cost one lookup and one update, so O(n) time, plus O(n) space for count.`,
    );
    frames[frames.length - 1].vars['result'] = total;
    return frames;
  },
};
