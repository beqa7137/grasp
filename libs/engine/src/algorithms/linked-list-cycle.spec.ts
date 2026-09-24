import { describe, expect, it } from 'vitest';
import { mulberry32 } from './input.js';
import { linkedListCycle as algo } from './linked-list-cycle.js';
import { InputError, type Frame } from './types.js';

type Point = { x: number; y: number };

const EM_DASH = '\u2014';
const MEET = 'Yes: slow === fast, return true';
const APART = 'No: they are still apart';
// The graph view spreads the unit box over 280 by 210 SVG units and draws nodes with radius 16.
const UNITS = { x: 280, y: 210 };

const traceOf = (input: unknown) => algo.trace(algo.validate(input));
const resultOf = (frames: Frame[]) => frames[frames.length - 1].vars['result'];
const correctChoices = (frames: Frame[]) => frames.flatMap((f) => (f.predict ? [f.predict.choices[f.predict.answer]] : []));
const randomInputs = (seed: number, count: number) => {
  const rand = mulberry32(seed);
  return Array.from({ length: count }, () => algo.randomInput(rand));
};
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

const clearance = (a: Point, b: Point, p: Point) => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
};

const side = (a: Point, b: Point, p: Point) => Math.sign((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x));
const crosses = (a: Point, b: Point, c: Point, d: Point) => side(a, b, c) * side(a, b, d) < 0 && side(c, d, a) * side(c, d, b) < 0;

function layoutProblems(n: number, pos: number): string[] {
  const { nodes, edges } = traceOf({ values: Array.from({ length: n }, (_, i) => i + 1), pos })[0].graph!;
  const points = new Map(nodes.map((node) => [node.id, { x: node.x * UNITS.x, y: node.y * UNITS.y }]));
  const at = (id: string) => points.get(id)!;
  const above = new Set(nodes.flatMap((node) => (node.badgeAbove ? [node.id] : [])));
  // A badge sits below its node unless badgeAbove, so an edge must not arrive from that side.
  const meetsBadge = (id: string, other: string) => (above.has(id) ? at(other).y < at(id).y : at(other).y > at(id).y);
  const problems = [
    edges.length !== n - 1 + (pos >= 0 ? 1 : 0) && `${edges.length} edges`,
    nodes.some((node) => node.x < -0.05 || node.x > 1.05 || node.y < 0 || node.y > 1) && 'a node leaves the drawing',
    ...nodes.flatMap((a, i) =>
      nodes.slice(i + 1).map((b) => Math.hypot(at(a.id).x - at(b.id).x, at(a.id).y - at(b.id).y) < 56 && `${a.label} and ${b.label} crowd`),
    ),
    ...edges.flatMap((e) =>
      nodes.map(
        (node) =>
          node.id !== e.from &&
          node.id !== e.to &&
          clearance(at(e.from), at(e.to), at(node.id)) < 24 &&
          `edge ${e.from}>${e.to} runs through ${node.label}`,
      ),
    ),
    ...edges.flatMap((e, i) =>
      edges
        .slice(i + 1)
        .map((f) => crosses(at(e.from), at(e.to), at(f.from), at(f.to)) && `edges ${e.from}>${e.to} and ${f.from}>${f.to} cross`),
    ),
    ...edges.map((e) => (meetsBadge(e.from, e.to) || meetsBadge(e.to, e.from)) && `edge ${e.from}>${e.to} runs into a badge`),
  ];
  return problems.flatMap((problem) => (problem ? [`n=${n} pos=${pos}: ${problem}`] : []));
}

describe('linked-list-cycle', () => {
  it('traces the default input: fast laps the loop and lands on slow at node 3', () => {
    const frames = traceOf(algo.defaultInput);
    const last = frames[frames.length - 1];
    expect(frames).toHaveLength(16);
    expect(correctChoices(frames)).toEqual(['node 1', APART, MEET]);
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
    const positions = new Set<number>();
    for (const input of randomInputs(7, 80)) {
      const frames = traceOf(input);
      expect(frames.some((f) => f.predict)).toBe(true);
      seen.add(`result ${resultOf(frames)}`);
      if (resultOf(frames) === false)
        seen.add(frames[frames.length - 2].note.startsWith('fast is null') ? 'exit on null' : 'exit on last node');
      for (const f of frames.filter((g) => g.predict)) {
        const { choices, answer, explain } = f.predict!;
        positions.add(answer);
        if (isMeetQuestion(f)) seen.add(choices[answer] === MEET ? 'meet' : 'apart');
        else seen.add(choices[answer] === 'null' ? 'runs off' : explain.includes('links back') ? 'wraps' : 'plain');
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
    expect(positions.size).toBeGreaterThanOrEqual(3);
  });

  it('lays out every list size and back link with room between nodes, and edges that miss other nodes and badges', () => {
    const problems = Array.from({ length: 8 }, (_, k) => k + 1).flatMap((n) =>
      Array.from({ length: n }, (_, k) => k - 1).flatMap((pos) => layoutProblems(n, pos)),
    );
    expect(problems).toEqual([]);
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

  it('never shows an em dash', () => {
    const rand = mulberry32(1);
    const traces = [algo.defaultInput, ...Array.from({ length: 20 }, () => algo.randomInput(rand))].map(traceOf);
    expect(JSON.stringify([algo, traces])).not.toContain(EM_DASH);
  });
});
