import { describe, expect, it } from 'vitest';
import { buildTree, levelOrder } from './tree.js';

describe('level-order trees', () => {
  it('link the nodes row by row, listing no children under a missing node', () => {
    const root = buildTree([1, 2, 3, null, 4, null, 5, 6])!;
    expect(root.left!.left).toBeNull();
    expect(root.left!.right!.val).toBe(4);
    expect(root.right!.left).toBeNull();
    expect(root.right!.right!.val).toBe(5);
    expect(root.left!.right!.left!.val).toBe(6);
  });

  it('read back in canonical form: no trailing nulls, and an empty list for an empty tree', () => {
    expect(levelOrder(buildTree([1, 2, 3, null, 4, null, 5, 6]))).toEqual([1, 2, 3, null, 4, null, 5, 6]);
    expect(levelOrder(buildTree([1, null, 2, null, null]))).toEqual([1, null, 2]);
    expect(buildTree([])).toBeNull();
    expect(levelOrder(null)).toEqual([]);
  });
});
