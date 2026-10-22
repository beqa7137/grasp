import {
  BOARD,
  COMPONENTS,
  NODE_SIZE,
  fmt,
  routeEdges,
  type Design,
  type DesignNode,
  type RoleGlyph,
  type RoutePoint,
  type SimResult,
  type TraceHop,
  type Workload,
} from '@grasp/engine';
import { ROLE_NAMES, type SysGlyph } from '../../viz/kit/sys/glyphs';
import { sysNodeView, type SysNodeView } from '../../viz/kit/sys/node-view';
import { edgeWidth, pillWidth, type SysEdgeView } from '../../viz/kit/sys/sys-edge.component';

export interface PlacedNode extends SysNodeView {
  x: number;
  y: number;
  kind: Design['nodes'][number]['kind'];
}

export interface LabDiagram {
  nodes: PlacedNode[];
  edges: SysEdgeView[];
}

/** How many edges always show their rps pill (REDESIGN.md 4.6). */
const PINNED_PILLS = 3;
/** Below this a refusal is rounding, not traffic: no tail. */
const MIN_DROPPED_RPS = 0.5;
/** Length of the red tail a pill must leave clear on an edge whose target refuses traffic. */
const TAIL_ROOM = 48;
/** Room the "−1.0k rps dropped" label needs along its edge. */
const dropWidth = (rps: number) => `−${fmt(rps)} rps dropped`.length * 6.8 + 8;

/**
 * The board drawn on the diagram kit: node views with their glyph (a case's role glyph only on the node it was given
 * to, and only while that node is still its kind), and routed edges whose widths, dropped tails and tags come from the
 * simulator's result.
 */
export function labDiagram(
  design: Design,
  result: SimResult,
  workload: Workload,
  nameOf: (id: string) => string,
  roles: { glyphs: Readonly<Record<string, RoleGlyph>>; kinds: ReadonlyMap<string, string> } | null,
  selectedEdge: string | null,
): LabDiagram {
  const glyphOf = (id: string, kind: Design['nodes'][number]['kind']): SysGlyph => {
    const role = roles?.glyphs[id];
    return role && roles!.kinds.get(id) === kind ? role : kind;
  };
  const client = { rps: result.metrics.offeredRps, readRatio: workload.readRatio, botRps: workload.botRps ?? 0 };
  const nodes = design.nodes.map((n) => ({
    ...sysNodeView(n, result.nodes[n.id], nameOf(n.id), glyphOf(n.id, n.kind), client),
    x: n.x,
    y: n.y,
    kind: n.kind,
  }));

  const kinds = new Map(design.nodes.map((n) => [n.id, n.kind]));
  const routes = routeEdges(
    design.nodes.map((n) => ({ id: n.id, x: n.x, y: n.y, ...NODE_SIZE })),
    design.edges,
    { floor: BOARD.h, bounds: { x0: 0, y0: 0, x1: BOARD.w, y1: BOARD.h } },
  );
  const rpsOf = (from: string, to: string) => result.edges[`${from}->${to}`] ?? 0;
  // A target's refusals are shared over the edges into it by their traffic; its inflow would also count requests that
  // reach replicas through a database's edge, and overstate each share's base.
  const into = new Map<string, number>();
  for (const r of routes) into.set(r.to, (into.get(r.to) ?? 0) + rpsOf(r.from, r.to));
  const droppedOf = (r: (typeof routes)[number]) => {
    const rps = rpsOf(r.from, r.to);
    const share = rps > 0 ? ((result.nodes[r.to]?.rejectedRps ?? 0) * rps) / (into.get(r.to) ?? rps) : 0;
    return share >= MIN_DROPPED_RPS ? share : 0;
  };
  const max = Math.max(0, ...routes.map((r) => rpsOf(r.from, r.to)));
  // A pill pins only where its edge has a straight run long enough to hold it clear of both nodes.
  const room = (points: readonly RoutePoint[]) =>
    Math.max(...points.slice(1).map((p, i) => Math.hypot(p[0] - points[i][0], p[1] - points[i][1])));
  // A pill pins only where it also leaves the red tail of what the target refuses in view.
  const pillFits = (r: (typeof routes)[number], dropped: number) =>
    room(r.points) >= pillWidth(`${fmt(rpsOf(r.from, r.to))} rps`) + 16 + (dropped > 0 ? TAIL_ROOM : 0);
  const busiest = new Set(
    routes
      .filter((r) => rpsOf(r.from, r.to) > 0 && pillFits(r, droppedOf(r)))
      .sort((a, b) => rpsOf(b.from, b.to) - rpsOf(a.from, a.to))
      .slice(0, PINNED_PILLS)
      .map((r) => `${r.from}->${r.to}`),
  );
  const edges = routes.map((r): SysEdgeView => {
    const key = `${r.from}->${r.to}`;
    const rps = rpsOf(r.from, r.to);
    const droppedRps = droppedOf(r);
    const fits = pillFits(r, droppedRps);
    const to = kinds.get(r.to);
    return {
      key,
      from: r.from,
      to: r.to,
      d: r.d,
      mid: r.mid,
      points: r.points,
      rps,
      width: edgeWidth(rps, max),
      droppedRps,
      dropLabel: droppedRps > 0 && room(r.points) >= dropWidth(droppedRps),
      // A sequencer is on the order's synchronous path, not a hand-off for later.
      tag: to === 'replica' && kinds.get(r.from) === 'db' ? 'repl' : to === 'queue' && roles?.glyphs[r.to] !== 'sequencer' ? 'async' : null,
      pill: fits && (busiest.has(key) || key === selectedEdge),
      pillFits: fits,
    };
  });
  return { nodes, edges };
}

export interface TracePath {
  points: RoutePoint[];
  /** Index into `points` where each hop's node is reached. */
  at: number[];
}

/** The traced hops as one polyline along their routed edges. */
export function tracePath(hops: readonly TraceHop[], edges: readonly SysEdgeView[]): TracePath | null {
  if (hops.length < 2) return null;
  const points: RoutePoint[] = [];
  const at = [0];
  for (let i = 1; i < hops.length; i++) {
    const edge = edges.find((e) => e.from === hops[i - 1].id && e.to === hops[i].id);
    if (!edge) return null;
    points.push(...(points.length ? edge.points.slice(1) : edge.points));
    at.push(points.length - 1);
  }
  return { points, at };
}

/** A node's name: its role's label, else its kind's short name, numbered when the board has several unlabeled ones. */
export function nodeName(nodes: readonly DesignNode[], id: string): string {
  const node = nodes.find((n) => n.id === id);
  if (!node) return id;
  if (node.label) return node.label;
  const same = nodes.filter((n) => n.kind === node.kind && !n.label);
  const short = COMPONENTS[node.kind].short;
  return same.length > 1 ? `${short} ${same.indexOf(node) + 1}` : short;
}

/** What a screen reader hears for a node: its name, kind (and role), size and load. */
export function nodeLabel(n: DesignNode, name: string, role: RoleGlyph | undefined, result: SimResult, workload: Workload): string {
  const spec = COMPONENTS[n.kind];
  const kind = role ? `${spec.name} as ${ROLE_NAMES[role]}` : spec.name;
  const named = spec.short === kind ? name : `${name}, ${kind}`;
  if (n.kind === 'client')
    return `${named}, ${fmt(result.metrics.offeredRps)} requests per second, ${Math.round(workload.readRatio * 100)}% reads`;
  const unit = n.kind === 'db' ? 'shard' : 'instance';
  const size = `${n.instances} ${unit}${n.instances === 1 ? '' : 's'}${n.failed ? `, ${n.failed} down` : ''}`;
  const st = result.nodes[n.id];
  const util = Math.round(Math.min(9.99, st?.utilization ?? 0) * 100);
  const load = st?.status === 'down' ? 'down' : `${util}% utilized, ${Math.round(st?.latencyMs ?? 0)} ms`;
  return `${named}, ${size}, ${load}`;
}
