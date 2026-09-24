import { describe, expect, it } from 'vitest';
import { mulberry32 } from './input.js';
import { treeTraversal } from './tree-traversal.js';
import { InputError, type Frame } from './types.js';

type Input = ReturnType<typeof treeTraversal.validate>;

const EM_DASH = '\u2014';
const ORDERS = ['preorder', 'inorder', 'postorder'] as const;

const randomInputs = (seed: number, count: number) => {
  const rand = mulberry32(seed);
  return Array.from({ length: count }, () => treeTraversal.randomInput(rand));
};

const traceOf = (input: unknown) => treeTraversal.trace(treeTraversal.validate(input));

const SAMPLES: Input[] = [
  ...ORDERS.map((order) => ({ ...treeTraversal.defaultInput, order })),
  ...randomInputs('tree-traversal'.length * 7919, 30),
];

/** Each answer is the node dfs enters or the value it appends next, and both prompt and append explanations name the order. */
const answersConfirmed = ({ order }: Input, frames: Frame[]) =>
  frames.every((f, i) => {
    if (!f.predict) return true;
    const { prompt, choices, answer, explain } = f.predict;
    const correct = Number(choices[answer]);
    if (!prompt.toLowerCase().includes(order)) return false;
    if (prompt.endsWith('first time?')) {
      return frames.slice(i + 1).find((g) => g.line === 4 && typeof g.vars['node'] === 'number')?.vars['node'] === correct;
    }
    const before = f.output!.items.length;
    const appended = frames.slice(i + 1).find((g) => g.output!.items.length > before);
    return explain.toLowerCase().includes(order) && appended?.output!.items[before] === correct;
  });

describe('tree-traversal', () => {
  it('traces the default BST inorder into sorted values and asks predictions', () => {
    const frames = traceOf(treeTraversal.defaultInput);
    expect(frames[0].line).toBe(2);
    expect(frames[frames.length - 1].line).toBe(12);
    expect(frames[frames.length - 1].vars['result']).toBe('[1, 2, 3, 4, 5, 8, 9]');
    expect(frames.filter((f) => f.predict).length).toBeGreaterThanOrEqual(2);
    expect(frames[0].tree!.nodes).toHaveLength(15);
  });

  it.each([
    ['preorder', '[5, 2, 1, 4, 3, 8, 9]'],
    ['inorder', '[1, 2, 3, 4, 5, 8, 9]'],
    ['postorder', '[1, 3, 4, 2, 9, 8, 5]'],
  ] as const)('walks the default tree in %s and asks something', (order, result) => {
    const frames = traceOf({ ...treeTraversal.defaultInput, order });
    expect(frames.some((f) => f.predict)).toBe(true);
    expect(frames[frames.length - 1].vars['result']).toBe(result);
  });

  it('asks predictions that the following frames confirm', () => {
    for (const input of SAMPLES) expect(answersConfirmed(input, traceOf(input))).toBe(true);
  });

  it('gives every random input at least one prediction, as review generation needs', () => {
    expect(randomInputs(7, 200).every((input) => traceOf(input).some((f) => f.predict))).toBe(true);
  });

  it('never rewrites out, and draws the whole tree with at most one running call', () => {
    for (const input of SAMPLES) {
      const frames = traceOf(input);
      const consistent = frames.every((f, i) => {
        const previous = i > 0 ? frames[i - 1].output!.items : [];
        const { nodes } = f.tree!;
        return (
          JSON.stringify(f.output!.items.slice(0, previous.length)) === JSON.stringify(previous) &&
          nodes.length === 2 * input.values.length + 1 &&
          nodes.filter((n) => n.state === 'active').length === (f.stack!.items.length ? 1 : 0)
        );
      });
      expect(consistent).toBe(true);
    }
  });

  it('draws every value with a left child before a right child, using placeholders for null', () => {
    for (const input of SAMPLES) {
      const { nodes } = traceOf(input)[0].tree!;
      const ordered = nodes
        .filter((n) => n.label !== '·')
        .every((parent) => {
          const children = nodes.filter((n) => n.parent === parent.id);
          const [left, right] = children;
          return (
            children.length === 2 &&
            (left.label === '·' ? left.id.endsWith('.left') : Number(left.label) < Number(parent.label)) &&
            (right.label === '·' ? right.id.endsWith('.right') : Number(right.label) > Number(parent.label))
          );
        });
      expect(ordered).toBe(true);
    }
  });

  it('never shows an em dash', () => {
    const rand = mulberry32(1);
    const traces = [treeTraversal.defaultInput, ...Array.from({ length: 20 }, () => treeTraversal.randomInput(rand))].map(traceOf);
    expect(JSON.stringify([treeTraversal, traces])).not.toContain(EM_DASH);
  });
});

describe('tree-traversal input validation', () => {
  it('rejects bad inputs with InputError', () => {
    const bad = [
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
});
