import { COMPONENTS, monthlyCost } from './catalog.js';
import type {
  ComponentKind,
  Design,
  DesignNode,
  Insight,
  NodeStats,
  NodeStatus,
  ShardKey,
  ShardStats,
  SimResult,
  Workload,
} from './types.js';

interface Flow {
  read: number;
  write: number;
  bg: number;
  repl: number;
  bot: number;
}

type ReqType = 'read' | 'write';
type Forwarded = ReqType | 'bot';

interface Branch {
  id: string;
  frac: number;
  extraMs: number;
}

interface Route {
  terminal: number;
  kids: Branch[];
}

interface PathOutcome {
  p: number;
  base: number;
  wait: number;
  waitSq: number;
}

const SATURATION = 0.97;
const JITTER = 0.05;
const EDGE_MS = 0.5;
const INTERNET_RTT_MS = 40;
const EDGE_RTT_MS = 10;
const CDN_ORIGIN_MS = 30;
const REPLICATION_COST = 1;
const SPOF_KINDS: ComponentKind[] = ['limiter', 'lb', 'app', 'cache', 'queue'];
/** Share of bot traffic a rate limiter rejects; the rest stays under quota by spreading over many IPs. */
export const BOT_BLOCK_RATE = 0.98;
const TENANT_SHARE = 0.4;
const TIME_RECENT_READS = 0.6;

const zero = (): Flow => ({ read: 0, write: 0, bg: 0, repl: 0, bot: 0 });
const total = (f: Flow) => f.read + f.write + f.bg + f.repl + f.bot;

/** Fraction of reads and writes each shard receives under a shard key, hottest shard first. */
export function shardShares(key: ShardKey, shards: number): { read: number[]; write: number[] } {
  if (shards <= 1) return { read: [1], write: [1] };
  const rest = (share: number) => Array.from({ length: shards - 1 }, () => (1 - share) / (shards - 1));
  switch (key) {
    case 'hash': {
      const even = Array.from({ length: shards }, () => 1 / shards);
      return { read: even, write: [...even] };
    }
    case 'time':
      return { read: [TIME_RECENT_READS, ...rest(TIME_RECENT_READS)], write: [1, ...rest(1)] };
    case 'tenant': {
      const shares = [TENANT_SHARE, ...rest(TENANT_SHARE)].sort((x, y) => y - x);
      return { read: shares, write: [...shares] };
    }
  }
}

export function available(node: DesignNode): number {
  return Math.max(0, node.instances - (node.failed ?? 0));
}

export function simulate(design: Design, workload: Workload): SimResult {
  const byId = new Map(design.nodes.map((n) => [n.id, n]));
  const kidsOf = new Map<string, DesignNode[]>();
  const indegree = new Map<string, number>();
  for (const n of design.nodes) {
    kidsOf.set(n.id, []);
    indegree.set(n.id, 0);
  }
  for (const e of design.edges) {
    const to = byId.get(e.to);
    if (!to || !byId.has(e.from)) continue;
    kidsOf.get(e.from)!.push(to);
    indegree.set(e.to, indegree.get(e.to)! + 1);
  }

  const inflow = new Map<string, Flow>(design.nodes.map((n) => [n.id, zero()]));
  const edgeRps: Record<string, number> = {};
  const stats: Record<string, NodeStats> = {};
  const servedFrac = new Map<string, Record<ReqType, number>>();
  const routes = new Map<string, Record<ReqType, Route>>();
  const ownWait = new Map<string, number>();
  const insights: Insight[] = [];

  let syncErrors = 0;
  let backlogGrowth = 0;
  let queueDrain = 0;
  let bgFailures = 0;
  let durableWrites = 0;
  let volatileWrites = 0;
  let botsBlocked = 0;

  const clients = design.nodes.filter((n) => n.kind === 'client');
  const offeredRead = workload.rps * workload.readRatio;
  const offeredWrite = workload.rps - offeredRead;
  const offeredBots = workload.botRps ?? 0;
  for (const c of clients) {
    const f = inflow.get(c.id)!;
    f.read += offeredRead / clients.length;
    f.write += offeredWrite / clients.length;
    f.bot += offeredBots / clients.length;
  }

  const send = (from: DesignNode, to: DesignNode, flow: Partial<Flow>) => {
    const target = inflow.get(to.id)!;
    target.read += flow.read ?? 0;
    target.write += flow.write ?? 0;
    target.bg += flow.bg ?? 0;
    target.repl += flow.repl ?? 0;
    target.bot += flow.bot ?? 0;
    const key = `${from.id}->${to.id}`;
    edgeRps[key] = (edgeRps[key] ?? 0) + (flow.read ?? 0) + (flow.write ?? 0) + (flow.bg ?? 0) + (flow.repl ?? 0) + (flow.bot ?? 0);
  };

  const weights = (targets: DesignNode[]) => {
    const live = targets.map(available);
    const sum = live.reduce((a, b) => a + b, 0);
    if (sum > 0) return live.map((w) => w / sum);
    const all = targets.map((t) => t.instances);
    const allSum = all.reduce((a, b) => a + b, 0) || 1;
    return all.map((w) => w / allSum);
  };

  const hopMs = (from: DesignNode, to: DesignNode) => {
    if (from.kind === 'client') return to.kind === 'cdn' ? EDGE_RTT_MS : INTERNET_RTT_MS;
    if (from.kind === 'cdn') return CDN_ORIGIN_MS;
    return EDGE_MS;
  };

  const order = topoOrder(design.nodes, kidsOf, indegree);
  // Without a load balancer, clients resolve a single address: only one app instance ever sees traffic.
  const clientFed = new Set(
    design.edges.filter((e) => byId.get(e.from)?.kind === 'client' && byId.get(e.to)?.kind === 'app').map((e) => e.to),
  );

  for (const node of order) {
    const spec = COMPONENTS[node.kind];
    const f = inflow.get(node.id)!;
    const avail = clientFed.has(node.id) ? Math.min(1, available(node)) : available(node);
    const capacity = node.kind === 'client' ? Number.POSITIVE_INFINITY : avail * spec.capacityRps;
    const load = f.read + f.bot + (f.write + f.bg) * spec.writeCost + f.repl * REPLICATION_COST;
    const pressure = node.kind === 'db' ? shardPressure(node, f) : poolPressure(spec.baseLatencyMs, load, capacity);
    const { utilization, latencyMs } = pressure;
    const sRead = pressure.servedRead;
    const sWrite = pressure.servedWrite;
    const served: Flow = { read: f.read * sRead, write: f.write * sWrite, bg: f.bg * sWrite, repl: f.repl * sWrite, bot: f.bot * sRead };
    const dropped = total(f) - total(served);
    syncErrors += f.read * (1 - sRead) + f.write * (1 - sWrite);
    bgFailures += f.bg * (1 - sWrite);

    ownWait.set(node.id, latencyMs - spec.baseLatencyMs);
    servedFrac.set(node.id, { read: sRead, write: sWrite });

    let status: NodeStatus = 'idle';
    if (node.kind !== 'client' && avail === 0) status = 'down';
    else if (utilization > 1 + 1e-9) status = 'overloaded';
    else if (utilization > 0.8) status = 'hot';
    else if (total(f) > 0) status = 'ok';

    const kids = kidsOf.get(node.id)!;
    const route: Record<ReqType, Route> = { read: { terminal: 0, kids: [] }, write: { terminal: 0, kids: [] } };
    let absorbed = 0;
    let unrouted = 0;
    let unroutedBots = 0;

    const forward = (type: Forwarded, amount: number, targets: DesignNode[], base: number) => {
      if (amount <= 0 || base <= 0) return;
      if (targets.length === 0) {
        if (type === 'bot') unroutedBots += amount;
        else unrouted += amount;
        return;
      }
      const readLike = type !== 'write';
      const track = (id: string, frac: number, extraMs: number) => {
        if (type !== 'bot') route[type].kids.push({ id, frac, extraMs });
      };
      const w = weights(targets);
      targets.forEach((t, i) => {
        const share = amount * w[i];
        const replicas = readLike && t.kind === 'db' ? kidsOf.get(t.id)!.filter((k) => k.kind === 'replica') : [];
        const slots = replicas.reduce((sum, r) => sum + available(r), 0);
        if (slots === 0) {
          send(node, t, { [type]: share });
          track(t.id, share / base, hopMs(node, t));
          return;
        }
        // Read routing (driver/proxy) spreads reads over every primary (one per shard) and the live replicas.
        const primary = (share * t.instances) / (t.instances + slots);
        send(node, t, { [type]: primary });
        track(t.id, primary / base, hopMs(node, t));
        for (const r of replicas) {
          const part = (share - primary) * (available(r) / slots);
          if (part <= 0) continue;
          send(t, r, { [type]: part });
          edgeRps[`${node.id}->${t.id}`] = (edgeRps[`${node.id}->${t.id}`] ?? 0) + part;
          track(r.id, part / base, hopMs(node, t));
        }
      });
    };
    const terminate = (type: ReqType, amount: number, base: number) => {
      if (amount <= 0 || base <= 0) return;
      absorbed += amount;
      route[type].terminal += amount / base;
    };
    const ofKind = (...kinds: ComponentKind[]) => kids.filter((k) => kinds.includes(k.kind));

    const forwardBots = (targets: DesignNode[]) => forward('bot', served.bot, targets, served.bot);
    const absorbBots = () => {
      absorbed += served.bot;
    };

    // Bots request long-tail and cache-busting URLs, so they miss the CDN and the cache every time.
    switch (node.kind) {
      case 'client':
      case 'lb':
        forward('read', served.read, kids, served.read);
        forward('write', served.write, kids, served.write);
        forwardBots(kids);
        break;
      case 'cdn': {
        const h = node.hitRate ?? spec.hitRate ?? 0;
        terminate('read', served.read * h, served.read);
        forward('read', served.read * (1 - h), kids, served.read);
        forward('write', served.write, kids, served.write);
        forwardBots(kids);
        break;
      }
      case 'limiter': {
        const blocked = served.bot * BOT_BLOCK_RATE;
        botsBlocked += blocked;
        absorbed += blocked;
        forward('read', served.read, kids, served.read);
        forward('write', served.write, kids, served.write);
        forward('bot', served.bot - blocked, kids, served.bot - blocked);
        break;
      }
      case 'app': {
        const readTargets = ofKind('cache').length ? ofKind('cache') : ofKind('db');
        const writeTargets = ofKind('queue').length ? ofKind('queue') : ofKind('db').length ? ofKind('db') : ofKind('cache');
        if (readTargets.length) {
          forward('read', served.read, readTargets, served.read);
          forwardBots(readTargets);
        } else {
          terminate('read', served.read, served.read);
          absorbBots();
        }
        if (writeTargets.length) forward('write', served.write, writeTargets, served.write);
        else {
          terminate('write', served.write, served.write);
          volatileWrites += served.write;
        }
        if ((!readTargets.length || !writeTargets.length) && total(f) > 0) {
          insights.push({
            severity: 'warning',
            nodeId: node.id,
            title: 'App servers have no data store',
            detail: 'Requests end at the app tier, so nothing is persisted. Connect the app to a database (or a cache in front of one).',
          });
        }
        break;
      }
      case 'cache': {
        const h = node.hitRate ?? spec.hitRate ?? 0;
        terminate('read', served.read * h, served.read);
        forward('read', served.read * (1 - h), ofKind('db'), served.read);
        forward('write', served.write, ofKind('db'), served.write);
        forwardBots(ofKind('db'));
        break;
      }
      case 'db': {
        const replicas = ofKind('replica');
        terminate('read', served.read, served.read);
        terminate('write', served.write, served.write);
        durableWrites += served.write;
        absorbed += served.bg;
        absorbBots();
        for (const r of replicas) send(node, r, { repl: served.write + served.bg });
        break;
      }
      case 'replica':
        terminate('read', served.read, served.read);
        absorbed += served.repl;
        absorbBots();
        break;
      case 'queue': {
        terminate('read', served.read, served.read);
        absorbBots();
        terminate('write', served.write, served.write);
        durableWrites += served.write;
        const workers = ofKind('worker');
        const drainCapacity = workers.reduce((sum, w) => sum + available(w) * COMPONENTS.worker.capacityRps, 0);
        const incoming = served.write + served.bg;
        const drain = Math.min(incoming, drainCapacity);
        queueDrain += drainCapacity;
        backlogGrowth += incoming - drain;
        if (drain > 0) {
          const w = weights(workers);
          workers.forEach((t, i) => send(node, t, { bg: drain * w[i] }));
        }
        break;
      }
      case 'worker': {
        const dbs = ofKind('db');
        if (dbs.length) {
          const w = weights(dbs);
          dbs.forEach((t, i) => send(node, t, { bg: served.bg * w[i] }));
        } else if (served.bg > 0) {
          bgFailures += served.bg;
          insights.push({
            severity: 'critical',
            nodeId: node.id,
            title: 'Workers have nowhere to write',
            detail: 'Jobs are consumed but never persisted. Connect the workers to the primary database.',
          });
        }
        break;
      }
    }

    if (unrouted > 0) {
      syncErrors += unrouted;
      insights.push({
        severity: 'critical',
        nodeId: node.id,
        title: `${spec.short} has nowhere to send traffic`,
        detail: `${fmt(unrouted)} RPS reach ${spec.name} but no downstream component can handle them, so they fail.`,
      });
    }

    routes.set(node.id, route);
    stats[node.id] = {
      readRps: f.read,
      writeRps: f.write,
      backgroundRps: f.bg,
      replicationRps: f.repl,
      botRps: f.bot,
      loadOps: load,
      capacityOps: capacity,
      utilization: Number.isFinite(utilization) ? utilization : 99,
      latencyMs,
      droppedRps: dropped + unrouted + unroutedBots,
      absorbedRps: absorbed,
      status,
      ...(pressure.shards ? { shards: pressure.shards } : {}),
    };
  }

  for (const n of design.nodes) {
    if (!stats[n.id]) {
      stats[n.id] = {
        readRps: 0,
        writeRps: 0,
        backgroundRps: 0,
        replicationRps: 0,
        botRps: 0,
        loadOps: 0,
        capacityOps: available(n) * COMPONENTS[n.kind].capacityRps,
        utilization: 0,
        latencyMs: COMPONENTS[n.kind].baseLatencyMs,
        droppedRps: 0,
        absorbedRps: 0,
        status: available(n) === 0 && n.kind !== 'client' ? 'down' : 'idle',
      };
    }
  }

  const collect = (type: ReqType): PathOutcome[] => {
    const out: PathOutcome[] = [];
    const walk = (id: string, p: number, base: number, wait: number, waitSq: number, depth: number) => {
      const node = byId.get(id)!;
      const pp = p * (servedFrac.get(id)?.[type] ?? 0);
      if (pp < 1e-9 || depth > 32) return;
      const own = ownWait.get(id) ?? 0;
      const b = base + COMPONENTS[node.kind].baseLatencyMs;
      const w = wait + own;
      const w2 = waitSq + own * own;
      const r = routes.get(id)?.[type];
      if (!r) return;
      if (r.terminal > 0) out.push({ p: pp * r.terminal, base: b, wait: w, waitSq: w2 });
      for (const k of r.kids) walk(k.id, pp * k.frac, b + k.extraMs, w, w2, depth + 1);
    };
    for (const c of clients) walk(c.id, 1 / clients.length, 0, 0, 0, 0);
    return out;
  };

  const readPaths = collect('read');
  const writePaths = collect('write');
  const weighted = [
    ...readPaths.map((o) => ({ ...o, p: o.p * workload.readRatio })),
    ...writePaths.map((o) => ({ ...o, p: o.p * (1 - workload.readRatio) })),
  ];

  const offered = clients.length ? workload.rps : 0;
  const successRps = Math.max(0, offered - syncErrors);
  const errorRate = offered > 0 ? Math.min(1, syncErrors / offered) : 1;

  addInsights(design, stats, insights, workload, {
    backlogGrowth,
    bgFailures,
    volatileWrites,
    durableWrites,
    clients: clients.length,
    clientFed,
    offeredBots,
    botsBlocked,
  });

  return {
    nodes: stats,
    edges: edgeRps,
    metrics: {
      offeredRps: offered,
      successRps,
      errorRate,
      p50Ms: percentile(weighted, 0.5),
      p99Ms: percentile(weighted, 0.99),
      readP99Ms: percentile(readPaths, 0.99),
      writeP99Ms: percentile(writePaths, 0.99),
      monthlyCost: monthlyCost(design),
      backlogGrowthPerSec: backlogGrowth,
      queueDrainRps: queueDrain,
      durableWriteRatio: durableWrites + volatileWrites > 0 ? durableWrites / (durableWrites + volatileWrites) : 1,
      botRps: clients.length ? offeredBots : 0,
      botsBlockedRps: botsBlocked,
    },
    insights: rank(dedupe(insights)),
  };
}

interface Pressure {
  utilization: number;
  latencyMs: number;
  servedRead: number;
  servedWrite: number;
  shards?: ShardStats[];
}

function poolPressure(baseLatencyMs: number, load: number, capacity: number): Pressure {
  const utilization = capacity === Number.POSITIVE_INFINITY ? 0 : capacity > 0 ? load / capacity : load > 0 ? Number.POSITIVE_INFINITY : 0;
  const served = utilization <= 1 ? 1 : capacity > 0 ? 1 / utilization : 0;
  return { utilization, latencyMs: baseLatencyMs / (1 - Math.min(utilization, SATURATION)), servedRead: served, servedWrite: served };
}

/**
 * Each shard is its own primary with its own capacity, so the hottest shard saturates first however much
 * headroom the others have. Failed instances take their shards (and those keys) offline.
 */
function shardPressure(node: DesignNode, f: Flow): Pressure {
  const spec = COMPONENTS.db;
  const shares = shardShares(node.shardKey ?? 'hash', node.instances);
  const down = node.instances - available(node);
  const reads = f.read + f.bot;
  const writes = (f.write + f.bg) * spec.writeCost;
  let servedRead = 0;
  let servedWrite = 0;
  let weightedLatency = 0;
  let liveLoad = 0;
  let hottest = 0;
  const shards: ShardStats[] = [];
  shares.read.forEach((readShare, i) => {
    const writeShare = shares.write[i];
    const load = reads * readShare + writes * writeShare;
    if (i >= node.instances - down) {
      shards.push({ utilization: 0, down: true });
      return;
    }
    const utilization = load / spec.capacityRps;
    const served = utilization <= 1 ? 1 : 1 / utilization;
    servedRead += readShare * served;
    servedWrite += writeShare * served;
    weightedLatency += load * (spec.baseLatencyMs / (1 - Math.min(utilization, SATURATION)));
    liveLoad += load;
    hottest = Math.max(hottest, utilization);
    shards.push({ utilization, down: false });
  });
  return {
    utilization: hottest,
    latencyMs: liveLoad > 0 ? weightedLatency / liveLoad : spec.baseLatencyMs,
    servedRead,
    servedWrite,
    ...(node.instances > 1 ? { shards } : {}),
  };
}

function topoOrder(nodes: DesignNode[], kidsOf: Map<string, DesignNode[]>, indegree: Map<string, number>): DesignNode[] {
  const deg = new Map(indegree);
  const ready = nodes.filter((n) => deg.get(n.id) === 0);
  const out: DesignNode[] = [];
  while (ready.length) {
    const n = ready.shift()!;
    out.push(n);
    for (const k of kidsOf.get(n.id)!) {
      deg.set(k.id, deg.get(k.id)! - 1);
      if (deg.get(k.id) === 0) ready.push(k);
    }
  }
  return out;
}

/**
 * Each path's latency is a shifted exponential: fixed service + network time, plus queueing waits.
 * Waits at independent hops partially cancel, so the tail uses the root-sum-square of per-hop waits
 * while the mean is preserved by shifting the remainder into the fixed part.
 */
export function percentile(paths: PathOutcome[], q: number): number {
  const mass = paths.reduce((s, o) => s + o.p, 0);
  if (mass <= 0) return 0;
  const parts = paths.map((o) => {
    const spread = Math.sqrt(o.waitSq);
    return { p: o.p / mass, b: o.base + o.wait - spread, w: Math.max(0.5, spread + JITTER * o.base) };
  });
  const cdf = (x: number) => parts.reduce((s, o) => s + (x < o.b ? 0 : o.p * (1 - Math.exp(-(x - o.b) / o.w))), 0);
  let lo = 0;
  let hi = Math.max(...parts.map((o) => o.b + 12 * o.w));
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (cdf(mid) < q) lo = mid;
    else hi = mid;
  }
  return Math.round(hi * 10) / 10;
}

function addInsights(
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

function dbInsights(design: Design, n: DesignNode, st: NodeStats, insights: Insight[]) {
  const replicas = design.edges
    .filter((e) => e.from === n.id)
    .map((e) => design.nodes.find((x) => x.id === e.to))
    .filter((x) => x?.kind === 'replica')
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
      return 'Add more replicas — but remember each replica also replays every write.';
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
    default:
      return 'Add capacity.';
  }
}

function dedupe(list: Insight[]): Insight[] {
  const seen = new Set<string>();
  return list.filter((i) => {
    const k = `${i.nodeId ?? ''}|${i.title}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function rank(list: Insight[]): Insight[] {
  const order = { critical: 0, warning: 1, tip: 2 } as const;
  return [...list].sort((a, b) => order[a.severity] - order[b.severity]);
}

export function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `${Math.round(n / 1000)}k`;
  if (n >= 1_000) return `${(n / 1000).toFixed(1)}k`;
  return `${Math.round(n)}`;
}
