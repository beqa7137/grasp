import type { ComponentKind, ComponentSpec, Design, DesignNode } from './types.js';

export const COMPONENTS: Record<ComponentKind, ComponentSpec> = {
  client: {
    kind: 'client',
    name: 'Users',
    short: 'Users',
    description: 'Traffic source. Requests cross the public internet (~40 ms RTT) unless they hit a nearby CDN edge (~10 ms).',
    capacityRps: Number.POSITIVE_INFINITY,
    baseLatencyMs: 0,
    monthlyCost: 0,
    maxInstances: 1,
    writeCost: 1,
    connectsTo: ['cdn', 'lb', 'app'],
  },
  cdn: {
    kind: 'cdn',
    name: 'CDN',
    short: 'CDN',
    description: 'Edge cache close to users. Serves cacheable reads without touching your origin; misses pay a ~30 ms trip back to origin.',
    capacityRps: 250_000,
    baseLatencyMs: 2,
    monthlyCost: 600,
    maxInstances: 1,
    writeCost: 1,
    hitRate: 0.5,
    connectsTo: ['lb', 'app'],
  },
  lb: {
    kind: 'lb',
    name: 'Load Balancer',
    short: 'LB',
    description: 'Spreads requests across app servers and removes unhealthy ones. Run 2+ to avoid a single point of failure.',
    capacityRps: 60_000,
    baseLatencyMs: 1,
    monthlyCost: 150,
    maxInstances: 4,
    writeCost: 1,
    connectsTo: ['app'],
  },
  app: {
    kind: 'app',
    name: 'App Servers',
    short: 'App',
    description: 'Stateless service tier. Scales horizontally: each instance handles ~2k RPS.',
    capacityRps: 2_000,
    baseLatencyMs: 12,
    monthlyCost: 220,
    maxInstances: 40,
    writeCost: 1,
    connectsTo: ['cache', 'db', 'queue'],
  },
  cache: {
    kind: 'cache',
    name: 'Cache (Redis)',
    short: 'Cache',
    description: 'In-memory key/value store. Hits return in ~1 ms; misses fall through to the database.',
    capacityRps: 100_000,
    baseLatencyMs: 1,
    monthlyCost: 350,
    maxInstances: 6,
    writeCost: 1,
    hitRate: 0.85,
    connectsTo: ['db'],
  },
  db: {
    kind: 'db',
    name: 'Primary DB',
    short: 'DB',
    description: 'Source of truth. ~5k ops/s; a write costs 2 ops (index + WAL). Add read replicas to offload reads. One primary per shard.',
    capacityRps: 5_000,
    baseLatencyMs: 6,
    monthlyCost: 1_100,
    maxInstances: 1,
    writeCost: 2,
    connectsTo: ['replica'],
  },
  replica: {
    kind: 'replica',
    name: 'Read Replicas',
    short: 'Replica',
    description: 'Asynchronous copies of the primary that serve reads. Every write is replayed on each replica (1 op), so replicas help reads, not writes.',
    capacityRps: 5_000,
    baseLatencyMs: 6,
    monthlyCost: 800,
    maxInstances: 8,
    writeCost: 2,
    connectsTo: [],
  },
  queue: {
    kind: 'queue',
    name: 'Message Queue',
    short: 'Queue',
    description: 'Durably accepts writes in ~3 ms and lets workers process them later. Absorbs spikes; backlog grows if workers are slower than inflow.',
    capacityRps: 150_000,
    baseLatencyMs: 3,
    monthlyCost: 300,
    maxInstances: 3,
    writeCost: 1,
    connectsTo: ['worker'],
  },
  worker: {
    kind: 'worker',
    name: 'Workers',
    short: 'Worker',
    description: 'Consume jobs from the queue and write to the database. Each drains ~1.5k jobs/s.',
    capacityRps: 1_500,
    baseLatencyMs: 20,
    monthlyCost: 180,
    maxInstances: 20,
    writeCost: 1,
    connectsTo: ['db'],
  },
};

export const PALETTE: ComponentKind[] = ['cdn', 'lb', 'app', 'cache', 'db', 'replica', 'queue', 'worker'];

export type ConnectCheck = { ok: true } | { ok: false; reason: string };

export function canConnect(design: Design, fromId: string, toId: string): ConnectCheck {
  const from = design.nodes.find((n) => n.id === fromId);
  const to = design.nodes.find((n) => n.id === toId);
  if (!from || !to) return { ok: false, reason: 'Unknown component' };
  if (from.id === to.id) return { ok: false, reason: 'A component cannot connect to itself' };
  if (!COMPONENTS[from.kind].connectsTo.includes(to.kind)) {
    const allowed = COMPONENTS[from.kind].connectsTo.map((k) => COMPONENTS[k].short).join(', ') || 'nothing';
    return { ok: false, reason: `${COMPONENTS[from.kind].short} can send traffic to: ${allowed}` };
  }
  if (design.edges.some((e) => e.from === fromId && e.to === toId)) return { ok: false, reason: 'Already connected' };
  if (reaches(design, toId, fromId)) return { ok: false, reason: 'That would create a cycle' };
  return { ok: true };
}

function reaches(design: Design, from: string, target: string): boolean {
  const stack = [from];
  const seen = new Set<string>();
  while (stack.length) {
    const id = stack.pop()!;
    if (id === target) return true;
    if (seen.has(id)) continue;
    seen.add(id);
    for (const e of design.edges) if (e.from === id) stack.push(e.to);
  }
  return false;
}

export function createNode(design: Design, kind: ComponentKind, x: number, y: number): DesignNode {
  const count = design.nodes.filter((n) => n.kind === kind).length;
  const spec = COMPONENTS[kind];
  return {
    id: `${kind}-${count + 1}-${Math.random().toString(36).slice(2, 6)}`,
    kind,
    x,
    y,
    instances: 1,
    ...(spec.hitRate !== undefined ? { hitRate: spec.hitRate } : {}),
  };
}

export function monthlyCost(design: Design): number {
  return design.nodes.reduce((sum, n) => sum + COMPONENTS[n.kind].monthlyCost * n.instances, 0);
}
