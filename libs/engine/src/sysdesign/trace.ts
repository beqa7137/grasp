import { hopMs } from './simulate.js';
import type { ComponentKind, Design, DesignEdge, DesignNode, SimResult } from './types.js';

export interface TraceHop {
  id: string;
  /** Network time to reach this node from the one before; 0 for the client. */
  networkMs: number;
  /** The node's own time as the simulator models it: service plus queueing wait. */
  nodeMs: number;
}

/** Where a request ends: a store answers or keeps it, and a queue acknowledges it. */
const ENDS: ComponentKind[] = ['db', 'replica', 'blob', 'queue'];

/**
 * One request down the busiest path (REDESIGN.md 4.6, Trace a request): from the busiest client, each step takes the
 * outgoing edge that carries the most traffic, until a store or queue, a node that is down, nowhere left to go, or a node
 * that answers more of the users' requests itself (a cache's or CDN's hits) than it sends down that edge, since the typical
 * request ends there.
 * Each hop's time is the simulator's own (`hopMs` and the node's `latencyMs`), so the total is that path's mean latency.
 */
export function traceRequest(design: Design, result: SimResult): TraceHop[] {
  const byId = new Map(design.nodes.map((n) => [n.id, n]));
  const clients = design.nodes.filter((n) => n.kind === 'client');
  const outRps = (id: string) => design.edges.reduce((sum, e) => sum + (e.from === id ? (result.edges[`${e.from}->${e.to}`] ?? 0) : 0), 0);
  let node = clients.reduce<(typeof clients)[number] | undefined>(
    (best, c) => (!best || outRps(c.id) > outRps(best.id) ? c : best),
    undefined,
  );
  if (!node) return [];
  const hops: TraceHop[] = [{ id: node.id, networkMs: 0, nodeMs: 0 }];
  const seen = new Set([node.id]);
  while (!ENDS.includes(node.kind) && result.nodes[node.id]?.status !== 'down') {
    const from: DesignNode = node;
    const next: DesignEdge | undefined = design.edges
      .filter((e) => e.from === from.id && !seen.has(e.to) && byId.has(e.to) && (result.edges[`${e.from}->${e.to}`] ?? 0) > 0)
      .sort((a, b) => (result.edges[`${b.from}->${b.to}`] ?? 0) - (result.edges[`${a.from}->${a.to}`] ?? 0))[0];
    if (!next) break;
    // Bots never stop at a cache or CDN, so only the bots this node itself absorbed (a limiter's blocks) leave its count.
    const here = result.nodes[from.id];
    const botsOut = design.edges.reduce((sum, e) => sum + (e.from === from.id ? (result.edgeBots[`${e.from}->${e.to}`] ?? 0) : 0), 0);
    const answered = here ? here.absorbedRps - Math.max(0, here.botRps - botsOut) : 0;
    const users = (result.edges[`${next.from}->${next.to}`] ?? 0) - (result.edgeBots[`${next.from}->${next.to}`] ?? 0);
    if (from.kind !== 'client' && answered >= users) break;
    node = byId.get(next.to)!;
    seen.add(node.id);
    const stats = result.nodes[node.id];
    hops.push({ id: node.id, networkMs: hopMs(from.kind, node.kind), nodeMs: stats?.status === 'down' ? 0 : (stats?.latencyMs ?? 0) });
  }
  return hops;
}
