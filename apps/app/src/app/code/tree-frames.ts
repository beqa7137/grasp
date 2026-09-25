import { buildTree, type LevelOrder, type NodeState, type TreeLegend, type TreeView } from '@grasp/engine';
import { describeSnap, snapshot, type Snap, type TraceStep, type TreeSnap } from './snapshot';

const LEGEND: Record<NodeState, string> = {
  active: 'a variable points here',
  frontier: 'waiting in a list',
  done: 'visited',
  idle: 'not visited yet',
};
const BLANK = '·';
const UNREACHED = '…';

type NodeStyle = Pick<TreeView['nodes'][number], 'state' | 'badge'>;

export const isTree = (snap: Snap | undefined): snap is TreeSnap => typeof snap === 'object' && snap !== null && snap.kind === 'tree';

/** The trees a list, set or map holds. */
function listed(snap: Snap): TreeSnap[] {
  if (typeof snap !== 'object' || snap === null) return [];
  const items = snap.kind === 'array' || snap.kind === 'set' ? snap.items : snap.kind === 'map' ? snap.entries.flat() : [];
  return items.filter(isTree);
}

/**
 * The tree from its root down, each node once. A node with one child gets a blank on its other side so left and right
 * read correctly; a child the snapshot did not reach is drawn as `…`.
 */
function draw(tree: TreeSnap, style: (id: number) => NodeStyle): TreeView['nodes'] {
  const byId = new Map(tree.nodes.map((node) => [node.id, node]));
  const nodes: TreeView['nodes'] = [];
  const drawn = new Set<number>();
  const add = (id: number, parent: string | null) => {
    if (drawn.has(id)) return;
    drawn.add(id);
    const node = byId.get(id);
    if (!node) {
      nodes.push({ id: `n${id}`, label: UNREACHED, parent });
      return;
    }
    nodes.push({ id: `n${id}`, label: describeSnap(node.val, 6), parent, ...style(id) });
    const oneChild = (node.left === null) !== (node.right === null);
    for (const [side, child] of [
      ['left', node.left],
      ['right', node.right],
    ] as const) {
      if (child !== null) add(child, `n${id}`);
      else if (oneChild) nodes.push({ id: `n${id}.${side}`, label: BLANK, parent: `n${id}`, blank: true });
    }
  };
  add(tree.nodes[0].id, null);
  return nodes;
}

/** An example's input tree, drawn plain; null for an empty tree. */
export function exampleTree(values: LevelOrder): TreeView | null {
  const snap = snapshot(buildTree(values));
  return isTree(snap) ? { nodes: draw(snap, () => ({ state: 'idle' })) } : null;
}

/** The parameter the problem names for the tree or, when the learner renamed it, the first tree the entry function was called with. */
function inputName(steps: TraceStep[], preferred?: string): string | undefined {
  if (preferred && steps.some((step) => isTree(step.vars[preferred]))) return preferred;
  const called = steps[0]?.vars ?? {};
  return Object.keys(called).find((name) => isTree(called[name]));
}

/**
 * For each step, the input tree drawn from the primary parameter, with the nodes variables point at, the nodes visited
 * earlier, and the nodes a list holds before any variable reaches them. The tree is kept from the first step, so it stays
 * whole while a helper recurses into subtrees; when the entry function recurses on the parameter itself, the parameter is
 * one more pointer.
 */
export function traceTrees(steps: TraceStep[], preferred?: string): (TreeView | undefined)[] {
  const primary = inputName(steps, preferred);
  const inputs = primary ? steps.map((step) => step.vars[primary]).filter(isTree) : [];
  if (!primary || !inputs.length) return steps.map(() => undefined);
  const rootId = inputs[0].nodes[0].id;
  const recurses = inputs.some((snap) => snap.nodes[0].id !== rootId);
  let base = inputs[0];
  const visited = new Set<number>();
  const shown = new Set<NodeState>();
  const views = steps.map((step): TreeView => {
    const own = step.vars[primary];
    if (isTree(own) && own.nodes[0].id === rootId) base = own;
    const pointers = new Map<number, string[]>();
    const waiting = new Set<number>();
    for (const [name, snap] of Object.entries(step.vars)) {
      if (isTree(snap) && (name !== primary || recurses)) pointers.set(snap.nodes[0].id, [...(pointers.get(snap.nodes[0].id) ?? []), name]);
      for (const item of listed(snap)) waiting.add(item.nodes[0].id);
    }
    const nodes = draw(base, (id) => {
      const state: NodeState = pointers.has(id) ? 'active' : visited.has(id) ? 'done' : waiting.has(id) ? 'frontier' : 'idle';
      shown.add(state);
      return { state, badge: pointers.get(id)?.join(', ') };
    });
    for (const id of pointers.keys()) visited.add(id);
    return { nodes };
  });
  const legend: TreeLegend = Object.fromEntries(Object.entries(LEGEND).filter(([state]) => shown.has(state as NodeState)));
  return views.map((view) => ({ ...view, legend }));
}
