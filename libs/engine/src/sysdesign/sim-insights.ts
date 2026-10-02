import { COMPONENTS } from './catalog.js';
import { fmt } from './format.js';
import { available, shardShares } from './shards.js';
import type { ComponentKind, Design, DesignNode, Insight, NodeStats, Workload } from './types.js';

const SPOF_KINDS: ComponentKind[] = ['limiter', 'lb', 'app', 'cache', 'queue'];

export function addInsights(
  design: Design,
  stats: Record<string, NodeStats>,
  insights: Insight[],
  workload: Workload,
  ctx: {
    backlogGrowth: number;
    bgFailures: number;
    volatileWrites: number;
    durableWrites: number;
    clients: number;
    clientFed: Set<string>;
    offeredBots: number;
    botsBlocked: number;
  },
) {
  if (ctx.clients === 0) {
    insights.push({
      severity: 'critical',
      title: 'No traffic source',
      detail: 'Add the Users node so requests have somewhere to come from.',
    });
  }

  for (const n of design.nodes) {
    const st = stats[n.id];
    const spec = COMPONENTS[n.kind];
    const pct = Math.round(st.utilization * 100);
    const hasLoad = st.loadOps > 0;

    if (st.status === 'down' && n.kind !== 'client') {
      insights.push({
        severity: hasLoad ? 'critical' : 'warning',
        nodeId: n.id,
        title: `${spec.name} is down`,
        detail: hasLoad
          ? `Every request routed here fails. Redundancy (2+ instances, or a replica for the database) lets traffic fail over.`
          : 'No traffic depends on it right now.',
      });
      continue;
    }

    if (st.status === 'overloaded') {
      insights.push({ severity: 'critical', nodeId: n.id, title: `${spec.name} overloaded (${pct}%)`, detail: overloadAdvice(n.kind, st) });
    } else if (st.status === 'hot' && !(n.kind === 'worker' && ctx.backlogGrowth > 0)) {
      insights.push({
        severity: 'warning',
        nodeId: n.id,
        title: `${spec.name} running hot (${pct}%)`,
        detail:
          'Queueing delay grows like 1/(1−ρ): at 80% utilization waits are 5× the service time, at 95% they are 20×. Keep headroom for spikes.',
      });
    }

    if (hasLoad && SPOF_KINDS.includes(n.kind) && available(n) === 1) {
      insights.push({
        severity: 'warning',
        nodeId: n.id,
        title: `Single point of failure: ${spec.name}`,
        detail: `Only one ${spec.short} instance. If it fails, everything behind it goes dark. Run at least 2.`,
      });
    }

    if (n.kind === 'db' && hasLoad) dbInsights(design, n, st, insights);
    const primaries = n.kind === 'replica' ? primariesOf(design, n.id) : 0;
    if (primaries > 1) {
      insights.push({
        severity: 'warning',
        nodeId: n.id,
        title: `One replica node copies ${primaries} primaries`,
        detail: 'A replica copies one primary, so this one is a standby for none of them. Give each primary its own replicas.',
      });
    }
  }

  if (ctx.backlogGrowth > 1) {
    insights.push({
      severity: 'warning',
      title: `Queue backlog growing ${fmt(ctx.backlogGrowth)} jobs/s`,
      detail:
        'Writes are accepted faster than workers drain them. Fine for a short spike; for sustained load add workers (and make sure the DB can take their writes).',
    });
  }
  if (ctx.bgFailures > 1) {
    insights.push({
      severity: 'critical',
      title: 'Background writes are failing',
      detail: `${fmt(ctx.bgFailures)} jobs/s fail downstream of the queue. They will be retried, but the backlog will keep growing.`,
    });
  }

  for (const n of design.nodes) {
    if (ctx.clientFed.has(n.id) && n.instances > 1) {
      insights.push({
        severity: 'warning',
        nodeId: n.id,
        title: `Users can only reach one of ${n.instances} app servers`,
        detail:
          'Clients connect to a single address, so the extra instances sit idle. Put a load balancer in front: it spreads traffic and stops sending requests to dead servers.',
      });
    }
  }
  const botsThrough = ctx.offeredBots - ctx.botsBlocked;
  const appBots = design.nodes.filter((n) => n.kind === 'app').reduce((sum, n) => sum + stats[n.id].botRps, 0);
  if (ctx.offeredBots > 0 && botsThrough > ctx.offeredBots * 0.5 && appBots > 0) {
    const appLoad = design.nodes.filter((n) => n.kind === 'app').reduce((sum, n) => sum + stats[n.id].loadOps, 0);
    insights.push({
      severity: 'warning',
      title: `Bots are ${Math.round((appBots / Math.max(1, appLoad)) * 100)}% of your app traffic`,
      detail:
        'Scrapers and credential stuffers request long-tail, cache-busting URLs, so every bot request misses the CDN and the cache and lands on the database. Stop them at the edge: a rate limiter rejects clients over quota with 429 before they cost you anything.',
    });
  }

  const hasCdn = design.nodes.some((n) => n.kind === 'cdn');
  if (!hasCdn && workload.readRatio >= 0.9 && workload.rps >= 20_000) {
    insights.push({
      severity: 'tip',
      title: 'Consider a CDN',
      detail:
        'Read-heavy traffic at this scale usually has cacheable content. A CDN removes it from your origin and cuts ~30 ms of round-trip for users.',
    });
  }
}

function primariesOf(design: Design, replicaId: string): number {
  return design.edges.filter((e) => e.to === replicaId && design.nodes.find((x) => x.id === e.from)?.kind === 'db').length;
}

function dbInsights(design: Design, n: DesignNode, st: NodeStats, insights: Insight[]) {
  // A replica copies one primary; old boards could link one to several, and then it stands by for none of them.
  const replicas = design.edges
    .filter((e) => e.from === n.id)
    .map((e) => design.nodes.find((x) => x.id === e.to))
    .filter((x) => x?.kind === 'replica' && primariesOf(design, x.id) === 1)
    .reduce((sum, r) => sum + available(r!), 0);
  const shards = n.instances;
  if (replicas < shards) {
    insights.push({
      severity: 'warning',
      nodeId: n.id,
      title: `Single point of failure: ${COMPONENTS.db.name}`,
      detail:
        shards === 1
          ? 'One primary with no replica: if it dies, you lose reads and writes until it is restored. Add a replica for failover.'
          : `${shards} shards but only ${replicas} replica${replicas === 1 ? '' : 's'}: a shard without a replica loses its keys when its primary dies. Give every shard a replica.`,
    });
  }
  if (!st.shards) return;

  const down = st.shards.filter((x) => x.down).length;
  if (down > 0 && down < shards) {
    const shares = shardShares(n.shardKey ?? 'hash', shards);
    const lost = shares.read.slice(shards - down).reduce((a, b) => a + b, 0);
    insights.push({
      severity: 'critical',
      nodeId: n.id,
      title: `${down} of ${shards} shards down`,
      detail: `Keys that live on a failed shard are unavailable until it is restored (~${Math.round(lost * 100)}% of reads fail). Other shards cannot take over their data; a per-shard replica can.`,
    });
  }

  const live = st.shards.filter((x) => !x.down).map((x) => x.utilization);
  const mean = live.reduce((a, b) => a + b, 0) / Math.max(1, live.length);
  const hottest = Math.max(0, ...live);
  if (live.length > 1 && hottest > 0.8 && hottest > mean * 1.5) {
    const key = n.shardKey ?? 'hash';
    insights.push({
      severity: hottest > 1 ? 'critical' : 'warning',
      nodeId: n.id,
      title: `Hot shard: one shard at ${Math.round(hottest * 100)}%, average ${Math.round(mean * 100)}%`,
      detail:
        key === 'time'
          ? 'Range-partitioning by created_at sends every new write to the newest shard while the others sit idle. Shard by a hash of a high-cardinality key (e.g. conversation_id) to spread writes.'
          : 'One tenant is 40% of all traffic, so its shard never drops below 40% of the load no matter how many shards you add. Shard by a key with more spread (a hash of conversation_id), or split the big tenant across shards.',
    });
  }
}

function overloadAdvice(kind: ComponentKind, st: NodeStats): string {
  switch (kind) {
    case 'app':
      return 'Scale horizontally: add instances. App servers are stateless, so any instance can serve any request.';
    case 'db': {
      const readShare = st.readRps / Math.max(1, st.loadOps);
      return readShare > 0.5
        ? `Reads are ${Math.round(readShare * 100)}% of DB load. Put a cache in front, or add read replicas.`
        : 'Writes dominate. You cannot replicate your way out of write load: buffer short spikes through a queue, and shard the data (add instances) for sustained write load.';
    }
    case 'replica':
      return 'Add more replicas, but remember each replica also replays every write.';
    case 'cache':
      return 'Add cache nodes (sharded by key) or raise the hit rate with longer TTLs.';
    case 'lb':
      return 'Add LB instances.';
    case 'limiter':
      return 'Add rate limiter instances; they share counters, so quotas stay per client.';
    case 'worker':
      return 'Add workers to drain the queue faster.';
    case 'queue':
      return 'Add queue partitions.';
    case 'blob':
      return 'Spread keys over more prefixes (object stores scale per prefix), or put a CDN in front for reads.';
    default:
      return 'Add capacity.';
  }
}

export function dedupe(list: Insight[]): Insight[] {
  const seen = new Set<string>();
  return list.filter((i) => {
    const k = `${i.nodeId ?? ''}|${i.title}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export function rank(list: Insight[]): Insight[] {
  const order = { critical: 0, warning: 1, tip: 2 } as const;
  return [...list].sort((a, b) => order[a.severity] - order[b.severity]);
}
