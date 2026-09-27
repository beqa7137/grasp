import { rangeOf } from '../../algorithms/input.js';
import { randInt } from '../../algorithms/random.js';
import type { CodingProblemDefinition } from '../types.js';
import { MinHeap } from './min-heap.js';

function islandGrid(rand: () => number, rows: number, cols: number, density: number): string[][] {
  return Array.from({ length: rows }, () => Array.from({ length: cols }, () => (rand() < density ? '1' : '0')));
}

/**
 * `combRows` rows that alternate rotten and fresh, the fresh ones joined by a fresh last column, above one corridor of
 * fresh oranges that snakes through every other row. Every rotten orange touches the fresh rows, so a search from any
 * of them reaches every fresh orange, and the corridor's far end rots last.
 */
function combOverSnake(rows: number, cols: number, combRows: number): number[][] {
  return rangeOf(0, rows - 1).map((r) =>
    rangeOf(0, cols - 1).map((c) => {
      if (r < combRows) return r % 2 === 0 && c < cols - 1 ? 2 : 1;
      const snakeRow = r - combRows;
      if (snakeRow % 2 === 0) return 1;
      return c === (snakeRow % 4 === 1 ? cols - 1 : 0) ? 1 : 0;
    }),
  );
}

/** Two low combs meet at one gate; an isolated high chamber adds many smaller step sizes. */
function effortCombs(rand: () => number): number[][] {
  const side = 480;
  const wall = 360;
  const secondBridge = 364;
  return Array.from({ length: side }, (_rowValue, row) =>
    Array.from({ length: side }, (_columnValue, col) => {
      if (row < 216 && col >= 36 && col < 252) {
        if (row === 0 || row === 215 || col === 36 || col === 251) return 1_000_000;
        return randInt(rand, 760_000, 1_000_000);
      }
      if (row === side - 1 && col === wall) return 250_000;
      if (
        (row === 240 && col < wall) ||
        (row === 0 && col > wall && col !== secondBridge) ||
        (row === side - 1 && (col === wall - 1 || col === secondBridge)) ||
        (col !== wall && col % 2 === (col < wall ? 0 : 1))
      )
        return 0;
      return 1_000_000;
    }),
  );
}

export const numberOfIslands: CodingProblemDefinition = {
  statement: [
    "`grid` is a map of `'1'` (land) and `'0'` (water). An island is land connected horizontally or vertically. Return the number of islands.",
  ],
  constraints: ['1 ≤ rows, cols ≤ 300', "grid[r][c] is '0' or '1'"],
  entry: 'numIslands',
  params: [{ name: 'grid', type: 'char[][]' }],
  returns: 'int',
  compare: 'exact',
  examples: [
    {
      args: [
        [
          ['1', '1', '0', '0', '0'],
          ['1', '1', '0', '0', '0'],
          ['0', '0', '1', '0', '0'],
          ['0', '0', '0', '1', '1'],
        ],
      ],
    },
  ],
  edgeCases: [[[['0']]], [[['1']]], [[['1', '0', '1', '0', '1']]], [[['1'], ['1'], ['0'], ['1']]]],
  randomCase: (rand) => [islandGrid(rand, randInt(rand, 1, 7), randInt(rand, 1, 7), 0.45)],
  performanceCase: (rand) => [islandGrid(rand, 300, 300, 0.4)],
  solve(grid: string[][]) {
    const rows = grid.length;
    const cols = grid[0].length;
    const seen = grid.map((r) => r.map(() => false));
    let islands = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (grid[r][c] !== '1' || seen[r][c]) continue;
        islands++;
        const queue: [number, number][] = [[r, c]];
        seen[r][c] = true;
        while (queue.length) {
          const [y, x] = queue.pop()!;
          for (const [dy, dx] of [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1],
          ]) {
            const ny = y + dy;
            const nx = x + dx;
            if (ny >= 0 && ny < rows && nx >= 0 && nx < cols && grid[ny][nx] === '1' && !seen[ny][nx]) {
              seen[ny][nx] = true;
              queue.push([ny, nx]);
            }
          }
        }
      }
    }
    return islands;
  },
  approach: 'Scan every cell; each unvisited land cell starts a new island, and a BFS or DFS marks the rest of it.',
  complexity: { time: 'O(rows × cols)', space: 'O(rows × cols)' },
};

export const rottingOranges: CodingProblemDefinition = {
  statement: [
    'In `grid`, 0 is an empty cell, 1 a fresh orange and 2 a rotten one. Every minute, each fresh orange next to a rotten one, horizontally or vertically, turns rotten.',
    'Return how many minutes pass until no fresh orange is left, or -1 if some fresh orange never rots.',
  ],
  constraints: ['1 ≤ rows, cols ≤ 500', 'grid[r][c] is 0, 1 or 2'],
  entry: 'orangesRotting',
  params: [{ name: 'grid', type: 'int[][]' }],
  returns: 'int',
  compare: 'exact',
  examples: [
    {
      args: [
        [
          [2, 1, 1],
          [1, 1, 0],
          [0, 1, 1],
        ],
      ],
      explanation: 'The rot spreads from the top-left corner and reaches the bottom-right orange in minute 4',
    },
    {
      args: [
        [
          [2, 1, 1],
          [0, 1, 1],
          [1, 0, 1],
        ],
      ],
      explanation: 'The bottom-left orange touches only empty cells, so it never rots',
    },
    { args: [[[0, 2]]], explanation: 'No orange is fresh, so no time passes' },
  ],
  edgeCases: [
    [[[0]]],
    [[[1]]],
    [[[1], [2], [1]]],
    [[[2, 0, 1]]],
    [
      [
        [2, 2],
        [1, 1],
      ],
    ],
  ],
  randomCase: (rand) => {
    const cols = randInt(rand, 1, 6);
    return [
      Array.from({ length: randInt(rand, 1, 6) }, () => Array.from({ length: cols }, () => [0, 1, 1, 1, 1, 2, 2][randInt(rand, 0, 6)])),
    ];
  },
  // About 10^4 rotten oranges each reach all 1.25·10^5 fresh ones, so a BFS from each rotten orange is too slow. The rot
  // takes over 10^5 minutes to reach the corridor's far end, so scanning the whole grid once a minute is too.
  performanceCase: () => [combOverSnake(500, 500, 40)],
  solve(grid: number[][]) {
    const cells = grid.map((row) => [...row]);
    let fresh = cells.flat().filter((cell) => cell === 1).length;
    let rotten = cells.flatMap((row, r) => row.flatMap((cell, c) => (cell === 2 ? [[r, c]] : [])));
    let minutes = 0;
    while (fresh && rotten.length) {
      const next: number[][] = [];
      for (const [r, c] of rotten)
        for (const [y, x] of [
          [r + 1, c],
          [r - 1, c],
          [r, c + 1],
          [r, c - 1],
        ])
          if (cells[y]?.[x] === 1) {
            cells[y][x] = 2;
            fresh--;
            next.push([y, x]);
          }
      rotten = next;
      minutes++;
    }
    return fresh ? -1 : minutes;
  },
  approach:
    'Multi-source BFS: start the queue with every rotten orange, and let each round rot the fresh neighbors of the oranges the last round rotted. The answer is the number of rounds, or -1 if a fresh orange is left over.',
  complexity: { time: 'O(rows × cols)', space: 'O(rows × cols)' },
};

export const pathWithMinimumEffort: CodingProblemDefinition = {
  statement: [
    'Walk from the top-left cell of `heights` to the bottom-right cell, one cell at a time up, down, left or right. A path may turn back up or left.',
    'The effort of a path is its largest absolute height difference between two consecutive cells. Return the least possible effort. A one-cell path has effort 0.',
  ],
  constraints: ['1 ≤ rows, cols ≤ 480', '0 ≤ heights[r][c] ≤ 10^6'],
  entry: 'minimumEffortPath',
  params: [{ name: 'heights', type: 'int[][]' }],
  returns: 'int',
  compare: 'exact',
  examples: [
    {
      args: [
        [
          [1, 2, 2],
          [3, 8, 2],
          [5, 3, 5],
        ],
      ],
      explanation: 'The route along the left and bottom edges has largest step 2',
    },
    {
      args: [
        [
          [1, 2, 3],
          [3, 8, 4],
          [5, 3, 5],
        ],
      ],
      explanation: 'Moving along the top and down the right edge makes every step at most 1',
    },
    {
      args: [
        [
          [1, 2, 1, 1, 1],
          [1, 2, 1, 2, 1],
          [1, 2, 1, 2, 1],
          [1, 2, 1, 2, 1],
          [1, 1, 1, 2, 1],
        ],
      ],
      explanation: 'The 1s run down the left edge, up the middle column and down the right edge, so a path along them never changes height',
    },
  ],
  edgeCases: [
    [[[7]]],
    [[[1, 10, 2]]],
    [[[1], [4], [9]]],
    [
      [
        [1, 100],
        [2, 3],
      ],
    ],
    [
      [
        [0, 2, 4, 2],
        [3, 3, 3, 0],
      ],
    ],
    [
      [
        [1, 100, 1],
        [1, 100, 1],
        [1, 1, 1],
      ],
    ],
    [
      [
        [2, 7, 7],
        [2, 7, 5],
        [5, 6, 1],
      ],
    ],
  ],
  randomCase: (rand) => {
    const rows = randInt(rand, 1, 5);
    const cols = randInt(rand, 1, 5);
    return [Array.from({ length: rows }, () => Array.from({ length: cols }, () => randInt(rand, 0, 20)))];
  },
  performanceCase: (rand) => [effortCombs(rand)],
  solve(heights: number[][]) {
    const rows = heights.length;
    const cols = heights[0].length;
    const goal = rows * cols - 1;
    const best = new Float64Array(goal + 1).fill(Infinity);
    best[0] = 0;
    const heap = new MinHeap();
    heap.push([0, 0]);
    const relax = (fromHeight: number, next: number, nextHeight: number, effort: number) => {
      const candidate = Math.max(effort, Math.abs(fromHeight - nextHeight));
      if (candidate < best[next]) {
        best[next] = candidate;
        heap.push([candidate, next]);
      }
    };
    while (heap.size) {
      const [effort, cell] = heap.pop();
      if (effort !== best[cell]) continue;
      if (cell === goal) return effort;
      const row = Math.floor(cell / cols);
      const col = cell % cols;
      const height = heights[row][col];
      if (row > 0) relax(height, cell - cols, heights[row - 1][col], effort);
      if (row + 1 < rows) relax(height, cell + cols, heights[row + 1][col], effort);
      if (col > 0) relax(height, cell - 1, heights[row][col - 1], effort);
      if (col + 1 < cols) relax(height, cell + 1, heights[row][col + 1], effort);
    }
    return 0;
  },
  approach:
    'Dijkstra on the cells, where a path costs its largest step instead of its total: moving to a neighbor costs the larger of the current effort and that step. Always expand the cell with the least known effort; the first time the bottom-right cell comes off the heap, its effort is the answer. Binary search on the effort with a BFS, or union-find over the steps sorted by size, also works.',
  complexity: { time: 'O(rows × cols × log(rows × cols))', space: 'O(rows × cols)' },
};
