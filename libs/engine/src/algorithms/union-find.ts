import { InputError } from './types.js';
import { asEdges, asNumber, randInt, type Edge } from './input.js';
import type { AlgorithmDef, Frame, TreeView } from './types.js';

type Input = { n: number; edges: Edge[] };

const CHOICES = ['Merge the two trees', 'Skip: already connected'];

export const unionFind: AlgorithmDef<Input> = {
  id: 'union-find',
  title: 'Union-Find: Counting Components',
  patternId: 'union-find',
  difficulty: 'medium',
  summary: 'Each component is a tree identified by its root; union links roots, and path compression keeps the trees flat.',
  complexity: { time: 'O(E · α(n)) ≈ O(E)', space: 'O(n)' },
  code: [
    'function countComponents(n, edges) {',
    '  const parent = [...Array(n).keys()], rank = Array(n).fill(0);',
    '  const find = (x) => parent[x] === x ? x : (parent[x] = find(parent[x]));',
    '  let components = n;',
    '  for (const [a, b] of edges) {',
    '    const ra = find(a), rb = find(b);',
    '    if (ra === rb) continue; // already connected',
    '    if (rank[ra] < rank[rb]) parent[ra] = rb;',
    '    else if (rank[ra] > rank[rb]) parent[rb] = ra;',
    '    else { parent[rb] = ra; rank[ra]++; }',
    '    components--;',
    '  }',
    '  return components;',
    '}',
  ],
  fields: [
    { key: 'n', label: 'Nodes', kind: 'number', hint: '2 to 10, numbered from 0' },
    { key: 'edges', label: 'Edges', kind: 'edges', hint: 'Like 0-1, 2-3' },
  ],
  defaultInput: {
    n: 8,
    edges: [
      [0, 1],
      [2, 3],
      [1, 2],
      [4, 5],
      [3, 0],
      [6, 7],
      [5, 6],
    ],
  },

  randomInput(rand = Math.random) {
    const n = randInt(rand, 5, 9);
    const seen = new Set<string>();
    const edges: Edge[] = [];
    const count = randInt(rand, 3, n + 1);
    for (let tries = 0; edges.length < count && tries < 100; tries++) {
      const a = randInt(rand, 0, n - 1);
      const b = randInt(rand, 0, n - 1);
      const id = `${Math.min(a, b)}-${Math.max(a, b)}`;
      if (a === b || seen.has(id)) continue;
      seen.add(id);
      edges.push([a, b]);
    }
    return { n, edges };
  },

  validate(input) {
    const raw = (input ?? {}) as Record<string, unknown>;
    const n = asNumber(raw['n'], 'n');
    if (n < 2 || n > 10) throw new InputError('n must be between 2 and 10');
    return { n, edges: asEdges(raw['edges'], 'edges', 'edges', n, { max: 14 }) };
  },

  trace({ n, edges }) {
    const frames: Frame[] = [];
    const parent = [...Array(n).keys()];
    const rank = Array<number>(n).fill(0);
    let components = n;
    let edgeIndex = -1;
    const current = { a: null as number | null, b: null as number | null, ra: null as number | null, rb: null as number | null };

    const forest = (active: number[] = []): TreeView => ({
      nodes: parent.map((p, v) => ({
        id: `n${v}`,
        label: String(v),
        parent: p === v ? null : `n${p}`,
        state: active.includes(v) ? 'active' : p === v ? 'done' : 'idle',
        badge: p === v && rank[v] > 0 ? `r${rank[v]}` : undefined,
      })),
    });
    const snap = (line: number, note: string, active: number[] = [], extra: Partial<Frame> = {}) => {
      const pointers: Record<string, number> = {};
      for (const [k, v] of Object.entries(current)) if (v !== null) pointers[k] = v;
      frames.push({
        line,
        note,
        vars: { ...current, components },
        array: { values: [...parent], pointers, active },
        tree: forest(active),
        output: { label: 'edges', items: edges.map(([a, b], i) => (i === edgeIndex ? `▶ ${a}-${b}` : `${a}-${b}`)) },
        ...extra,
      });
    };

    const find = (x: number): number => {
      const path: number[] = [];
      let root = x;
      while (parent[root] !== root) {
        path.push(root);
        root = parent[root];
      }
      const compressed = path.filter((v) => parent[v] !== root);
      if (compressed.length) {
        for (const v of compressed) parent[v] = root;
        snap(3, `Path compression: ${compressed.join(', ')} now point straight at root ${root}, so the next find is one hop.`, [
          ...compressed,
          root,
        ]);
      }
      return root;
    };

    snap(2, `Every node starts as its own component: ${n} trees of one node, each its own root (\`parent[x] = x\`).`);

    for (edgeIndex = 0; edgeIndex < edges.length; edgeIndex++) {
      const [a, b] = edges[edgeIndex];
      Object.assign(current, { a, b, ra: null, rb: null });
      snap(5, `Next edge ${a}-${b}.`, [a, b]);
      current.ra = find(a);
      current.rb = find(b);
      const { ra, rb } = current as { ra: number; rb: number };
      const same = ra === rb;
      snap(6, `\`find(${a}) = ${ra}\`, \`find(${b}) = ${rb}\`.`, [ra, rb], {
        predict: {
          prompt: `\`find(${a}) = ${ra}\` and \`find(${b}) = ${rb}\`. What does union do?`,
          choices: CHOICES,
          ordered: true,
          answer: same ? 1 : 0,
          explain: same
            ? `Both nodes already share the root ${ra}: this edge adds no new connection (in a graph it would close a cycle).`
            : `Different roots mean different components. Linking one root under the other joins them, and the component count drops by one.`,
        },
      });
      if (same) {
        snap(7, `Same root: skip. Still ${components} components.`, [ra]);
        continue;
      }
      if (rank[ra] < rank[rb]) {
        parent[ra] = rb;
        snap(8, `Tree of ${ra} is shorter: hang root ${ra} under ${rb}.`, [ra, rb]);
      } else if (rank[ra] > rank[rb]) {
        parent[rb] = ra;
        snap(9, `Tree of ${rb} is shorter: hang root ${rb} under ${ra}.`, [ra, rb]);
      } else {
        parent[rb] = ra;
        rank[ra]++;
        snap(10, `Equal rank: hang ${rb} under ${ra} and bump ${ra}'s rank to ${rank[ra]}.`, [ra, rb]);
      }
      components--;
      snap(11, `Two components became one: ${components} left.`, [ra, rb]);
    }

    edgeIndex = -1;
    Object.assign(current, { a: null, b: null, ra: null, rb: null });
    snap(
      13,
      `Done: ${components} connected component${components === 1 ? '' : 's'}, one per remaining root. Union by rank plus path compression makes each operation nearly O(1).`,
    );
    frames[frames.length - 1].vars['result'] = components;
    return frames;
  },
};
