import { andList, spansOf } from './annotate.js';
import { fixedChoices } from './choices.js';
import { InputError } from './types.js';
import { asEdges, asNumber, type Edge } from './input.js';
import { randInt } from './random.js';
import { circleLayout, layeredLayout } from './layout.js';
import type { AlgorithmDefinition, EdgeState, Frame, GraphLegend, GraphView, NodeState } from './types.js';

type Input = { n: number; edges: Edge[] };

const CHOICES = ['Yes: nothing else points to it now', 'Not yet: it still has prerequisites'];
const LEGEND: GraphLegend = { active: 'current', frontier: 'queued', done: 'done' };

const CODE = [
  'function topoSort(n, edges) {',
  '  const indeg = Array(n).fill(0), adj = lists(n);',
  '  for (const [u, v] of edges) { adj[u].push(v); indeg[v]++; }',
  '  const queue = nodes(n).filter((v) => indeg[v] === 0);',
  '  const order = [];',
  '  while (queue.length) {',
  '    const u = queue.shift(); order.push(u);',
  '    for (const v of adj[u]) {',
  '      if (--indeg[v] === 0) queue.push(v);',
  '    }',
  '  }',
  '  return order.length === n ? order : null; // null: cycle',
  '}',
];

const SPANS = spansOf(CODE, {
  3: 'indeg[v]++',
  4: 'nodes(n).filter((v) => indeg[v] === 0)',
  7: 'const u = queue.shift(); order.push(u)',
  8: 'const v of adj[u]',
  9: '--indeg[v] === 0',
  12: 'return order.length === n ? order : null',
});
const ENQUEUE_SPAN = spansOf(CODE, { 9: 'if (--indeg[v] === 0) queue.push(v)' })[9];

export const topoSort: AlgorithmDefinition<Input> = {
  code: CODE,
  fields: [
    { key: 'n', label: 'Nodes', kind: 'number', hint: '2 to 9, numbered from 0' },
    { key: 'edges', label: 'Dependencies', kind: 'directedEdges', hint: 'u>v means u comes before v' },
  ],
  defaultInput: {
    n: 7,
    edges: [
      [0, 2],
      [1, 2],
      [1, 3],
      [2, 4],
      [3, 4],
      [4, 5],
      [3, 6],
    ],
  },
  presets: [
    {
      label: 'A chain, one after another',
      input: {
        n: 5,
        edges: [
          [0, 1],
          [1, 2],
          [2, 3],
          [3, 4],
        ],
      },
    },
    {
      label: 'Four arrows into one node',
      input: {
        n: 5,
        edges: [
          [0, 4],
          [1, 4],
          [2, 4],
          [3, 4],
        ],
      },
    },
    {
      label: 'A cycle behind the start',
      input: {
        n: 4,
        edges: [
          [0, 1],
          [1, 2],
          [2, 3],
          [3, 1],
        ],
      },
    },
  ],

  randomInput(rand = Math.random) {
    const n = randInt(rand, 4, 8);
    const order = [...Array(n).keys()].sort(() => rand() - 0.5);
    const seen = new Set<string>();
    const edges: Edge[] = [];
    const target = randInt(rand, n - 1, n + 3);
    for (let tries = 0; edges.length < target && tries < 200; tries++) {
      const i = randInt(rand, 0, n - 2);
      const j = randInt(rand, i + 1, n - 1);
      const id = `${order[i]}>${order[j]}`;
      if (seen.has(id)) continue;
      seen.add(id);
      edges.push([order[i], order[j]]);
    }
    if (rand() < 0.2 && edges.length) {
      const [u, v] = edges[randInt(rand, 0, edges.length - 1)];
      if (!seen.has(`${v}>${u}`)) edges.push([v, u]);
    }
    return { n, edges };
  },

  validate(input) {
    const raw = (input ?? {}) as Record<string, unknown>;
    const n = asNumber(raw['n'], 'n');
    if (n < 2 || n > 9) throw new InputError('n must be between 2 and 9');
    return { n, edges: asEdges(raw['edges'], 'edges', 'directedEdges', n, { max: 16 }) };
  },

  trace({ n, edges }) {
    const frames: Frame[] = [];
    const points = layeredLayout(n, edges) ?? circleLayout(n);
    const adj: number[][] = Array.from({ length: n }, () => []);
    const indeg = Array<number>(n).fill(0);
    for (const [u, v] of edges) {
      adj[u].push(v);
      indeg[v]++;
    }
    const queue: number[] = [];
    const order: number[] = [];
    const used = new Set<string>();
    let u: number | null = null;

    const graph = (activeEdge?: string): GraphView => ({
      nodes: points.map((p, v) => {
        const state: NodeState = v === u ? 'active' : order.includes(v) ? 'done' : queue.includes(v) ? 'frontier' : 'idle';
        return { id: String(v), label: String(v), x: p.x, y: p.y, state, badge: order.includes(v) ? undefined : `in ${indeg[v]}` };
      }),
      edges: edges.map(([a, b]) => {
        const id = `${a}>${b}`;
        const state: EdgeState = id === activeEdge ? 'active' : used.has(id) ? 'chosen' : 'idle';
        return { from: String(a), to: String(b), directed: true, state };
      }),
      legend: LEGEND,
    });
    let chapter = 'Set up';
    const snap = (line: number, caption: string, note: string, extra: Partial<Frame> = {}, activeEdge?: string) =>
      frames.push({
        line,
        caption,
        note,
        chapter,
        span: SPANS[line],
        vars: { u, 'queue size': queue.length, placed: order.length },
        graph: graph(activeEdge),
        queue: { label: 'queue', items: [...queue] },
        output: { label: 'order', items: [...order] },
        ...extra,
      });

    snap(
      3,
      "Count each node's prerequisites: the arrows pointing into it.",
      `Count prerequisites: in-degree is the number of arrows pointing into a node.`,
    );
    for (let v = 0; v < n; v++) if (indeg[v] === 0) queue.push(v);
    const single = queue.length === 1;
    snap(
      4,
      queue.length === 0
        ? 'Every node has a prerequisite, so the queue starts empty.'
        : single
          ? `Node ${queue[0]} has no prerequisites, so it starts the queue alone.`
          : queue.length === n
            ? `None of the ${n} nodes has a prerequisite, so they all start the queue.`
            : queue.length > 4
              ? `${queue.length} nodes have no prerequisites, so they start the queue.`
              : `Nodes ${andList(queue.map(String))} have no prerequisites, so they start the queue.`,
      queue.length
        ? `${single ? 'Node' : 'Nodes'} ${queue.join(', ')} ${single ? 'has' : 'have'} no prerequisites: ${single ? 'it' : 'they'} can go first.`
        : 'No node is free of prerequisites: there must be a cycle.',
      { lens: `queue = [${queue.join(', ')}]` },
    );

    while (queue.length) {
      u = queue.shift()!;
      order.push(u);
      chapter = `Place node ${u}`;
      snap(7, `Place ${u} next: nothing it depends on is still waiting.`, `Take ${u} from the queue and place it next in the order.`, {
        lens: `order = [${order.join(', ')}]`,
      });
      for (const v of adj[u]) {
        const id = `${u}>${v}`;
        const next = indeg[v] - 1;
        snap(
          8,
          `Edge ${u}→${v}: ${u} is placed, so ${v} has one fewer node to wait for.`,
          `Edge ${u}→${v}: ${u} is done, so ${v} loses one prerequisite.`,
          {
            predict: {
              prompt: `Removing ${u}→${v} takes one prerequisite off ${v}. Does ${v} join the queue?`,
              ...fixedChoices(CHOICES, next === 0 ? 0 : 1),
              explain:
                next === 0
                  ? `${v}'s in-degree was 1, so ${u} was the last node it waited on. It drops to 0: ${v} is free to go.`
                  : `${v}'s in-degree was ${indeg[v]}, so it drops to ${next}: ${v} still waits on ${next} more prerequisite${next === 1 ? '' : 's'}.`,
              skill: 'release',
            },
          },
          id,
        );
        indeg[v] = next;
        used.add(id);
        if (next === 0) queue.push(v);
        snap(
          9,
          next === 0
            ? `${v} has no prerequisites left, so it joins the queue.`
            : `${v} still waits on ${next} more, so it stays out of the queue.`,
          next === 0 ? `${v} is free: enqueue it.` : `${v} still has ${next} to go.`,
          next === 0 ? { span: ENQUEUE_SPAN, lens: `--indeg[${v}] → 0` } : { lens: `--indeg[${v}] → ${next}` },
          id,
        );
      }
    }

    u = null;
    const cyclic = order.length < n;
    chapter = cyclic ? 'Cycle' : 'Result';
    snap(
      12,
      cyclic
        ? `Only ${order.length} of ${n} nodes ${order.length === 1 ? 'was' : 'were'} placed: the rest wait on a cycle, so return null.`
        : `All ${n} nodes are placed, each after its prerequisites: return the order.`,
      cyclic
        ? `Only ${order.length} of ${n} nodes ${order.length === 1 ? 'was' : 'were'} placed. The rest wait on each other forever: a cycle, so no valid order exists.`
        : `All ${n} nodes placed: ${order.join(' → ')}. Each node and edge was handled once, O(V + E).`,
      { lens: `${order.length} === ${n} → ${!cyclic}` },
    );
    frames[frames.length - 1].vars['result'] = cyclic ? 'cycle' : order.join(' → ');
    return frames;
  },
};
