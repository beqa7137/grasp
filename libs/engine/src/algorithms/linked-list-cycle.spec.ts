import { describe, expect, it } from 'vitest';
import { listLayout } from './layout.js';
import { linkedListCycle as algo } from './linked-list-cycle.js';
import { correctChoices, predictions, resultOf, tracerFixture } from './tracer.fixture.js';
import { InputError, type Frame } from './types.js';

const MEET = 'Yes: slow === fast, return true';
const APART = 'No: they are still apart';

const { traceOf, randomInputs } = tracerFixture(algo);
const nodeName = (value: unknown) => (value === 'null' ? 'null' : `node ${value}`);
const isMeetQuestion = (f: Frame) => f.predict!.prompt.endsWith('meet on this step?');

const SAMPLES = [
  algo.defaultInput,
  { values: [5], pos: -1 },
  { values: [4, 9], pos: 0 },
  { values: [2, 4, 6, 8, 10], pos: -1 },
  { values: [4, 8, 15, 16], pos: 2 },
  ...randomInputs(2026, 40),
];

/** A where answer is the node the move frame puts fast on; a meet answer says whether that frame has slow === fast. */
const answersConfirmed = (frames: Frame[]) =>
  frames.every((f, k) => {
    if (!f.predict) return true;
    const moved = frames[k + 1];
    const chosen = f.predict.choices[f.predict.answer];
    const confirmed = isMeetQuestion(f)
      ? (chosen === MEET) === (moved.vars['slow'] === moved.vars['fast'])
      : chosen === nodeName(moved.vars['fast']);
    return confirmed && moved.line === 4 && !moved.predict;
  });

/** The slow and fast badges sit on exactly the nodes the variables name, and fast has no node once it is null. */
const badgesInSync = (frames: Frame[]) =>
  frames.every(({ vars, graph }) => {
    const holders = (who: string) => graph!.nodes.filter((node) => node.badge?.includes(who)).map((node) => node.label);
    const fast = vars['fast'] === 'null' ? [] : [String(vars['fast'])];
    return (
      JSON.stringify(holders('slow')) === JSON.stringify([String(vars['slow'])]) && JSON.stringify(holders('fast')) === JSON.stringify(fast)
    );
  });

describe('linked-list-cycle', () => {
  it('traces the default input: fast laps the loop and lands on slow at node 3', () => {
    const frames = traceOf(algo.defaultInput);
    const last = frames[frames.length - 1];
    expect(frames).toHaveLength(16);
    expect(correctChoices(frames)).toEqual(['node 1', APART, MEET]);
    expect([...predictions(frames)[0].choices].sort()).toEqual(['node 1', 'node 4', 'node 7', 'node 9']);
    expect(frames[0].graph!.nodes[0]).toMatchObject({ label: '4', state: 'active', badge: 'slow, fast' });
    expect(last.line).toBe(5);
    expect(resultOf(frames)).toBe(true);
    expect(last.vars['gap']).toBe(0);
    expect(last.graph!.nodes.find((node) => node.badge)).toMatchObject({ label: '3', state: 'done', badge: 'slow = fast' });
    expect(last.graph!.edges.find((e) => e.from === 'n5')).toMatchObject({ to: 'n2', directed: true });
  });

  it('asks predictions that the move frame confirms', () => {
    for (const input of SAMPLES) expect(answersConfirmed(traceOf(input))).toBe(true);
  });

  it('keeps the slow and fast badges on the nodes the variables name', () => {
    for (const input of SAMPLES) expect(badgesInSync(traceOf(input))).toBe(true);
  });

  it('covers both outcomes, both exits and every kind of question on random inputs', () => {
    const seen = new Set<string>();
    for (const input of randomInputs(7, 80)) {
      const frames = traceOf(input);
      seen.add(`result ${resultOf(frames)}`);
      if (resultOf(frames) === false)
        seen.add(frames[frames.length - 2].note.startsWith('fast is null') ? 'exit on null' : 'exit on last node');
      for (const f of frames.filter((g) => g.predict)) {
        const { choices, answer, explain } = f.predict!;
        if (isMeetQuestion(f)) {
          expect(choices).toEqual([MEET, APART]);
          seen.add(choices[answer] === MEET ? 'meet' : 'apart');
        } else {
          seen.add(choices[answer] === 'null' ? 'runs off' : explain.includes('links back') ? 'wraps' : 'plain');
        }
      }
    }
    expect([...seen].sort()).toEqual([
      'apart',
      'exit on last node',
      'exit on null',
      'meet',
      'plain',
      'result false',
      'result true',
      'runs off',
      'wraps',
    ]);
  });

  it('draws every list size and back link at its list layout points, with one edge per next pointer', () => {
    for (let n = 1; n <= 8; n++) {
      for (let pos = -1; pos < n - 1; pos++) {
        const { nodes, edges } = traceOf({ values: Array.from({ length: n }, (_, i) => i + 1), pos })[0].graph!;
        expect(nodes.map(({ x, y }) => ({ x, y }))).toEqual(listLayout(n, pos));
        expect(edges).toHaveLength(pos < 0 ? n - 1 : n);
      }
    }
  });

  it('rejects bad input with clear InputErrors', () => {
    const rejects = (input: unknown, message: string) => expect(() => algo.validate(input)).toThrow(new InputError(message));
    rejects({ values: [1, 2, 1], pos: -1 }, 'values must be distinct: each value names one node');
    rejects({ values: [1, 2, 3, 4, 5, 6, 7, 8, 9], pos: -1 }, 'values can hold at most 8 nodes');
    rejects({ values: [5, 100], pos: -1 }, 'values must contain integers between -99 and 99');
    rejects(
      { values: [1, 2, 3], pos: 2 },
      'pos 2 would link the last node to itself, which the drawing cannot show: use -1 or an index from 0 to 1',
    );
    rejects({ values: [7], pos: 0 }, 'pos 0 would link the last node to itself, which the drawing cannot show: use -1');
    rejects({ values: [1, 2, 3], pos: 3 }, 'pos must be -1 or an index from 0 to 1');
    rejects({ values: [1, 2, 3], pos: -2 }, 'pos must be -1 or an index from 0 to 1');
    rejects({ values: [7, 8], pos: 5 }, 'pos must be -1 or 0');
    rejects({ values: [7, 8], pos: '' }, 'pos must be an integer');
  });
});
