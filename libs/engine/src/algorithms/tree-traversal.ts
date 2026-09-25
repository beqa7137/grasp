import { InputError } from './types.js';
import { rotatedChoices } from './choices.js';
import { asNumbers } from './input.js';
import { randInt, shuffle } from './random.js';
import type { AlgorithmDefinition, Frame, NodeState, Prediction, TreeLegend, TreeView } from './types.js';

type Order = 'preorder' | 'inorder' | 'postorder';
type Side = 'left' | 'right';
type QuestionKind = 'append' | 'visit';
type Input = { values: number[]; order: Order };

interface TreeNode {
  val: number;
  left: TreeNode | null;
  right: TreeNode | null;
}

interface Call {
  node: TreeNode | null;
  id: string;
  side: Side | null;
}

/** The nearest waiting call that has not gone right yet, and the right child it will enter. */
interface Turn {
  at: TreeNode;
  right: TreeNode;
}

const ORDERS: Order[] = ['preorder', 'inorder', 'postorder'];
const MAX_NODES = 9;
const VALUE_POOL = Array.from({ length: 40 }, (_, i) => i + 1);
const EMPTY = '·';
const LEGEND: TreeLegend = { active: 'running', frontier: 'on the call stack', done: 'returned', idle: 'not visited yet' };

function asOrder(value: unknown): Order {
  const name = `${String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z]/g, '')
    .replace(/order$/, '')}order`;
  const order = ORDERS.find((o) => o === name);
  if (!order) throw new InputError('order must be preorder, inorder or postorder');
  return order;
}

function insert(node: TreeNode | null, val: number): TreeNode {
  if (!node) return { val, left: null, right: null };
  if (val < node.val) node.left = insert(node.left, val);
  else node.right = insert(node.right, val);
  return node;
}

function walk(node: TreeNode | null, order: Order, out: number[] = []): number[] {
  if (!node) return out;
  if (order === 'preorder') out.push(node.val);
  walk(node.left, order, out);
  if (order === 'inorder') out.push(node.val);
  walk(node.right, order, out);
  if (order === 'postorder') out.push(node.val);
  return out;
}

const label = (node: TreeNode | null) => (node ? String(node.val) : 'null');
const nodeId = (node: TreeNode | null, parentId: string, side: Side) => (node ? `n${node.val}` : `${parentId}.${side}`);

export const treeTraversal: AlgorithmDefinition<Input> = {
  code: [
    'function traverse(root, order) {',
    '  const out = [];',
    '  function dfs(node) {',
    '    if (!node) return; // base case',
    "    if (order === 'preorder') out.push(node.val);",
    '    dfs(node.left);',
    "    if (order === 'inorder') out.push(node.val);",
    '    dfs(node.right);',
    "    if (order === 'postorder') out.push(node.val);",
    '  }',
    '  dfs(root);',
    '  return out;',
    '}',
  ],
  fields: [
    { key: 'values', label: 'BST values', kind: 'numbers', hint: `Inserted in this order, distinct, up to ${MAX_NODES}` },
    { key: 'order', label: 'Order', kind: 'text', options: ORDERS },
  ],
  defaultInput: { values: [5, 2, 8, 1, 4, 9, 3], order: 'inorder' },

  randomInput(rand = Math.random) {
    const count = randInt(rand, 5, 8);
    const values = shuffle(rand, VALUE_POOL).slice(0, count);
    return { values, order: ORDERS[randInt(rand, 0, ORDERS.length - 1)] };
  },

  validate(input) {
    const raw = (input ?? {}) as Record<string, unknown>;
    const values = asNumbers(raw['values'], 'values');
    if (values.length > MAX_NODES) throw new InputError(`values can hold at most ${MAX_NODES} numbers`);
    if (new Set(values).size !== values.length) throw new InputError('values must be distinct: a BST holds each value once');
    return { values, order: asOrder(raw['order']) };
  },

  trace({ values, order }) {
    const frames: Frame[] = [];
    const root = values.reduce<TreeNode | null>(insert, null)!;
    const rootId = `n${root.val}`;
    const sequence = walk(root, order);
    const entryOrder = walk(root, 'preorder');
    const orderName = order[0].toUpperCase() + order.slice(1);
    const out: number[] = [];
    const stack: Call[] = [];
    const returned = new Set<string>();
    let enteredCount = 0;
    let lastKind: QuestionKind | null = null;
    // out.length and enteredCount at the last question of each kind: until they grow, asking again repeats the same answer.
    const askedAt: Record<QuestionKind, number> = { append: -1, visit: -1 };

    const stateOf = (id: string): NodeState => {
      if (stack.length && stack[stack.length - 1].id === id) return 'active';
      if (stack.some((c) => c.id === id)) return 'frontier';
      return returned.has(id) ? 'done' : 'idle';
    };
    const tree = (): TreeView => {
      const nodes: TreeView['nodes'] = [];
      const add = (node: TreeNode | null, id: string, parent: string | null) => {
        const position = node ? out.indexOf(node.val) + 1 : 0;
        nodes.push({
          id,
          label: node ? String(node.val) : EMPTY,
          parent,
          state: stateOf(id),
          badge: position ? `#${position}` : undefined,
        });
        if (!node) return;
        add(node.left, nodeId(node.left, id, 'left'), id);
        add(node.right, nodeId(node.right, id, 'right'), id);
      };
      add(root, rootId, null);
      return { nodes, legend: LEGEND };
    };
    const snap = (line: number, note: string, extra: Partial<Frame> = {}) => {
      const call = stack.length ? stack[stack.length - 1] : null;
      const node = call?.node ?? null;
      frames.push({
        line,
        note,
        vars: {
          order,
          node: node ? node.val : call ? 'null' : null,
          'node.left': node ? (node.left?.val ?? 'null') : null,
          'node.right': node ? (node.right?.val ?? 'null') : null,
          'stack depth': stack.length,
        },
        tree: tree(),
        stack: { label: 'call stack', items: stack.map((c) => `dfs(${label(c.node)})`) },
        output: { label: 'out', items: [...out] },
        ...extra,
      });
    };

    const pendingTurn = (): Turn | null => {
      for (let i = stack.length - 2; i >= 0; i--) {
        const at = stack[i].node!;
        if (stack[i + 1].side === 'left' && at.right) return { at, right: at.right };
      }
      return null;
    };

    const optionsFor = (prompt: string, answer: number, distractors: number[]) => {
      const options = rotatedChoices(prompt, String(answer), distractors.map(String));
      return options.choices.length > 1 ? options : null;
    };

    const appendReason = (x: TreeNode, answer: number, turn: Turn | null): string => {
      const waiting = stack.slice(0, -1).find((c) => c.node?.val === answer)?.node;
      if (waiting && order === 'inorder') {
        return `Returning unwinds to dfs(${answer}), the nearest call that was still busy with its left subtree. Inorder appends a node right after its left subtree, so ${answer} is next.`;
      }
      if (waiting) {
        const rightIsNull = waiting.left === x && !waiting.right;
        return `After dfs(${x.val}) returns, dfs(${answer}) has no subtree left to explore${rightIsNull ? ' (its right child is null)' : ''}. Postorder appends a node once both subtrees are done, so ${answer} is next.`;
      }
      const { at, right } = turn!;
      return order === 'preorder'
        ? `Returning unwinds to dfs(${at.val}), the nearest call that has not gone right yet. It calls dfs(${right.val}), and preorder appends a node the moment its call starts.`
        : `Returning unwinds to dfs(${at.val}), which now goes right into the subtree of ${right.val}. Postorder appends nothing there until a call has finished both subtrees, and ${answer} is the first to do so.`;
    };

    const appendQuestion = (x: TreeNode, caller: TreeNode, turn: Turn | null): Prediction | null => {
      if (out.length === askedAt.append || out.length === sequence.length) return null;
      const answer = sequence[out.length];
      const distractors = [caller.val, ...(turn ? [turn.right.val] : []), ...sequence.slice(out.length + 1)].filter(
        (v) => !out.includes(v),
      );
      const options = optionsFor(
        `${orderName}, out = [${out.join(', ')}]. dfs(${x.val}) is about to return to dfs(${caller.val}). Which value is appended next?`,
        answer,
        distractors,
      );
      if (!options) return null;
      askedAt.append = out.length;
      return {
        ...options,
        explain: appendReason(x, answer, turn),
      };
    };

    const visitQuestion = (x: TreeNode, caller: TreeNode, turn: Turn | null): Prediction | null => {
      if (!turn || enteredCount === askedAt.visit) return null;
      const answer = turn.right.val;
      const options = optionsFor(
        `${orderName}. dfs(${x.val}) is about to return to dfs(${caller.val}). Which node will dfs enter next for the first time?`,
        answer,
        entryOrder.slice(enteredCount),
      );
      if (!options) return null;
      askedAt.visit = enteredCount;
      return {
        ...options,
        explain: `Returning unwinds the stack to dfs(${turn.at.val}), the nearest call that has not gone right yet, so dfs(${answer}) is the next new call. Every order enters nodes in this same sequence; only the append line moves.`,
      };
    };

    const returnQuestion = (x: TreeNode, caller: TreeNode | null): Partial<Frame> => {
      if (!caller) return {};
      const turn = pendingTurn();
      // Preorder appends on entry, so "next new node" and "next appended value" would be the same question.
      const kinds: QuestionKind[] = order === 'preorder' ? ['append'] : lastKind === 'append' ? ['visit', 'append'] : ['append', 'visit'];
      for (const kind of kinds) {
        const predict = kind === 'append' ? appendQuestion(x, caller, turn) : visitQuestion(x, caller, turn);
        if (!predict) continue;
        lastKind = kind;
        return { predict };
      }
      return {};
    };

    const firstQuestion = (): Partial<Frame> => {
      const answer = sequence[0];
      const options = optionsFor(
        `${orderName} walk of this BST. dfs(${root.val}) is about to start. Which value is appended to out first?`,
        answer,
        [...ORDERS.map((o) => walk(root, o)[0]), ...entryOrder],
      );
      if (!options) return {};
      askedAt.append = 0;
      return {
        predict: {
          ...options,
          explain:
            order === 'preorder'
              ? `Preorder appends a node the moment its call starts, so the root ${answer} comes first.`
              : order === 'inorder'
                ? `Inorder appends a node only after its left subtree, so dfs first runs down the left edge. The leftmost node, ${answer}, is appended first.`
                : `Postorder appends a node only after both of its subtrees, so the first value has no children: ${answer}, the first leaf dfs reaches.`,
        },
      };
    };

    const dfs = (node: TreeNode | null, id: string, side: Side | null) => {
      stack.push({ node, id, side });
      if (!node) {
        snap(4, `No ${side} child here: dfs(null) hits the base case and returns at once.`);
        stack.pop();
        returned.add(id);
        return;
      }
      const v = node.val;
      enteredCount++;
      snap(4, `dfs(${v}): the node is not null, so the call goes on.`);
      if (order === 'preorder') {
        out.push(v);
        snap(5, `Preorder appends ${v} the moment its call starts.`);
      }
      snap(6, `Go left from ${v}: call dfs(${label(node.left)}).`);
      dfs(node.left, nodeId(node.left, id, 'left'), 'left');
      if (order === 'inorder') {
        out.push(v);
        snap(7, `Back at ${v} with its left subtree done. Inorder appends ${v} now, before its right subtree.`);
      }
      snap(
        8,
        order === 'inorder'
          ? `Go right from ${v}: call dfs(${label(node.right)}).`
          : `Back at ${v} with its left subtree done. Go right: call dfs(${label(node.right)}).`,
      );
      dfs(node.right, nodeId(node.right, id, 'right'), 'right');
      if (order === 'postorder') {
        out.push(v);
        snap(9, `Back at ${v} with both subtrees done. Postorder appends ${v} last.`);
      }
      const caller = stack.length > 1 ? stack[stack.length - 2].node : null;
      snap(
        10,
        caller ? `dfs(${v}) is done. Return to dfs(${caller.val}).` : `dfs(${v}) is done, and with it the whole tree.`,
        returnQuestion(node, caller),
      );
      stack.pop();
      returned.add(id);
    };

    snap(
      2,
      `Insert ${values.join(', ')} into a BST, then walk it in ${order}. Blue marks the running call, amber the calls waiting under it, green the calls that returned.`,
    );
    snap(
      11,
      `Start the recursion at the root, ${root.val}. The call stack always holds the path from the root down to the running call.`,
      firstQuestion(),
    );
    dfs(root, rootId, null);

    const result = `[${out.join(', ')}]`;
    snap(
      12,
      order === 'inorder'
        ? `Return ${result}: sorted, as inorder on a BST always is. Each node was entered and appended once, O(n), and the stack never held more than one root-to-leaf path, O(h).`
        : `Return ${result}. Each node was entered and appended once, O(n), and the stack never held more than one root-to-leaf path, O(h).`,
    );
    frames[frames.length - 1].vars['result'] = result;
    return frames;
  },
};
