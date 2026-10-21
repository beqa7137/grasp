import { spansOf } from './annotate.js';
import { fixedChoices, rotatedChoices } from './choices.js';
import { InputError } from './types.js';
import { randInt } from './random.js';
import type { AlgorithmDefinition, Frame, Prediction, TableLegend, TableView } from './types.js';

type Input = { a: string; b: string };

const MAX_LENGTH = 9;
const RULES = ['Diagonal + 1: the characters match', 'Max of the cell above and the cell to the left'];
const LEGEND: TableLegend = { active: 'current cell', deps: 'reads from', path: 'answer path' };

function asWord(value: unknown, key: string): string {
  const text = typeof value === 'string' ? value.trim().toUpperCase() : '';
  if (!/^[A-Z]{1,9}$/.test(text)) throw new InputError(`${key} must be 1–${MAX_LENGTH} letters`);
  return text;
}

const CODE = [
  'function lcs(a, b) {',
  '  const dp = table(a.length + 1, b.length + 1, 0);',
  '  for (let i = 1; i <= a.length; i++) {',
  '    for (let j = 1; j <= b.length; j++) {',
  '      if (a[i - 1] === b[j - 1]) dp[i][j] = dp[i - 1][j - 1] + 1;',
  '      else dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);',
  '    }',
  '  }',
  '  return dp[a.length][b.length];',
  '}',
];

const SPANS = spansOf(CODE, {
  2: 'const dp = table(a.length + 1, b.length + 1, 0)',
  4: 'j <= b.length',
  5: 'dp[i][j] = dp[i - 1][j - 1] + 1',
  6: 'dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1])',
  9: 'return dp[a.length][b.length]',
});

export const lcs: AlgorithmDefinition<Input> = {
  code: CODE,
  fields: [
    { key: 'a', label: 'First string', kind: 'text', hint: `Up to ${MAX_LENGTH} letters` },
    { key: 'b', label: 'Second string', kind: 'text', hint: `Up to ${MAX_LENGTH} letters` },
  ],
  defaultInput: { a: 'ABCBDAB', b: 'BDCABA' },
  presets: [
    { label: 'No letters in common', input: { a: 'ABC', b: 'XYZ' } },
    { label: 'The same word twice', input: { a: 'ABCD', b: 'ABCD' } },
    { label: 'One word inside the other', input: { a: 'BANANA', b: 'ANA' } },
  ],

  randomInput(rand = Math.random) {
    const word = () => Array.from({ length: randInt(rand, 3, 7) }, () => 'ABCD'[randInt(rand, 0, 3)]).join('');
    return { a: word(), b: word() };
  },

  validate(input) {
    const raw = (input ?? {}) as Record<string, unknown>;
    return { a: asWord(raw['a'], 'a'), b: asWord(raw['b'], 'b') };
  },

  trace({ a, b }) {
    const frames: Frame[] = [];
    const m = a.length;
    const n = b.length;
    const dp: (number | null)[][] = Array.from({ length: m + 1 }, (_row, i) =>
      Array.from({ length: n + 1 }, (_cell, j) => (i === 0 || j === 0 ? 0 : null)),
    );
    const table = (extra: Partial<TableView> = {}): TableView => ({
      rowLabels: ['∅', ...a],
      colLabels: ['∅', ...b],
      cells: dp.map((row) => [...row]),
      legend: LEGEND,
      ...extra,
    });

    frames.push({
      line: 2,
      caption: 'Row 0 and column 0 are 0: an empty prefix shares nothing.',
      note: '`dp[i][j]` = length of the LCS of the first i letters of a and the first j letters of b. An empty prefix shares nothing, so row 0 and column 0 are 0.',
      chapter: 'Set up',
      span: SPANS[2],
      vars: { a, b },
      table: table(),
    });

    const ruleQuestion = (i: number, j: number, match: boolean): Prediction => ({
      prompt: `\`a[${i - 1}] = '${a[i - 1]}'\`, \`b[${j - 1}] = '${b[j - 1]}'\`. Which rule fills \`dp[${i}][${j}]\`?`,
      ...fixedChoices(RULES, match ? 0 : 1),
      explain: match
        ? `Both prefixes end in ${a[i - 1]}, so that letter extends the best answer for the prefixes without it: \`dp[${i - 1}][${j - 1}] + 1\`.`
        : `The last letters differ, so at least one of them is not in the LCS. Take the better of dropping a's (above) or b's (left).`,
    });

    const matchQuestion = (i: number, j: number): Prediction => {
      const diagonal = dp[i - 1][j - 1]!;
      return {
        ...rotatedChoices(
          `\`a[${i - 1}]\` and \`b[${j - 1}]\` are both '${a[i - 1]}'. What is \`dp[${i}][${j}]\`?`,
          String(diagonal + 1),
          [diagonal, diagonal + 2, diagonal > 0 ? diagonal - 1 : diagonal + 3].map(String),
        ),
        explain: `Both prefixes end in ${a[i - 1]}, so that letter extends the best answer for the prefixes without it: \`dp[${i - 1}][${j - 1}] + 1 = ${diagonal} + 1 = ${diagonal + 1}\`.`,
      };
    };

    // The first match asks for the rule, so the menu's answer is not always the max; later matches ask for the value.
    let ruleMatched = false;
    for (let i = 1; i <= m; i++) {
      const chapter = `Row ${i}: '${a[i - 1]}'`;
      for (let j = 1; j <= n; j++) {
        const match = a[i - 1] === b[j - 1];
        const deps: [number, number][] = match
          ? [[i - 1, j - 1]]
          : [
              [i - 1, j],
              [i, j - 1],
            ];
        const predict = match && ruleMatched ? matchQuestion(i, j) : j === 1 || match ? ruleQuestion(i, j, match) : undefined;
        ruleMatched ||= match;
        frames.push({
          line: 4,
          caption: `Cell (${i}, ${j}): compare '${a[i - 1]}' from a with '${b[j - 1]}' from b.`,
          note: `Cell (${i}, ${j}): compare \`a[${i - 1}] = '${a[i - 1]}'\` with \`b[${j - 1}] = '${b[j - 1]}'\`.`,
          chapter,
          span: SPANS[4],
          vars: { i, j, 'a[i-1]': a[i - 1], 'b[j-1]': b[j - 1] },
          table: table({ active: [i, j], deps }),
          ...(predict ? { predict } : { lens: `${j} <= ${n} → true` }),
        });
        const [diagonal, up, left] = [dp[i - 1][j - 1]!, dp[i - 1][j]!, dp[i][j - 1]!];
        dp[i][j] = match ? diagonal + 1 : Math.max(up, left);
        frames.push({
          line: match ? 5 : 6,
          caption: match
            ? `'${a[i - 1]}' matches, so extend the diagonal: dp[${i}][${j}] = ${diagonal} + 1 = ${dp[i][j]}.`
            : `No match, so keep the better of above and left: max(${up}, ${left}) = ${dp[i][j]}.`,
          note: match
            ? `Match: \`dp[${i}][${j}] = dp[${i - 1}][${j - 1}] + 1\`, which is ${dp[i][j]}.`
            : `No match: \`dp[${i}][${j}] = max(${up}, ${left})\`, which is ${dp[i][j]}.`,
          chapter,
          span: SPANS[match ? 5 : 6],
          lens: match ? `${diagonal} + 1 = ${dp[i][j]}` : `max(${up}, ${left}) = ${dp[i][j]}`,
          vars: { i, j, 'dp[i][j]': dp[i][j] },
          table: table({ active: [i, j], deps }),
        });
      }
    }

    const path: [number, number][] = [];
    const letters: string[] = [];
    for (let i = m, j = n; i > 0 && j > 0;) {
      if (a[i - 1] === b[j - 1]) {
        path.push([i, j]);
        letters.unshift(a[i - 1]);
        i--;
        j--;
      } else if (dp[i - 1][j]! >= dp[i][j - 1]!) i--;
      else j--;
    }
    frames.push({
      line: 9,
      caption: letters.length
        ? `The bottom-right cell holds ${dp[m][n]}: one LCS is "${letters.join('')}".`
        : 'The bottom-right cell holds 0: the strings share no letter.',
      note: `The answer is in the bottom-right cell: ${dp[m][n]}. Walking back through the matches recovers one LCS: "${letters.join('')}". Every cell cost O(1), so O(m·n) overall.`,
      chapter: 'Result',
      span: SPANS[9],
      vars: { result: dp[m][n], lcs: letters.join('') },
      table: table({ path }),
    });
    return frames;
  },
};
