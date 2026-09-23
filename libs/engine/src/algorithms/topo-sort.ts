import { InputError } from './types.js';
import { asEdges, asNumber, randInt, type Edge } from './input.js';
import { circleLayout, layeredLayout } from './layout.js';
import type { AlgorithmDef, EdgeState, Frame, GraphView, NodeState } from './types.js';

type Input = { n: number; edges: Edge[] };

const CHOICES = ['Yes — nothing else points to it now', 'Not yet — it still has prerequisites'];

export const topoSort: AlgorithmDef<Input> = {
  id: 'topo-sort',
  title: "Topological Sort (Kahn's Algorithm)",
  patternId: 'topo-sort',
  difficulty: 'medium',
  summary: 'Repeatedly take a node with no remaining prerequisites; if some nodes never free up, the graph has a cycle.',
  complexity: { time: 'O(V + E)', space: 'O(V + E)' },
  code: [
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
  ],
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
    });
    const snap = (line: number, note: string, extra: Partial<Frame> = {}, activeEdge?: string) =>
      frames.push({
        line,
        note,
        vars: { u, 'queue size': queue.length, placed: order.length },
        graph: graph(activeEdge),
        queue: { label: 'queue', items: [...queue] },
        output: { label: 'order', items: [...order] },
        ...extra,
      });

    snap(3, `Count prerequisites: in-degree is the number of arrows pointing into a node.`);
    for (let v = 0; v < n; v++) if (indeg[v] === 0) queue.push(v);
    snap(
      4,
      queue.length
        ? `Nodes ${queue.join(', ')} have no prerequisites: they can go first.`
        : 'No node is free of prerequisites: there must be a cycle.',
    );

    while (queue.length) {
      u = queue.shift()!;
      order.push(u);
      snap(7, `Take ${u} from the queue and place it next in the order.`);
      for (const v of adj[u]) {
        const id = `${u}>${v}`;
        const next = indeg[v] - 1;
        snap(
          8,
          `Edge ${u}→${v}: ${u} is done, so ${v} loses one prerequisite.`,
          {
            predict: {
              prompt: `Removing ${u}→${v} drops ${v}'s in-degree from ${indeg[v]} to ${next}. Does ${v} join the queue?`,
              choices: CHOICES,
              answer: next === 0 ? 0 : 1,
              explain:
                next === 0
                  ? `Every node that must come before ${v} is placed, so ${v} is free to go.`
                  : `${v} still waits on ${next} more prerequisite${next === 1 ? '' : 's'}.`,
            },
          },
          id,
        );
        indeg[v] = next;
        used.add(id);
        if (next === 0) queue.push(v);
        snap(9, next === 0 ? `${v} is free: enqueue it.` : `${v} still has ${next} to go.`, {}, id);
      }
    }

    u = null;
    const cyclic = order.length < n;
    snap(
      12,
      cyclic
        ? `Only ${order.length} of ${n} nodes were placed. The rest wait on each other forever: a cycle, so no valid order exists.`
        : `All ${n} nodes placed: ${order.join(' → ')}. Each node and edge was handled once, O(V + E).`,
    );
    frames[frames.length - 1].vars['result'] = cyclic ? 'cycle' : order.join(' → ');
    return frames;
  },
};
