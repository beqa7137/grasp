import { fixedChoices } from './choices.js';
import { InputError } from './types.js';
import { asEdges, asNumber, type Edge } from './input.js';
import { randInt } from './random.js';
import { circleLayout } from './layout.js';
import type { AlgorithmDefinition, EdgeState, Frame, GraphLegend, GraphView, NodeState } from './types.js';

type Input = { n: number; edges: Edge[]; source: number };

const RELAX = ['Yes: a shorter path was found', 'No: keep the current distance'];
const LEGEND: GraphLegend = { active: 'current', frontier: 'queued', done: 'done' };
const fmt = (d: number) => (d === Infinity ? '∞' : String(d));

export const dijkstra: AlgorithmDefinition<Input> = {
  summary: 'Always settle the closest unsettled node next; with non-negative weights its distance can never improve later.',
  complexity: { time: 'O((V + E) log V)', space: 'O(V + E)' },
  code: [
    'function dijkstra(n, edges, source) {',
    '  const dist = Array(n).fill(Infinity); dist[source] = 0;',
    '  const pq = new MinHeap([[0, source]]);',
    '  while (pq.size) {',
    '    const [d, u] = pq.pop();',
    '    if (d > dist[u]) continue; // stale entry',
    '    for (const [v, w] of adj[u]) {',
    '      if (dist[u] + w < dist[v]) {',
    '        dist[v] = dist[u] + w;',
    '        pq.push([dist[v], v]);',
    '      }',
    '    }',
    '  }',
    '  return dist;',
    '}',
  ],
  fields: [
    { key: 'n', label: 'Nodes', kind: 'number', hint: '2 to 8, numbered from 0' },
    { key: 'edges', label: 'Roads', kind: 'weightedEdges', hint: 'Like 0-1:4 (undirected, weight 1–99)' },
    { key: 'source', label: 'Start at', kind: 'number' },
  ],
  defaultInput: {
    n: 6,
    edges: [
      [0, 1, 7],
      [0, 2, 9],
      [0, 5, 14],
      [1, 2, 10],
      [1, 3, 15],
      [2, 3, 11],
      [2, 5, 2],
      [3, 4, 6],
      [4, 5, 9],
    ],
    source: 0,
  },

  randomInput(rand = Math.random) {
    const n = randInt(rand, 4, 7);
    const seen = new Set<string>();
    const edges: Edge[] = [];
    const add = (a: number, b: number) => {
      const id = `${Math.min(a, b)}-${Math.max(a, b)}`;
      if (a === b || seen.has(id)) return;
      seen.add(id);
      edges.push([a, b, randInt(rand, 1, 9)]);
    };
    for (let v = 1; v < n; v++) if (rand() < 0.9) add(v, randInt(rand, 0, v - 1));
    for (let extra = randInt(rand, 1, n); extra > 0; extra--) add(randInt(rand, 0, n - 1), randInt(rand, 0, n - 1));
    return { n, edges, source: randInt(rand, 0, n - 1) };
  },

  validate(input) {
    const raw = (input ?? {}) as Record<string, unknown>;
    const n = asNumber(raw['n'], 'n');
    if (n < 2 || n > 8) throw new InputError('n must be between 2 and 8');
    const source = asNumber(raw['source'], 'source');
    if (source < 0 || source >= n) throw new InputError(`source must be between 0 and ${n - 1}`);
    return { n, edges: asEdges(raw['edges'], 'edges', 'weightedEdges', n, { max: 16, maxWeight: 99 }), source };
  },

  trace({ n, edges, source }) {
    const frames: Frame[] = [];
    const points = circleLayout(n);
    const adj: [number, number][][] = Array.from({ length: n }, () => []);
    for (const [a, b, w] of edges) {
      adj[a].push([b, w!]);
      adj[b].push([a, w!]);
    }
    const dist = Array<number>(n).fill(Infinity);
    const via = Array<number | null>(n).fill(null);
    const settled = new Set<number>();
    let pq: [number, number][] = [];
    let u: number | null = null;
    let askedSettled = false;
    dist[source] = 0;

    const key = (a: number, b: number) => `${Math.min(a, b)}-${Math.max(a, b)}`;
    const graph = (active?: string): GraphView => {
      const tree = new Set(via.map((p, v) => (p === null ? '' : key(p, v))));
      return {
        nodes: points.map((p, v) => {
          const state: NodeState = v === u ? 'active' : settled.has(v) ? 'done' : pq.some(([, x]) => x === v) ? 'frontier' : 'idle';
          return { id: String(v), label: String(v), x: p.x, y: p.y, state, badge: fmt(dist[v]) };
        }),
        edges: edges.map(([a, b, w]) => {
          const id = key(a, b);
          const state: EdgeState = id === active ? 'active' : tree.has(id) ? 'chosen' : 'idle';
          return { from: String(a), to: String(b), directed: false, label: String(w), state };
        }),
        legend: LEGEND,
      };
    };
    const snap = (line: number, note: string, extra: Partial<Frame> = {}, active?: string) =>
      frames.push({
        line,
        note,
        vars: { u, 'dist[u]': u === null ? null : fmt(dist[u]), settled: settled.size },
        graph: graph(active),
        queue: { label: 'priority queue (dist@node)', items: [...pq].sort((a, b) => a[0] - b[0]).map(([d, v]) => `${d}@${v}`) },
        output: { label: 'dist', items: dist.map(fmt) },
        ...extra,
      });

    pq = [[0, source]];
    snap(3, `Start at ${source} with distance 0; every other node is ∞ until a path reaches it.`);

    while (pq.length) {
      pq.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
      const [d, next] = pq.shift()!;
      u = next;
      if (d > dist[u]) {
        snap(6, `Popped ${d}@${u}, but \`dist[${u}]\` is already ${dist[u]}: a stale entry left behind by a later improvement. Skip it.`);
        continue;
      }
      settled.add(u);
      snap(5, `Closest unsettled node is ${u} at distance ${d}. No later path can beat it, because every edge weight is non-negative.`);
      for (const [v, w] of adj[u]) {
        // Settled neighbours always fail the check: ask about the first one, skip the rest.
        if (settled.has(v) && askedSettled) continue;
        askedSettled ||= settled.has(v);
        const candidate = dist[u] + w;
        const better = candidate < dist[v];
        snap(
          8,
          `Edge ${u}–${v} (weight ${w}): via ${u} costs ${dist[u]} + ${w} = ${candidate}.`,
          {
            predict: {
              prompt: `Going through ${u} reaches ${v} in ${candidate}; \`dist[${v}]\` is ${fmt(dist[v])}. Update?`,
              ...fixedChoices(RELAX, better ? 0 : 1),
              explain: better
                ? `${candidate} < ${fmt(dist[v])}: record the shorter distance and push ${v} with its new priority.`
                : settled.has(v)
                  ? `${candidate} ≥ ${dist[v]}: node ${v} is already settled, and a settled distance never improves because every edge weight is non-negative. From here on, the trace skips edges back to settled nodes: they always fail this check.`
                  : `${candidate} ≥ ${fmt(dist[v])}: the path through ${u} is no shortcut, so nothing changes.`,
            },
          },
          key(u, v),
        );
        if (!better) continue;
        dist[v] = candidate;
        via[v] = u;
        pq.push([candidate, v]);
        snap(10, `\`dist[${v}] = ${candidate}\`; push ${candidate}@${v}.`, {}, key(u, v));
      }
    }

    u = null;
    const unreachable = dist.filter((d) => d === Infinity).length;
    snap(
      14,
      `Queue empty: every reachable node is settled.${unreachable ? ` ${unreachable} node${unreachable === 1 ? ' is' : 's are'} unreachable (∞).` : ''} The highlighted edges form the shortest-path tree.`,
    );
    frames[frames.length - 1].vars['result'] = `[${dist.map(fmt).join(', ')}]`;
    return frames;
  },
};
