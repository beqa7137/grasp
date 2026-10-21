import { spansOf } from './annotate.js';
import { VALUE, fixedChoices, rotatedChoices } from './choices.js';
import { InputError } from './types.js';
import { asEdges, asNumber, rangeOf } from './input.js';
import { randInt, shuffle } from './random.js';
import { circleLayout } from './layout.js';
import type { AlgorithmDefinition, EdgeState, Frame, GraphLegend, GraphView, NodeState, Prediction } from './types.js';

type WeightedEdge = [number, number, number];
type Input = { n: number; edges: WeightedEdge[] };

const VERDICTS = ['Accept, and more edges are still needed', 'Reject: it would close a cycle', 'Accept, and the tree is complete'];
const LEGEND: GraphLegend = { active: 'on the current edge', done: 'in the tree' };

const setText = (nodes: number[]) => `{${nodes.join(', ')}}`;

const CODE = [
  'function kruskal(n, edges) {',
  '  edges.sort((a, b) => a[2] - b[2]);',
  '  const parent = [...Array(n).keys()];',
  '  let total = 0, used = 0;',
  '  for (const [u, v, w] of edges) {',
  '    const ru = find(u), rv = find(v);',
  '    if (ru === rv) continue; // a cycle',
  '    union(ru, rv); // by rank',
  '    total += w;',
  '    if (++used === n - 1) break; // done',
  '  }',
  '  return used === n - 1 ? total : -1;',
  '}',
];

const SPANS = spansOf(CODE, {
  2: 'edges.sort((a, b) => a[2] - b[2])',
  3: 'const parent = [...Array(n).keys()]',
  6: 'const ru = find(u), rv = find(v)',
  7: 'ru === rv',
  8: 'union(ru, rv)',
  9: 'total += w',
  10: '++used === n - 1',
  12: 'return used === n - 1 ? total : -1',
});

export const kruskalMst: AlgorithmDefinition<Input> = {
  code: CODE,
  fields: [
    { key: 'n', label: 'Nodes', kind: 'number', hint: '2 to 8, numbered from 0' },
    { key: 'edges', label: 'Edges', kind: 'weightedEdges', hint: 'Like 0-1:4 (undirected, weight 1–99)' },
  ],
  defaultInput: {
    n: 6,
    edges: [
      [0, 1, 4],
      [0, 2, 1],
      [0, 5, 8],
      [1, 2, 2],
      [1, 3, 6],
      [2, 3, 3],
      [2, 4, 9],
      [3, 4, 5],
      [4, 5, 7],
    ],
  },
  presets: [
    {
      label: 'Two groups, no bridge',
      input: {
        n: 4,
        edges: [
          [0, 1, 1],
          [2, 3, 2],
        ],
      },
    },
    {
      label: 'Every weight the same',
      input: {
        n: 4,
        edges: [
          [0, 1, 2],
          [1, 2, 2],
          [0, 2, 2],
          [2, 3, 2],
        ],
      },
    },
    {
      label: 'The heaviest edge is never read',
      input: {
        n: 4,
        edges: [
          [0, 1, 1],
          [1, 2, 2],
          [2, 3, 3],
          [0, 3, 9],
        ],
      },
    },
  ],

  randomInput(rand = Math.random) {
    const n = randInt(rand, 4, 6);
    const labels = shuffle(rand, rangeOf(0, n - 1));
    // One time in five the nodes split into two groups that no edge joins, so the answer is -1.
    const cut = rand() < 0.2 ? randInt(rand, 1, n - 1) : 0;
    const groupStart = (i: number) => (i < cut ? 0 : cut);
    const seen = new Set<string>();
    const edges: WeightedEdge[] = [];
    // Two diameters of the circle would cross at its center and draw their weights on top of each other.
    let diameter = false;
    const add = (a: number, b: number) => {
      const id = `${Math.min(a, b)}-${Math.max(a, b)}`;
      const across = n % 2 === 0 && Math.abs(a - b) === n / 2;
      if (a === b || seen.has(id) || (across && diameter)) return false;
      diameter ||= across;
      seen.add(id);
      edges.push([a, b, randInt(rand, 1, 9)]);
      return true;
    };
    for (let i = 1; i < n; i++) if (i !== cut) shuffle(rand, rangeOf(groupStart(i), i - 1)).some((j) => add(labels[i], labels[j]));
    for (let extra = randInt(rand, 2, n); extra > 0; extra--) {
      const [p, q] = [randInt(rand, 0, n - 1), randInt(rand, 0, n - 1)];
      if (groupStart(p) === groupStart(q)) add(labels[p], labels[q]);
    }
    return { n, edges: shuffle(rand, edges) };
  },

  validate(input) {
    const raw = (input ?? {}) as Record<string, unknown>;
    const n = asNumber(raw['n'], 'n');
    if (n < 2 || n > 8) throw new InputError('n must be between 2 and 8');
    const edges = asEdges(raw['edges'], 'edges', 'weightedEdges', n, { max: 16, maxWeight: 99 }) as WeightedEdge[];
    if (edges.length === 0) throw new InputError('edges must list at least one edge');
    return { n, edges };
  },

  trace({ n, edges }) {
    const frames: Frame[] = [];
    const points = circleLayout(n);
    const order = edges.map((_, i) => i).sort((a, b) => edges[a][2] - edges[b][2]);
    const parent = [...Array(n).keys()];
    const rank = Array<number>(n).fill(0);
    const states = edges.map((): EdgeState => 'idle');
    let current: number | null = null;
    let queued = 0;
    let total = 0;
    let used = 0;
    let rejectedWeight = 0;
    let roots: [number, number] | null = null;

    const find = (x: number): number => (parent[x] === x ? x : (parent[x] = find(parent[x])));
    const componentOf = (x: number) => {
      const root = find(x);
      return parent.flatMap((_, v) => (find(v) === root ? [v] : []));
    };
    const components = () => {
      const byRoot = new Map<number, number[]>();
      for (let v = 0; v < n; v++) byRoot.set(find(v), [...(byRoot.get(find(v)) ?? []), v]);
      return [...byRoot.values()];
    };
    const label = (i: number) => `${edges[i][0]}-${edges[i][1]}`;

    const graph = (): GraphView => {
      const ends = current === null ? [] : edges[current].slice(0, 2);
      const inTree = new Set(edges.flatMap(([a, b], i) => (states[i] === 'chosen' ? [a, b] : [])));
      return {
        nodes: points.map((p, v) => {
          const state: NodeState = ends.includes(v) ? 'active' : inTree.has(v) ? 'done' : 'idle';
          return { id: String(v), label: String(v), x: p.x, y: p.y, state };
        }),
        edges: edges.map(([a, b, w], i) => ({
          from: String(a),
          to: String(b),
          directed: false,
          label: String(w),
          state: i === current && states[i] === 'idle' ? 'active' : states[i],
        })),
        legend: LEGEND,
      };
    };

    let chapter = 'Set up';
    const snap = (line: number, caption: string, note: string, extra: Partial<Frame> = {}, active?: number[]) => {
      const [u, v, w] = current === null ? [null, null, null] : edges[current];
      frames.push({
        line,
        caption,
        note,
        chapter,
        span: SPANS[line],
        vars: { u, v, w, ru: roots?.[0] ?? null, rv: roots?.[1] ?? null, total, used },
        graph: graph(),
        queue: {
          label: 'edges left, cheapest first',
          items: order.slice(queued).map((i) => `${label(i)}:${edges[i][2]}`),
        },
        set: { label: 'components', entries: components().map(setText), ...(active ? { active: setText(active) } : {}) },
        ...extra,
      });
    };

    const verdictQuestion = (u: number, v: number, w: number, ru: number, rv: number): Prediction => {
      const completes = ru !== rv && used + 1 === n - 1;
      return {
        prompt: `used is ${used} and n is ${n}. What happens to edge ${u}-${v}, weight ${w}?`,
        ...fixedChoices(VERDICTS, ru === rv ? 1 : completes ? 2 : 0),
        explain:
          ru === rv
            ? `\`find(${u})\` and \`find(${v})\` both reach root ${ru}: tree edges already join ${u} and ${v}, so ${u}-${v} would close a cycle. Every edge on that path weighs at most ${w}, so leaving this one out costs nothing.`
            : `\`find(${u}) = ${ru}\` and \`find(${v}) = ${rv}\` differ, so no path joins ${u} and ${v} yet, and no edge still to come weighs less than ${w}: accept it. That makes used ${used + 1}, ${completes ? 'which is n - 1: every node is joined, so the loop stops.' : `short of n - 1 = ${n - 1}, so the loop goes on.`}`,
        skill: 'verdict',
      };
    };

    const mergeQuestion = (u: number, v: number, ru: number, rv: number, mine: number[], theirs: number[]): Prediction => {
      const merged = [...mine, ...theirs].sort((a, b) => a - b);
      const other = components().find((c) => !c.includes(u) && !c.includes(v));
      return {
        ...rotatedChoices(`Edge ${u}-${v} is accepted. Which component does \`union(${ru}, ${rv})\` make?`, setText(merged), [
          setText(mine),
          setText(theirs),
          ...(other ? [setText([...merged, ...other].sort((a, b) => a - b))] : []),
        ]),
        explain: `Union links root ${ru} and root ${rv}, so every node of ${setText(mine)} and of ${setText(theirs)} now shares one root.`,
        skill: 'merge',
      };
    };

    const totalQuestion = (u: number, v: number, w: number): Prediction => ({
      ...rotatedChoices(`total is ${total}. What is it after adding edge ${u}-${v}, weight ${w}?`, String(total + w), [
        String(total + w + rejectedWeight),
        String(total),
        String(w),
        String(total + 2 * w),
      ]),
      explain: `Only accepted edges count: ${total} + ${w} = ${total + w}.${rejectedWeight ? ` The rejected edges, ${rejectedWeight} in all, are not in the tree.` : ''}`,
      skill: 'total',
      // Plain arithmetic beside the lesson's verdicts and merges.
      tier: 1,
      pick: VALUE,
    });

    const returnQuestion = (lastWeight: number, checkedWeight: number): Prediction => {
      const spans = used === n - 1;
      const everything = edges.reduce((sum, [, , w]) => sum + w, 0);
      return {
        ...rotatedChoices(
          `The loop is over with used = ${used} and total = ${total}, for n = ${n} nodes. What does kruskal return?`,
          spans ? String(total) : '-1',
          spans ? ['-1', String(checkedWeight), String(everything), String(total - lastWeight)] : [String(total), String(used), '0'],
        ),
        explain: spans
          ? `used is n - 1 = ${n - 1}: the tree joins every node, so return its total, ${total}. Rejected and unchecked edges are not in it.`
          : `Only ${used} edge${used === 1 ? '' : 's'} joined two components, fewer than n - 1 = ${n - 1}, so some node is cut off and there is no spanning tree: return -1.`,
        skill: 'return',
        pick: VALUE,
      };
    };

    snap(
      2,
      `Sort the ${edges.length} edge${edges.length === 1 ? '' : 's'} by weight, so the cheapest come${edges.length === 1 ? 's' : ''} first.`,
      `Sort the ${edges.length} edges by weight. Kruskal looks at them cheapest first and keeps one only if it joins two separate components.`,
    );
    snap(
      3,
      `Each of the ${n} nodes starts as its own component, with no tree edges yet.`,
      `Every node starts as its own component: ${n} components, and no tree edges yet.`,
    );

    let accepted = 0;
    let lastWeight = 0;
    for (let k = 0; k < order.length; k++) {
      current = order[k];
      queued = k + 1;
      const [u, v, w] = edges[current];
      roots = [find(u), find(v)];
      const [ru, rv] = roots;
      chapter = `Edge ${k + 1}: ${u}-${v}`;
      snap(
        6,
        `Next cheapest edge: ${u}-${v}, weight ${w}. Find the root of each end.`,
        `Next cheapest edge: ${u}-${v}, weight ${w}. \`find(${u}) = ${ru}\` and \`find(${v}) = ${rv}\`.`,
        { lens: `edge ${u}-${v}, w ${w}` },
        componentOf(u),
      );
      if (k >= 2) {
        // The roots would answer the verdict, so they stay out of the asking frame's variables.
        roots = null;
        snap(7, `Compare the roots: are ${u} and ${v} in one component already?`, 'Check the roots.', {
          predict: verdictQuestion(u, v, w, ru, rv),
        });
        roots = [ru, rv];
      }
      if (ru === rv) {
        states[current] = 'skipped';
        rejectedWeight += w;
        snap(
          7,
          `${u} and ${v} are already connected, so ${u}-${v} would close a cycle: reject it.`,
          `Same root ${ru}: ${u} and ${v} are already connected, so ${u}-${v} would close a cycle. Reject it.`,
          { lens: `${ru} === ${rv} → true` },
          componentOf(u),
        );
        continue;
      }
      states[current] = 'chosen';
      snap(
        7,
        `${u} and ${v} are in different components, so ${u}-${v} joins them: accept it.`,
        `Roots ${ru} and ${rv} differ: ${u} and ${v} are in different components, so accept ${u}-${v}.`,
        { lens: `${ru} === ${rv} → false` },
      );
      const [mine, theirs] = [componentOf(u), componentOf(v)];
      if (accepted === 1)
        snap(8, `Union the components of ${u} and ${v}.`, 'Union the two components.', {
          predict: mergeQuestion(u, v, ru, rv, mine, theirs),
        });
      if (rank[ru] < rank[rv]) parent[ru] = rv;
      else if (rank[ru] > rank[rv]) parent[rv] = ru;
      else {
        parent[rv] = ru;
        rank[ru]++;
      }
      const left = components().length;
      snap(
        8,
        `Join them into ${setText(componentOf(u))}: ${left} component${left === 1 ? '' : 's'} left.`,
        `Union: ${setText(mine)} and ${setText(theirs)} become ${setText(componentOf(u))}. ${left} component${left === 1 ? '' : 's'} left.`,
        { lens: `union(${ru}, ${rv})` },
        componentOf(u),
      );
      if (accepted === 2)
        snap(9, `Add the weight of ${u}-${v} to the running total.`, 'Add the weight to the running total.', {
          predict: totalQuestion(u, v, w),
        });
      total += w;
      lastWeight = w;
      snap(9, `total grows by ${w} to ${total}: only accepted edges count.`, `total = ${total - w} + ${w} = ${total}.`, {
        lens: `${total - w} + ${w} = ${total}`,
      });
      accepted++;
      used++;
      if (used === n - 1) {
        const unchecked = order.length - queued;
        snap(
          10,
          `used is ${used}, which is n - 1: every node is joined, so stop here.`,
          `used = ${used} = n - 1: the tree joins all ${n} nodes, so stop.${unchecked ? ` The ${unchecked === 1 ? 'edge' : `${unchecked} edges`} left ${unchecked === 1 ? 'is' : 'are'} never checked.` : ''}`,
          { lens: `${used} === ${n - 1} → true` },
        );
        break;
      }
      const more = n - 1 - used;
      snap(
        10,
        `used is ${used}: a tree on ${n} nodes needs ${n - 1} edges, so ${more} more to go.`,
        `used = ${used}. A tree on ${n} nodes needs ${n - 1} edges, so ${more} more to go.`,
        { lens: `${used} === ${n - 1} → false` },
      );
    }

    current = null;
    roots = null;
    const checkedWeight = total + rejectedWeight;
    chapter = 'Result';
    snap(12, 'The loop is over: did it find all n - 1 edges?', 'The loop is over.', { predict: returnQuestion(lastWeight, checkedWeight) });
    const result = used === n - 1 ? total : -1;
    snap(
      12,
      result >= 0
        ? `Return ${total}: the accepted edges form a minimum spanning tree.`
        : `Return -1: the edges ran out with ${used} of the ${n - 1} a spanning tree needs.`,
      result >= 0
        ? `Return ${total}: the edges taken form a minimum spanning tree. Sorting takes O(E log E), and each find and union is nearly O(1).`
        : `Return -1: the edges ran out after ${used} of the ${n - 1} a spanning tree needs, leaving ${components().length} components.`,
      { lens: `${used} === ${n - 1} → ${result >= 0}` },
    );
    frames[frames.length - 1].vars['result'] = result;
    return frames;
  },
};
