import { spansOf } from './annotate.js';
import { rotatedChoices } from './choices.js';
import { asNumbers } from './input.js';
import { randInt, shuffle } from './random.js';
import type { AlgorithmDefinition, Frame, SetView, TableLegend, TableView } from './types.js';

type Input = { nums: number[] };
type Cell = [number, number];

const LEGEND: TableLegend = { deps: 'bits of n that flip x', path: 'result' };

const binary = (value: number, width: number) => value.toString(2).padStart(width, '0');

function bitTable(width: number, rows: (number | null)[], extra: Partial<TableView> = {}): TableView {
  return {
    rowLabels: ['x', 'n', 'x^n'],
    colLabels: [...Array.from({ length: width }, (_, c) => String(2 ** (width - 1 - c))), '='],
    cells: rows.map((value) => (value === null ? Array(width + 1).fill(null) : [...[...binary(value, width)].map(Number), value])),
    legend: LEGEND,
    ...extra,
  };
}

const wholeRow = (row: number, width: number): Cell[] => Array.from({ length: width + 1 }, (_, c): Cell => [row, c]);

/** Distractors follow the XOR cloze's wrong operators (|, &, +); values wider than the table are dropped, since the extra digit would give them away. */
function xorQuestion(x: number, n: number, width: number) {
  const next = x ^ n;
  const show = (v: number) => `${binary(v, width)} (${v})`;
  const distractors = [x | n, x & n, x + n, x, n, next ^ 1, next ^ 2].filter((v) => v < 2 ** width);
  return rotatedChoices(
    `\`x = ${x}\` (${binary(x, width)}), \`n = ${n}\` (${binary(n, width)}). What is x after \`x ^= n\`?`,
    show(next),
    distractors.map(show),
  );
}

const CODE = [
  'function singleNumber(nums) {',
  '  let x = 0; // 0 ^ n = n',
  '  for (const n of nums) {',
  '    x ^= n; // n ^ n = 0',
  '  }',
  '  return x;',
  '}',
];

const SPANS = spansOf(CODE, { 2: 'let x = 0', 3: 'const n of nums', 4: 'x ^= n', 6: 'return x' });

export const singleNumberXor: AlgorithmDefinition<Input> = {
  code: CODE,
  fields: [{ key: 'nums', label: 'Numbers', kind: 'numbers', hint: 'Every value twice except one' }],
  defaultInput: { nums: [4, 1, 2, 1, 2] },
  presets: [
    { label: 'The single number is last', input: { nums: [3, 5, 3, 5, 6] } },
    { label: 'Zero is the single number', input: { nums: [7, 0, 7] } },
    { label: 'Pairs far apart', input: { nums: [9, 12, 6, 12, 9] } },
  ],

  randomInput(rand = Math.random) {
    const pool = shuffle(
      rand,
      Array.from({ length: 15 }, (_, k) => k + 1),
    );
    const pairs = pool.slice(0, randInt(rand, 2, 4));
    return { nums: shuffle(rand, [...pairs, ...pairs, pool[pairs.length]]) };
  },

  validate(input) {
    const raw = (input ?? {}) as Record<string, unknown>;
    return { nums: asNumbers(raw['nums'], 'nums', { minValue: 0 }) };
  },

  trace({ nums }) {
    const frames: Frame[] = [];
    const width = Math.max(...nums.map((v) => v.toString(2).length));
    const unpaired = new Map<number, number>();
    const settled: number[] = [];
    let x = 0;
    let i = -1;
    let folded = 0;
    let chapter = 'Set up';

    const unpairedView = (active?: string): SetView => ({ label: 'unpaired so far', entries: [...unpaired.keys()].map(String), active });

    const snap = (line: number, caption: string, note: string, table: TableView, extra: Partial<Frame> = {}) => {
      const reading = i >= 0 && i < nums.length;
      frames.push({
        line,
        caption,
        note,
        chapter,
        span: SPANS[line],
        vars: { n: reading ? nums[i] : null, x, 'x in binary': binary(x, width) },
        array: {
          values: [...nums],
          pointers: reading ? { n: i } : {},
          window: folded > 0 ? [0, folded - 1] : undefined,
          active: reading ? [i] : [],
          settled: [...settled],
          found: i === nums.length ? [...unpaired.values()] : [],
        },
        table,
        set: unpairedView(),
        ...extra,
      });
    };

    snap(
      2,
      'x starts at 0, since 0 ^ n = n.',
      'Start with `x = 0`, since `0 ^ n = n`. x will hold the XOR of every number read so far, and because `n ^ n = 0`, that equals the XOR of the numbers still waiting for a partner.',
      bitTable(width, [x, null, null]),
      { lens: 'x = 0' },
    );

    for (i = 0; i < nums.length; i++) {
      const n = nums[i];
      const before = x;
      const partner = unpaired.get(n);
      chapter = `nums[${i}] = ${n}`;
      snap(
        3,
        `Read n = ${n}, which is ${binary(n, width)} in binary.`,
        `Read \`n = nums[${i}] = ${n}\`, which is ${binary(n, width)} in binary.`,
        bitTable(width, [x, n, null]),
        { lens: `n = ${n} = ${binary(n, width)}` },
      );

      if (i > 0) {
        const reason =
          partner !== undefined
            ? `${n} is already folded into x, so this copy cancels it (\`${n} ^ ${n} = 0\`).`
            : n === 0
              ? 'XOR with 0 changes nothing.'
              : (x & n) !== 0
                ? 'Columns with a 1 in both become 0, which is where XOR differs from OR and +.'
                : 'No column has a 1 in both, so each 1 bit of n switches on in x.';
        snap(
          4,
          'XOR x with n, one bit column at a time.',
          `XOR \`x = ${binary(x, width)}\` with \`n = ${binary(n, width)}\`, one column at a time.`,
          bitTable(width, [x, n, null]),
          {
            predict: {
              ...xorQuestion(x, n, width),
              explain: `XOR keeps a 1 only where the two bits differ: \`${binary(x, width)} ^ ${binary(n, width)}\` = ${binary(x ^ n, width)}, which is ${x ^ n}. ${reason}`,
              skill: 'xor',
            },
          },
        );
      }

      if (partner === undefined) unpaired.set(n, i);
      else {
        unpaired.delete(n);
        settled.push(partner, i);
      }
      x ^= n;
      folded = i + 1;

      const step = `\`${binary(before, width)} ^ ${binary(n, width)}\` = ${binary(x, width)}, so \`x = ${x}\`.`;
      const flips = [...binary(n, width)].flatMap((bit, c): Cell[] => (bit === '1' ? [[1, c]] : []));
      snap(
        4,
        partner !== undefined
          ? `${n} meets its earlier copy and cancels out: x is ${x}.`
          : n === 0
            ? `XOR with 0 changes nothing: x stays ${x}.`
            : `Each 1 bit of ${n} flips the matching bit of x: x is ${x}; ${n} waits for a partner.`,
        partner !== undefined
          ? `${step} This ${n} meets the earlier ${n} at \`nums[${partner}]\`, and \`n ^ n = 0\`, so the pair cancels out of x.`
          : n === 0
            ? `${step} XOR with 0 changes nothing.`
            : `${step} Each 1 in n flips the matching bit of x, and ${n} now waits for a partner.`,
        bitTable(width, [before, n, x], { deps: flips, path: wholeRow(2, width) }),
        {
          ...(partner === undefined ? { set: unpairedView(String(n)) } : {}),
          lens: `${binary(before, width)} ^ ${binary(n, width)} = ${binary(x, width)}`,
        },
      );
    }

    const survivors = [...unpaired.keys()];
    const cost = 'One pass with one variable: O(n) time, O(1) space.';
    chapter = 'Result';
    snap(
      6,
      survivors.length === 1
        ? `${settled.length ? 'Every pair canceled' : 'No pairs'}, so x = ${x}: the number without a partner.`
        : survivors.length === 0
          ? 'Every number had a partner, so everything canceled: x = 0.'
          : `${survivors.length} numbers have no partner, so x is their XOR, ${x}.`,
      survivors.length === 1
        ? `${settled.length ? 'Every pair canceled' : 'There were no pairs to cancel'}, so \`x = ${x}\`: the one number without a partner. ${cost}`
        : survivors.length === 0
          ? `Every number had a partner, so everything canceled and \`x = 0\`. ${cost}`
          : `${survivors.join(', ')} have no partner, so x is their XOR, ${x}. The trick names the single number only when exactly one value is unpaired. ${cost}`,
      bitTable(width, [x, null, null], { path: wholeRow(0, width) }),
    );
    frames[frames.length - 1].vars['result'] = x;
    return frames;
  },
};
