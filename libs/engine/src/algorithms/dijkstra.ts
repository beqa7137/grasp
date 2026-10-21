import { andList, spansOf } from './annotate.js';
import { VALUE, fixedChoices, rotatedChoices } from './choices.js';
import { InputError } from './types.js';
import { asEdges, asNumber, type Edge } from './input.js';
import { randInt } from './random.js';
import { circleLayout } from './layout.js';
import type { AlgorithmDefinition, EdgeState, Frame, GraphLegend, GraphView, NodeState } from './types.js';

type Input = { n: number; edges: Edge[]; source: number };

const RELAX = ['Yes: a shorter path was found', 'No: keep the current distance'];
const LEGEND: GraphLegend = { active: 'current', frontier: 'queued', done: 'done' };
const fmt = (d: number) => (d === Infinity ? '∞' : String(d));

const CODE = [
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
];

const SPANS = spansOf(CODE, {
  3: 'const pq = new MinHeap([[0, source]])',
  5: 'const [d, u] = pq.pop()',
  6: 'd > dist[u]',
  8: 'dist[u] + w < dist[v]',
  10: 'pq.push([dist[v], v])',
  14: 'return dist',
});

export const dijkstra: AlgorithmDefinition<Input> = {
  code: CODE,
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
  presets: [
    {
      label: 'A detour beats the direct road',
      input: {
        n: 3,
        edges: [
          [0, 2, 10],
          [0, 1, 2],
          [1, 2, 3],
        ],
        source: 0,
      },
    },
    {
      label: 'A node no road reaches',
      input: {
        n: 4,
        edges: [
          [0, 1, 2],
          [1, 2, 3],
          [0, 2, 6],
        ],
        source: 0,
      },
    },
    {
      label: 'Start in the middle',
      input: {
        n: 5,
        edges: [
          [0, 1, 4],
          [1, 2, 1],
          [2, 3, 2],
          [3, 4, 5],
        ],
        source: 2,
      },
    },
  ],

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
    let chapter = 'Set up';
    const snap = (line: number, caption: string, note: string, extra: Partial<Frame> = {}, active?: string) =>
      frames.push({
        line,
        caption,
        note,
        chapter,
        span: SPANS[line],
        vars: { u, 'dist[u]': u === null ? null : fmt(dist[u]), settled: settled.size },
        graph: graph(active),
        queue: { label: 'priority queue (dist@node)', items: [...pq].sort((a, b) => a[0] - b[0]).map(([d, v]) => `${d}@${v}`) },
        output: { label: 'dist', items: dist.map(fmt) },
        ...extra,
      });

    pq = [[0, source]];
    snap(
      3,
      `Start at node ${source}, distance 0. Every other node is ∞ until a path reaches it.`,
      `Start at ${source} with distance 0; every other node is ∞ until a path reaches it.`,
      { lens: `pq = [0@${source}]` },
    );

    while (pq.length) {
      pq.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
      const [d, next] = pq.shift()!;
      u = next;
      if (d > dist[u]) {
        chapter = `Skip ${d}@${u}`;
        snap(
          6,
          `${d}@${u} is stale: dist[${u}] already dropped to ${dist[u]}, so skip it.`,
          `Popped ${d}@${u}, but \`dist[${u}]\` is already ${dist[u]}: a stale entry left behind by a later improvement. Skip it.`,
          { lens: `${d} > ${dist[u]} → true` },
        );
        continue;
      }
      settled.add(u);
      chapter = `Settle node ${u}`;
      snap(
        5,
        adj[u].every(([v]) => settled.has(v))
          ? `Node ${u} is the closest left, at distance ${d}, and all its neighbors are settled.`
          : `Node ${u} is the closest left, at distance ${d}: no later path can beat that.`,
        `Closest unsettled node is ${u} at distance ${d}. No later path can beat it, because every edge weight is non-negative.`,
        { lens: `pq.pop() → ${d}@${u}` },
      );
      for (const [v, w] of adj[u]) {
        // Settled neighbors always fail the check: ask about the first one, skip the rest.
        if (settled.has(v) && askedSettled) continue;
        askedSettled ||= settled.has(v);
        const candidate = dist[u] + w;
        const better = candidate < dist[v];
        snap(
          8,
          dist[v] === Infinity
            ? `Edge ${u}-${v}, weight ${w}: what does the way through ${u} cost?`
            : `Edge ${u}-${v}, weight ${w}: is the way through ${u} shorter?`,
          `Edge ${u}–${v} (weight ${w}): via ${u} costs ${dist[u]} + ${w} = ${candidate}.`,
          {
            predict:
              dist[v] === Infinity
                ? {
                    ...rotatedChoices(
                      `Edge ${u}-${v} weighs ${w}, and \`dist[${v}]\` is ∞. What is \`dist[${v}]\` after this step?`,
                      String(candidate),
                      [String(w), String(dist[u]), '∞', String(candidate + w)],
                    ),
                    explain: `\`dist[${v}]\` was ∞, so any path is shorter: ${dist[u]} + ${w} = ${candidate}. Record it and push ${v} with that priority.`,
                    skill: 'reach',
                    // From the source, whose distance is 0, the answer is the weight printed on the edge.
                    ...(dist[u] === 0 ? { tier: 1 as const } : {}),
                    pick: VALUE,
                  }
                : {
                    prompt: `\`dist[${u}] = ${dist[u]}\`, edge ${u}-${v} weighs ${w}, and \`dist[${v}]\` is ${dist[v]}. Update?`,
                    ...fixedChoices(RELAX, better ? 0 : 1),
                    explain: better
                      ? `${candidate} < ${fmt(dist[v])}: record the shorter distance and push ${v} with its new priority.`
                      : settled.has(v)
                        ? `${candidate} ≥ ${dist[v]}: node ${v} is already settled, and a settled distance never improves because every edge weight is non-negative. From here on, the trace skips edges back to settled nodes: they always fail this check.`
                        : `${candidate} ≥ ${fmt(dist[v])}: the path through ${u} is no shortcut, so nothing changes.`,
                    skill: 'relax',
                    // An edge back to a settled node always fails the check, as the drawing's settled node shows.
                    ...(settled.has(v) ? { tier: 1 as const } : {}),
                  },
          },
          key(u, v),
        );
        if (!better) continue;
        const old = dist[v];
        dist[v] = candidate;
        via[v] = u;
        pq.push([candidate, v]);
        snap(
          10,
          `dist[${v}] drops from ${fmt(old)} to ${candidate}, and ${candidate}@${v} joins the queue.`,
          `\`dist[${v}] = ${candidate}\`; push ${candidate}@${v}.`,
          { lens: `${dist[u]} + ${w} = ${candidate} < ${fmt(old)}` },
          key(u, v),
        );
      }
    }

    u = null;
    const unreached = dist.flatMap((d, v) => (d === Infinity ? [String(v)] : []));
    const unreachable = unreached.length;
    chapter = 'Result';
    snap(
      14,
      unreachable
        ? `Queue empty: return dist. ${unreached.length === 1 ? `Node ${unreached[0]} has` : unreached.length === 2 ? `Nodes ${andList(unreached)} have` : `${unreached.length} nodes have`} no road from ${source}, so ${unreached.length === 1 ? 'it stays' : 'they stay'} at ∞.`
        : 'Queue empty: every node is settled at its shortest distance, so return dist.',
      `Queue empty: every reachable node is settled.${unreachable ? ` ${unreachable} node${unreachable === 1 ? ' is' : 's are'} unreachable (∞).` : ''} The highlighted edges form the shortest-path tree.`,
    );
    frames[frames.length - 1].vars['result'] = `[${dist.map(fmt).join(', ')}]`;
    return frames;
  },
};
