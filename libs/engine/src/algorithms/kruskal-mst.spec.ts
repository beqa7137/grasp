import { describe, expect, it } from 'vitest';
import { rangeOf, type Edge } from './input.js';
import { kruskalMst as algo } from './kruskal-mst.js';
import { correctChoices, predictions, resultOf, tracerFixture } from './tracer.fixture.js';
import { InputError, type Frame } from './types.js';

const { traceOf, randomInputs } = tracerFixture(algo);

/** Every graph on 2 to 4 nodes, with weights all equal, all different, or alternating, so ties come in every shape. */
const SMALL = rangeOf(2, 4).flatMap((n) => {
  const pairs = rangeOf(0, n - 1).flatMap((a) => rangeOf(a + 1, n - 1).map((b) => [a, b]));
  return rangeOf(1, 2 ** pairs.length - 1).flatMap((mask) => {
    const picked = pairs.filter((_, i) => (mask >> i) & 1);
    return [() => 1, (i: number) => i + 1, (i: number) => (i % 2) + 1].map((weight) => ({
      n,
      edges: picked.map(([a, b], i) => [a, b, weight(i)] as Edge),
    }));
  });
});

const SAMPLES = [algo.defaultInput, ...SMALL, ...randomInputs(2026, 60)];

const edgeOf = (f: Frame) => f.graph!.edges.find((e) => e.from === String(f.vars['u']) && e.to === String(f.vars['v']));

const kindOf = (f: Frame) => {
  const prompt = f.predict!.prompt;
  if (prompt.includes('What happens to edge')) return (['accept', 'reject', 'complete'] as const)[f.predict!.answer];
  if (prompt.includes('`union(')) return 'merge';
  if (prompt.startsWith('total is')) return 'total';
  return f.predict!.choices[f.predict!.answer] === '-1' ? 'return -1' : 'return total';
};

/** Whether the edge accepted after frame k is the one that ends the loop, as its own used frame says. */
const stopsAt = (frames: Frame[], k: number) =>
  frames
    .slice(k)
    .find((f) => f.line === 10)
    ?.note.includes('n - 1: the tree joins') ?? false;

/** Each answer is what the frame after the question shows: the edge's state, the merged component, the total or the result. */
const answersConfirmed = (frames: Frame[]) =>
  frames.every((f, k) => {
    if (!f.predict) return true;
    const next = frames[k + 1];
    const chosen = f.predict.choices[f.predict.answer];
    const confirmed = {
      accept: () => edgeOf(next)?.state === 'chosen' && !stopsAt(frames, k),
      complete: () => edgeOf(next)?.state === 'chosen' && stopsAt(frames, k),
      reject: () => edgeOf(next)?.state === 'skipped',
      merge: () => next.set?.active === chosen,
      total: () => String(next.vars['total']) === chosen,
      'return total': () => String(next.vars['result']) === chosen,
      'return -1': () => String(next.vars['result']) === chosen,
    }[kindOf(f)]();
    return confirmed && next.line === f.line && !next.predict;
  });

/** The components that the given edges make of nodes 0 to n - 1, written as the set view writes them. */
function componentsOf(n: number, edges: { from: string; to: string }[]): string[] {
  const label = rangeOf(0, n - 1);
  for (let changed = true; changed;) {
    changed = false;
    for (const { from, to } of edges) {
      const [a, b] = [Number(from), Number(to)];
      const low = Math.min(label[a], label[b]);
      if (label[a] !== low || label[b] !== low) [label[a], label[b], changed] = [low, low, true];
    }
  }
  const groups = new Map<number, number[]>();
  label.forEach((root, v) => groups.set(root, [...(groups.get(root) ?? []), v]));
  return [...groups.values()].map((nodes) => `{${nodes.join(', ')}}`).sort();
}

/**
 * The set view lists the components of the tree edges taken so far, and those edges never close a cycle. Between the
 * frame that accepts an edge and the union after it, the components do not include that edge yet.
 */
const componentsInSync = (n: number, frames: Frame[]) =>
  frames.every((f) => {
    const current = edgeOf(f);
    const taken = f.graph!.edges.filter((e) => e.state === 'chosen' && !(e === current && (f.line === 7 || (f.line === 8 && f.predict))));
    const components = componentsOf(n, taken);
    return components.join(' ') === [...f.set!.entries].sort().join(' ') && taken.length === n - components.length;
  });

describe('kruskal-mst', () => {
  it('traces the default input: five edges taken, two rejected as cycles and two never checked, for a total of 18', () => {
    const frames = traceOf(algo.defaultInput);
    const last = frames[frames.length - 1];
    expect(frames).toHaveLength(40);
    expect(correctChoices(frames)).toEqual([
      '{0, 1, 2}',
      'Accept, and more edges are still needed',
      '6',
      'Reject: it would close a cycle',
      'Accept, and more edges are still needed',
      'Reject: it would close a cycle',
      'Accept, and the tree is complete',
      '18',
    ]);
    expect(resultOf(frames)).toBe(18);
    expect(last.line).toBe(12);
    const states = Object.fromEntries(last.graph!.edges.map((e) => [`${e.from}-${e.to}`, e.state]));
    expect(states).toEqual({
      '0-1': 'skipped',
      '0-2': 'chosen',
      '0-5': 'idle',
      '1-2': 'chosen',
      '1-3': 'skipped',
      '2-3': 'chosen',
      '2-4': 'idle',
      '3-4': 'chosen',
      '4-5': 'chosen',
    });
    expect(last.queue!.items).toEqual(['0-5:8', '2-4:9']);
  });

  it('asks predictions that the next frame confirms', () => {
    for (const input of SAMPLES) expect(answersConfirmed(traceOf(input)), JSON.stringify(input)).toBe(true);
  });

  it('shows the union-find components of the edges taken, which never close a cycle', () => {
    for (const input of SAMPLES) expect(componentsInSync(input.n, traceOf(input)), JSON.stringify(input)).toBe(true);
  });

  it('offers at least three different choices at every checkpoint', () => {
    for (const input of SAMPLES)
      for (const p of predictions(traceOf(input))) {
        expect(p.choices.length, `${JSON.stringify(input)}: ${p.prompt}`).toBeGreaterThanOrEqual(3);
        expect(new Set(p.choices).size, p.prompt).toBe(p.choices.length);
      }
  });

  it('asks every kind of question, with each accept or reject option right at least once, and returns -1 for a graph that is not connected', () => {
    const seen = new Set(randomInputs(7, 150).flatMap((input) => traceOf(input).flatMap((f) => (f.predict ? [kindOf(f)] : []))));
    expect([...seen].sort()).toEqual(['accept', 'complete', 'merge', 'reject', 'return -1', 'return total', 'total']);
  });

  it('draws at most one diameter of the circle in a random graph, so no two weights meet at its center', () => {
    for (const { n, edges } of randomInputs(11, 300)) {
      const diameters = edges.filter(([a, b]) => n % 2 === 0 && Math.abs(a - b) === n / 2);
      expect(diameters.length, JSON.stringify(edges)).toBeLessThanOrEqual(1);
    }
  });

  it('rejects bad input with clear InputErrors', () => {
    const rejects = (input: unknown, message: string) => expect(() => algo.validate(input)).toThrow(new InputError(message));
    rejects({ n: 1, edges: [] }, 'n must be between 2 and 8');
    rejects({ n: 9, edges: [[0, 1, 1]] }, 'n must be between 2 and 8');
    rejects({ n: 3, edges: [] }, 'edges must list at least one edge');
    rejects({ n: 3, edges: [[0, 1, 0]] }, 'edges: weights go from 1 to 99');
    rejects({ n: 3, edges: [[1, 1, 4]] }, 'edges: an edge cannot connect a node to itself');
    rejects(
      {
        n: 3,
        edges: [
          [0, 1, 4],
          [1, 0, 2],
        ],
      },
      'edges: edge 0-1 appears twice',
    );
    rejects({ n: 3, edges: [[0, 3, 4]] }, 'edges: nodes go from 0 to 2');
  });
});
