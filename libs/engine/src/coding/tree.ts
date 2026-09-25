export class TreeNode {
  val: number;
  left: TreeNode | null;
  right: TreeNode | null;

  constructor(val = 0, left: TreeNode | null = null, right: TreeNode | null = null) {
    this.val = val;
    this.left = left;
    this.right = right;
  }
}

/** A tree in LeetCode's level order: the nodes row by row, `null` for a missing child, no trailing nulls. The children of a missing node are not listed. */
export type LevelOrder = (number | null)[];

export function buildTree(values: LevelOrder): TreeNode | null {
  if (!values.length || values[0] === null) return null;
  const root = new TreeNode(values[0]);
  const queue = [root];
  for (let head = 0, i = 1; i < values.length; head++) {
    const parent = queue[head];
    for (const side of ['left', 'right'] as const) {
      const value = values[i++];
      if (value !== null && value !== undefined) queue.push((parent[side] = new TreeNode(value)));
    }
  }
  return root;
}

export function levelOrder(root: TreeNode | null): LevelOrder {
  const values: LevelOrder = [];
  const queue = [root];
  for (let head = 0; head < queue.length; head++) {
    const node = queue[head];
    values.push(node ? node.val : null);
    if (node) queue.push(node.left, node.right);
  }
  while (values.length && values[values.length - 1] === null) values.pop();
  return values;
}
