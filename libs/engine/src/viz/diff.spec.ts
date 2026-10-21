import { describe, expect, it } from 'vitest';
import { ALGORITHMS, getAlgorithm } from '../algorithms/index.js';
import { mulberry32 } from '../algorithms/random.js';
import type { Frame } from '../algorithms/types.js';
import { diffFrames, type ViewName, type VizEvent } from './diff.js';
import { traceKeys } from './keys.js';

const SWEEP = 60;
const VIEWS: ViewName[] = ['array', 'stack', 'queue', 'set', 'output', 'grid', 'table', 'graph', 'tree', 'vars'];

/** A view as drawn: its marks are sets, so their order is not a change. */
const drawn = (f: Frame, view: ViewName) =>
  JSON.stringify(view === 'vars' ? f.vars : (f[view] ?? null), (key, value) =>
    ['active', 'settled', 'found'].includes(key) && Array.isArray(value) ? [...value].sort() : value,
  );

/** Every view and array field that changed from `a` to `b` with no event to show it. */
function unshown(a: Frame, b: Frame, events: VizEvent[]): string[] {
  const missing: string[] = VIEWS.filter((view) => drawn(a, view) !== drawn(b, view) && !events.some((e) => e.view === view));
  const has = (view: ViewName, kinds: VizEvent['kind'][]) => events.some((e) => e.view === view && kinds.includes(e.kind));
  const x = a.array;
  const y = b.array;
  if (x && y) {
    if (JSON.stringify(x.values) !== JSON.stringify(y.values) && !has('array', ['write', 'swap', 'shift', 'add', 'remove']))
      missing.push('array values');
    if (JSON.stringify(x.pointers) !== JSON.stringify(y.pointers) && !has('array', ['move'])) missing.push('array pointers');
    if (JSON.stringify(x.window) !== JSON.stringify(y.window) && !has('array', ['window'])) missing.push('array window');
    for (const s of ['active', 'settled', 'found'] as const)
      if (
        JSON.stringify([...(x[s] ?? [])].sort()) !== JSON.stringify([...(y[s] ?? [])].sort()) &&
        !events.some((e) => e.kind === 'mark' && e.view === 'array' && e.state === s)
      )
        missing.push(`array ${s}`);
  }
  return missing;
}

describe('diffFrames', () => {
  for (const algo of ALGORITHMS) {
    it(`gives every changed step of ${algo.id} an event for each view it changes, and none to a step that changes nothing`, () => {
      const rand = mulberry32(algo.id.length * 7919);
      const inputs = [
        algo.defaultInput,
        ...algo.presets.map((p) => p.input),
        ...Array.from({ length: SWEEP }, () => algo.randomInput(rand)),
      ];
      const problems: string[] = [];
      for (const input of inputs) {
        const frames = algo.trace(algo.validate(input));
        const keys = traceKeys(frames);
        for (let i = 1; i < frames.length; i++) {
          const events = diffFrames(frames[i - 1], frames[i], [keys[i - 1], keys[i]]);
          const missing = unshown(frames[i - 1], frames[i], events);
          if (missing.length) problems.push(`step ${i} of ${JSON.stringify(input)}: ${missing.join(', ')}`);
          const changed = VIEWS.some((view) => drawn(frames[i - 1], view) !== drawn(frames[i], view));
          if (changed !== events.some((e) => e.kind !== 'compare'))
            problems.push(`step ${i} of ${JSON.stringify(input)}: ${events.length} events, changed ${changed}`);
        }
      }
      expect(problems.slice(0, 5)).toEqual([]);
    });
  }

  it("reads binary search's first decision as a comparison over mid, lo sliding, and the left half done with", () => {
    const algo = getAlgorithm('binary-search')!;
    const frames = algo.trace(algo.defaultInput);
    const events = diffFrames(frames[3], frames[4]);
    expect(events).toContainEqual({ view: 'array', kind: 'compare', text: '16 < 23', at: [4] });
    expect(events).toContainEqual({ view: 'array', kind: 'move', pointer: 'lo', from: 0, to: 5 });
    expect(events).toContainEqual({ view: 'array', kind: 'move', pointer: 'mid', from: 4, to: null });
    expect(events).toContainEqual({ view: 'array', kind: 'window', from: [0, 9], to: [5, 9] });
    expect(events).toContainEqual({ view: 'array', kind: 'mark', state: 'settled', added: [0, 1, 2, 3, 4], removed: [] });
    expect(events).toContainEqual({ view: 'vars', kind: 'var', name: 'lo', from: 0, to: 5 });
  });

  it('anchors a loop test on the cells its pointers name', () => {
    const algo = getAlgorithm('binary-search')!;
    const frames = algo.trace(algo.defaultInput);
    expect(diffFrames(frames[0], frames[1])).toEqual([{ view: 'array', kind: 'compare', text: '0 <= 9', at: [0, 9] }]);
  });

  it('dequeues the front of a queue, pops the top of a stack and writes an output in place', () => {
    const queue = (items: string[]): Frame => ({ line: 1, vars: {}, note: '', queue: { label: 'queue', items } });
    expect(diffFrames(queue(['a', 'b', 'c']), queue(['b', 'c']))).toEqual([{ view: 'queue', kind: 'pop', at: 0, value: 'a' }]);
    expect(diffFrames(queue(['x', 'x']), queue(['x']))).toEqual([{ view: 'queue', kind: 'pop', at: 0, value: 'x' }]);
    expect(diffFrames(queue(['a', 'b']), queue(['b', 'c']))).toEqual([
      { view: 'queue', kind: 'pop', at: 0, value: 'a' },
      { view: 'queue', kind: 'push', at: 1, value: 'c' },
    ]);
    const stack = (items: string[]): Frame => ({ line: 1, vars: {}, note: '', stack: { label: 'stack', items } });
    expect(diffFrames(stack(['x', 'x']), stack(['x']))).toEqual([{ view: 'stack', kind: 'pop', at: 1, value: 'x' }]);
    const output = (items: number[]): Frame => ({ line: 1, vars: {}, note: '', output: { label: 'res', items } });
    expect(diffFrames(output([-1, -1, -1]), output([-1, 5, -1]))).toEqual([{ view: 'output', kind: 'write', at: 1, from: -1, to: 5 }]);
  });

  it('tells a swap from a write in an array', () => {
    const array = (values: number[]): Frame => ({ line: 1, vars: {}, note: '', array: { values, pointers: {} } });
    expect(diffFrames(array([3, 1, 2]), array([1, 3, 2]))).toEqual([{ view: 'array', kind: 'swap', a: 0, b: 1 }]);
    expect(diffFrames(array([3, 1, 2]), array([3, 9, 2]))).toEqual([{ view: 'array', kind: 'write', at: 1, from: 1, to: 9 }]);
    expect(diffFrames(array([3, 1, 2]), array([2, 1, 3]))).toEqual([{ view: 'array', kind: 'swap', a: 0, b: 2 }]);
  });

  it('keys mean what moved: a swap trades two keys, an item that stays keeps its key, equal values keep their places', () => {
    const output = (items: number[]): Frame => ({ line: 1, vars: {}, note: '', output: { label: 'heap', items } });
    const frames = [output([0, 0, 2, 2, 2]), output([0, 2, 2, 0, 2]), output([3, 1, 2]), output([2, 1, 3])];
    const keys = traceKeys(frames).map((k) => k.output!);
    expect(keys[1]).toEqual([keys[0][0], keys[0][3], keys[0][2], keys[0][1], keys[0][4]]);
    expect(diffFrames(frames[0], frames[1], [{ output: keys[0] }, { output: keys[1] }])).toEqual([
      { view: 'output', kind: 'swap', a: 1, b: 3 },
    ]);
    const [k3, k4] = traceKeys(frames.slice(2)).map((k) => k.output!);
    expect(k4).toEqual([k3[2], k3[1], k3[0]]);
  });

  it('keys the heap swaps of kth largest as swaps, each value keeping its key', () => {
    const algo = getAlgorithm('kth-largest')!;
    const frames = algo.trace(algo.defaultInput);
    const keys = traceKeys(frames);
    const events = diffFrames(frames[2], frames[3], [keys[2], keys[3]]);
    expect(events).toContainEqual({ view: 'output', kind: 'swap', a: 0, b: 1 });
    expect(events.filter((e) => e.view === 'output')).toHaveLength(1);
    expect(keys[3].output).toEqual([keys[2].output![1], keys[2].output![0]]);
  });
});
