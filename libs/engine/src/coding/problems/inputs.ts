import { distinctInts, randInt } from '../../algorithms/input.js';
import { TreeNode, levelOrder, type LevelOrder } from '../tree.js';

export const ints = (rand: () => number, n: number, lo: number, hi: number) => Array.from({ length: n }, () => randInt(rand, lo, hi));

export const distinctSorted = (rand: () => number, n: number, lo: number, hi: number) =>
  distinctInts(rand, n, lo, hi).sort((a, b) => a - b);

/** A position in the middle fifth of n, so a nested-loop search from either end is still quadratic when it gets there. */
export const nearMiddle = (rand: () => number, n: number) => randInt(rand, Math.floor(n * 0.4), Math.floor(n * 0.6));

/** A random tree of n ≥ 1 nodes: each new node takes a uniformly random free child slot, which keeps it shallow (about 40 levels for 10^5 nodes). */
export function randomTree(rand: () => number, n: number, lo: number, hi: number): LevelOrder {
  const root = new TreeNode(randInt(rand, lo, hi));
  const free: [TreeNode, 'left' | 'right'][] = [
    [root, 'left'],
    [root, 'right'],
  ];
  for (let size = 1; size < n; size++) {
    const k = randInt(rand, 0, free.length - 1);
    const [parent, side] = free[k];
    free[k] = free[free.length - 1];
    free.pop();
    const node = (parent[side] = new TreeNode(randInt(rand, lo, hi)));
    free.push([node, 'left'], [node, 'right']);
  }
  return levelOrder(root);
}
