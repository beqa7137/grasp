import { rangeOf } from '../../algorithms/input.js';
import { randInt, shuffle } from '../../algorithms/random.js';
import type { CodingProblemDefinition } from '../types.js';
import { ints } from './inputs.js';
import { MinHeap } from './min-heap.js';

const sortedInts = (rand: () => number, n: number, lo: number, hi: number) => ints(rand, n, lo, hi).sort((a, b) => a - b);

/** The codes one turn away from a lock code, read as a number from 0 to 9999. */
export function lockNeighbors(code: number): number[] {
  const out: number[] = [];
  for (let place = 1; place < 10_000; place *= 10) {
    const digit = Math.floor(code / place) % 10;
    out.push(code + (((digit + 1) % 10) - digit) * place, code + (((digit + 9) % 10) - digit) * place);
  }
  return out;
}

/** The fewest turns from 0000 to every code, -1 where a deadend blocks the way (everywhere when 0000 is one). */
export function lockTurns(deadends: string[]): Int32Array {
  const dead = new Uint8Array(10_000);
  for (const code of deadends) dead[Number(code)] = 1;
  const turns = new Int32Array(10_000).fill(-1);
  if (dead[0]) return turns;
  turns[0] = 0;
  const queue = [0];
  for (let head = 0; head < queue.length; head++)
    for (const next of lockNeighbors(queue[head]))
      if (!dead[next] && turns[next] < 0) {
        turns[next] = turns[queue[head]] + 1;
        queue.push(next);
      }
  return turns;
}

const lockCode = (code: number) => String(code).padStart(4, '0');

export const lastStoneWeight: CodingProblemDefinition = {
  statement: [
    'Each `stones[i]` is the weight of a stone. Each turn, take the two heaviest stones, weighing `x <= y`, and smash them together. If `x == y`, both are destroyed; otherwise the lighter one is destroyed and the other now weighs `y - x`.',
    'Keep going until at most one stone is left. Return its weight, or 0 if none is left.',
    'Aim for O(n log n) time.',
  ],
  constraints: ['1 ≤ stones.length ≤ 10^5', '1 ≤ stones[i] ≤ 10^9'],
  entry: 'lastStoneWeight',
  params: [{ name: 'stones', type: 'int[]' }],
  returns: 'int',
  compare: 'exact',
  examples: [
    {
      args: [[2, 7, 4, 1, 8, 1]],
      explanation: '8 and 7 leave 1, then 4 and 2 leave 2, then 2 and 1 leave 1, then 1 and 1 are both destroyed, leaving the last 1',
    },
    { args: [[1]], explanation: 'A single stone is never smashed' },
    { args: [[3, 3]], explanation: 'Two equal stones destroy each other, so nothing is left' },
  ],
  edgeCases: [
    [[5]],
    [[1000000000, 1]],
    [[5, 5, 5]],
    [[1, 1, 1, 1]],
    [[3, 7, 2]],
    [[10, 4, 4, 2, 2]],
    [[1, 2, 3, 4, 5, 6]],
    [[9, 3, 3, 1]],
    [[3, 10, 8, 5, 6]],
    [[11, 8, 12, 8, 10]],
    [[1000000000, 1000000000, 999999999, 1]],
  ],
  randomCase: (rand) => [ints(rand, randInt(rand, 1, 8), 1, 12)],
  // 10^5 stones up to 10^9: nearly every smash leaves a stone, so there are about 10^5 turns, and finding the two
  // heaviest with a scan of every stone left takes about 4.6·10^9 steps.
  performanceCase: (rand) => [ints(rand, 100_000, 1, 1_000_000_000)],
  solve(stones: number[]) {
    const heap = new MinHeap();
    for (const stone of stones) heap.push([-stone, 0]);
    while (heap.size > 1) {
      const y = -heap.pop()[0];
      const x = -heap.pop()[0];
      if (x !== y) heap.push([x - y, 0]);
    }
    return heap.size ? -heap.pop()[0] : 0;
  },
  approach:
    'Keep the stones in a max-heap (a min-heap of negated weights in most languages). Each turn pop the two heaviest and push back their difference when it is not 0. Each turn costs O(log n) instead of a scan or a sort of every stone left; keeping a sorted list with `bisect.insort` is still O(n) a turn.',
  complexity: { time: 'O(n log n)', space: 'O(n)' },
};

export const mergeKSortedArrays: CodingProblemDefinition = {
  statement: [
    '`arrays` holds k arrays, each sorted in non-decreasing order, and any of them can be empty. Return one array holding every value from all of them, sorted in non-decreasing order and keeping duplicates.',
    'Try using the order each array is already in instead of sorting every value again.',
  ],
  constraints: [
    '1 ≤ k ≤ 10^5',
    '0 ≤ arrays[i].length',
    'at most 2·10^5 values in all',
    '-10^9 ≤ arrays[i][j] ≤ 10^9',
    'each array is sorted in non-decreasing order',
  ],
  entry: 'mergeKArrays',
  params: [{ name: 'arrays', type: 'int[][]' }],
  returns: 'int[]',
  compare: 'exact',
  examples: [
    {
      args: [
        [
          [1, 4, 5],
          [1, 3, 4],
          [2, 6],
        ],
      ],
      explanation: 'Taking the smallest next value each time gives 1, 1, 2, 3, 4, 4, 5, 6',
    },
    { args: [[[], [0]]], explanation: 'The empty array adds nothing' },
    { args: [[[]]] },
  ],
  edgeCases: [
    [[[7]]],
    [[[], []]],
    [
      [
        [1, 1, 1],
        [1, 1],
      ],
    ],
    [
      [
        [5, 6],
        [1, 2],
        [3, 4],
      ],
    ],
    [[[1, 2, 3], [], [2]]],
    [[[-1000000000, 1000000000], [0], [-1000000000]]],
    [
      [
        [1, 10],
        [2, 3, 4, 5],
      ],
    ],
    [[[], [3], [], [1, 2], []]],
  ],
  randomCase: (rand) => [Array.from({ length: randInt(rand, 1, 5) }, () => sortedInts(rand, randInt(rand, 0, 5), -9, 9))],
  // 7·10^4 arrays of 1 to 3 values, 1.4·10^5 in all, each spread over the whole range: scanning the next value of every
  // array still open for each value out takes about 6·10^9 steps, and merging the arrays into the result one at a time
  // copies the growing result 7·10^4 times, about 5·10^9 steps.
  performanceCase: (rand) => [Array.from({ length: 70_000 }, () => sortedInts(rand, randInt(rand, 1, 3), -1_000_000_000, 1_000_000_000))],
  solve(arrays: number[][]) {
    const merge = (a: number[], b: number[]) => {
      const out = Array<number>(a.length + b.length);
      for (let i = 0, j = 0, k = 0; k < out.length; k++) out[k] = j === b.length || (i < a.length && a[i] <= b[j]) ? a[i++] : b[j++];
      return out;
    };
    let round = arrays;
    while (round.length > 1) round = rangeOf(0, Math.ceil(round.length / 2) - 1).map((i) => merge(round[2 * i], round[2 * i + 1] ?? []));
    return [...round[0]];
  },
  approach:
    'Put the first value of each non-empty array in a min-heap with the index of its array. Pop the smallest, append it, and push the next value from the same array. The heap never holds more than k values, so each of the N values costs O(log k). Merging the arrays in pairs, round after round, is also O(N log k). Joining everything and sorting is O(N log N) and ignores the order already there; picking the next value with a scan over all k arrays is O(N k).',
  complexity: { time: 'O(N log k), N values in all', space: 'O(k) besides the output' },
};

export const ipo: CodingProblemDefinition = {
  statement: [
    'You start with capital `w` and can finish at most `k` different projects, one after another. You can start project `i` only when your capital is at least `capital[i]`; that capital is not spent, and finishing the project adds its profit `profits[i]` to your capital.',
    'Choose the projects and their order to make your final capital as large as possible, and return it. Each project can be done at most once, and doing fewer than `k` projects is allowed.',
  ],
  constraints: [
    '1 ≤ n ≤ 10^5, n = profits.length = capital.length',
    '1 ≤ k ≤ 10^5',
    '0 ≤ w ≤ 10^9',
    '0 ≤ profits[i] ≤ 10^4',
    '0 ≤ capital[i] ≤ 10^9',
  ],
  entry: 'findMaximizedCapital',
  params: [
    { name: 'k', type: 'int' },
    { name: 'w', type: 'int' },
    { name: 'profits', type: 'int[]' },
    { name: 'capital', type: 'int[]' },
  ],
  returns: 'int',
  compare: 'exact',
  examples: [
    {
      args: [2, 0, [1, 2, 3], [0, 1, 1]],
      explanation:
        'Only project 0 is open with capital 0. It brings capital to 1, which opens projects 1 and 2, and project 2 adds 3 for 4',
    },
    { args: [3, 0, [1, 2, 3], [0, 1, 2]], explanation: 'The projects open one by one: 0 + 1 + 2 + 3 = 6' },
  ],
  edgeCases: [
    [1, 0, [5], [1]],
    [1, 7, [0], [0]],
    [5, 10, [1, 2], [0, 0]],
    [1, 1000000000, [10000], [1000000000]],
    [2, 0, [1, 100, 50], [0, 60, 0]],
    [2, 0, [1, 100, 50], [0, 50, 0]],
    [1, 0, [1, 5], [0, 0]],
    [3, 1, [3, 1, 10, 4], [1, 0, 5, 2]],
    [2, 2, [4, 5, 6], [3, 3, 3]],
  ],
  randomCase: (rand) => {
    const n = randInt(rand, 1, 7);
    return [randInt(rand, 1, n + 1), randInt(rand, 0, 4), ints(rand, n, 0, 9), ints(rand, n, 0, 12)];
  },
  // 10^5 projects, each needing close to the capital the ones before it in a hidden order bring, so about 9.5·10^4 get
  // done one by one: scanning every project left for the best affordable one each round takes about 5·10^9 steps.
  performanceCase: (rand) => {
    const n = 100_000;
    const profits = ints(rand, n, 1, 10_000);
    const capital = Array<number>(n).fill(0);
    let reach = randInt(rand, 0, 10);
    const w = reach;
    for (const i of shuffle(rand, rangeOf(0, n - 1))) {
      capital[i] = randInt(rand, Math.max(0, reach - 20_000), reach);
      reach += profits[i];
    }
    return [randInt(rand, 90_000, n), w, profits, capital];
  },
  solve(k: number, w: number, profits: number[], capital: number[]) {
    const byCapital = rangeOf(0, profits.length - 1).sort((a, b) => capital[a] - capital[b]);
    const open = new MinHeap();
    let next = 0;
    for (let done = 0; done < k; done++) {
      while (next < byCapital.length && capital[byCapital[next]] <= w) open.push([-profits[byCapital[next++]], 0]);
      if (!open.size) break;
      w -= open.pop()[0];
    }
    return w;
  },
  approach:
    'Greedy with a max-heap: sort the projects by the capital they need, and before each pick push the profit of every project your capital now reaches. Then take the most profitable one in the heap. Capital only grows, so a project once open stays open, and taking the largest profit now never leaves you with less capital for any later step. Stop after `k` picks or when the heap is empty.',
  complexity: { time: 'O((n + k) log n)', space: 'O(n)' },
};

export const openTheLock: CodingProblemDefinition = {
  statement: [
    'A lock has four wheels, each showing a digit from 0 to 9, and it starts at `"0000"`. One turn moves one wheel one step up or down, and the wheels wrap around: 9 turns up to 0 and 0 turns down to 9.',
    'The lock jams if it ever shows a code in `deadends`, including the starting code. Return the fewest turns that bring it to `target` without showing a deadend, or -1 if that cannot be done.',
    'Every code is four digits. `target` is never in `deadends`, `deadends` can repeat a code, and if `target` is `"0000"` the answer is 0.',
  ],
  constraints: ['0 ≤ deadends.length ≤ 5000', 'every code is 4 digits', 'target is not in deadends'],
  entry: 'openLock',
  params: [
    { name: 'deadends', type: 'string[]' },
    { name: 'target', type: 'string' },
  ],
  returns: 'int',
  compare: 'exact',
  examples: [
    {
      args: [['0201', '0101', '0102', '1212', '2002'], '0202'],
      explanation: '0000, 1000, 1100, 1200, 1201, 1202, 0202 takes 6 turns; the 4-turn routes all pass 0101, 0102 or 0201',
    },
    { args: [['8888'], '0009'], explanation: 'Turning the last wheel down once wraps it from 0 to 9' },
    {
      args: [['8887', '8889', '8878', '8898', '8788', '8988', '7888', '9888'], '8888'],
      explanation: 'Every code one turn from 8888 is a deadend, so it cannot be reached',
    },
  ],
  edgeCases: [
    [[], '0000'],
    [['0000'], '8888'],
    [[], '5555'],
    [[], '9999'],
    [['1000', '9000', '0100', '0900', '0010', '0090', '0001', '0009'], '1111'],
    [['0001', '0009'], '0005'],
    [['1000', '0100', '0010'], '0001'],
    [['0000', '0000'], '0001'],
    [['1234', '1234', '4321'], '1235'],
  ],
  randomCase: (rand) => {
    const goal = randInt(rand, 0, 9_999);
    const near = lockNeighbors(goal);
    const deadends = rand() < 0.25 ? [...near] : [];
    for (let m = randInt(rand, 0, 8); m > 0; m--) {
      const step = near[randInt(rand, 0, 7)];
      deadends.push(rand() < 0.5 ? step : lockNeighbors(step)[randInt(rand, 0, 7)]);
    }
    for (let m = randInt(rand, 0, 3); m > 0; m--) deadends.push(randInt(rand, 0, 9_999));
    if (rand() < 0.1) deadends.push(0);
    return [shuffle(rand, deadends.filter((code) => code !== goal).map(lockCode)), lockCode(goal)];
  },
  // 3,500 random deadends, some repeated, and a target as many turns away as any code the lock can reach, 20 or more: a
  // BFS that never remembers the codes it has queued makes billions of copies of them long before it gets there.
  performanceCase: (rand) => {
    const deadends = Array.from({ length: 3_500 }, () => lockCode(randInt(rand, 1, 9_999)));
    const turns = lockTurns(deadends);
    const farthest = turns.reduce((a, b) => Math.max(a, b), 0);
    const ends = rangeOf(0, 9_999).filter((code) => turns[code] === farthest);
    return [deadends, lockCode(ends[randInt(rand, 0, ends.length - 1)])];
  },
  solve(deadends: string[], target: string) {
    return lockTurns(deadends)[Number(target)];
  },
  approach:
    'BFS over the 10,000 codes from `"0000"`, each with 8 neighbors: one wheel one step up or down, wrapping 9 and 0. Put the deadends in a set and never queue one, return -1 at once if `"0000"` is a deadend, and mark each code seen when it is queued. BFS reaches codes in order of turns, so the level where `target` appears is the answer.',
  complexity: { time: 'O(10^4 · 8 + deadends)', space: 'O(10^4)' },
};

const KNIGHT_MOVES = [
  [1, 2],
  [2, 1],
  [-1, 2],
  [-2, 1],
  [1, -2],
  [2, -1],
  [-1, -2],
  [-2, -1],
];

export const minimumKnightMoves: CodingProblemDefinition = {
  statement: [
    'A knight stands on square `(0, 0)` of an infinite chessboard. Each move takes it two squares along one axis and one square along the other, in any of the 8 such directions.',
    'Return the fewest moves that bring it to square `(x, y)`. Every square can be reached, and the knight may pass through squares with negative coordinates on the way.',
  ],
  constraints: ['|x| + |y| ≤ 300'],
  entry: 'minKnightMoves',
  params: [
    { name: 'x', type: 'int' },
    { name: 'y', type: 'int' },
  ],
  returns: 'int',
  compare: 'exact',
  examples: [
    { args: [2, 1], explanation: 'One move: two squares along x and one along y' },
    { args: [5, 5], explanation: '(0, 0) to (2, 1) to (4, 2) to (3, 4) to (5, 5) takes 4 moves' },
    { args: [1, 1], explanation: '(0, 0) to (2, -1) to (1, 1): the shortest route dips below the x axis' },
  ],
  edgeCases: [
    [0, 0],
    [1, 0],
    [0, -1],
    [-1, 1],
    [2, 2],
    [-2, -2],
    [-1, -2],
    [3, 0],
    [4, 4],
    [-3, 7],
    [150, -150],
    [-100, -200],
    [0, 200],
    [1, 199],
  ],
  randomCase: (rand) => [randInt(rand, -12, 12), randInt(rand, -12, 12)],
  // A target 285 to 300 squares away, about 100 moves: a BFS that never remembers the squares it has queued puts 8^d
  // paths on level d. Neither coordinate passes 190, so a plain BFS over the whole board still finishes in browser Python.
  performanceCase: (rand) => {
    const total = randInt(rand, 285, 300);
    const x = randInt(rand, total - 190, 190);
    return [rand() < 0.5 ? x : -x, rand() < 0.5 ? total - x : x - total];
  },
  solve(x: number, y: number) {
    const [tx, ty] = [Math.abs(x), Math.abs(y)];
    // By symmetry the target can sit in the first quadrant, and no shortest route needs to leave x, y >= -2 or pass
    // more than 2 squares beyond it.
    const width = tx + 5;
    const height = ty + 5;
    const index = (a: number, b: number) => (a + 2) * height + (b + 2);
    const moves = new Int32Array(width * height).fill(-1);
    const queue = [index(0, 0)];
    moves[queue[0]] = 0;
    for (let head = 0; head < queue.length; head++) {
      const cell = queue[head];
      const [a, b] = [Math.floor(cell / height) - 2, (cell % height) - 2];
      if (a === tx && b === ty) return moves[cell];
      for (const [da, db] of KNIGHT_MOVES) {
        const [na, nb] = [a + da, b + db];
        if (na < -2 || nb < -2 || na > tx + 2 || nb > ty + 2 || moves[index(na, nb)] >= 0) continue;
        moves[index(na, nb)] = moves[cell] + 1;
        queue.push(index(na, nb));
      }
    }
    return -1;
  },
  approach:
    'BFS from `(0, 0)`, marking each square when it is queued. Reflecting the target into the first quadrant changes nothing by symmetry, and shortest routes never need to go more than 2 squares below 0 or past the target, so the search can stay in that box. The level where `(x, y)` appears is the answer. A closed-form formula with special cases also exists.',
  complexity: { time: 'O((|x| + |y|)²)', space: 'O((|x| + |y|)²)' },
};
