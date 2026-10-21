import { andList, spansOf } from './annotate.js';
import { VALUE, fixedChoices, rotatedChoices } from './choices.js';
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

const CODE = [
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
];

const SPANS = spansOf(CODE, {
  2: 'const queue = [[start, 0]]',
  4: 'queue.length',
  5: 'const [cell, dist] = queue.shift()',
  6: 'return dist',
  10: 'queue.push([next, dist + 1])',
  13: 'return -1',
});
const COUNTS = ['0', '1', '2', '3'];

export const gridBfs: AlgorithmDefinition<Input> = {
  code: CODE,
  fields: [{ key: 'grid', label: 'Grid', kind: 'grid', hint: 'S start · G goal · # wall · . open' }],
  defaultInput: {
    grid: ['S....#..', '.##..#..', '...#....', '.#...##.', '...#...G'],
  },
  presets: [
    { label: 'The goal is walled off', input: { grid: ['S...#...', '.#..#.#.', '....#.#G', '.#..#.##'] } },
    { label: 'No walls at all', input: { grid: ['S....', '.....', '.....', '....G'] } },
    { label: 'The goal is next door', input: { grid: ['SG..', '....', '..#.'] } },
  ],

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

    const snap = (line: number, caption: string, note: string, extra: Partial<Frame> = {}) => {
      frames.push({
        line,
        caption,
        note,
        chapter,
        span: SPANS[line],
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

    const inside = ([r, c]: Cell) => r >= 0 && c >= 0 && r < rows && c < cols;
    const neighbors = (cell: Cell) => DIRS.map(([dr, dc]): Cell => [cell[0] + dr, cell[1] + dc]).filter(inside);

    /** What stops a cell from adding a neighbor: walls, cells already seen and the grid's edge, as they occur. */
    const blockers = (cell: Cell) => {
      const around = neighbors(cell);
      const walls = around.filter(isWall).length;
      const known = around.length - walls;
      return andList([
        ...(walls ? [walls === 1 ? 'a wall' : 'walls'] : []),
        ...(known ? [known === 1 ? 'a seen cell' : 'seen cells'] : []),
        ...(around.length < 4 ? ["the grid's edge"] : []),
      ]);
    };

    const fifoQuestion = (): Frame['predict'] => {
      const front = queue[0];
      const ask = rotatedChoices(
        `Queue is [${queue.map(label).join(', ')}]. Which cell is expanded next?`,
        label(front),
        [queue[queue.length - 1], queue[Math.floor(queue.length / 2)]].map(label),
      );
      const at = new Map(queue.map((cell) => [label(cell), cell]));
      return {
        ...ask,
        explain: `A queue is FIFO: ${label(front)} was discovered earliest, so it is closest to the start. That ordering is exactly why BFS finds shortest paths.`,
        skill: 'fifo',
        pick: {
          on: 'cell',
          ask: 'Tap the cell expanded next.',
          cells: ask.choices.map((choice) => [{ view: 'grid', at: at.get(choice)! }]),
        },
      };
    };

    const countQuestion = (): Frame['predict'] => {
      const front = queue[0];
      const around = neighbors(front);
      const fresh = around.filter((c) => !isWall(c) && !seen.has(key(c))).map(label);
      const walls = around.filter(isWall).map(label);
      const known = around.filter((c) => !isWall(c) && seen.has(key(c))).map(label);
      const reasons = [
        walls.length ? `${andList(walls)} ${walls.length === 1 ? 'is a wall' : 'are walls'}` : '',
        known.length ? `${andList(known)} ${known.length === 1 ? 'is' : 'are'} already seen` : '',
      ].filter(Boolean);
      return {
        prompt: `${label(front)} is at the front of the queue. How many new cells will it add?`,
        ...fixedChoices(COUNTS, fresh.length),
        skill: 'count',
        pick: VALUE,
        explain: `${fresh.length ? `It adds ${andList(fresh)}` : 'It adds nothing'}${reasons.length ? `: ${reasons.join(', and ')}` : ''}. A cell joins the queue only the first time it is seen, so each one is expanded once.`,
      };
    };

    let chapter = 'Set up';
    snap(
      2,
      `Start at ${label(start)}, distance 0: the only cell in the queue so far.`,
      `Start at ${label(start)} with distance 0. The queue is the frontier of cells we have discovered but not expanded.`,
      { lens: `queue = [${label(start)}]` },
    );

    let dequeues = 0;
    let askedFifo = false;
    while (queue.length) {
      const front = queue[0];
      chapter = `Distance ${dist[front[0]][front[1]]}`;
      if (queue.length >= 2 && dequeues % 3 === 1) {
        // The goal returns before it adds anything, so a count ask there would be wrong; it gets the FIFO ask instead.
        if (askedFifo && key(front) !== key(goal)) {
          snap(4, `${label(front)} comes off next: which of its neighbors are new?`, 'The queue is not empty: take the next cell.', {
            predict: countQuestion(),
          });
        } else {
          askedFifo = true;
          snap(4, `${queue.length} cells wait in the queue, so take the next one.`, 'The queue is not empty: take the next cell.', {
            predict: fifoQuestion(),
          });
        }
      }

      current = queue.shift()!;
      dequeues++;
      visited.add(key(current));
      const d = dist[current[0]][current[1]]!;
      snap(
        5,
        d === 0
          ? `Take ${label(current)}, the start, off the front of the queue.`
          : `Take ${label(current)} off the front: it is ${d} step${d === 1 ? '' : 's'} from the start.`,
        `Dequeue ${label(current)} at distance ${d}.`,
        { lens: `queue.shift() → ${label(current)}, ${d}` },
      );

      if (key(current) === key(goal)) {
        const pathCells: Cell[] = [];
        let walk: Cell | undefined = current;
        while (walk) {
          pathCells.push(walk);
          walk = parent.get(key(walk));
        }
        path = new Set(pathCells.map(key));
        chapter = 'Reach the goal';
        snap(
          6,
          `${label(current)} is the goal, so return its distance, ${d}.`,
          `Reached the goal at distance ${d}. Following parent links back gives the path (${pathCells.length} cells). Every cell was enqueued at most once → O(rows × cols).`,
          { lens: `return ${d}` },
        );
        frames[frames.length - 1].vars['result'] = d;
        return frames;
      }

      const added: string[] = [];
      for (const next of neighbors(current)) {
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
          ? `Enqueue ${andList(added)} at distance ${d + 1}, one step past ${label(current)}.`
          : `${label(current)} adds nothing: its sides are ${blockers(current)}.`,
        added.length
          ? `Discover ${added.join(', ')} at distance ${d + 1} and add to the back of the queue.`
          : 'No new neighbors: walls, edges, or already seen.',
        added.length ? { lens: `dist + 1 = ${d + 1}` } : {},
      );
    }

    current = null;
    chapter = 'No path';
    snap(
      13,
      'The queue ran out before the goal: it is walled off, so return -1.',
      'The queue emptied without reaching the goal: it is walled off. Return -1.',
    );
    frames[frames.length - 1].vars['result'] = -1;
    return frames;
  },
};
