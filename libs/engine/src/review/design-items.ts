import { getSdTopic } from '../curriculum/sd-topics.js';
import { COMPONENTS } from '../sysdesign/catalog.js';
import { fmt } from '../sysdesign/scenario-catalog.js';
import { simulate } from '../sysdesign/simulate.js';
import type { ComponentKind, Design, DesignNode } from '../sysdesign/types.js';
import { pick, seeded, shuffle, withChoices, type Rand } from './random.js';
import { DESIGN_ITEM_CATALOG, designSummary, type DesignItemId } from './summaries.js';
import { KIND_LABELS, type ItemDef, type PipelineStage, type Question, type ReviewItemSummary } from './types.js';

type Spec = Omit<Question, 'itemId' | 'kind' | 'topic' | 'seed' | 'eyebrow'>;

interface DesignItemDefinition {
  label: string;
  build: (rand: Rand) => Spec;
}

function item(label: string, build: (rand: Rand) => Spec): DesignItemDefinition {
  return { label, build };
}

function designItem(summary: ReviewItemSummary, { label, build }: DesignItemDefinition): ItemDef {
  return {
    ...summary,
    label,
    generate(seed) {
      return {
        itemId: this.id,
        kind: 'design',
        topic: summary.topic,
        seed,
        eyebrow: `${KIND_LABELS.design} · ${getSdTopic(summary.topic)?.name ?? summary.topic}`,
        ...build(seeded(seed)),
      };
    },
  };
}

const ms = (v: number) => `${Math.round(v)} ms`;

function duration(seconds: number): string {
  if (seconds < 90) return `${Math.round(seconds)} s`;
  const minutes = seconds / 60;
  return minutes < 90 ? `${Math.round(minutes * 10) / 10} min` : `${Math.round((minutes / 60) * 10) / 10} h`;
}

function bytes(b: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  let i = 0;
  while (b >= 1000 && i < units.length - 1) {
    b /= 1000;
    i++;
  }
  return `${b >= 100 ? Math.round(b) : Math.round(b * 10) / 10} ${units[i]}`;
}

function percent(p: number): string {
  const pct = p * 100;
  const decimals = pct >= 99.99 ? 4 : pct >= 99 ? 2 : 1;
  return `${Number(pct.toFixed(decimals))}%`;
}

const concept = (prompt: string, correct: string, distractors: string[], explain: string) =>
  item(prompt, (rand) => ({ prompt, ...withChoices(rand, correct, distractors), explain }));

const responseTime = item('Response time at a given utilization', (rand) => {
  const s = pick(rand, [4, 8, 10, 20]);
  const rho = pick(rand, [0.5, 0.75, 0.8, 0.9, 0.95]);
  const r = s / (1 - rho);
  return {
    prompt: `A server spends ${s} ms on each request and runs at ${Math.round(rho * 100)}% utilization. Roughly what is the average response time (queueing + service)?`,
    facts: [
      { label: 'Service time', value: `${s} ms` },
      { label: 'Utilization ρ', value: `${Math.round(rho * 100)}%` },
    ],
    ...withChoices(rand, ms(r), [ms(s), ms(s * (1 + rho)), ms(s / (1 - rho) ** 2), ms(r * 2)].filter((d) => d !== ms(r)).slice(0, 3)),
    explain: `Response ≈ S / (1 − ρ) = ${s} / ${Number((1 - rho).toFixed(2))} ≈ ${ms(r)}, a ${Math.round(1 / (1 - rho))}× slowdown. Waiting time explodes as utilization approaches 100%.`,
  };
});

const headroom = concept(
  'Why do teams plan for roughly 60–70% peak utilization instead of running servers at 95%?',
  'Queueing delay grows like 1/(1 − ρ): near 95% requests wait ~20× the service time and small spikes cause overload',
  [
    'CPU performance degrades above 70% because of thermal throttling, which makes every request slower',
    'Cloud providers charge a premium rate for sustained utilization above 70%, so it costs far more',
    'Load balancers mark servers above 70% as unhealthy and stop routing traffic to them entirely',
  ],
  'Latency is not linear in load. The last 25% of utilization costs far more in tail latency than the first 70%. Headroom is what absorbs spikes.',
);

const bottleneck = item('Spot the bottleneck', (rand) => {
  for (let attempt = 0; attempt < 60; attempt++) {
    const rps = pick(rand, [3_000, 5_000, 8_000, 12_000, 20_000, 30_000]);
    const readRatio = pick(rand, [0.8, 0.9, 0.95]);
    const nodes: DesignNode[] = [
      { id: 'users', kind: 'client', x: 0, y: 0, instances: 1 },
      { id: 'lb', kind: 'lb', x: 0, y: 0, instances: 1 + Math.floor(rand() * 2) },
      { id: 'app', kind: 'app', x: 0, y: 0, instances: 2 + Math.floor(rand() * 14) },
      { id: 'db', kind: 'db', x: 0, y: 0, instances: 1 },
    ];
    const edges = [
      { from: 'users', to: 'lb' },
      { from: 'lb', to: 'app' },
    ];
    const withCache = rand() < 0.6;
    if (withCache) {
      nodes.push({ id: 'cache', kind: 'cache', x: 0, y: 0, instances: 1, hitRate: pick(rand, [0.7, 0.8, 0.9]) });
      edges.push({ from: 'app', to: 'cache' }, { from: 'cache', to: 'db' });
    } else {
      edges.push({ from: 'app', to: 'db' });
    }
    const replicas = Math.floor(rand() * 3);
    if (replicas) {
      nodes.push({ id: 'rep', kind: 'replica', x: 0, y: 0, instances: replicas });
      edges.push({ from: 'db', to: 'rep' });
    }
    const design: Design = { nodes, edges };
    // Simulate at 1 rps (nothing saturates, load is linear) and scale up, so upstream drops don't mask downstream load.
    const unit = simulate(design, { rps: 1, readRatio });
    const ranked = nodes
      .filter((n) => n.kind !== 'client')
      .map((n) => ({ n, u: (unit.nodes[n.id].loadOps * rps) / Math.max(1, unit.nodes[n.id].capacityOps) }))
      .sort((a, b) => b.u - a.u);
    if (ranked[0].u < 1 || ranked[1].u > ranked[0].u * 0.8) continue;

    const name = (n: DesignNode) => COMPONENTS[n.kind].name;
    const pipeline: PipelineStage[] = [
      { name: 'Users', detail: `${fmt(rps)} rps · ${Math.round(readRatio * 100)}% reads` },
      { name: `LB ×${nodes[1].instances}`, detail: `${fmt(COMPONENTS.lb.capacityRps)} rps each` },
      { name: `App ×${nodes[2].instances}`, detail: `${fmt(COMPONENTS.app.capacityRps)} rps each` },
      ...(withCache ? [{ name: 'Cache', detail: `${Math.round(nodes.find((x) => x.id === 'cache')!.hitRate! * 100)}% hit rate` }] : []),
      { name: 'Primary DB', detail: `${fmt(COMPONENTS.db.capacityRps)} ops/s · write = 2 ops` },
      ...(replicas ? [{ name: `Replicas ×${replicas}`, detail: `${fmt(COMPONENTS.replica.capacityRps)} ops/s each` }] : []),
    ];
    const others = shuffle(
      rand,
      ranked.slice(1).map((x) => name(x.n)),
    ).slice(0, 3);
    return {
      prompt: 'Which component saturates first under this load?',
      pipeline,
      ...withChoices(rand, name(ranked[0].n), others),
      explain: `Utilization = load ÷ capacity: ${ranked.map((x) => `${COMPONENTS[x.n.kind].short} ${Math.round(x.u * 100)}%`).join(' · ')}. ${
        ranked[0].n.kind === 'db'
          ? 'Remember cache misses, replica read-splitting, and that writes cost 2 ops.'
          : 'Scale the saturated tier first; everything behind it is idle waiting.'
      }`,
    };
  }
  throw new Error('Could not generate a bottleneck case');
});

const lbConcept = concept(
  'You scale the app tier from 1 to 4 servers, but all traffic still lands on one of them. What is missing?',
  'A load balancer in front of the app tier to spread requests and health-check servers',
  [
    'A read replica, so the database can keep up with the extra app servers',
    'A CDN in front of users, so each request reaches the nearest app server',
    'Bigger instances, because horizontal scaling only works with more CPU per server',
  ],
  'Clients resolve a single address. A load balancer spreads requests across instances and stops routing to unhealthy ones.',
);

const qps = item('Daily actives → QPS', (rand) => {
  const dau = pick(rand, [10e6, 50e6, 100e6, 300e6]);
  const actions = pick(rand, [5, 10, 20, 50]);
  const avg = (dau * actions) / 86_400;
  return {
    prompt: `${fmt(dau)} daily active users each make about ${actions} requests per day. Roughly what is the average QPS?`,
    ...withChoices(rand, `~${fmt(avg)} QPS`, [`~${fmt(avg * 10)} QPS`, `~${fmt(avg / 10)} QPS`, `~${fmt((dau * actions) / 3_600)} QPS`]),
    explain: `A day has ~86,400 s (round to 10⁵): ${fmt(dau)} × ${actions} ÷ 86,400 ≈ ${fmt(avg)} QPS on average. Plan for peaks of 2–3× that.`,
  };
});

const storage = item('Storage over time', (rand) => {
  const perDay = pick(rand, [1e6, 10e6, 100e6]);
  const size = pick(rand, [500, 2_000, 10_000]);
  const years = pick(rand, [1, 5]);
  const total = perDay * size * 365 * years;
  return {
    prompt: `You store ${fmt(perDay)} new records per day at about ${bytes(size)} each. How much storage after ${years} year${years > 1 ? 's' : ''} (before replication)?`,
    ...withChoices(rand, bytes(total), [bytes(total * 10), bytes(total / 10), bytes(total / 365)]),
    explain: `${fmt(perDay)}/day × ${bytes(size)} × 365 × ${years} ≈ ${bytes(total)}. Multiply by the replication factor (often 3) for raw disk.`,
  };
});

const availability = item('Availability math', (rand) => {
  const a = pick(rand, [0.99, 0.995, 0.999]);
  const parallel = rand() < 0.5;
  const series = a * a;
  const redundant = 1 - (1 - a) ** 2;
  const correct = parallel ? redundant : series;
  return {
    prompt: parallel
      ? `Two independent replicas each have ${percent(a)} availability, and either one can serve traffic. What is the combined availability?`
      : `A request must pass through two independent services in a row, each with ${percent(a)} availability. What is the end-to-end availability?`,
    ...withChoices(rand, percent(correct), [
      percent(parallel ? series : redundant),
      percent(a),
      percent(parallel ? 1 - (1 - a) ** 3 : a ** 3),
    ]),
    explain: parallel
      ? `Redundancy multiplies failure probabilities: 1 − (1 − ${a})² = ${percent(redundant)}.`
      : `Dependencies in series multiply availabilities: ${a}² = ${percent(series)}. Every extra hop lowers the ceiling.`,
  };
});

const spof = item('Find the single point of failure', (rand) => {
  const candidates: { kind: ComponentKind; label: string; redundant: string; single: string }[] = [
    { kind: 'lb', label: 'Load Balancer', redundant: '×2', single: '×1' },
    { kind: 'app', label: 'App Servers', redundant: `×${2 + Math.floor(rand() * 6)}`, single: '×1' },
    { kind: 'cache', label: 'Cache (Redis)', redundant: '×2 (replicated)', single: '×1' },
    { kind: 'queue', label: 'Message Queue', redundant: '×3 brokers', single: '×1 broker' },
    { kind: 'db', label: 'Primary DB', redundant: '+ replica (failover)', single: 'no replica' },
  ];
  const chosen = shuffle(rand, candidates).slice(0, 4);
  const weak = pick(rand, chosen);
  const order: ComponentKind[] = ['lb', 'app', 'cache', 'queue', 'db'];
  const pipeline = chosen
    .sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind))
    .map((c) => ({ name: c.label, detail: c === weak ? c.single : c.redundant }));
  return {
    prompt: 'Which component is a single point of failure in this design?',
    pipeline: [{ name: 'Users', detail: 'traffic' }, ...pipeline],
    ...withChoices(
      rand,
      weak.label,
      chosen.filter((c) => c !== weak).map((c) => c.label),
    ),
    explain: `${weak.label} is the only component without redundancy: if it fails, everything that depends on it fails too. The fix is a second instance or a failover replica.`,
  };
});

const hitP99 = item('Cache hit rate vs p99', (rand) => {
  const h = pick(rand, [0.9, 0.95, 0.98, 0.995]);
  const hit = 2;
  const miss = 45;
  const missRate = 1 - h;
  const tailIsMiss = missRate > 0.01;
  const avg = h * hit + missRate * miss;
  return {
    prompt: `Reads hit a cache ${percent(h)} of the time. Hits take ~${hit} ms; misses go to the database and take ~${miss} ms. Roughly what is p99 read latency?`,
    ...withChoices(rand, tailIsMiss ? `~${miss} ms (miss path)` : `~${hit} ms (hit path)`, [
      tailIsMiss ? `~${hit} ms (hit path)` : `~${miss} ms (miss path)`,
      `~${Math.round(avg * 10) / 10} ms (the average)`,
      `~${miss * 2} ms (twice the miss path)`,
    ]),
    explain: tailIsMiss
      ? `${percent(missRate)} of reads miss (more than the slowest 1%), so the 99th percentile lands on the miss path. Caches fix p50; the tail is still the database.`
      : `Only ${percent(missRate)} of reads miss (fewer than 1%), so even the 99th percentile is a hit. Past a 99% hit rate the cache fixes the tail too.`,
  };
});

const cacheMath = item('Reads that reach the database', (rand) => {
  const reads = pick(rand, [10_000, 20_000, 40_000, 80_000]);
  const h = pick(rand, [0.8, 0.9, 0.95, 0.99]);
  const db = reads * (1 - h);
  return {
    prompt: `${fmt(reads)} reads/s go through a cache with a ${Math.round(h * 100)}% hit rate. How many reads/s reach the database?`,
    ...withChoices(rand, `${fmt(db)}/s`, [`${fmt(reads * h)}/s`, `${fmt(db * 10)}/s`, `${fmt(db / 10)}/s`]),
    explain: `Only misses fall through: ${fmt(reads)} × (1 − ${h}) = ${fmt(db)}/s. Going from 90% to 99% hit rate cuts database reads 10×.`,
  };
});

const cdn = concept(
  'A CDN caches your cacheable responses at edge locations near users. What does it improve?',
  'Both user latency (short edge round trip) and origin load (hits never reach you)',
  [
    'Only origin load; users still pay the full round trip to your servers',
    'Only write throughput, since uploads are buffered at the edge first',
    'Data consistency, because every edge keeps a fresh copy of the database',
  ],
  'Edge hits skip the long trip to your origin (~10 ms instead of ~40+ ms) and never consume origin capacity. Misses still pay the full path.',
);

const fixDb = item('First move for an overloaded database', (rand) => {
  const readShare = pick(rand, [0.95, 0.9, 0.85, 0.3, 0.2, 0.1]);
  const util = pick(rand, [130, 160, 200]);
  const readHeavy = readShare >= 0.5;
  const reads = 'Put a cache in front and/or add read replicas';
  const writes = 'Reduce write pressure: queue and batch writes, or shard the data';
  return {
    prompt: `Your primary database is at ${util}% utilization, and ${Math.round(readShare * 100)}% of its load is reads. What is the most effective first move?`,
    ...withChoices(rand, readHeavy ? reads : writes, [
      readHeavy ? writes : reads,
      'Add more app servers so each one sends fewer queries to the database',
      'Add a second load balancer to spread database connections more evenly',
    ]),
    explain: readHeavy
      ? 'Reads dominate, and reads are easy to offload: caches absorb repeated reads, replicas split the rest. App servers are not the bottleneck.'
      : 'Writes dominate. Replicas replay every write and caches do not absorb writes, so you have to smooth writes (queue/batch) or split them across shards.',
  };
});

const replicasWrites = item('Do read replicas fix it?', (rand) => {
  const writeShare = pick(rand, [0.3, 0.5, 0.6, 0.7]);
  const util = pick(rand, [140, 180]);
  const after = util * (writeShare + (1 - writeShare) / 4);
  const fixed = after < 100;
  const shown = `~${Math.round(after)}%`;
  return {
    prompt: `The primary is at ${util}% utilization and ${Math.round(writeShare * 100)}% of its load is writes. You add three read replicas that share reads evenly with the primary. Does that fix the overload?`,
    ...withChoices(rand, fixed ? `Yes: the primary drops to ${shown}` : `No: the primary is still at ${shown}`, [
      fixed ? `No: the primary is still at ${shown}` : `Yes: the primary drops to ${shown}`,
      'Yes: replicas share the write load with the primary as well',
      'No: replicas cannot serve reads until they fully catch up',
    ]),
    explain: `Reads split four ways (${util}% × ${Math.round((1 - writeShare) * 100)}% ÷ 4), but every write still lands on the primary (${util}% × ${Math.round(writeShare * 100)}%). Total ≈ ${Math.round(after)}%. Replicas scale reads, not writes.`,
  };
});

const queueDrain = item('How long until the backlog clears?', (rand) => {
  const inflow = pick(rand, [6_000, 8_000, 10_000, 12_000]);
  const drain = pick(rand, [1_500, 2_000, 3_000]);
  const spike = pick(rand, [30, 60, 90]);
  const backlog = (inflow - drain) * spike;
  const seconds = backlog / drain;
  return {
    prompt: `Orders arrive at ${fmt(inflow)}/s for ${spike} s. Workers drain the queue at ${fmt(drain)}/s. After the spike ends (inflow drops to ~0), how long until the backlog is empty?`,
    facts: [
      { label: 'Inflow', value: `${fmt(inflow)}/s for ${spike} s` },
      { label: 'Drain rate', value: `${fmt(drain)}/s` },
    ],
    ...withChoices(rand, duration(seconds), [duration(backlog / inflow), duration((inflow * spike) / drain + spike), duration(spike)]),
    explain: `During the spike the backlog grows by ${fmt(inflow)} − ${fmt(drain)} = ${fmt(inflow - drain)}/s → ${fmt(backlog)} jobs. Draining at ${fmt(drain)}/s takes ${duration(seconds)}.`,
  };
});

const workerLimit = concept(
  'You keep adding queue workers to drain a backlog faster. When does that stop helping?',
  'When the database they write to saturates; extra workers then only add failures and retries',
  [
    'Never; queue throughput keeps scaling linearly with the number of consumers',
    'When message IDs run out, since every job needs a globally unique sequence number',
    'When the load balancer in front of the workers reaches its connection limit',
  ],
  'Consumers should be sized to what the slowest downstream dependency can sustain, not to peak inflow.',
);

const asyncAck = concept(
  'Why does putting a durable queue in front of order writes lower user-facing latency during a spike?',
  'The API acknowledges once the order is durably enqueued, instead of waiting on the database write',
  [
    'Queues make each database write faster by compressing the payload in transit',
    'Queues cache recent orders so the database can skip redundant duplicate writes',
    'Queues route every write to the least-loaded database replica automatically',
  ],
  'Decoupling acceptance from processing: the user waits for the cheap, highly scalable step; the expensive step happens at a pace the database can handle.',
);

const tokenBucket = item('Token bucket over time', (rand) => {
  const burst = pick(rand, [20, 50, 100]);
  const refill = pick(rand, [5, 10, 20]);
  const sent = pick(rand, [50, 100, 200]);
  const seconds = pick(rand, [10, 30, 60]);
  const accepted = Math.min(sent * seconds, burst + refill * seconds);
  const req = (v: number) => `${fmt(v)} requests`;
  return {
    prompt: `A token bucket holds up to ${burst} tokens and refills ${refill} tokens/s. It starts full, and a client then sends ${sent} requests/s for ${seconds} s. How many are accepted?`,
    facts: [
      { label: 'Bucket size (burst)', value: `${burst}` },
      { label: 'Refill rate', value: `${refill}/s` },
      { label: 'Client sends', value: `${sent}/s for ${seconds} s` },
    ],
    ...withChoices(
      rand,
      req(accepted),
      [req(refill * seconds), req(burst), req(sent * seconds), req(burst + sent)].filter((d) => d !== req(accepted)).slice(0, 3),
    ),
    explain: `The full bucket absorbs a burst of ${burst}; after that the client gets exactly the refill rate: ${burst} + ${refill} × ${seconds} = ${fmt(accepted)}. The other ${fmt(sent * seconds - accepted)} get 429s. Burst size and sustained rate are separate knobs.`,
  };
});

const limiterState = concept(
  'Four rate limiter instances sit behind round-robin. Each keeps per-client counters in its own memory with a limit of 100 requests/min. What limit does a client really get?',
  'About 400/min: each instance only sees a quarter of that client’s requests',
  [
    'Exactly 100/min, because the load balancer keeps the counters in sync',
    'About 25/min, because each instance enforces a quarter of the limit',
    'Unlimited, because in-memory counters reset on every request',
  ],
  'Local counters multiply the limit by the instance count. Keep counters in a shared store (e.g. Redis INCR with a TTL, or an atomic token-bucket script), or route each client key to one instance.',
);

const botsCache = concept(
  'Why does 20k RPS of scraper traffic hurt the database far more than 20k RPS of real users?',
  'Scrapers crawl long-tail and cache-busting URLs, so they miss every cache',
  [
    'Scrapers send larger request bodies that the database has to parse',
    'Scrapers skip the load balancer and connect to the database directly',
    'Scrapers always open fresh TLS sessions that the database must verify',
  ],
  'Real users read popular content that caches absorb; bots walk everything once. Every unfiltered bot request becomes a database read, so shed them at the edge before they cost anything.',
);

const overQuota = concept(
  'What should an API return to a client that is over its rate limit?',
  '429 Too Many Requests with a Retry-After header',
  [
    '503 Service Unavailable, so it looks like an outage',
    '403 Forbidden and a permanent ban on the IP',
    '200 OK with an empty body so bots cannot tell',
  ],
  '429 tells well-behaved clients exactly what happened, and Retry-After tells them when to come back, so retries spread out instead of stampeding. Reject cheaply, before any expensive work.',
);

const shardCount = item('How many shards?', (rand) => {
  const writes = pick(rand, [4_000, 6_000, 9_000, 12_000, 15_000]);
  const target = 0.7;
  const correct = Math.ceil((writes * 2) / (5_000 * target));
  const shards = (v: number) => `${v} shards`;
  const pool = [
    Math.ceil(writes / (5_000 * target)),
    Math.ceil((writes * 2) / 5_000),
    correct + 2,
    correct - 1,
    correct + 1,
    Math.ceil(writes / 5_000),
  ]
    .filter((v) => v > 0 && v !== correct)
    .map(shards);
  return {
    prompt: `A service writes ${fmt(writes)} rows/s, sustained. Each write costs a primary 2 ops, one primary handles 5k ops/s, and you plan for 70% peak utilization. With an evenly spreading shard key, how many shards do you need?`,
    facts: [
      { label: 'Writes', value: `${fmt(writes)}/s × 2 ops` },
      { label: 'Per primary', value: '5k ops/s at ≤ 70%' },
    ],
    ...withChoices(rand, shards(correct), [...new Set(pool)].slice(0, 3)),
    explain: `${fmt(writes)} × 2 = ${fmt(writes * 2)} ops/s. Each shard should carry at most 5k × 0.7 = 3.5k, so ${fmt(writes * 2)} ÷ 3.5k → ${correct} shards. Forgetting the write cost or the headroom are the two classic misses.`,
  };
});

const timeKey = concept(
  'You range-partition a messages table by created_at across 6 shards. Where do new writes go?',
  'All to the newest shard, while the others only serve older reads',
  [
    'Evenly across all 6 shards, since timestamps are unique',
    'To whichever shard currently has the most free disk',
    'Round-robin across the shards in insertion order',
  ],
  'Monotonic keys (timestamps, auto-increment IDs) put every new row at the end of the range: one hot shard takes all the writes. Hash a high-cardinality key instead, or prefix the time with a hash bucket.',
);

const tenantSkew = concept(
  'You shard by tenant_id and your largest tenant is 40% of all traffic. What does going from 4 to 8 shards do for the busiest shard?',
  'Nothing: that tenant’s keys stay on one shard, still ~40% of load',
  [
    'Halves it to ~20%, like every other shard',
    'Drops it to 1/8 of all traffic, about 12.5%',
    'Doubles it, because rebalancing moves keys onto it',
  ],
  'A shard can never hold less than its single biggest key. Skewed keys cap scale-out; pick a finer key (e.g. conversation_id) or split the big tenant across several shards.',
);

const reshard = concept(
  'Why place keys with consistent hashing (or many fixed virtual partitions) instead of `hash(key) % N`?',
  'Changing N with modulo moves almost every key; consistent hashing moves ~1/N',
  [
    'Modulo hashing cannot spread string keys evenly across shards',
    'Consistent hashing keeps related keys together so joins stay local',
    'Modulo placement only works when N is a power of two',
  ],
  'With `hash(key) % N`, adding one shard reassigns most keys and triggers a massive migration. Consistent hashing (or pre-splitting into many virtual partitions assigned to nodes) makes resharding incremental.',
);

const quorumOverlap = item('Is a quorum read guaranteed fresh?', (rand) => {
  const [n, w, r] = pick(rand, [
    [3, 2, 2],
    [3, 1, 3],
    [3, 1, 1],
    [3, 2, 1],
    [5, 3, 3],
    [5, 3, 2],
    [5, 4, 2],
    [5, 1, 5],
    [5, 2, 2],
  ] as const);
  const fresh = r + w > n;
  return {
    prompt: `A leaderless store keeps ${n} replicas of each key. A write waits for ${w} acknowledgment${w > 1 ? 's' : ''} and a read asks ${r} replica${r > 1 ? 's' : ''} and keeps the newest value. Is every read that starts after a write is acknowledged guaranteed to reach at least one replica holding that write?`,
    facts: [
      { label: 'Replicas N', value: `${n}` },
      { label: 'Write quorum W', value: `${w}` },
      { label: 'Read quorum R', value: `${r}` },
    ],
    ...withChoices(rand, fresh ? `Yes: R + W = ${r + w} > ${n}` : `No: R + W = ${r + w} ≤ ${n}`, [
      fresh ? `No: R + W = ${r + w} ≤ ${n}` : `Yes: R + W = ${r + w} > ${n}`,
      `Only if W > N / 2, whatever R is`,
      `Only if R > N / 2, whatever W is`,
    ]),
    explain: fresh
      ? `Any ${r} replica${r > 1 ? 's' : ''} and any ${w} replica${w > 1 ? 's' : ''} out of ${n} must share at least one (${r} + ${w} > ${n}), so every read reaches a replica holding the write. Sloppy quorums and concurrent writes can still surprise you, but the overlap holds.`
      : `${r} + ${w} ≤ ${n}, so a read can ask ${r} replica${r > 1 ? 's' : ''} that the write never reached and return the old value. Raise R or W until R + W > N.`,
  };
});

const quorumFailures = item('How many replicas can fail?', (rand) => {
  const n = pick(rand, [3, 5, 7]);
  const w = pick(rand, n === 3 ? [2, 3] : n === 5 ? [3, 4, 5] : [4, 5, 6]);
  const failures = (v: number) => `${v} replica${v === 1 ? '' : 's'}`;
  return {
    prompt: `A store keeps ${n} replicas of each key and a write waits for ${w} acknowledgments. How many replicas can be down while writes still succeed?`,
    ...withChoices(
      rand,
      failures(n - w),
      [...new Set([w - 1, Math.floor((n - 1) / 2), n - w + 1, 0, w, n].filter((v) => v !== n - w))].slice(0, 3).map(failures),
    ),
    explain: `A write needs ${w} of ${n} replicas up, so it survives ${n} − ${w} = ${n - w} down. Every replica added to W buys consistency at the cost of availability: W = N stops writes when any single replica fails.`,
  };
});

const partitionChoice = concept(
  'A network partition cuts your replicas in two. A client on the minority side asks to update its cart. What does a system that chooses consistency (CP) do?',
  'Reject or stall the write until the partition heals, so no two sides accept conflicting versions',
  [
    'Accept the write locally and merge the two sides when the partition heals',
    'Accept the write on every replica it can reach, even if that is only one',
    'Route the write to the majority side through the partitioned link',
  ],
  'During a partition a replica must either refuse (consistent, not available) or answer with what it has (available, possibly stale or conflicting). Carts often choose availability and merge; balances and bookings choose consistency. With no partition, the real trade is latency against consistency.',
);

const majoritySize = item('Failures a consensus cluster survives', (rand) => {
  const n = pick(rand, [3, 4, 5, 6, 7, 9]);
  const tolerates = n - (Math.floor(n / 2) + 1);
  const nodes = (v: number) => `${v} node${v === 1 ? '' : 's'}`;
  return {
    prompt: `A Raft cluster has ${n} nodes. How many can fail while it still elects a leader and commits writes?`,
    ...withChoices(
      rand,
      nodes(tolerates),
      [...new Set([Math.floor(n / 2), n - 1, tolerates + 1, tolerates - 1, n].filter((v) => v >= 0 && v !== tolerates))]
        .slice(0, 3)
        .map(nodes),
    ),
    explain: `Every decision needs a majority, ${Math.floor(n / 2) + 1} of ${n}, so ${n} − ${Math.floor(n / 2) + 1} = ${tolerates} can fail.${n % 2 === 0 ? ` An even cluster tolerates no more than a ${n - 1}-node cluster would, and it can split evenly with no majority on either side.` : ''}`,
  };
});

const evenCluster = concept(
  'Why do teams run consensus clusters of 3 or 5 nodes rather than 4?',
  'A 4-node cluster still needs 3 votes, so it tolerates 1 failure like 3 nodes, and a 2–2 split leaves no majority',
  [
    'Raft and Paxos cannot elect a leader when the node count is even',
    'An even cluster doubles the replication traffic for every committed write',
    'With 4 nodes every write must reach all four before it commits',
  ],
  'A majority of 4 is 3, the same failure budget as 3 nodes but one more machine to pay for and one more vote to wait on. 5 nodes tolerate 2 failures, which is why 3 and 5 are the common sizes.',
);

const fencingToken = concept(
  'A lock holder pauses for 30 s in garbage collection. Its lease expires, another node takes the lock and writes. Then the first node wakes and writes too. What stops the stale write?',
  'A fencing token: each grant carries a rising number, and storage rejects writes with a lower one than it has seen',
  [
    'A shorter lease, so the paused node loses the lock before it can pause',
    'A heartbeat, so the lock service knows the first node was only paused',
    'Checking that the lease is still valid just before the write',
  ],
  'A pause can strike between any check and the write, so no client-side check is safe. The resource itself must reject stale holders: the lock service hands out an increasing token (an etcd revision or a Raft log index, a ZooKeeper zxid), and storage refuses anything older than the newest token it has accepted.',
);

const idRange = item('How long does the timestamp last?', (rand) => {
  const bits = pick(rand, [39, 41, 42]);
  const tickMs = pick(rand, [1, 10]);
  const years = (2 ** bits * tickMs) / (365.25 * 24 * 3600 * 1000);
  const y = (v: number) => (v < 10 ? `about ${Math.round(v * 10) / 10} years` : `about ${Math.round(v)} years`);
  return {
    prompt: `A 64-bit id gives the timestamp ${bits} bits, counting ${tickMs === 1 ? 'milliseconds' : '10 ms ticks'} from a custom epoch. How long until the timestamp runs out?`,
    ...withChoices(rand, y(years), [y(years * 2), y(years / 2), y(years * (tickMs === 1 ? 10 : 0.1))]),
    explain: `2^${bits} ticks × ${tickMs} ms ≈ ${(2 ** bits * tickMs).toExponential(1).replace('e+', ' × 10^')} ms, and a year is about 3.16 × 10^10 ms, so ${y(years)}. Each extra bit doubles it; start the epoch at launch, not 1970, to use all of it.`,
  };
});

const shardCounters = concept(
  'Rows now live on 8 database shards, each with its own auto-increment counter. What goes wrong with the ids?',
  'Every shard counts 1, 2, 3…, so the same id appears on several shards',
  [
    'The counters drift apart in speed, so ids stop being sortable by shard',
    'Auto-increment stops working entirely once a table is sharded',
    'Every insert must lock all 8 counters, so writes serialize',
  ],
  'Independent counters collide. Fixes: give each shard an offset and step (shard k issues k, k + 8, k + 16…), hand out ranges from a central allocator, or generate ids without coordination: Snowflake-style (time, generator, sequence) or random 128-bit ids.',
);

const randomKeys = concept(
  'Why can random UUIDv4 primary keys slow inserts into a large B-tree table compared with time-ordered ids?',
  'Each insert lands on a random leaf page, so the working set is the whole index and pages split everywhere',
  [
    'UUIDs are strings, and B-trees cannot index string keys efficiently',
    'Random ids collide often enough that every insert must retry',
    'The database must lock the whole index to check a random id is unique',
  ],
  'Sequential keys append at the right edge of the index, so recent pages stay in memory. Random keys touch pages all over it, missing cache and splitting half-full pages. Time-ordered 128-bit ids (UUIDv7, ULID) keep uniqueness without coordination and restore locality.',
);

const idfRank = item('Which document ranks first?', (rand) => {
  const n = 1_000_000;
  const commonDf = pick(rand, [600_000, 800_000, 950_000]);
  const rareDf = pick(rand, [500, 2_000, 10_000]);
  const [commonA, rareA] = [pick(rand, [12, 20, 30]), 1];
  const [commonB, rareB] = [pick(rand, [2, 3, 4]), pick(rand, [2, 3])];
  const idf = (df: number) => Math.log(n / df);
  const a = commonA * idf(commonDf) + rareA * idf(rareDf);
  const b = commonB * idf(commonDf) + rareB * idf(rareDf);
  const first = a > b ? 'Document A' : 'Document B';
  const other = a > b ? 'Document B' : 'Document A';
  return {
    prompt: `An index holds 1,000,000 documents. The query is "the raft": "the" appears in ${fmt(commonDf)} of them and "raft" in ${fmt(rareDf)}. Document A has "the" ${commonA} times and "raft" once; document B has "the" ${commonB} times and "raft" ${rareB} times. Ranking by TF-IDF (count times ln(N / documents with the term)), which ranks first?`,
    ...withChoices(rand, first, [other, 'They tie, since both hold both terms', 'Neither: "the" is a stop word, so the query is empty']),
    explain: `IDF is ln(1,000,000 / ${fmt(commonDf)}) ≈ ${idf(commonDf).toFixed(2)} for "the" and ln(1,000,000 / ${fmt(rareDf)}) ≈ ${idf(rareDf).toFixed(2)} for "raft". A scores ${a.toFixed(1)}, B scores ${b.toFixed(1)}. A rare term outweighs many copies of a common one; real engines use BM25, which also caps how much repeating a term helps.`,
  };
});

const indexRefresh = concept(
  'A search engine indexes new documents in immutable segments. Why is a just-written document not searchable for about a second?',
  'New documents sit in an in-memory buffer until a refresh writes them into a new searchable segment',
  [
    'Each write must first be replicated to every shard before any shard can search it',
    'The inverted index is rebuilt from scratch for every new document',
    'Documents wait in the queue until the nightly compaction merges them in',
  ],
  'Engines like Lucene buffer writes and periodically refresh (by default about every second in Elasticsearch), turning the buffer into a new small segment; background merges later combine segments. Refreshing more often costs throughput, so freshness is a tunable trade.',
);

const indexSharding = concept(
  'You shard a search index by document (each shard indexes a subset of documents) rather than by term. What does every query cost?',
  'It fans out to every shard, and the results are merged by score',
  [
    'It reads one shard, the one owning the rarest query term',
    'It reads only the shard holding the document with the highest score',
    'It reads two shards, since each term lives on exactly one',
  ],
  'Document partitioning keeps writes local and shards independent, but every query scatters to all shards and gathers the top results, so tail latency is set by the slowest shard. Term partitioning makes a query touch only its terms but makes writes and multi-term queries costly, which is why document partitioning is the common choice.',
);

const windowAssign = item('Is the event counted?', (rand) => {
  const size = pick(rand, [10, 30, 60]);
  const t = pick(rand, [3, 7, 12, 25, 41, 58]) % (size * 2);
  const start = Math.floor(t / size) * size;
  const end = start + size;
  const watermark = pick(rand, [end - 2, end, end + 5, end - size + 1]);
  const counted = end > watermark;
  return {
    prompt: `A stream counts events in tumbling ${size}-second windows by event time. The watermark stands at ${watermark} s when an event with event time ${t} s arrives. Is it counted?`,
    ...withChoices(
      rand,
      counted ? `Yes: its window [${start}, ${end}) is still open` : `No: its window [${start}, ${end}) closed at the watermark`,
      [
        counted ? `No: its window [${start}, ${end}) closed at the watermark` : `Yes: its window [${start}, ${end}) is still open`,
        'Yes: every event is counted in the window of its arrival time',
        'No: events are only counted when they arrive in order',
      ],
    ),
    explain: `A window closes once the watermark passes its end. The window [${start}, ${end}) ${counted ? `is still open at ${watermark} s, so the event counts` : `closed when the watermark reached ${end} s, so the event is late: dropped, or sent to a side output for correction`}.`,
  };
});

const watermark = concept(
  'What does a stream processor trade by holding its watermark further behind the newest events it has seen?',
  'Fewer late events dropped, but each window result is emitted later and more state is kept',
  [
    'Higher throughput, since events can be processed in any order',
    'Exactly-once output, since late events are retried until they fit',
    'Less memory, since fewer windows are open at once',
  ],
  'The watermark is the promise that no older events are coming. Holding it back tolerates more delay (mobile clients, retries) at the cost of latency and state; pushing it forward is fast but drops more events. Many systems add allowed lateness to update a closed window with stragglers.',
);

const exactlyOnce = concept(
  'A stream job crashes and restarts from its last checkpoint, replaying events since then. How does it avoid double-counting in the output?',
  'Commit output with the checkpoint (transactional sink) or write idempotently, keyed so a replay overwrites',
  [
    'Deliver every event at most once, so replays never happen',
    'Checkpoint after every single event, so nothing is replayed',
    'Rely on the message broker, which removes duplicates by content',
  ],
  'Replay makes processing at least once. The effect becomes exactly once when state and output commit together (Flink two-phase commit sinks, Kafka transactions) or when writes are idempotent upserts by a key such as window and user.',
);

const pageWriteAmp = item('Write amplification of a B-tree update', (rand) => {
  const page = pick(rand, [4, 8, 16]);
  const record = pick(rand, [64, 100, 200, 500]);
  const wa = (page * 1024) / record;
  const times = (v: number) => `about ${Math.round(v)} times`;
  return {
    prompt: `A B-tree stores ${record}-byte records in ${page} KB pages. Each random update changes one record, and its page is written back alone. Roughly how many bytes reach disk per byte of data changed (ignoring the log)?`,
    ...withChoices(rand, times(wa), [times(wa / 4), times(wa * 4), 'about 1 time']),
    explain: `A ${page} KB page is ${fmt(page * 1024)} bytes, rewritten for a ${record}-byte change: ${fmt(page * 1024)} / ${record} ≈ ${Math.round(wa)}. Batching updates to the same page, or an LSM tree that writes sequentially, cuts this.`,
  };
});

const lsmVsBtree = concept(
  'A service ingests 200,000 small events a second and mostly reads recent ones by key. Which storage engine fits better, and why?',
  'An LSM tree: writes are sequential appends and compaction, so it absorbs high write rates cheaply',
  [
    'A B-tree: every write updates the page in place, which is fastest for heavy ingest',
    'A B-tree: LSM trees cannot serve point lookups by key',
    'An LSM tree: it never needs to rewrite data once written',
  ],
  'LSM trees (RocksDB, Cassandra) turn random writes into sequential ones and batch them, at the cost of compaction rewrites and reads that may check several levels (bloom filters help). B-trees (Postgres, InnoDB) give steady read latency and in-place updates but pay a page write per random update.',
);

const bloomFilter = concept(
  'Why does an LSM tree keep a bloom filter for each sorted file?',
  'To skip files that certainly lack the key, so a point lookup reads about one file instead of every level',
  [
    'To sort keys inside each file without comparing them',
    'To compress values so more of each file fits in memory',
    'To find the newest version of a key without reading the log',
  ],
  'A bloom filter answers "definitely not here" or "maybe here" with a small false positive rate (about 1% at 10 bits per key). Checking it in memory avoids a disk read for most levels. It does not help range scans, which must merge every level.',
);

const DEFINITIONS: Record<DesignItemId, DesignItemDefinition> = {
  'response-time': responseTime,
  headroom,
  bottleneck,
  'load-balancer': lbConcept,
  qps,
  storage,
  availability,
  spof,
  'cache-tail': hitP99,
  'cache-math': cacheMath,
  cdn,
  'fix-db': fixDb,
  'replicas-writes': replicasWrites,
  'queue-drain': queueDrain,
  'worker-limit': workerLimit,
  'async-ack': asyncAck,
  'token-bucket': tokenBucket,
  'limiter-state': limiterState,
  'bots-cache': botsCache,
  'over-quota': overQuota,
  'shard-count': shardCount,
  'time-key': timeKey,
  'tenant-skew': tenantSkew,
  reshard,
  'quorum-overlap': quorumOverlap,
  'quorum-failures': quorumFailures,
  'partition-choice': partitionChoice,
  'majority-size': majoritySize,
  'even-cluster': evenCluster,
  'fencing-token': fencingToken,
  'id-range': idRange,
  'shard-counters': shardCounters,
  'random-keys': randomKeys,
  'idf-rank': idfRank,
  'index-refresh': indexRefresh,
  'index-sharding': indexSharding,
  'window-assign': windowAssign,
  watermark,
  'exactly-once': exactlyOnce,
  'page-write-amp': pageWriteAmp,
  'lsm-vs-btree': lsmVsBtree,
  'bloom-filter': bloomFilter,
};

export const DESIGN_ITEMS: ItemDef[] = DESIGN_ITEM_CATALOG.map((summary, i) =>
  designItem(designSummary(summary, i), DEFINITIONS[summary.id]),
);
