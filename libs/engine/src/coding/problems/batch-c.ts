import { rangeOf } from '../../algorithms/input.js';
import { distinctInts, randInt, shuffle } from '../../algorithms/random.js';
import type { CodingProblemDefinition } from '../types.js';

const squaredDistance = ([x, y]: number[]) => x * x + y * y;

/** A `k` for `points` whose k-th and (k+1)-th closest distances differ, as near `target` as possible. */
function uniqueCutoff(points: number[][], target: number): number {
  const distances = points.map(squaredDistance).sort((a, b) => a - b);
  const unique = (k: number) => k === points.length || distances[k - 1] < distances[k];
  for (let gap = 0; ; gap++) {
    if (target - gap >= 1 && unique(target - gap)) return target - gap;
    if (target + gap <= points.length && unique(target + gap)) return target + gap;
  }
}

function randomPoints(rand: () => number, n: number, limit: number): number[][] {
  return Array.from({ length: n }, () => [randInt(rand, -limit, limit), randInt(rand, -limit, limit)]);
}

/** Open rows joined by one gap in each wall row between them, alternately at the right and left end: one long corridor. */
function serpentine(n: number): number[][] {
  const indices = rangeOf(0, n - 1);
  return indices.map((r) => indices.map((c) => (r % 2 === 0 || c === (r % 4 === 1 ? n - 1 : 0) ? 0 : 1)));
}

const letterBoard = (rand: () => number, rows: number, cols: number, letters: string) =>
  Array.from({ length: rows }, () => Array.from({ length: cols }, () => letters[randInt(rand, 0, letters.length - 1)]));

/** The letters along a random path through `board` that never revisits a cell, so the word it spells is always there. */
function wordOnBoard(rand: () => number, board: string[][], length: number): string {
  let r = randInt(rand, 0, board.length - 1);
  let c = randInt(rand, 0, board[0].length - 1);
  const used = new Set([`${r},${c}`]);
  let word = board[r][c];
  while (word.length < length) {
    const next = [
      [r + 1, c],
      [r - 1, c],
      [r, c + 1],
      [r, c - 1],
    ].filter(([y, x]) => board[y]?.[x] !== undefined && !used.has(`${y},${x}`));
    if (!next.length) break;
    [r, c] = next[randInt(rand, 0, next.length - 1)];
    used.add(`${r},${c}`);
    word += board[r][c];
  }
  return word;
}

export const kClosestPoints: CodingProblemDefinition = {
  statement: [
    'Each `points[i]` is `[x, y]`, a point in the plane. Return the `k` points closest to the origin `[0, 0]` by straight-line (Euclidean) distance, in any order.',
    'Points can repeat, and each copy counts as its own point. The tests guarantee the answer is unique: the `k`-th closest point is strictly closer than the next one, unless `k` is the number of points.',
  ],
  constraints: ['1 ≤ k ≤ points.length ≤ 10^5', '-10^4 ≤ x, y ≤ 10^4'],
  entry: 'kClosest',
  params: [
    { name: 'points', type: 'int[][]' },
    { name: 'k', type: 'int' },
  ],
  returns: 'int[][]',
  compare: 'unordered',
  examples: [
    {
      args: [
        [
          [1, 3],
          [-2, 2],
        ],
        1,
      ],
      explanation: 'The squared distances are 1 + 9 = 10 and 4 + 4 = 8, so [-2,2] is closer',
    },
    {
      args: [
        [
          [3, 3],
          [5, -1],
          [-2, 4],
        ],
        2,
      ],
      explanation: 'The squared distances are 18, 26 and 20, so the two closest are [3,3] and [-2,4]',
    },
  ],
  edgeCases: [
    [[[0, 0]], 1],
    [
      [
        [1, 0],
        [0, -1],
        [-1, 0],
      ],
      3,
    ],
    [
      [
        [3, 0],
        [2, 2],
      ],
      1,
    ],
    [
      [
        [2, 2],
        [2, 2],
        [3, 0],
      ],
      2,
    ],
    [
      [
        [-10000, -10000],
        [10000, 9999],
        [0, -10000],
      ],
      2,
    ],
  ],
  randomCase: (rand) => {
    const points = randomPoints(rand, randInt(rand, 1, 10), 4);
    return [points, uniqueCutoff(points, randInt(rand, 1, points.length))];
  },
  // Picking the closest remaining point k times with a full scan takes about 5·10^9 steps for k near 0.9n.
  performanceCase: (rand) => {
    const points = randomPoints(rand, 100_000, 10_000);
    return [points, uniqueCutoff(points, 90_000)];
  },
  solve(points: number[][], k: number) {
    return points
      .map((point) => ({ point, distance: squaredDistance(point) }))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, k)
      .map(({ point }) => point);
  },
  approach:
    'Keep a max-heap of the `k` closest points seen so far, keyed by squared distance (no square root needed). When a closer point arrives, it replaces the farthest one at the top. Quickselect on the distances averages O(n).',
  complexity: { time: 'O(n log k)', space: 'O(k)' },
};

export const shortestPathBinaryMatrix: CodingProblemDefinition = {
  statement: [
    '`grid` is an n × n matrix where 0 is an open cell and 1 is blocked. A clear path runs from the top-left cell to the bottom-right cell through open cells only, and each step moves to one of the 8 neighboring cells: across a side or diagonally across a corner.',
    'Return the number of cells on the shortest clear path, counting both ends, or -1 if there is none. If either corner is blocked there is no path; in a 1 × 1 grid holding 0 the path is that one cell.',
  ],
  constraints: ['1 ≤ n ≤ 500', 'grid[r][c] is 0 or 1'],
  entry: 'shortestPathBinaryMatrix',
  params: [{ name: 'grid', type: 'int[][]' }],
  returns: 'int',
  compare: 'exact',
  examples: [
    {
      args: [
        [
          [0, 0, 0],
          [1, 1, 0],
          [1, 1, 0],
        ],
      ],
      explanation: 'Right, then diagonally down, then down: 4 cells',
    },
    {
      args: [
        [
          [0, 1],
          [1, 0],
        ],
      ],
      explanation: 'One diagonal step joins the corners, so the path has 2 cells',
    },
    {
      args: [
        [
          [1, 0, 0],
          [1, 1, 0],
          [1, 1, 0],
        ],
      ],
      explanation: 'The top-left cell is blocked, so no path starts',
    },
  ],
  edgeCases: [
    [[[0]]],
    [[[1]]],
    [
      [
        [1, 0],
        [0, 0],
      ],
    ],
    [
      [
        [0, 0],
        [0, 1],
      ],
    ],
    [
      [
        [0, 1, 0, 0],
        [0, 1, 0, 1],
        [0, 1, 0, 1],
        [0, 0, 1, 0],
      ],
    ],
    [
      [
        [0, 0, 0, 0, 0],
        [1, 1, 1, 1, 0],
        [0, 0, 0, 0, 0],
        [0, 1, 1, 1, 1],
        [0, 0, 0, 0, 0],
      ],
    ],
    [
      [
        [0, 1, 1],
        [1, 1, 1],
        [1, 1, 0],
      ],
    ],
  ],
  randomCase: (rand) => {
    const n = randInt(rand, 2, 6);
    const grid = Array.from({ length: n }, () => Array.from({ length: n }, () => (rand() < 0.3 ? 1 : 0)));
    if (rand() < 0.8) grid[0][0] = grid[n - 1][n - 1] = 0;
    return [grid];
  },
  // The corridor holds about 1.25·10^5 cells, so rescanning the whole grid once per step of the path is too slow.
  performanceCase: () => [serpentine(499)],
  solve(grid: number[][]) {
    const n = grid.length;
    if (grid[0][0] || grid[n - 1][n - 1]) return -1;
    const distance = new Int32Array(n * n);
    distance[0] = 1;
    const queue = new Int32Array(n * n);
    let tail = 1;
    for (let head = 0; head < tail; head++) {
      const cell = queue[head];
      if (cell === n * n - 1) return distance[cell];
      const r = Math.floor(cell / n);
      const c = cell % n;
      for (let y = Math.max(0, r - 1); y <= Math.min(n - 1, r + 1); y++)
        for (let x = Math.max(0, c - 1); x <= Math.min(n - 1, c + 1); x++) {
          const next = y * n + x;
          if (grid[y][x] || distance[next]) continue;
          distance[next] = distance[cell] + 1;
          queue[tail++] = next;
        }
    }
    return -1;
  },
  approach:
    'BFS from the top-left cell over the 8 neighbors, marking each open cell when it is first queued. BFS reaches cells in order of distance, so the first time the bottom-right cell comes off the queue its distance is the answer.',
  complexity: { time: 'O(n²)', space: 'O(n²)' },
};

export const combinationSum: CodingProblemDefinition = {
  statement: [
    'The values in `candidates` are distinct. Return every combination of them that adds up to `target`, where a value can be used any number of times. Two combinations are the same when they use each value the same number of times; return each one once.',
    'The combinations, and the numbers inside each one, can come in any order. If no combination works, return an empty list.',
  ],
  constraints: [
    '1 ≤ candidates.length ≤ 30',
    '2 ≤ candidates[i] ≤ 100',
    'values are distinct',
    '1 ≤ target ≤ 100',
    'The answer has at most 1,000 combinations',
  ],
  entry: 'combinationSum',
  params: [
    { name: 'candidates', type: 'int[]' },
    { name: 'target', type: 'int' },
  ],
  returns: 'int[][]',
  compare: 'unordered-nested',
  examples: [
    {
      args: [[2, 3, 6, 7], 7],
      explanation: '2 + 2 + 3 = 7 uses 2 twice, and 7 alone is a combination too',
    },
    { args: [[2, 3, 5], 8] },
    { args: [[2], 1], explanation: 'No sum of 2s is odd, so the answer is empty' },
  ],
  edgeCases: [
    [[2], 4],
    [[7], 7],
    [[2, 3], 5],
    [[8, 2, 3], 6],
    [[3, 4], 2],
    [[100, 99], 100],
  ],
  randomCase: (rand) => [distinctInts(rand, randInt(rand, 1, 4), 2, 12), randInt(rand, 1, 20)],
  // 549 combinations, but more than 10^13 ordered sequences reach 80: searching sequences and dropping repeats is too slow.
  performanceCase: (rand) => [shuffle(rand, [2, 3, 5, 7, ...distinctInts(rand, 3, 81, 100)]), 80],
  solve(candidates: number[], target: number) {
    const sorted = [...candidates].sort((a, b) => a - b);
    const out: number[][] = [];
    const path: number[] = [];
    const go = (from: number, rest: number) => {
      if (rest === 0) {
        out.push([...path]);
        return;
      }
      for (let i = from; i < sorted.length && sorted[i] <= rest; i++) {
        path.push(sorted[i]);
        go(i, rest - sorted[i]);
        path.pop();
      }
    };
    go(0, target);
    return out;
  },
  approach:
    'Backtrack over the sorted candidates: from index `i`, try each value at `i` or later and recurse from that same index, so a value can repeat but combinations only ever list values in increasing order and none comes out twice. Stop a loop at the first value larger than what is left.',
  complexity: { time: 'O(n^(target / min + 1)) for the smallest value min', space: 'O(target / min) plus the output' },
};

export const wordSearch: CodingProblemDefinition = {
  statement: [
    '`board` is a grid of uppercase letters. Return true if `word` can be spelled along a path of cells where each next cell is next to the one before it horizontally or vertically (not diagonally) and no cell is used more than once. Otherwise return false.',
  ],
  constraints: ['1 ≤ rows, cols ≤ 200', '1 ≤ word.length ≤ 30', 'board and word hold only uppercase English letters'],
  entry: 'exist',
  params: [
    { name: 'board', type: 'char[][]' },
    { name: 'word', type: 'string' },
  ],
  returns: 'bool',
  compare: 'exact',
  examples: [
    {
      args: [
        [
          ['A', 'B', 'C', 'E'],
          ['S', 'F', 'C', 'S'],
          ['A', 'D', 'E', 'E'],
        ],
        'ABCCED',
      ],
      explanation: 'Right along the top row to C, down to the second C, then down to E and left to D',
    },
    {
      args: [
        [
          ['A', 'B', 'C', 'E'],
          ['S', 'F', 'C', 'S'],
          ['A', 'D', 'E', 'E'],
        ],
        'SEE',
      ],
    },
    {
      args: [
        [
          ['A', 'B', 'C', 'E'],
          ['S', 'F', 'C', 'S'],
          ['A', 'D', 'E', 'E'],
        ],
        'ABCB',
      ],
      explanation: 'Spelling it would need the B cell twice',
    },
  ],
  edgeCases: [
    [[['A']], 'A'],
    [[['A']], 'B'],
    [[['A']], 'AA'],
    [[['A', 'B']], 'ABA'],
    [[['A', 'B']], 'BA'],
    [
      [
        ['A', 'X'],
        ['Y', 'B'],
      ],
      'AB',
    ],
    [
      [
        ['A', 'B', 'C', 'E'],
        ['S', 'F', 'E', 'S'],
        ['A', 'D', 'E', 'E'],
      ],
      'ABCESEEEFS',
    ],
    [
      [
        ['C', 'A', 'A'],
        ['A', 'A', 'A'],
        ['B', 'C', 'D'],
      ],
      'AAB',
    ],
  ],
  randomCase: (rand) => {
    const board = letterBoard(rand, randInt(rand, 1, 4), randInt(rand, 1, 4), 'ABC');
    const length = randInt(rand, 2, 7);
    const word = rand() < 0.5 ? wordOnBoard(rand, board, length) : letterBoard(rand, 1, length, 'ABCD')[0].join('');
    return [board, word];
  },
  // A word that is not on the board makes every search run to the end. Skipping the letter check until a path is full
  // length walks at least 2^29 paths from most cells.
  performanceCase: (rand) => {
    const board = letterBoard(rand, 200, 200, 'ABCD');
    for (;;) {
      const word = letterBoard(rand, 1, 30, 'ABCD')[0].join('');
      if (!wordSearch.solve(board, word)) return [board, word];
    }
  },
  solve(board: string[][], word: string) {
    const rows = board.length;
    const cols = board[0].length;
    const used = board.map((row) => row.map(() => false));
    const spells = (r: number, c: number, i: number): boolean => {
      if (r < 0 || c < 0 || r >= rows || c >= cols || used[r][c] || board[r][c] !== word[i]) return false;
      if (i === word.length - 1) return true;
      used[r][c] = true;
      const found = spells(r + 1, c, i + 1) || spells(r - 1, c, i + 1) || spells(r, c + 1, i + 1) || spells(r, c - 1, i + 1);
      used[r][c] = false;
      return found;
    };
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) if (spells(r, c, 0)) return true;
    return false;
  },
  approach:
    'Backtrack from every cell: match the next letter, mark the cell used, try the 4 neighbors for the letter after it, and unmark the cell on the way back. A mismatch ends a branch at once, which keeps the search small.',
  complexity: { time: 'O(rows × cols × 3^L) for a word of length L', space: 'O(L)' },
};
