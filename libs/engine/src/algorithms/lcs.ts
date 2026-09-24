import { InputError } from './types.js';
import { randInt } from './input.js';
import type { AlgorithmDef, Frame, TableLegend, TableView } from './types.js';

type Input = { a: string; b: string };

const MAX_LENGTH = 9;
const RULES = ['Diagonal + 1: the characters match', 'Max of the cell above and the cell to the left'];
const LEGEND: TableLegend = { active: 'current cell', deps: 'reads from', path: 'answer path' };

function asWord(value: unknown, key: string): string {
  const text = typeof value === 'string' ? value.trim().toUpperCase() : '';
  if (!/^[A-Z]{1,9}$/.test(text)) throw new InputError(`${key} must be 1–${MAX_LENGTH} letters`);
  return text;
}

export const lcs: AlgorithmDef<Input> = {
  id: 'lcs',
  title: 'Longest Common Subsequence',
  patternId: 'dp-2d',
  difficulty: 'medium',
  summary: 'Fill a table where each cell answers the problem for two prefixes, using only the three neighbours already filled.',
  complexity: { time: 'O(m·n)', space: 'O(m·n)' },
  code: [
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
  ],
  fields: [
    { key: 'a', label: 'First string', kind: 'text', hint: `Up to ${MAX_LENGTH} letters` },
    { key: 'b', label: 'Second string', kind: 'text', hint: `Up to ${MAX_LENGTH} letters` },
  ],
  defaultInput: { a: 'ABCBDAB', b: 'BDCABA' },

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
      note: '`dp[i][j]` = length of the LCS of the first i letters of a and the first j letters of b. An empty prefix shares nothing, so row 0 and column 0 are 0.',
      vars: { a, b },
      table: table(),
    });

    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        const match = a[i - 1] === b[j - 1];
        const deps: [number, number][] = match
          ? [[i - 1, j - 1]]
          : [
              [i - 1, j],
              [i, j - 1],
            ];
        const ask = j === 1 || match;
        frames.push({
          line: 4,
          note: `Cell (${i}, ${j}): compare \`a[${i - 1}] = '${a[i - 1]}'\` with \`b[${j - 1}] = '${b[j - 1]}'\`.`,
          vars: { i, j, 'a[i-1]': a[i - 1], 'b[j-1]': b[j - 1] },
          table: table({ active: [i, j], deps }),
          ...(ask
            ? {
                predict: {
                  prompt: `\`a[${i - 1}] = '${a[i - 1]}'\`, \`b[${j - 1}] = '${b[j - 1]}'\`. Which rule fills \`dp[${i}][${j}]\`?`,
                  choices: RULES,
                  ordered: true,
                  answer: match ? 0 : 1,
                  explain: match
                    ? `Both prefixes end in ${a[i - 1]}, so that letter extends the best answer for the prefixes without it: \`dp[${i - 1}][${j - 1}] + 1\`.`
                    : `The last letters differ, so at least one of them is not in the LCS. Take the better of dropping a's (above) or b's (left).`,
                },
              }
            : {}),
        });
        dp[i][j] = match ? dp[i - 1][j - 1]! + 1 : Math.max(dp[i - 1][j]!, dp[i][j - 1]!);
        frames.push({
          line: match ? 5 : 6,
          note: match
            ? `Match: \`dp[${i}][${j}] = dp[${i - 1}][${j - 1}] + 1\`, which is ${dp[i][j]}.`
            : `No match: \`dp[${i}][${j}] = max(${dp[i - 1][j]}, ${dp[i][j - 1]})\`, which is ${dp[i][j]}.`,
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
      note: `The answer is in the bottom-right cell: ${dp[m][n]}. Walking back through the matches recovers one LCS: "${letters.join('')}". Every cell cost O(1), so O(m·n) overall.`,
      vars: { result: dp[m][n], lcs: letters.join('') },
      table: table({ path }),
    });
    return frames;
  },
};
