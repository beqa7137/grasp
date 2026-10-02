import type { ComponentKind, Design, DesignNode } from './types.js';

/** The usual shape of a design, by how many of each part it has; parts left at zero are not on the board. */
export interface Stack {
  apps: number;
  shards: number;
  lbs?: number;
  caches?: number;
  replicas?: number;
  queues?: number;
  workers?: number;
  objectStore?: boolean;
  /** Workers write to the object store, and to the database unless this is `only`. */
  workersToStore?: boolean | 'only';
  /** `count` CDNs in a row, the last one in front of the load balancers. */
  cdn?: { hitRate: number; toStore?: boolean; count?: number };
}

const node = (id: string, kind: ComponentKind, instances = 1, extra: Partial<DesignNode> = {}): DesignNode => ({
  id,
  kind,
  x: 0,
  y: 0,
  instances,
  ...extra,
});

export function stack(s: Stack): Design {
  const nodes = [node('users', 'client'), node('app', 'app', s.apps), node('db', 'db', s.shards, { shardKey: 'hash' })];
  const edges: [string, string][] = [];
  let front = 'users';
  for (let i = (s.cdn?.count ?? 1) - 1; s.cdn && i >= 0; i--) {
    const id = i ? `cdn${i}` : 'cdn';
    nodes.push(node(id, 'cdn', 1, { hitRate: s.cdn.hitRate }));
    edges.push([front, id]);
    front = id;
  }
  if (s.lbs) {
    nodes.push(node('lb', 'lb', s.lbs));
    edges.push([front, 'lb'], ['lb', 'app']);
  } else edges.push([front, 'app']);
  if (s.caches) {
    nodes.push(node('cache', 'cache', s.caches));
    edges.push(['app', 'cache'], ['cache', 'db']);
  } else edges.push(['app', 'db']);
  if (s.objectStore || s.workersToStore || s.cdn?.toStore) nodes.push(node('objects', 'blob'));
  if (s.objectStore) edges.push(['app', 'objects']);
  if (s.cdn?.toStore) edges.push(['cdn', 'objects']);
  if (s.replicas) {
    nodes.push(node('replica', 'replica', s.replicas));
    edges.push(['db', 'replica']);
  }
  if (s.queues) {
    nodes.push(node('queue', 'queue', s.queues), node('worker', 'worker', s.workers ?? 1));
    edges.push(['app', 'queue'], ['queue', 'worker']);
    if (s.workersToStore !== 'only') edges.push(['worker', 'db']);
    if (s.workersToStore) edges.push(['worker', 'objects']);
  }
  return { nodes, edges: edges.map(([from, to]) => ({ from, to })) };
}

/** Reference designs for the missions built on the case studies, keyed `id` or `id:revisit`. */
export const CASE_MISSION_SOLUTIONS: Record<string, Design> = {
  'mail-attachments': stack({ lbs: 2, apps: 8, caches: 1, shards: 2, objectStore: true }),
  'mail-attachments:1': stack({ lbs: 2, apps: 12, shards: 2, objectStore: true }),
  'mail-attachments:2': stack({ lbs: 2, apps: 8, caches: 2, shards: 2, replicas: 2, objectStore: true }),
  'mail-attachments:3': stack({ lbs: 2, apps: 10, caches: 1, shards: 4, objectStore: true }),
  'ledger-month-end': stack({ lbs: 2, apps: 10, caches: 2, shards: 4, replicas: 4 }),
  'ledger-month-end:1': stack({ lbs: 2, apps: 14, caches: 2, shards: 5, replicas: 5 }),
  'ledger-month-end:2': stack({ lbs: 2, apps: 9, caches: 2, shards: 2, replicas: 2 }),
  'ledger-month-end:3': stack({ lbs: 2, apps: 9, caches: 2, shards: 5, replicas: 5 }),
  'reconnect-storm': stack({ lbs: 2, apps: 12, caches: 2, shards: 2, replicas: 2, queues: 2, workers: 2 }),
  'reconnect-storm:1': stack({ lbs: 2, apps: 17, caches: 2, shards: 1, replicas: 1, queues: 2, workers: 1 }),
  'reconnect-storm:2': stack({ lbs: 2, apps: 8, caches: 2, shards: 1, replicas: 1, queues: 2, workers: 1 }),
  'reconnect-storm:3': stack({ lbs: 2, apps: 15, caches: 2, shards: 1, replicas: 1, queues: 2, workers: 1 }),
};
