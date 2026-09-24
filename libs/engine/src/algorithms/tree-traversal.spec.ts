import { describe, expect, it } from 'vitest';
import { formatField, mulberry32, parseField } from './input.js';
import { treeTraversal } from './tree-traversal.js';
import { InputError, type Frame } from './types.js';

type Input = ReturnType<typeof treeTraversal.validate>;

const ORDERS = ['preorder', 'inorder', 'postorder'] as const;

// Inserting values in order makes the first one the root, and the smaller and larger values form its subtrees in the same relative order.
const reference = ({ values, order }: Input): string => {
  const walk = (vals: number[]): number[] => {
    if (!vals.length) return [];
    const [root, ...rest] = vals;
    const left = walk(rest.filter((v) => v < root));
    const right = walk(rest.filter((v) => v > root));
    return order === 'preorder' ? [root, ...left, ...right] : order === 'inorder' ? [...left, root, ...right] : [...left, ...right, root];
  };
  return `[${walk(values).join(', ')}]`;
};

const randomInputs = (seed: number, count: number) => {
  const rand = mulberry32(seed);
  return Array.from({ length: count }, () => treeTraversal.randomInput(rand));
};

const traceOf = (input: unknown) => treeTraversal.trace(treeTraversal.validate(input));

const sampleInputs = (): Input[] => [
  ...ORDERS.map((order) => ({ ...treeTraversal.defaultInput, order })),
  ...randomInputs('tree-traversal'.length * 7919, 100),
];

function expectWellFormed(frames: Frame[]) {
  expect(frames.length).toBeGreaterThan(1);
  expect(frames.length).toBeLessThan(600);
  for (const f of frames) {
    expect(f.line).toBeGreaterThanOrEqual(1);
    expect(f.line).toBeLessThanOrEqual(treeTraversal.code.length);
    expect(f.note.length).toBeGreaterThan(0);
  }
  expect(frames[frames.length - 1].predict).toBeUndefined();
}

describe('tree-traversal', () => {
  it('traces the default BST inorder into sorted values and asks predictions', () => {
    const frames = traceOf(treeTraversal.defaultInput);
    expectWellFormed(frames);
    expect(frames[0].line).toBe(2);
    expect(frames[frames.length - 1].line).toBe(12);
    expect(frames[frames.length - 1].vars['result']).toBe('[1, 2, 3, 4, 5, 8, 9]');
    expect(frames.filter((f) => f.predict).length).toBeGreaterThanOrEqual(2);
    expect(frames[0].tree!.nodes).toHaveLength(15);
  });

  it.each(ORDERS)('matches the reference on the default tree in %s', (order) => {
    const input = { ...treeTraversal.defaultInput, order };
    const frames = traceOf(input);
    expectWellFormed(frames);
    expect(frames.some((f) => f.predict)).toBe(true);
    expect(frames[frames.length - 1].vars['result']).toBe(reference(input));
  });

  it('matches the reference on 300 seeded random inputs', () => {
    for (const input of randomInputs(42, 300)) {
      const frames = traceOf(input);
      expectWellFormed(frames);
      expect(frames[frames.length - 1].vars['result']).toBe(reference(treeTraversal.validate(input)));
    }
  });

  it('asks well-formed predictions that the following frames confirm', () => {
    for (const input of sampleInputs()) {
      const frames = traceOf(input);
      frames.forEach((f, i) => {
        if (!f.predict) return;
        const { prompt, choices, answer, explain } = f.predict;
        expect(choices.length).toBeGreaterThanOrEqual(2);
        expect(choices.length).toBeLessThanOrEqual(4);
        expect(new Set(choices).size).toBe(choices.length);
        expect(answer).toBeGreaterThanOrEqual(0);
        expect(answer).toBeLessThan(choices.length);
        expect(prompt.length).toBeGreaterThan(10);
        expect(explain.length).toBeGreaterThan(10);
        expect(prompt.toLowerCase()).toContain(input.order);

        const correct = Number(choices[answer]);
        if (prompt.endsWith('first time?')) {
          const entered = frames.slice(i + 1).find((g) => g.line === 4 && typeof g.vars['node'] === 'number');
          expect(entered?.vars['node']).toBe(correct);
        } else {
          expect(explain.toLowerCase()).toContain(input.order);
          const before = f.output!.items.length;
          const appended = frames.slice(i + 1).find((g) => g.output!.items.length > before);
          expect(appended?.output!.items[before]).toBe(correct);
        }
      });
    }
  });

  it('gives every random input at least one prediction, as review generation needs', () => {
    for (const input of randomInputs(7, 200)) expect(traceOf(input).some((f) => f.predict)).toBe(true);
  });

  it('varies its questions across random inputs', () => {
    const prompts = new Set(randomInputs(3, 40).flatMap((input) => traceOf(input).flatMap((f) => (f.predict ? [f.predict.prompt] : []))));
    expect(prompts.size).toBeGreaterThanOrEqual(5);
  });

  it('is deterministic for a given seed', () => {
    expect(randomInputs(99, 5)).toEqual(randomInputs(99, 5));
    for (const input of randomInputs(99, 5)) expect(traceOf(input)).toEqual(traceOf(input));
  });

  it('emits JSON-safe snapshots that never rewrite earlier frames', () => {
    for (const input of sampleInputs()) {
      const frames = traceOf(input);
      expect(JSON.parse(JSON.stringify(frames))).toEqual(frames);
      for (let i = 1; i < frames.length; i++) {
        const previous = frames[i - 1].output!.items;
        expect(frames[i].output!.items.slice(0, previous.length)).toEqual(previous);
      }
      for (const f of frames) {
        expect(f.tree!.nodes).toHaveLength(2 * input.values.length + 1);
        expect(f.tree!.nodes.filter((n) => n.state === 'active')).toHaveLength(f.stack!.items.length ? 1 : 0);
      }
    }
  });

  it('draws every value with a left child before a right child, using placeholders for null', () => {
    for (const input of sampleInputs()) {
      const { nodes } = traceOf(input)[0].tree!;
      for (const parent of nodes.filter((n) => n.label !== '·')) {
        const children = nodes.filter((n) => n.parent === parent.id);
        expect(children).toHaveLength(2);
        const [left, right] = children;
        expect(left.label === '·' ? left.id.endsWith('.left') : Number(left.label) < Number(parent.label)).toBe(true);
        expect(right.label === '·' ? right.id.endsWith('.right') : Number(right.label) > Number(parent.label)).toBe(true);
      }
    }
  });

  it('never shows an em dash', () => {
    const shown = [treeTraversal.title, treeTraversal.summary, ...treeTraversal.code, ...treeTraversal.fields.map((f) => f.hint ?? '')];
    for (const input of sampleInputs()) {
      for (const f of traceOf(input)) {
        shown.push(f.note);
        if (f.predict) shown.push(f.predict.prompt, f.predict.explain, ...f.predict.choices);
      }
    }
    expect(shown.filter((text) => text.includes('\u2014'))).toEqual([]);
  });
});

describe('tree-traversal input validation', () => {
  it('rejects bad inputs with InputError', () => {
    const bad = [
      null,
      { values: [], order: 'inorder' },
      { values: 'a, b', order: 'inorder' },
      { values: [1.5, 2], order: 'inorder' },
      { values: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], order: 'inorder' },
      { values: [3, 1, 3], order: 'inorder' },
      { values: [3, 1], order: 'sideways' },
      { values: [3, 1], order: 'order' },
      { values: [3, 1] },
    ];
    for (const input of bad) expect(() => treeTraversal.validate(input)).toThrow(InputError);
  });

  it('explains what is wrong', () => {
    expect(() => treeTraversal.validate({ values: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], order: 'inorder' })).toThrow('at most 9');
    expect(() => treeTraversal.validate({ values: [3, 1, 3], order: 'inorder' })).toThrow('distinct');
    expect(() => treeTraversal.validate({ values: [3, 1], order: 'level' })).toThrow('preorder, inorder or postorder');
  });

  it('accepts loose spellings of the order', () => {
    expect(treeTraversal.validate({ values: [2, 1], order: 'Pre-order' }).order).toBe('preorder');
    expect(treeTraversal.validate({ values: [2, 1], order: 'IN' }).order).toBe('inorder');
    expect(treeTraversal.validate({ values: [2, 1], order: ' post order ' }).order).toBe('postorder');
  });

  it('offers exactly the valid orders in its picker', () => {
    const order = treeTraversal.fields.find((f) => f.key === 'order')!;
    expect(order.options).toEqual([...ORDERS]);
    for (const option of order.options!) expect(treeTraversal.validate({ values: [2, 1], order: option }).order).toBe(option);
  });

  it('round-trips through the input fields and accepts API-style strings', () => {
    const drafts = treeTraversal.fields.map((f) => [
      f.key,
      parseField(f.kind, formatField(f.kind, treeTraversal.defaultInput[f.key as keyof Input])),
    ]);
    expect(treeTraversal.validate(Object.fromEntries(drafts))).toEqual(treeTraversal.defaultInput);
    expect(treeTraversal.validate({ values: '5 2 8', order: 'postorder' })).toEqual({ values: [5, 2, 8], order: 'postorder' });
  });
});
