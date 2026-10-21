import { andList, spansOf } from './annotate.js';
import { fixedChoices, rotatedChoices } from './choices.js';
import { InputError } from './types.js';
import { asNumbers, rangeOf } from './input.js';
import { mulberry32, randInt, shuffle } from './random.js';
import type { AlgorithmDefinition, Frame, Prediction, TableLegend, TableView } from './types.js';

type Input = { nums1: number[]; nums2: number[] };
type Cell = [number, number];

const LEGEND: TableLegend = { deps: 'bit j', path: 'the new mask' };
const OUTCOMES = [
  'Set it: the first way to reach this mask',
  'Lower it: cheaper than the stored value',
  'Keep it: the stored value is no bigger',
];

/** Which transitions ask about the min, by their place in the loop, so the outcome does not choose them. */
const OUTCOME_STEPS: Record<number, { outcome: number[]; value: number[] }> = {
  3: { outcome: [3, 5, 10], value: [8] },
  4: { outcome: [4, 11, 17, 26], value: [14, 30] },
};

/**
 * The masks that ask for the next index and the transitions that ask for the new mask, drawn from a hash of the input,
 * so they vary from run to run while the same input always asks the same questions.
 */
function questionPlan(nums1: number[], nums2: number[]) {
  const n = nums1.length;
  const seed = [...nums1, ...nums2].reduce((h, v) => Math.imul(h ^ (v + 1), 0x01000193) >>> 0, 0x811c9dc5);
  const rand = mulberry32(seed);
  const steps = n * 2 ** (n - 1);
  const { outcome, value } = OUTCOME_STEPS[n];
  return {
    which: shuffle(rand, rangeOf(0, (1 << n) - 2)).slice(0, n - 1),
    to: shuffle(
      rand,
      rangeOf(0, steps - 1).filter((t) => !outcome.includes(t) && !value.includes(t)),
    ).slice(0, n - 1),
    outcome,
    value,
  };
}

const popcount = (mask: number) => mask.toString(2).split('1').length - 1;
const show = (value: number) => (value === Infinity ? '∞' : String(value));

const CODE = [
  'function minimumXorSum(nums1, nums2) {',
  '  const n = nums1.length;',
  '  const dp = Array(1 << n).fill(Infinity);',
  '  dp[0] = 0; // nothing paired yet',
  '  for (let mask = 0; mask < (1 << n) - 1; mask++) {',
  '    const i = popcount(mask); // next nums1 index',
  '    for (let j = 0; j < n; j++) {',
  '      if (mask & (1 << j)) continue; // used',
  '      const to = mask | (1 << j);',
  '      dp[to] = Math.min(dp[to], dp[mask] + (nums1[i] ^ nums2[j]));',
  '    }',
  '  }',
  '  return dp[(1 << n) - 1];',
  '}',
];

const SPANS = spansOf(CODE, {
  3: 'const dp = Array(1 << n).fill(Infinity)',
  4: 'dp[0] = 0',
  6: 'const i = popcount(mask)',
  9: 'const to = mask | (1 << j)',
  10: 'dp[to] = Math.min(dp[to], dp[mask] + (nums1[i] ^ nums2[j]))',
  13: 'return dp[(1 << n) - 1]',
});

export const minimumXorSum: AlgorithmDefinition<Input> = {
  code: CODE,
  fields: [
    { key: 'nums1', label: 'nums1', kind: 'numbers', hint: '3 or 4 values, 0 to 99' },
    { key: 'nums2', label: 'nums2', kind: 'numbers', hint: 'As many values as nums1' },
  ],
  defaultInput: { nums1: [1, 0, 3], nums2: [5, 3, 4] },
  presets: [
    { label: 'Every value is 0', input: { nums1: [0, 0, 0], nums2: [0, 0, 0] } },
    { label: 'Same values, reversed', input: { nums1: [1, 2, 3], nums2: [3, 2, 1] } },
    { label: 'Four pairs: 16 masks', input: { nums1: [7, 7, 7, 7], nums2: [1, 2, 4, 8] } },
  ],

  randomInput(rand = Math.random) {
    const n = randInt(rand, 3, 4);
    const values = () => Array.from({ length: n }, () => randInt(rand, 0, 15));
    return { nums1: values(), nums2: values() };
  },

  validate(input) {
    const raw = (input ?? {}) as Record<string, unknown>;
    const nums1 = asNumbers(raw['nums1'], 'nums1', { minValue: 0, maxValue: 99 });
    const nums2 = asNumbers(raw['nums2'], 'nums2', { minValue: 0, maxValue: 99 });
    if (nums1.length < 3 || nums1.length > 4) throw new InputError('nums1 must hold 3 or 4 values');
    if (nums2.length !== nums1.length) throw new InputError('nums2 must hold as many values as nums1');
    return { nums1, nums2 };
  },

  trace({ nums1, nums2 }) {
    const frames: Frame[] = [];
    const n = nums1.length;
    const full = (1 << n) - 1;
    const plan = questionPlan(nums1, nums2);
    const cost = (i: number, j: number) => nums1[i] ^ nums2[j];
    const binary = (mask: number) => mask.toString(2).padStart(n, '0');
    const named = (mask: number) => `${binary(mask)} (${mask})`;
    const dp: number[] = Array(1 << n).fill(Infinity);
    let mask: number | null = null;
    let j: number | null = null;
    let to: number | null = null;
    let done = false;

    /** Rows mask, 1 << j and to, one column per bit from j = n - 1 down to 0, then the value. */
    const bits = (): TableView => {
      const rows = [mask, j === null ? null : 1 << j, to];
      const column = (bit: number) => n - 1 - bit;
      return {
        rowLabels: ['mask', '1 << j', 'to'],
        colLabels: [...rangeOf(0, n - 1).map((c) => `j=${n - 1 - c}`), '='],
        cells: rows.map((value) =>
          value === null ? Array(n + 1).fill(null) : [...rangeOf(0, n - 1).map((c) => (value >> (n - 1 - c)) & 1), value],
        ),
        deps: j === null ? [] : [[1, column(j)] as Cell],
        path: to === null ? [] : rangeOf(0, n).map((c): Cell => [2, c]),
        legend: LEGEND,
      };
    };

    let chapter = 'Set up';
    const snap = (line: number, caption: string, note: string, extra: Partial<Frame> = {}) => {
      const i = mask === null || mask === full ? null : popcount(mask);
      frames.push({
        line,
        caption,
        note,
        chapter,
        span: SPANS[line],
        vars: {
          mask: mask === null ? null : named(mask),
          i,
          j,
          to: to === null ? null : named(to),
          'nums1[i] ^ nums2[j]': i === null || j === null || i >= n ? null : cost(i, j),
          'dp[mask]': mask === null ? null : show(dp[mask]),
          'dp[to]': to === null ? null : show(dp[to]),
        },
        array: {
          values: dp.map(show),
          pointers: { ...(mask === null ? {} : { mask }), ...(to === null ? {} : { to }) },
          active: to === null ? [] : [to],
          settled: mask === null ? [] : rangeOf(0, mask - 1),
          found: done ? [full] : [],
        },
        table: bits(),
        ...extra,
      });
    };

    const used = (m: number) => rangeOf(0, n - 1).filter((b) => (m >> b) & 1);

    const whichQuestion = (m: number): Prediction => {
      const count = popcount(m);
      const lowestFree = rangeOf(0, n - 1).find((b) => !((m >> b) & 1))!;
      const highestUsed = Math.max(...used(m));
      const slips = [lowestFree, highestUsed + 1, count - 1, count + 1, ...rangeOf(0, n - 1)];
      return {
        ...rotatedChoices(
          `mask is ${binary(m)}. Which index i of nums1 gets its partner next?`,
          `i = ${count}`,
          slips.filter((k) => k >= 0 && k < n && k !== count).map((k) => `i = ${k}`),
        ),
        explain: `${count === 0 ? 'No bit is set, so nothing is paired yet' : count === 1 ? '1 bit is set, so 1 value of nums2 is used, and it went to nums1[0]' : `${count} bits are set, so ${count} values of nums2 are used, and they went to nums1[0] ${count === 2 ? 'and' : 'to'} nums1[${count - 1}] in order`}. The next index is \`popcount(mask) = ${count}\`: the mask alone says how far the pairing has got.`,
      };
    };

    const toQuestion = (m: number, bit: number): Prediction => {
      const answer = m | (1 << bit);
      const slips = [m | bit, m + bit, 1 << bit, m | (1 << (n - 1 - bit)), m | (1 << (bit + 1)), m & (1 << bit), m ^ (1 << (bit + 1))];
      return {
        ...rotatedChoices(
          `mask is ${binary(m)} and j is ${bit}. What is \`mask | (1 << j)\`?`,
          named(answer),
          slips.filter((v) => v >= 0 && v <= full && v !== answer).map(named),
        ),
        explain: `\`1 << ${bit}\` is ${binary(1 << bit)}, with only bit ${bit} set. OR keeps every bit of mask and turns bit ${bit} on: ${binary(answer)}, which is ${answer}. Setting a bit always makes the number larger, so dp[${answer}] comes later in the loop.`,
      };
    };

    const outcomeOf = (before: number, offer: number) => (before === Infinity ? 0 : offer < before ? 1 : 2);

    const outcomeQuestion = (i: number, bit: number, offer: number, before: number): Prediction => {
      const outcome = outcomeOf(before, offer);
      return {
        prompt: `dp[${mask}] is ${dp[mask!]}, and pairing nums1[${i}] = ${nums1[i]} with nums2[${bit}] = ${nums2[bit]} costs \`${nums1[i]} ^ ${nums2[bit]} = ${cost(i, bit)}\`. dp[${to}] holds ${show(before)}. What does the min do to it?`,
        ...fixedChoices(OUTCOMES, outcome),
        explain: [
          `dp[${to}] is still ∞: no mask has reached ${binary(to!)} yet, so the min takes ${dp[mask!]} + ${cost(i, bit)} = ${offer}.`,
          `${dp[mask!]} + ${cost(i, bit)} = ${offer} is less than ${before}, so this way of pairing the same values is cheaper, and dp[${to}] drops to ${offer}.`,
          `${dp[mask!]} + ${cost(i, bit)} = ${offer} is not less than ${before}, so an earlier way of pairing the same values stays the best.`,
        ][outcome],
      };
    };

    const valueQuestion = (i: number, bit: number, offer: number, before: number): Prediction => {
      const answer = Math.min(before, offer);
      const others = [i - 1, i + 1].filter((k) => k >= 0 && k < n).map((k) => dp[mask!] + cost(k, bit));
      // When every cost is 0 the slips all equal the answer, so near misses keep three choices.
      const slips = [offer, before, cost(i, bit), dp[mask!], ...others, answer + 1, answer + 2].filter(
        (v) => v !== answer && v !== Infinity,
      );
      return {
        ...rotatedChoices(
          `dp[${mask}] is ${dp[mask!]}, the pair costs \`${nums1[i]} ^ ${nums2[bit]} = ${cost(i, bit)}\`, and dp[${to}] holds ${show(before)}. What is dp[${to}] after the min?`,
          String(answer),
          [...new Set(slips)].map(String),
        ),
        explain:
          before === Infinity
            ? `dp[${to}] was ∞, so it becomes ${dp[mask!]} + ${cost(i, bit)} = ${offer}.`
            : `The min of ${before} and ${dp[mask!]} + ${cost(i, bit)} = ${offer} is ${answer}.`,
      };
    };

    const returnQuestion = (): Prediction => {
      const inOrder = nums1.reduce((sum, a, i) => sum + (a ^ nums2[i]), 0);
      const free = new Set(rangeOf(0, n - 1));
      let greedy = 0;
      for (let i = 0; i < n; i++) {
        const best = [...free].reduce((b, k) => (cost(i, k) < cost(i, b) ? k : b));
        greedy += cost(i, best);
        free.delete(best);
      }
      const rowMins = rangeOf(0, n - 1).reduce((sum, i) => sum + Math.min(...rangeOf(0, n - 1).map((k) => cost(i, k))), 0);
      const slips = [inOrder, greedy, rowMins, dp[full - (1 << (n - 1))], ...rangeOf(1, 3).map((d) => dp[full] + d)];
      return {
        ...rotatedChoices(
          `The loop is over. What does minimumXorSum return?`,
          String(dp[full]),
          [...new Set(slips)].filter((v) => v !== dp[full]).map(String),
        ),
        explain: `dp[${binary(full)}] is the least XOR sum with every value of nums2 used once: ${dp[full]}. Pairing the arrays in the order given costs ${inOrder}, and giving each nums1 value its cheapest free partner costs ${greedy}.`,
      };
    };

    snap(
      3,
      `dp has a slot per mask, 0 to ${full}, each ∞ until some pairing reaches it.`,
      `dp[mask] will hold the least XOR sum once the values of nums2 whose bits are set in mask are paired with nums1[0], nums1[1] and so on, in order. With n = ${n} there are ${1 << n} masks, 0 to ${full}, all ∞ for now.`,
    );
    dp[0] = 0;
    snap(
      4,
      'dp[0] = 0: with nothing paired yet, the sum is 0.',
      `dp[0] = 0: with no values used, nothing is paired yet and the sum is 0.`,
      {
        lens: 'dp[0] = 0',
      },
    );

    let t = 0;
    for (let m = 0; m < full; m++) {
      mask = m;
      j = null;
      to = null;
      const i = popcount(m);
      chapter = `mask = ${binary(m)}`;
      if (plan.which.includes(m))
        snap(6, `Find the next index of nums1 from mask ${binary(m)}.`, 'Find the next index of nums1.', { predict: whichQuestion(m) });
      const free = rangeOf(0, n - 1).filter((b) => !((m >> b) & 1));
      const taken = used(m);
      snap(
        6,
        m === 0
          ? `mask = ${binary(m)}: nothing is used yet, so nums1[0] = ${nums1[0]} pairs first.`
          : `mask = ${binary(m)}: ${taken.length} value${taken.length === 1 ? '' : 's'} of nums2 used, so nums1[${i}] = ${nums1[i]} pairs next.`,
        m === 0
          ? `mask = ${binary(m)}: nothing is used, so i = 0 and nums1[0] = ${nums1[0]} is paired first, with each value of nums2 in turn.`
          : `mask = ${binary(m)}: ${andList(taken.map((b) => `nums2[${b}]`))} ${taken.length === 1 ? 'is' : 'are'} used, so i = popcount(mask) = ${i} and nums1[${i}] = ${nums1[i]} comes next. dp[${m}] = ${dp[m]} is final: every mask that leads here is smaller and was done earlier. Only j = ${andList(free.map(String))} ${free.length === 1 ? 'is' : 'are'} free.`,
        { lens: `popcount(${binary(m)}) = ${i}` },
      );
      for (const bit of free) {
        j = bit;
        const next = m | (1 << bit);
        const offer = dp[m] + cost(i, bit);
        const before = dp[next];
        if (plan.to.includes(t)) {
          snap(9, `Try j = ${bit}: to is mask with bit ${bit} set.`, `Try j = ${bit}: set its bit.`, { predict: toQuestion(m, bit) });
          to = next;
          snap(
            9,
            `Setting bit ${bit} gives to = ${binary(next)}, which is ${next}.`,
            `\`to = ${binary(m)} | ${binary(1 << bit)}\` = ${binary(next)}, which is ${next}.`,
            { lens: `${binary(m)} | ${binary(1 << bit)} = ${binary(next)}` },
          );
        }
        to = next;
        if (plan.outcome.includes(t))
          snap(
            10,
            before === Infinity
              ? `Offer dp[${next}] its first way in, through mask ${binary(m)}.`
              : `Compare the two ways into dp[${next}].`,
            'Compare the two ways into dp[to].',
            {
              predict: outcomeQuestion(i, bit, offer, before),
            },
          );
        if (plan.value.includes(t))
          snap(10, `Take the min for dp[${next}].`, 'Take the min.', { predict: valueQuestion(i, bit, offer, before) });
        dp[next] = Math.min(before, offer);
        const pair = `Pair nums1[${i}] = ${nums1[i]} with nums2[${bit}] = ${nums2[bit]}: \`${nums1[i]} ^ ${nums2[bit]} = ${cost(i, bit)}\`, so this way costs ${dp[m]} + ${cost(i, bit)} = ${offer}.`;
        const pairing = `Pairing nums1[${i}] with nums2[${bit}] costs ${cost(i, bit)}`;
        snap(
          10,
          [
            `${pairing}: dp[${next}] = ${offer}, its first value.`,
            `${pairing}: ${offer} < ${before}, so dp[${next}] drops.`,
            `${pairing}: ${offer} ≥ ${before}, so dp[${next}] stays.`,
          ][outcomeOf(before, offer)],
          [
            `${pair} dp[${next}] was ∞, so it becomes ${offer}.`,
            `${pair} That beats ${before}, so dp[${next}] drops to ${offer}.`,
            `${pair} dp[${next}] = ${before} is no bigger, so it stays.`,
          ][outcomeOf(before, offer)],
          { lens: `min(${show(before)}, ${dp[m]} + ${cost(i, bit)}) = ${dp[next]}` },
        );
        to = null;
        t++;
      }
    }

    mask = full;
    j = null;
    chapter = 'Result';
    snap(13, 'The loop is over: every mask holds its least XOR sum.', 'The loop is over.', { predict: returnQuestion() });
    done = true;
    snap(
      13,
      `Return dp[${full}] = ${dp[full]}: every value of nums2 is used exactly once.`,
      `Return dp[${full}] = ${dp[full]}: every value of nums2 is used once. Each of the 2ⁿ masks tries up to n values, O(2ⁿ · n) time and O(2ⁿ) space. Trying every order of nums2 is n! orders: ${rangeOf(1, n).reduce((p, k) => p * k, 1)} here, but about 87 billion at n = 14.`,
    );
    frames[frames.length - 1].vars['result'] = dp[full];
    return frames;
  },
};
