import { rotatedChoices } from './choices.js';
import { asGrid } from './input.js';
import { randInt } from './random.js';
import type { AlgorithmDefinition, CellState, Frame } from './types.js';

type Input = { grid: string[] };
type Cell = [number, number];

const DIRS: Cell[] = [
  [-1, 0],
  [0, 1],
  [1, 0],
  [0, -1],
];
const key = ([r, c]: Cell) => `${r},${c}`;
const label = ([r, c]: Cell) => `(${r},${c})`;

export const gridBfs: AlgorithmDefinition<Input> = {
  code: [
    'function shortestPath(grid, start, goal) {',
    '  const queue = [[start, 0]];',
    '  const seen = new Set([key(start)]);',
    '  while (queue.length) {',
    '    const [cell, dist] = queue.shift();',
    '    if (same(cell, goal)) return dist;',
    '    for (const next of neighbors(cell)) { // ↑ → ↓ ←',
    '      if (isWall(next) || seen.has(key(next))) continue;',
    '      seen.add(key(next));',
    '      queue.push([next, dist + 1]);',
    '    }',
    '  }',
    '  return -1;',
    '}',
  ],
  fields: [{ key: 'grid', label: 'Grid', kind: 'grid', hint: 'S start · G goal · # wall · . open' }],
  defaultInput: {
    grid: ['S....#..', '.##..#..', '...#....', '.#...##.', '...#...G'],
  },

  randomInput(rand = Math.random) {
    const rows = randInt(rand, 5, 7);
    const cols = randInt(rand, 6, 9);
    const g: string[][] = Array.from({ length: rows }, () => Array.from({ length: cols }, () => (rand() < 0.28 ? '#' : '.')));
    g[0][0] = 'S';
    g[rows - 1][cols - 1] = 'G';
    return { grid: g.map((r) => r.join('')) };
  },

  validate(input) {
    const raw = (input ?? {}) as Record<string, unknown>;
    return { grid: asGrid(raw['grid'], 'grid') };
  },

  trace({ grid }) {
    const rows = grid.length;
    const cols = grid[0].length;
    const find = (ch: string): Cell => {
      for (let r = 0; r < rows; r++) {
        const c = grid[r].indexOf(ch);
        if (c >= 0) return [r, c];
      }
      throw new Error(`missing ${ch}`);
    };
    const start = find('S');
    const goal = find('G');
    const isWall = ([r, c]: Cell) => grid[r][c] === '#';

    const dist: (number | null)[][] = grid.map((row) => [...row].map(() => null));
    const parent = new Map<string, Cell>();
    const seen = new Set<string>([key(start)]);
    const queue: Cell[] = [start];
    const visited = new Set<string>();
    dist[start[0]][start[1]] = 0;

    const frames: Frame[] = [];
    let current: Cell | null = null;
    let path = new Set<string>();

    const cells = (): CellState[][] =>
      grid.map((row, r) =>
        [...row].map((ch, c): CellState => {
          const k = `${r},${c}`;
          if (ch === '#') return 'wall';
          if (path.has(k)) return 'path';
          if (current && key(current) === k) return 'current';
          if (ch === 'S') return 'start';
          if (ch === 'G') return 'goal';
          if (visited.has(k)) return 'visited';
          if (seen.has(k)) return 'frontier';
          return 'open';
        }),
      );

    const snap = (line: number, note: string, extra: Partial<Frame> = {}) => {
      frames.push({
        line,
        note,
        vars: {
          cell: current ? label(current) : null,
          dist: current ? dist[current[0]][current[1]] : null,
          'queue.length': queue.length,
          visited: visited.size,
        },
        grid: { cells: cells(), distances: dist.map((r) => [...r]) },
        queue: { label: 'queue (front → back)', items: queue.map(label) },
        ...extra,
      });
    };

    snap(2, `Start at ${label(start)} with distance 0. The queue is the frontier of cells we have discovered but not expanded.`);

    let dequeues = 0;
    while (queue.length) {
      let predict: Frame['predict'];
      if (queue.length >= 2 && dequeues % 3 === 1) {
        const front = queue[0];
        const back = queue[queue.length - 1];
        const middle = queue[Math.floor(queue.length / 2)];
        predict = {
          ...rotatedChoices(
            `Queue is [${queue.map(label).join(', ')}]. Which cell is expanded next?`,
            label(front),
            [back, middle].map(label),
          ),
          explain: `A queue is FIFO: ${label(front)} was discovered earliest, so it is closest to the start. That ordering is exactly why BFS finds shortest paths.`,
        };
      }
      if (predict) snap(4, 'The queue is not empty: take the next cell.', { predict });

      current = queue.shift()!;
      dequeues++;
      visited.add(key(current));
      const d = dist[current[0]][current[1]]!;
      snap(5, `Dequeue ${label(current)} at distance ${d}.`);

      if (key(current) === key(goal)) {
        const pathCells: Cell[] = [];
        let walk: Cell | undefined = current;
        while (walk) {
          pathCells.push(walk);
          walk = parent.get(key(walk));
        }
        path = new Set(pathCells.map(key));
        snap(
          6,
          `Reached the goal at distance ${d}. Following parent links back gives the path (${pathCells.length} cells). Every cell was enqueued at most once → O(rows × cols).`,
        );
        frames[frames.length - 1].vars['result'] = d;
        return frames;
      }

      const added: string[] = [];
      for (const [dr, dc] of DIRS) {
        const next: Cell = [current[0] + dr, current[1] + dc];
        if (next[0] < 0 || next[1] < 0 || next[0] >= rows || next[1] >= cols) continue;
        if (isWall(next) || seen.has(key(next))) continue;
        seen.add(key(next));
        parent.set(key(next), current);
        dist[next[0]][next[1]] = d + 1;
        queue.push(next);
        added.push(label(next));
      }
      snap(
        10,
        added.length
          ? `Discover ${added.join(', ')} at distance ${d + 1} and add to the back of the queue.`
          : 'No new neighbors: walls, edges, or already seen.',
      );
    }

    current = null;
    snap(13, 'The queue emptied without reaching the goal: it is walled off. Return -1.');
    frames[frames.length - 1].vars['result'] = -1;
    return frames;
  },
};
