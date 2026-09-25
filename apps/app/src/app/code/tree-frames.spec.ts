import type { Frame } from '@grasp/engine';
import { traceJs } from './execute-js';
import { toFrames } from './trace-frames';
import { exampleTree } from './tree-frames';

const DIAMETER = `function diameterOfBinaryTree(root) {
  let best = 0;
  const height = (node) => {
    if (!node) return 0;
    const left = height(node.left);
    const right = height(node.right);
    best = Math.max(best, left + right);
    return 1 + Math.max(left, right);
  };
  height(root);
  return best;
}`;
const RECURSIVE = `function maxDepth(root) {
  if (!root) return 0;
  return 1 + Math.max(maxDepth(root.left), maxDepth(root.right));
}`;
const ITERATIVE = `function count(root) {
  const stack = [root];
  let n = 0;
  while (stack.length) {
    const node = stack.pop();
    if (!node) continue;
    n++;
    stack.push(node.left, node.right);
  }
  return n;
}`;
const MEMO = `function rob(root) {
  const memo = new Map();
  const order = [];
  const best = (node) => {
    if (!node) return 0;
    if (memo.has(node)) return memo.get(node);
    order.push(node);
    let take = node.val;
    if (node.left) take += best(node.left.left) + best(node.left.right);
    if (node.right) take += best(node.right.left) + best(node.right.right);
    const result = Math.max(take, best(node.left) + best(node.right));
    memo.set(node, result);
    return result;
  };
  return best(root);
}`;

const node = (frame: Frame, label: string) => frame.tree!.nodes.find((n) => n.label === label)!;

describe('trace trees', () => {
  it('draw the input tree once and mark the node each variable points at, then leave it visited', () => {
    const trace = traceJs(DIAMETER, 'javascript', 'diameterOfBinaryTree', ['tree'], [[1, 2, null, 3, 4]], 500);
    const frames = toFrames(trace.steps, { primary: 'root', returned: trace.returned });
    expect(frames[0].tree!.nodes.map((n) => n.label)).toEqual(['1', '2', '3', '4', '·']);
    expect(frames[0].array).toBeUndefined();
    expect(frames[0].note).toBe('Called with root = TreeNode(1)');
    const atThree = frames.find((f) => f.vars['node'] === 'TreeNode(3)')!;
    expect(node(atThree, '3')).toMatchObject({ state: 'active', badge: 'node' });
    expect(node(atThree, '1').state).toBe('done');
    expect(node(atThree, '4').state).toBe('idle');
    expect(frames.at(-1)!.note).toBe('Returned 2');
  });

  it('follow the parameter itself when the entry function recurses on it', () => {
    const trace = traceJs(RECURSIVE, 'javascript', 'maxDepth', ['tree'], [[1, 2, 3]], 500);
    const frames = toFrames(trace.steps, { primary: 'root', returned: trace.returned });
    expect(frames.some((f) => node(f, '2').state === 'active' && node(f, '2').badge === 'root')).toBe(true);
    expect(frames.every((f) => f.tree!.nodes.length === 3)).toBe(true);
  });

  it('mark the nodes waiting in a stack and draw the stack as a list', () => {
    const trace = traceJs(ITERATIVE, 'javascript', 'count', ['tree'], [[1, 2, 3]], 500);
    const frames = toFrames(trace.steps, { primary: 'root', returned: trace.returned });
    const waiting = frames.find((f) => node(f, '2').state === 'frontier')!;
    expect(waiting.stack?.label).toBe('stack');
    expect(waiting.tree!.legend).toMatchObject({ frontier: 'waiting in a list' });
  });

  it('leave a node visited, not waiting, once a memo or a result list holds it', () => {
    const trace = traceJs(MEMO, 'javascript', 'rob', ['tree'], [[3, 2, 3, null, 3, null, 1]], 500);
    const frames = toFrames(trace.steps, { primary: 'root', returned: trace.returned });
    expect(frames.at(-1)!.set).toMatchObject({
      label: 'memo',
      entries: ['TreeNode(3)→3', 'TreeNode(1)→1', 'TreeNode(2)→3', 'TreeNode(3)→3', 'TreeNode(3)→7'],
    });
    expect(frames.some((f) => node(f, '1').state === 'done')).toBe(true);
    expect(new Set(frames.flatMap((f) => f.tree!.nodes.map((n) => n.state)))).not.toContain('frontier');
    expect(frames[0].tree!.legend).not.toHaveProperty('frontier');
  });

  it('find the input tree when the learner renames the parameter', () => {
    const trace = traceJs(DIAMETER.replaceAll('root', 'tree'), 'javascript', 'diameterOfBinaryTree', ['tree'], [[1, 2, null, 3, 4]], 500);
    const frames = toFrames(trace.steps, { primary: 'root', returned: trace.returned });
    expect(frames[0].tree!.nodes.map((n) => n.label)).toEqual(['1', '2', '3', '4', '·']);
    const atThree = frames.find((f) => f.vars['node'] === 'TreeNode(3)')!;
    expect(node(atThree, '3')).toMatchObject({ state: 'active', badge: 'node' });
  });

  it("draw an example's level order with a blank on the empty side of a one-child node", () => {
    const tree = exampleTree([1, null, 2])!;
    expect(tree.nodes.map((n) => n.label)).toEqual(['1', '·', '2']);
    expect(tree.nodes.map((n) => !!n.blank)).toEqual([false, true, false]);
    expect(exampleTree([])).toBeNull();
  });
});
