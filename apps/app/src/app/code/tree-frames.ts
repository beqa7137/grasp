import { buildTree, type LevelOrder, type NodeState, type TreeLegend, type TreeView } from '@grasp/engine';
import { describeSnap, isTree, snapshot, type Snap, type TraceStep, type TreeSnap } from './snapshot';

const LEGEND: Record<NodeState, string> = {
  active: 'a variable points here',
  frontier: 'waiting in a list',
  done: 'visited',
  idle: 'not visited yet',
};
const BLANK = '·';
const UNREACHED = '…';

type NodeStyle = Pick<TreeView['nodes'][number], 'state' | 'badge'>;

const idOf = (tree: TreeSnap) => tree.nodes[0].id;

function treesHeldBy(snap: Snap): TreeSnap[] {
  if (typeof snap !== 'object' || snap === null) return [];
  const items = snap.kind === 'array' || snap.kind === 'set' ? snap.items : snap.kind === 'map' ? snap.entries.flat() : [];
  return items.filter(isTree);
}

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
  add(idOf(tree), null);
  return nodes;
}

export function exampleTree(values: LevelOrder): TreeView | null {
  const snap = snapshot(buildTree(values));
  return isTree(snap) ? { nodes: draw(snap, () => ({ state: 'idle' })) } : null;
}

/** Falls back to the first tree argument when the learner renamed the parameter. */
function inputName(steps: TraceStep[], preferred?: string): string | undefined {
  if (preferred && steps.some((step) => isTree(step.vars[preferred]))) return preferred;
  const called = steps[0]?.vars ?? {};
  return Object.keys(called).find((name) => isTree(called[name]));
}

/**
 * The tree stays drawn from the first step's root while code recurses into subtrees; when the entry function recurses on
 * its own parameter, that parameter is one more pointer.
 */
export function traceTrees(steps: TraceStep[], preferred?: string): TreeView[] | undefined {
  const primary = inputName(steps, preferred);
  if (!primary) return undefined;
  const inputs = steps.map((step) => step.vars[primary]).filter(isTree);
  const rootId = idOf(inputs[0]);
  const recurses = inputs.some((snap) => idOf(snap) !== rootId);
  let base = inputs[0];
  const visited = new Set<number>();
  const shown = new Set<NodeState>();
  const nodesPerStep = steps.map((step) => {
    const own = step.vars[primary];
    if (isTree(own) && idOf(own) === rootId) base = own;
    const pointers = new Map<number, string[]>();
    const waiting = new Set<number>();
    for (const [name, snap] of Object.entries(step.vars)) {
      if (isTree(snap) && (name !== primary || recurses)) pointers.set(idOf(snap), [...(pointers.get(idOf(snap)) ?? []), name]);
      for (const item of treesHeldBy(snap)) waiting.add(idOf(item));
    }
    const nodes = draw(base, (id) => {
      const state: NodeState = pointers.has(id) ? 'active' : visited.has(id) ? 'done' : waiting.has(id) ? 'frontier' : 'idle';
      shown.add(state);
      return { state, badge: pointers.get(id)?.join(', ') };
    });
    for (const id of pointers.keys()) visited.add(id);
    return nodes;
  });
  const legend: TreeLegend = Object.fromEntries(Object.entries(LEGEND).filter(([state]) => shown.has(state as NodeState)));
  return nodesPerStep.map((nodes) => ({ nodes, legend }));
}
