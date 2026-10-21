import { andList, spansOf } from './annotate.js';
import { fixedChoices } from './choices.js';
import { InputError } from './types.js';
import { asEdges, asNumber, type Edge } from './input.js';
import { randInt } from './random.js';
import type { AlgorithmDefinition, Frame, TreeView } from './types.js';

type Input = { n: number; edges: Edge[] };

const CHOICES = ['Merge the two trees', 'Skip: already connected'];

const CODE = [
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
];

const SPANS = spansOf(CODE, {
  2: 'const parent = [...Array(n).keys()]',
  3: '(parent[x] = find(parent[x]))',
  5: 'const [a, b] of edges',
  6: 'const ra = find(a), rb = find(b)',
  7: 'ra === rb',
  8: 'parent[ra] = rb',
  9: 'parent[rb] = ra',
  10: 'parent[rb] = ra; rank[ra]++',
  11: 'components--',
  13: 'return components',
});

export const unionFind: AlgorithmDefinition<Input> = {
  code: CODE,
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
  presets: [
    {
      label: 'A triangle closes a cycle',
      input: {
        n: 3,
        edges: [
          [0, 1],
          [1, 2],
          [2, 0],
        ],
      },
    },
    {
      label: 'Two separate groups',
      input: {
        n: 6,
        edges: [
          [0, 1],
          [1, 2],
          [3, 4],
          [4, 5],
        ],
      },
    },
    {
      label: 'Extra edges, nothing new',
      input: {
        n: 4,
        edges: [
          [0, 1],
          [1, 2],
          [2, 3],
          [0, 2],
          [1, 3],
          [0, 3],
        ],
      },
    },
  ],

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
    let chapter = 'Set up';
    const snap = (line: number, caption: string, note: string, active: number[] = [], extra: Partial<Frame> = {}) => {
      const pointers: Record<string, number> = {};
      for (const [k, v] of Object.entries(current)) if (v !== null) pointers[k] = v;
      frames.push({
        line,
        caption,
        note,
        chapter,
        span: SPANS[line],
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
        snap(
          3,
          `find(${x}) compresses its path: ${andList(compressed.map(String))} now ${compressed.length === 1 ? 'points' : 'point'} straight at its root.`,
          `Path compression: ${compressed.join(', ')} now point straight at root ${root}, so the next find is one hop.`,
          [...compressed, root],
        );
      }
      return root;
    };

    snap(
      2,
      `Each of the ${n} nodes starts as its own root: ${n} components.`,
      `Every node starts as its own component: ${n} trees of one node, each its own root (\`parent[x] = x\`).`,
    );

    for (edgeIndex = 0; edgeIndex < edges.length; edgeIndex++) {
      const [a, b] = edges[edgeIndex];
      Object.assign(current, { a, b, ra: null, rb: null });
      chapter = `Edge ${edgeIndex + 1}: ${a}-${b}`;
      snap(5, `Next edge: ${a}-${b}. Are they in the same tree yet?`, `Next edge ${a}-${b}.`, [a, b], { lens: `a = ${a}, b = ${b}` });
      current.ra = find(a);
      current.rb = find(b);
      const { ra, rb } = current as { ra: number; rb: number };
      const same = ra === rb;
      // The roots would answer the ask, so the asking frame shows the edge's ends and keeps ra and rb out of its variables.
      Object.assign(current, { ra: null, rb: null });
      snap(6, `Follow ${a} and ${b} up the forest to their roots.`, `\`find(${a}) = ${ra}\`, \`find(${b}) = ${rb}\`.`, [a, b], {
        predict: {
          prompt: `Edge ${a}-${b}. Follow each end up the forest to its root. What does union do?`,
          ...fixedChoices(CHOICES, same ? 1 : 0),
          explain: same
            ? `\`find(${a})\` and \`find(${b})\` both reach root ${ra}: this edge adds no new connection (it would close a cycle).`
            : `\`find(${a}) = ${ra}\` and \`find(${b}) = ${rb}\`. Different roots mean different components. Linking one root under the other joins them, and the component count drops by one.`,
        },
      });
      Object.assign(current, { ra, rb });
      if (same) {
        snap(
          7,
          `${a} and ${b} share root ${ra}, so the edge joins nothing new: skip it.`,
          `Same root: skip. Still ${components} components.`,
          [ra],
          { lens: `${ra} === ${rb} → true` },
        );
        continue;
      }
      if (rank[ra] < rank[rb]) {
        parent[ra] = rb;
        snap(
          8,
          `Root ${ra}'s tree is shorter, so it hangs under root ${rb}.`,
          `Tree of ${ra} is shorter: hang root ${ra} under ${rb}.`,
          [ra, rb],
          {
            lens: `rank ${rank[ra]} < ${rank[rb]} → parent[${ra}] = ${rb}`,
          },
        );
      } else if (rank[ra] > rank[rb]) {
        parent[rb] = ra;
        snap(
          9,
          `Root ${rb}'s tree is shorter, so it hangs under root ${ra}.`,
          `Tree of ${rb} is shorter: hang root ${rb} under ${ra}.`,
          [ra, rb],
          {
            lens: `rank ${rank[ra]} > ${rank[rb]} → parent[${rb}] = ${ra}`,
          },
        );
      } else {
        parent[rb] = ra;
        rank[ra]++;
        snap(
          10,
          `Equal ranks: hang ${rb} under ${ra}, so ${ra}'s tree is one level taller.`,
          `Equal rank: hang ${rb} under ${ra} and bump ${ra}'s rank to ${rank[ra]}.`,
          [ra, rb],
          { lens: `parent[${rb}] = ${ra}, rank[${ra}] = ${rank[ra]}` },
        );
      }
      components--;
      snap(
        11,
        `Two components became one, so ${components} ${components === 1 ? 'is' : 'are'} left.`,
        `Two components became one: ${components} left.`,
        [ra, rb],
        { lens: `components = ${components}` },
      );
    }

    edgeIndex = -1;
    Object.assign(current, { a: null, b: null, ra: null, rb: null });
    chapter = 'Result';
    snap(
      13,
      `No edges left: ${components} component${components === 1 ? ', since one root remains' : `s, since ${components} roots remain`}.`,
      `Done: ${components} connected component${components === 1 ? '' : 's'}, one per remaining root. Union by rank plus path compression makes each operation nearly O(1).`,
    );
    frames[frames.length - 1].vars['result'] = components;
    return frames;
  },
};
