import { COMPONENTS, DEFAULT_OBJECT_SHARE, monthlyCost } from './catalog.js';
import { fmt } from './scenario-catalog.js';
import { addInsights, dedupe, rank } from './sim-insights.js';
import { available, shardShares } from './shards.js';
import type { ComponentKind, Design, DesignNode, Insight, NodeStats, NodeStatus, ShardStats, SimResult, Workload } from './types.js';

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
/** Share of bot traffic a rate limiter rejects; the rest stays under quota by spreading over many IPs. */
export const BOT_BLOCK_RATE = 0.98;
const zero = (): Flow => ({ read: 0, write: 0, bg: 0, repl: 0, bot: 0 });
const total = (f: Flow) => f.read + f.write + f.bg + f.repl + f.bot;

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
  let queuedWrites = 0;
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

  const objectsIn = new Map<string, number>();
  /** `carry` is the share of the read, write and job traffic sent that are whole objects. */
  const send = (from: DesignNode, to: DesignNode, flow: Partial<Flow>, carry = 0) => {
    const target = inflow.get(to.id)!;
    objectsIn.set(to.id, (objectsIn.get(to.id) ?? 0) + ((flow.read ?? 0) + (flow.write ?? 0) + (flow.bg ?? 0)) * carry);
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
    const sized = f.read + f.write + f.bg;
    const objectFrac = node.kind === 'client' ? (workload.objectShare ?? 0) : sized > 0 ? (objectsIn.get(node.id) ?? 0) / sized : 0;
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

    const forward = (type: Forwarded, amount: number, targets: DesignNode[], base: number, carry = objectFrac) => {
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
          send(node, t, { [type]: share }, carry);
          track(t.id, share / base, hopMs(node, t));
          return;
        }
        // Read routing (driver/proxy) spreads reads over every primary (one per shard) and the live replicas.
        const primary = (share * t.instances) / (t.instances + slots);
        send(node, t, { [type]: primary }, carry);
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
    /**
     * Object stores take the whole objects in this node's traffic and nothing else; the rest leaves without objects.
     * Boards saved before the workload named its object share split by instance count, and still do.
     */
    const objectSplit = (targets: DesignNode[]) => {
      const stores = targets.filter((t) => t.kind === 'blob');
      const w = weights(targets);
      const legacy = targets.reduce((sum, t, i) => sum + (t.kind === 'blob' ? w[i] : 0), 0);
      const objects = !stores.length ? 0 : workload.objectShare === undefined ? legacy : objectFrac;
      return {
        stores,
        others: targets.filter((t) => t.kind !== 'blob'),
        objects,
        records: 1 - objects,
        carry: stores.length ? 0 : objectFrac,
      };
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
        const { stores, others, objects, records, carry } = objectSplit(kids);
        forward('read', served.read * (1 - h) * objects, stores, served.read);
        forward('read', served.read * (1 - h) * records, others, served.read, carry);
        forward('write', served.write * objects, stores, served.write);
        forward('write', served.write * records, others, served.write, carry);
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
        const blobs = ofKind('blob');
        const objects = blobs.length ? (workload.objectShare === undefined ? DEFAULT_OBJECT_SHARE : objectFrac) : 0;
        const rest = 1 - objects;
        const carry = blobs.length ? 0 : objectFrac;
        forward('read', served.read * objects, blobs, served.read);
        forward('write', served.write * objects, blobs, served.write);
        const readTargets = ofKind('cache').length ? ofKind('cache') : ofKind('db');
        const writeTargets = ofKind('queue').length ? ofKind('queue') : ofKind('db').length ? ofKind('db') : ofKind('cache');
        if (readTargets.length) {
          forward('read', served.read * rest, readTargets, served.read, carry);
          forwardBots(readTargets);
        } else {
          terminate('read', served.read * rest, served.read);
          absorbBots();
        }
        if (writeTargets.length) forward('write', served.write * rest, writeTargets, served.write, carry);
        else {
          terminate('write', served.write * rest, served.write);
          volatileWrites += served.write * rest;
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
        queuedWrites += served.write;
        const workers = ofKind('worker');
        const drainCapacity = workers.reduce((sum, w) => sum + available(w) * COMPONENTS.worker.capacityRps, 0);
        const incoming = served.write + served.bg;
        const drain = Math.min(incoming, drainCapacity);
        queueDrain += drainCapacity;
        backlogGrowth += incoming - drain;
        if (drain > 0) {
          const w = weights(workers);
          workers.forEach((t, i) => send(node, t, { bg: drain * w[i] }, objectFrac));
        }
        break;
      }
      case 'blob':
        terminate('read', served.read, served.read);
        terminate('write', served.write, served.write);
        durableWrites += served.write;
        absorbed += served.bg;
        absorbBots();
        break;
      case 'worker': {
        const { stores, others: dbs, objects, records } = objectSplit(ofKind('db', 'blob'));
        if (dbs.length || stores.length) {
          const spread = (targets: DesignNode[], amount: number) => {
            if (amount <= 0) return;
            const w = weights(targets);
            targets.forEach((t, i) => send(node, t, { bg: amount * w[i] }));
          };
          spread(stores, served.bg * objects);
          spread(dbs, served.bg * records);
          if (!dbs.length && served.bg * records > 0) {
            bgFailures += served.bg * records;
            insights.push({
              severity: 'critical',
              nodeId: node.id,
              title: 'Workers have no database for records',
              detail: `An object store keeps whole objects by key, with no queries, so it takes only the ${Math.round(objects * 100)}% of jobs that are objects. Connect the workers to the primary database for the rest.`,
            });
          }
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
      queuedWriteRps: queuedWrites,
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
