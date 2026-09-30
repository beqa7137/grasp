import { describe, expect, it } from 'vitest';
import { GRAPH_BOX, GRAPH_NODE_RADIUS, dipLayout } from './layout.js';
import { linkedListReversal as algo } from './linked-list-reversal.js';
import { correctChoices, predictions, resultOf, tracerFixture } from './tracer.fixture.js';
import { InputError, type Frame, type GraphView } from './types.js';

const { traceOf, randomInputs } = tracerFixture(algo);

const SAMPLES = [
  algo.defaultInput,
  { values: [5], left: 1, right: 1 },
  { values: [4, 9], left: 1, right: 2 },
  { values: [1, 2, 3, 4, 5], left: 1, right: 5 },
  { values: [3, 8, 6], left: 2, right: 2 },
  { values: [10, 20, 30, 40], left: 3, right: 4 },
  ...randomInputs(2026, 40),
];

const nameOf = (graph: GraphView, id: string | undefined) => {
  if (id === undefined) return 'null';
  const label = graph.nodes.find((node) => node.id === id)!.label;
  return id === 'n0' ? 'the dummy' : `node ${label}`;
};
const target = (graph: GraphView, from: string) => nameOf(graph, graph.edges.find((e) => e.from === from)?.to);
const holderOf = (graph: GraphView, pointer: string) => graph.nodes.find((n) => n.badge?.split(', ').includes(pointer));
const kindOf = (f: Frame) =>
  f.predict!.prompt.includes('`curr.next = prev`')
    ? 'flip'
    : f.predict!.prompt.includes('`curr = next`')
      ? 'step'
      : f.predict!.prompt.includes('`before.next.next = curr`')
        ? 'tail link'
        : 'head link';

/** Each answer is what the frame after the question shows: the link that changed, or where curr went. */
const answersConfirmed = (frames: Frame[]) =>
  frames.every((f, k) => {
    if (!f.predict) return true;
    const moved = frames[k + 1];
    const chosen = f.predict.choices[f.predict.answer];
    const graph = moved.graph!;
    const changed = graph.edges.find((e) => e.state === 'active');
    const confirmed =
      kindOf(f) === 'flip'
        ? chosen === target(graph, holderOf(graph, 'curr')!.id)
        : kindOf(f) === 'step'
          ? chosen === nameOf(graph, holderOf(graph, 'curr')?.id)
          : changed !== undefined
            ? chosen === `${nameOf(graph, changed.from)} → ${nameOf(graph, changed.to)}`
            : chosen.endsWith('→ null');
    return confirmed && moved.line === f.line && !moved.predict;
  });

/** Every pointer badge sits on exactly the node its variable names, and on no node while it is null or out of scope. */
const badgesInSync = (frames: Frame[]) =>
  frames.every(({ vars, graph }) =>
    ['before', 'prev', 'curr', 'next'].every((pointer) => {
      const holders = graph!.nodes.filter((node) => node.badge?.split(', ').includes(pointer));
      const value = vars[pointer];
      if (value === null || value === 'null') return holders.length === 0;
      return holders.length === 1 && (value === 'dummy' ? holders[0].id === 'n0' : holders[0].label === String(value));
    }),
  );

/** How close a segment from a to b comes to point p, in drawing units. */
function distance(p: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }) {
  const [dx, dy] = [b.x - a.x, b.y - a.y];
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(a.x + t * dx - p.x, a.y + t * dy - p.y);
}

describe('linked-list-reversal', () => {
  it('traces the default input: 2 → 9 → 4 turns around and both ends reconnect', () => {
    const frames = traceOf(algo.defaultInput);
    const last = frames[frames.length - 1];
    expect(frames).toHaveLength(25);
    expect(correctChoices(frames)).toEqual(['null', 'node 4', 'node 9', 'node 2 → node 6', 'node 7 → node 4']);
    expect(resultOf(frames)).toBe('[7, 4, 9, 2, 6]');
    expect(last.line).toBe(14);
    expect(frames[0].graph!.nodes[0]).toMatchObject({ label: '0', badge: 'dummy' });
    expect(last.graph!.edges.map((e) => `${e.from}>${e.to}`).sort()).toEqual(['n0>n1', 'n1>n4', 'n2>n5', 'n3>n2', 'n4>n3']);
  });

  it('asks predictions that the next frame confirms', () => {
    for (const input of SAMPLES) expect(answersConfirmed(traceOf(input)), JSON.stringify(input)).toBe(true);
  });

  it('keeps the before, prev, curr and next badges on the nodes the variables name', () => {
    for (const input of SAMPLES) expect(badgesInSync(traceOf(input)), JSON.stringify(input)).toBe(true);
  });

  it('asks every kind of question and returns the list with the part reversed', () => {
    const seen = new Set<string>();
    for (const input of randomInputs(7, 80)) {
      const frames = traceOf(input);
      const { values, left, right } = algo.validate(input);
      expect(resultOf(frames)).toBe(
        `[${[...values.slice(0, left - 1), ...values.slice(left - 1, right).reverse(), ...values.slice(right)].join(', ')}]`,
      );
      seen.add(left === 1 ? 'from the head' : 'after the head');
      seen.add(right === values.length ? 'to the end' : 'before the end');
      for (const f of frames.filter((g) => g.predict))
        seen.add(`${kindOf(f)}${f.predict!.choices[f.predict!.answer] === 'null' ? ' to null' : ''}`);
    }
    expect([...seen].sort()).toEqual([
      'after the head',
      'before the end',
      'flip',
      'flip to null',
      'from the head',
      'head link',
      'step',
      'step to null',
      'tail link',
      'to the end',
    ]);
  });

  it('draws every node at its dip layout point, and no link passes close to a node it does not join', () => {
    const clear = GRAPH_NODE_RADIUS + 5;
    for (let n = 1; n <= 5; n++)
      for (let left = 1; left <= n; left++)
        for (let right = left; right <= n; right++) {
          const frames = traceOf({ values: Array.from({ length: n }, (_, i) => i + 1), left, right });
          expect(frames[0].graph!.nodes.map(({ x, y }) => ({ x, y }))).toEqual(dipLayout(n + 1, left, right));
          for (const { graph } of frames) {
            const at = new Map(graph!.nodes.map((node) => [node.id, { x: node.x * GRAPH_BOX.width, y: node.y * GRAPH_BOX.height }]));
            for (const edge of graph!.edges)
              for (const [id, point] of at)
                if (id !== edge.from && id !== edge.to)
                  expect(
                    distance(point, at.get(edge.from)!, at.get(edge.to)!),
                    `${n} ${left}-${right} ${edge.from}>${edge.to} by ${id}`,
                  ).toBeGreaterThan(clear);
          }
        }
  });

  it('offers at least three choices at every checkpoint, even when the stretch is one node', () => {
    for (let n = 1; n <= 5; n++)
      for (let left = 1; left <= n; left++)
        for (let right = left; right <= n; right++)
          for (const p of predictions(traceOf({ values: Array.from({ length: n }, (_, i) => i + 1), left, right })))
            expect(p.choices.length, `${n} ${left}-${right}: ${p.prompt}`).toBeGreaterThanOrEqual(3);
  });

  it('rejects bad input with clear InputErrors', () => {
    const rejects = (input: unknown, message: string) => expect(() => algo.validate(input)).toThrow(new InputError(message));
    rejects({ values: [1, 2, 1], left: 1, right: 2 }, 'values must be distinct: each value names one node');
    rejects({ values: [1, 2, 3, 4, 5, 6], left: 1, right: 2 }, 'values can hold at most 5 nodes');
    rejects({ values: [0, 5], left: 1, right: 2 }, 'values must contain integers between 1 and 99');
    rejects({ values: [1, 2, 3], left: 0, right: 2 }, 'left must be from 1 to 3');
    rejects({ values: [1, 2, 3], left: 4, right: 4 }, 'left must be from 1 to 3');
    rejects({ values: [7], left: 2, right: 2 }, 'left must be 1');
    rejects({ values: [1, 2, 3], left: 2, right: 1 }, 'right must be from 2 to 3');
    rejects({ values: [1, 2, 3], left: 3, right: 4 }, 'right must be 3');
    rejects({ values: [1, 2, 3], left: 1, right: '' }, 'right must be an integer');
  });
});
