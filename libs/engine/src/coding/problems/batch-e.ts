import { rangeOf } from '../../algorithms/input.js';
import { randInt, shuffle } from '../../algorithms/random.js';
import type { CodingProblemDefinition } from '../types.js';
import { ints } from './inputs.js';

const randomWord = (rand: () => number, alphabet: string, min: number, max: number) =>
  Array.from({ length: randInt(rand, min, max) }, () => alphabet[randInt(rand, 0, alphabet.length - 1)]).join('');

/** A walk of up to `length` steps between neighboring cells; it may revisit a cell, so the word it spells may not be findable. */
function walkWord(rand: () => number, board: string[][], length: number): string {
  let r = randInt(rand, 0, board.length - 1);
  let c = randInt(rand, 0, board[0].length - 1);
  let word = board[r][c];
  for (let step = 1; step < length; step++) {
    const moves = [
      [r - 1, c],
      [r + 1, c],
      [r, c - 1],
      [r, c + 1],
    ].filter(([y, x]) => y >= 0 && y < board.length && x >= 0 && x < board[0].length);
    if (!moves.length) break;
    [r, c] = moves[randInt(rand, 0, moves.length - 1)];
    word += board[r][c];
  }
  return word;
}

export const wordSearchII: CodingProblemDefinition = {
  statement: [
    '`board` is a grid of lowercase letters. A word is on the board if a path of cells spells it, each cell horizontally or vertically next to the one before, with no cell used twice in the same word.',
    'The words in `words` are distinct. Return every word of `words` that is on the board, each once, in any order; return an empty list if none is.',
  ],
  constraints: [
    '1 ≤ rows, cols ≤ 12',
    '1 ≤ words.length ≤ 3·10^4',
    '1 ≤ words[i].length ≤ 10',
    'words are distinct',
    'board and words hold lowercase letters',
  ],
  entry: 'findWords',
  params: [
    { name: 'board', type: 'char[][]' },
    { name: 'words', type: 'string[]' },
  ],
  returns: 'string[]',
  compare: 'unordered',
  examples: [
    {
      args: [
        [
          ['o', 'a', 'a', 'n'],
          ['e', 't', 'a', 'e'],
          ['i', 'h', 'k', 'r'],
          ['i', 'f', 'l', 'v'],
        ],
        ['oath', 'pea', 'eat', 'rain'],
      ],
      explanation:
        'oath goes right from the top-left o, then down through t to h; eat runs left along the second row from its last cell; the board has no p, and no path spells rain',
    },
    {
      args: [
        [
          ['a', 'b'],
          ['c', 'd'],
        ],
        ['abdc', 'abc', 'aba'],
      ],
      explanation: 'abdc turns two corners; b and c touch only diagonally, and aba would use the a twice',
    },
  ],
  edgeCases: [
    [[['a']], ['a', 'b', 'aa']],
    [[['a', 'a']], ['a', 'aa', 'aaa']],
    [
      [
        ['a', 'a'],
        ['a', 'a'],
      ],
      ['aaaa', 'aaaaa'],
    ],
    [
      [
        ['a', 'b'],
        ['c', 'd'],
      ],
      ['ad', 'bc', 'da', 'cb'],
    ],
    [[['a', 'b', 'c']], ['ab', 'abc', 'cba', 'bc', 'abcd', 'aba']],
    [
      [['x'], ['y'], ['z']],
      ['q', 'xzy'],
    ],
  ],
  randomCase: (rand) => {
    const cols = randInt(rand, 1, 4);
    const board = Array.from({ length: randInt(rand, 1, 4) }, () => Array.from({ length: cols }, () => 'abc'[randInt(rand, 0, 2)]));
    const words = new Set<string>();
    const count = randInt(rand, 1, 8);
    while (words.size < count) words.add(rand() < 0.6 ? walkWord(rand, board, randInt(rand, 1, 6)) : randomWord(rand, 'abc', 1, 4));
    return [board, [...words]];
  },
  // A 12 × 12 board of a's with b to z once each in a 5 × 5 corner block. Every word is six or seven a's, then distinct
  // letters from b to z, so a search per word walks the 3·10^4 to 8·10^4 all-a paths again for each of the 30,000
  // words, while a trie walks them once. Each word's letters are all on the board, so counting letters rules none out.
  performanceCase: (rand) => {
    const top = 7 * randInt(rand, 0, 1);
    const left = 7 * randInt(rand, 0, 1);
    const rare = shuffle(rand, [...'bcdefghijklmnopqrstuvwxyz']);
    const board = rangeOf(0, 11).map((r) =>
      rangeOf(0, 11).map((c) => (r >= top && r < top + 5 && c >= left && c < left + 5 ? rare[(r - top) * 5 + c - left] : 'a')),
    );
    const words = new Set<string>();
    for (const x of rare) for (const y of rare) for (const z of rare) if (x !== y && y !== z && x !== z) words.add(`aaaaaaa${x}${y}${z}`);
    while (words.size < 30_000) words.add(`aaaaaa${shuffle(rand, rare).slice(0, 4).join('')}`);
    return [board, shuffle(rand, [...words])];
  },
  solve(board: string[][], words: string[]) {
    const children: Map<string, number>[] = [new Map()];
    const ending: (string | null)[] = [null];
    for (const word of words) {
      let node = 0;
      for (const letter of word) {
        let next = children[node].get(letter);
        if (next === undefined) {
          next = children.length;
          children[node].set(letter, next);
          children.push(new Map());
          ending.push(null);
        }
        node = next;
      }
      ending[node] = word;
    }
    const rows = board.length;
    const cols = board[0].length;
    const found: string[] = [];
    const visit = (r: number, c: number, parent: number): void => {
      const letter = board[r][c];
      const node = children[parent].get(letter);
      if (node === undefined) return;
      if (ending[node] !== null) {
        found.push(ending[node]!);
        ending[node] = null;
      }
      board[r][c] = '#';
      if (r > 0) visit(r - 1, c, node);
      if (r + 1 < rows) visit(r + 1, c, node);
      if (c > 0) visit(r, c - 1, node);
      if (c + 1 < cols) visit(r, c + 1, node);
      board[r][c] = letter;
    };
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) visit(r, c, 0);
    return found;
  },
  approach:
    'Put the words in a trie and run one backtracking search from every cell, following the trie as it goes: a path stops as soon as no word starts with its letters. Record a word when its trie node ends one, and clear the mark so it is found once. Searching for each word on its own repeats the shared prefixes once per word.',
  complexity: { time: 'O(rows · cols · 3^L), L the longest word length', space: 'O(total letters in words)' },
};

export const wordBreak: CodingProblemDefinition = {
  statement: [
    'Return `true` if `s` can be split into one or more pieces that are each a word in `wordDict`, and `false` otherwise.',
    'A word can be used any number of times. The words in `wordDict` are distinct.',
  ],
  constraints: ['1 ≤ s.length ≤ 1000', '1 ≤ wordDict.length ≤ 1000', '1 ≤ wordDict[i].length ≤ 20', 'lowercase letters'],
  entry: 'wordBreak',
  params: [
    { name: 's', type: 'string' },
    { name: 'wordDict', type: 'string[]' },
  ],
  returns: 'bool',
  compare: 'exact',
  examples: [
    { args: ['leetcode', ['leet', 'code']], explanation: 'leetcode is leet followed by code' },
    { args: ['applepenapple', ['apple', 'pen']], explanation: 'apple + pen + apple: apple is used twice' },
    { args: ['catsandog', ['cats', 'dog', 'sand', 'and', 'cat']] },
  ],
  edgeCases: [
    ['a', ['a']],
    ['a', ['b']],
    ['aaaa', ['a']],
    ['ab', ['abc']],
    ['abcd', ['abc', 'ab', 'cd']],
    ['aab', ['a', 'aab']],
    ['aaaaaaa', ['aaaa', 'aaa']],
    ['abab', ['ab', 'ba']],
  ],
  randomCase: (rand) => {
    const words = new Set<string>();
    const count = randInt(rand, 1, 5);
    while (words.size < count) words.add(randomWord(rand, 'ab', 1, 3));
    const dictionary = [...words];
    const s =
      rand() < 0.5
        ? Array.from({ length: randInt(rand, 1, 4) }, () => dictionary[randInt(rand, 0, dictionary.length - 1)]).join('')
        : randomWord(rand, 'ab', 1, 10);
    return [s, dictionary];
  },
  // a^k b with runs of a as words and no word ending in the b: every way to split the a's fails at the b, so recursion
  // that does not remember which positions already failed tries exponentially many splits.
  performanceCase: (rand) => {
    const words = new Set(rangeOf(1, 20).flatMap((k) => (k <= 2 || rand() < 0.6 ? ['a'.repeat(k)] : [])));
    while (words.size < 1000) {
      const word = [...randomWord(rand, 'ab', 1, 18)];
      word[randInt(rand, 0, word.length - 1)] = 'b';
      words.add(word.join('') + 'a');
    }
    return ['a'.repeat(randInt(rand, 990, 999)) + 'b', shuffle(rand, [...words])];
  },
  solve(s: string, wordDict: string[]) {
    const words = new Set(wordDict);
    const longest = Math.max(...wordDict.map((w) => w.length));
    const ok = Array<boolean>(s.length + 1).fill(false);
    ok[0] = true;
    for (let end = 1; end <= s.length; end++)
      for (let start = Math.max(0, end - longest); start < end && !ok[end]; start++) ok[end] = ok[start] && words.has(s.slice(start, end));
    return ok[s.length];
  },
  approach:
    '`ok[i]` says whether the first `i` letters split into words: it holds when some `ok[j]` does and `s[j:i]` is a word. Words have at most 20 letters, so only `j` from `i - 20` up can work. Recursing on each word that fits, without remembering positions that already failed, is exponential. Fill it bottom-up in browser Python: `@cache` and `@lru_cache` can exhaust its stack at these lengths.',
  complexity: { time: 'O(n · L²), L the longest word length', space: 'O(n + total letters in wordDict)' },
};

export const longestPalindromicSubsequence: CodingProblemDefinition = {
  statement: [
    'Return the length of the longest subsequence of `s` that reads the same forwards and backwards. A subsequence keeps the letters in their order but may skip any of them.',
  ],
  constraints: ['1 ≤ s.length ≤ 1000', 'lowercase letters'],
  entry: 'longestPalindromeSubseq',
  params: [{ name: 's', type: 'string' }],
  returns: 'int',
  compare: 'exact',
  examples: [
    { args: ['bbbab'], explanation: 'Skipping the a leaves bbbb' },
    { args: ['cbbd'], explanation: 'bb is the longest: no subsequence of three letters is a palindrome' },
  ],
  edgeCases: [['a'], ['ab'], ['aa'], ['abcd'], ['aaaa'], ['abcab'], ['abab'], ['character']],
  randomCase: (rand) => [randomWord(rand, 'abc', 1, 10)],
  performanceCase: (rand) => [randomWord(rand, 'abcdefghij', 1000, 1000)],
  solve(s: string) {
    const n = s.length;
    let below = Array<number>(n).fill(0);
    for (let i = n - 1; i >= 0; i--) {
      const row = Array<number>(n).fill(0);
      row[i] = 1;
      for (let j = i + 1; j < n; j++) row[j] = s[i] === s[j] ? below[j - 1] + 2 : Math.max(below[j], row[j - 1]);
      below = row;
    }
    return below[n - 1];
  },
  approach:
    '`dp[i][j]` is the answer for `s[i..j]`: when the ends match they wrap the answer inside, adding 2; otherwise drop one end or the other and keep the better. Fill from short ranges to long, bottom-up: in browser Python, `@cache` and `@lru_cache` can exhaust its stack at these lengths.',
  complexity: { time: 'O(n²)', space: 'O(n) with one rolling row' },
};

/** The indices a full lap can start from, found with prefix sums: the tank must never drop below zero. */
export function gasStationStarts(gas: number[], cost: number[]): number[] {
  const n = gas.length;
  const tank = [0];
  for (let i = 0; i < n; i++) tank.push(tank[i] + gas[i] - cost[i]);
  const total = tank[n];
  if (total < 0) return [];
  const lowestFrom = [...tank];
  for (let i = n - 1; i >= 0; i--) lowestFrom[i] = Math.min(tank[i], lowestFrom[i + 1]);
  const starts: number[] = [];
  let lowestBefore = Infinity;
  for (let i = 0; i < n; i++) {
    if (i > 0) lowestBefore = Math.min(lowestBefore, tank[i]);
    if (lowestFrom[i + 1] >= tank[i] && lowestBefore + total >= tank[i]) starts.push(i);
  }
  return starts;
}

function station(rand: () => number, gain: number): [gas: number, cost: number] {
  const cost = randInt(rand, Math.max(0, -gain), Math.min(10_000, 10_000 - gain));
  return [cost + gain, cost];
}

export const gasStation: CodingProblemDefinition = {
  statement: [
    'Stations `0` to `n - 1` sit on a loop. At station `i` you can take `gas[i]` units of gas, and driving on to the next station (from `n - 1` back to `0`) burns `cost[i]`.',
    'You start at one station with an empty tank, which has no limit. Return the index of the station from which you can drive the whole loop once without the tank dropping below zero on the way, or -1 if there is none.',
    'When such a station exists, it is the only one.',
  ],
  constraints: ['1 ≤ n ≤ 2·10^5', 'gas.length = cost.length = n', '0 ≤ gas[i], cost[i] ≤ 10^4', 'at most one station works'],
  entry: 'canCompleteCircuit',
  params: [
    { name: 'gas', type: 'int[]' },
    { name: 'cost', type: 'int[]' },
  ],
  returns: 'int',
  compare: 'exact',
  examples: [
    {
      args: [
        [1, 2, 3, 4, 5],
        [3, 4, 5, 1, 2],
      ],
      explanation: 'From station 3 the tank holds 4 - 1 = 3, then 3 + 5 - 2 = 6, 6 + 1 - 3 = 4, 4 + 2 - 4 = 2 and 2 + 3 - 5 = 0 back at 3',
    },
    {
      args: [
        [2, 3, 4],
        [3, 4, 3],
      ],
      explanation: 'The loop takes 10 units and offers only 9, so no start works',
    },
  ],
  edgeCases: [
    [[5], [5]],
    [[0], [0]],
    [[4], [5]],
    [
      [2, 0],
      [0, 2],
    ],
    [
      [0, 0, 5],
      [1, 1, 3],
    ],
    [
      [5, 1, 2],
      [4, 4, 1],
    ],
    [
      [3, 1, 1],
      [1, 2, 2],
    ],
    [
      [1, 9, 0, 4],
      [2, 1, 9, 1],
    ],
  ],
  randomCase: (rand) => {
    for (;;) {
      const n = randInt(rand, 1, 8);
      const gas = ints(rand, n, 0, 6);
      const cost = ints(rand, n, 0, 6);
      if (gasStationStarts(gas, cost).length <= 1) return [gas, cost];
    }
  },
  // A long climb of small gains, then a few steep losses back down to the start: every other start drives on until
  // the losses, so trying each start in turn from either end drives about 10^10 legs before it reaches the answer.
  performanceCase: (rand) => {
    const climb = 199_800;
    const first = randInt(rand, 1, 3);
    const gains = [first, ...Array.from({ length: climb - 1 }, () => randInt(rand, 1, 3))];
    let owed = gains.reduce((sum, g) => sum + g, 0) - randInt(rand, 0, first - 1);
    while (owed > 0) {
      const loss = Math.min(owed, randInt(rand, 5_000, 10_000));
      gains.push(-loss);
      owed -= loss;
    }
    const stations = gains.map((gain) => station(rand, gain));
    const turn = randInt(rand, Math.floor(stations.length * 0.25), Math.floor(stations.length * 0.33));
    const loop = [...stations.slice(turn), ...stations.slice(0, turn)];
    return [loop.map(([gas]) => gas), loop.map(([, cost]) => cost)];
  },
  solve(gas: number[], cost: number[]) {
    let total = 0;
    let tank = 0;
    let start = 0;
    for (let i = 0; i < gas.length; i++) {
      total += gas[i] - cost[i];
      tank += gas[i] - cost[i];
      if (tank < 0) {
        start = i + 1;
        tank = 0;
      }
    }
    return total < 0 ? -1 : start;
  },
  approach:
    'If the total gas is less than the total cost, no start works. Otherwise drive once from station 0 with a running tank: when it drops below zero after station `i`, no station from the current start to `i` can work either, since each would arrive at `i` with no more gas, so restart at `i + 1`. The last restart is the answer.',
  complexity: { time: 'O(n)', space: 'O(1)' },
};

export const countingBits: CodingProblemDefinition = {
  statement: [
    'Return an array `ans` of length `n + 1` where `ans[i]` is the number of 1 bits in the binary form of `i`, for every `i` from 0 to `n`.',
    'Aim for O(n) time: one pass that reuses answers already computed.',
  ],
  constraints: ['0 ≤ n ≤ 10^5'],
  entry: 'countBits',
  params: [{ name: 'n', type: 'int' }],
  returns: 'int[]',
  compare: 'exact',
  examples: [{ args: [5], explanation: '0 to 5 in binary are 0, 1, 10, 11, 100 and 101' }, { args: [2] }],
  edgeCases: [[0], [1], [3], [8], [16], [31]],
  randomCase: (rand) => [randInt(rand, 0, 64)],
  performanceCase: (rand) => [randInt(rand, 90_000, 100_000)],
  solve(n: number) {
    const ans = Array<number>(n + 1).fill(0);
    for (let i = 1; i <= n; i++) ans[i] = ans[i >> 1] + (i & 1);
    return ans;
  },
  approach:
    '`i >> 1` is `i` without its last bit, and its count is already known, so `ans[i]` is `ans[i >> 1]` plus that last bit, `i & 1`. Counting the bits of each number on its own costs O(log n) per number instead.',
  complexity: { time: 'O(n)', space: 'O(1) besides the output' },
};
