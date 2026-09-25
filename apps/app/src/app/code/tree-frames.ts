import { buildTree, type LevelOrder, type NodeState, type TreeLegend, type TreeView } from '@grasp/engine';
import { describeSnap, isTree, snapshot, type Snap, type TraceCall, type TraceStep, type TreeSnap } from './snapshot';

/** Why a node is frontier or done; the legend names only the reasons the trace shows. */
type Reason = 'stack' | 'list' | 'returned' | 'visited';

const FRONTIER: Record<string, string> = {
  stack: 'on the call stack',
  list: 'waiting in a list',
  'stack,list': 'on the call stack or in a list',
};
const DONE: Record<string, string> = { returned: 'returned', visited: 'visited', 'returned,visited': 'returned or visited' };
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

/** The preferred name when some step holds a tree under it, else the first tree variable of the first step. */
function inputName(steps: TraceStep[], preferred?: string): string | undefined {
  if (preferred && steps.some((step) => isTree(step.vars[preferred]))) return preferred;
  const called = steps[0]?.vars ?? {};
  return Object.keys(called).find((name) => isTree(called[name]));
}

/**
 * The tree stays drawn from the first step's root while code recurses into subtrees. A node is active while a variable
 * of the running code points at it, on the call stack while it is an argument of a call waiting beneath, and returned
 * once such a call has finished; a node only reached by a loop is visited. The entry call's own tree argument is the tree
 * itself, not a pointer, unless the entry function calls itself.
 */
export function traceTrees(steps: TraceStep[], calls: TraceCall[], preferred?: string): TreeView[] | undefined {
  const primary = inputName(steps, preferred);
  if (!primary) return undefined;
  const input = steps.map((step) => step.vars[primary]).find(isTree)!;
  const rootId = idOf(input);
  const entry = calls[steps[0].call];
  const entryRecurses = calls.some((call) => call.depth > 1 && call.name === entry.name);
  const isPointer = (name: string, call: TraceCall) => name !== primary || entryRecurses || (call !== entry && call.params.includes(name));

  const latest = new Map<number, TraceStep>();
  const argumentsOf = (id: number): number[] => {
    const call = calls[id];
    const vars = latest.get(id)?.vars ?? {};
    return call.params.flatMap((name) => (isTree(vars[name]) && isPointer(name, call) ? [idOf(vars[name] as TreeSnap)] : []));
  };
  // Only nodes a drawn tree holds can be marked, so a deep recursion's calls each copy at most those.
  const drawable = new Set<number>();
  for (const step of steps) {
    const tree = step.vars[primary];
    if (isTree(tree) && idOf(tree) === rootId) for (const node of tree.nodes) drawable.add(node.id);
  }
  const heldBelow = new Map<number, Set<number>>();
  const waitingBelow = (id: number): Set<number> => {
    let held = heldBelow.get(id);
    if (!held) {
      const caller = calls[id].caller;
      held = caller === null ? new Set() : new Set([...waitingBelow(caller), ...argumentsOf(caller).filter((node) => drawable.has(node))]);
      heldBelow.set(id, held);
    }
    return held;
  };

  let base = input;
  const reached = new Set<number>();
  const argumentNodes = new Set<number>();
  const shown = new Set<NodeState>();
  const reasons = new Set<Reason>();
  const nodesPerStep = steps.map((step) => {
    latest.set(step.call, step);
    const call = calls[step.call];
    const own = step.vars[primary];
    if (isTree(own) && idOf(own) === rootId) base = own;
    const pointers = new Map<number, string[]>();
    const listed = new Set<number>();
    for (const [name, snap] of Object.entries(step.vars)) {
      if (isTree(snap) && isPointer(name, call)) pointers.set(idOf(snap), [...(pointers.get(idOf(snap)) ?? []), name]);
      for (const item of treesHeldBy(snap)) listed.add(idOf(item));
    }
    for (const id of argumentsOf(step.call)) argumentNodes.add(id);
    const onStack = waitingBelow(step.call);
    const nodes = draw(base, (id) => {
      let state: NodeState = 'idle';
      let reason: Reason | undefined;
      if (pointers.has(id)) state = 'active';
      else if (onStack.has(id)) [state, reason] = ['frontier', 'stack'];
      else if (reached.has(id)) [state, reason] = ['done', argumentNodes.has(id) ? 'returned' : 'visited'];
      else if (listed.has(id)) [state, reason] = ['frontier', 'list'];
      shown.add(state);
      if (reason) reasons.add(reason);
      return { state, badge: pointers.get(id)?.join(', ') };
    });
    for (const id of pointers.keys()) reached.add(id);
    return nodes;
  });
  const named = (table: Record<string, string>, kinds: Reason[]) => table[kinds.filter((k) => reasons.has(k)).join(',')];
  const labels: Record<NodeState, string> = {
    active: 'a variable points here',
    frontier: named(FRONTIER, ['stack', 'list']),
    done: named(DONE, ['returned', 'visited']),
    idle: 'not visited yet',
  };
  const legend: TreeLegend = Object.fromEntries(Object.entries(labels).filter(([state]) => shown.has(state as NodeState)));
  return nodesPerStep.map((nodes) => ({ nodes, legend }));
}
