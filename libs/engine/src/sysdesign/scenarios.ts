import { fmt } from './format.js';
import { SCENARIO_CATALOG, type ScenarioId, type ScenarioSummary } from './scenario-catalog.js';
import { SCENARIO_VARIANTS } from './scenario-variants.js';
import { simulate } from './simulate.js';
import type { Design, DesignNode, GoalCheck, Scenario, SimResult } from './types.js';

const n = (id: string, kind: Design['nodes'][number]['kind'], x: number, y: number, instances = 1, extra: Partial<DesignNode> = {}) => ({
  id,
  kind,
  x,
  y,
  instances,
  ...extra,
});

type ScenarioDefinition = Omit<Scenario, keyof ScenarioSummary | 'variants' | 'revisit'>;

const DEFINITIONS: Record<ScenarioId, ScenarioDefinition> = {
  'first-scale-up': {
    brief:
      "A startup's REST API runs on a single app server. Marketing expects 3,000 requests/second at launch, 90% reads. Keep p99 under 150 ms and errors near zero without blowing the budget.",
    starter: {
      nodes: [n('users', 'client', 70, 240), n('app', 'app', 360, 240), n('db', 'db', 640, 240)],
      edges: [
        { from: 'users', to: 'app' },
        { from: 'app', to: 'db' },
      ],
    },
    hints: [
      'Tap the App node: how many requests per second can one instance handle?',
      'Stateless servers scale horizontally. Something needs to spread traffic across them.',
      'Watch the p99 as you add instances: latency explodes as utilization approaches 100%.',
    ],
    takeaway: 'Horizontal scaling + a load balancer is the first move for a stateless tier. Aim for ≤ 70% utilization so p99 stays flat.',
  },
  'viral-feed': {
    brief:
      'A social feed hits the front page. Traffic jumps to 40,000 RPS with 97% reads. Keep p99 under 180 ms, errors under 0.1%, no single point of failure, and spend at most $9,000/month.',
    starter: {
      nodes: [n('users', 'client', 70, 240), n('lb', 'lb', 260, 240), n('app', 'app', 450, 240, 4), n('db', 'db', 700, 240)],
      edges: [
        { from: 'users', to: 'lb' },
        { from: 'lb', to: 'app' },
        { from: 'app', to: 'db' },
      ],
    },
    hints: [
      'Adding app servers alone will not save the database. Where do the reads go?',
      'A cache with an 85% hit rate turns 38.8k DB reads into ~5.8k. Is that enough for one primary?',
      'Read replicas split reads. A CDN removes cacheable reads before they even reach your LB.',
      'No single point of failure means 2+ of every stateful or routing component, and a replica for the DB.',
    ],
    takeaway: 'Read-heavy systems scale by caching at every layer (CDN → cache → replicas). Each layer multiplies the one behind it.',
  },
  'flash-sale': {
    brief:
      'A ticketing site opens sales for a stadium tour: 15,000 RPS for 60 seconds, 70% of them writes (orders). The database can take ~2.5k writes/s. Every accepted order must be durable, p99 under 250 ms, errors under 0.5%, and the backlog must clear within 10 minutes of the spike.',
    starter: {
      nodes: [n('users', 'client', 70, 220), n('lb', 'lb', 240, 220, 2), n('app', 'app', 420, 220, 8), n('db', 'db', 720, 220)],
      edges: [
        { from: 'users', to: 'lb' },
        { from: 'lb', to: 'app' },
        { from: 'app', to: 'db' },
      ],
    },
    hints: [
      'You cannot make one primary take 10.5k writes/s. Can you accept orders now and write them a bit later?',
      'A queue acknowledges writes in milliseconds. Workers drain it into the database.',
      'More workers drain faster, until they overload the database. Find the balance.',
    ],
    takeaway:
      'Queues decouple accepting work from doing it. Size consumers to what the slowest downstream dependency can sustain, not to peak inflow.',
  },
  'bot-storm': {
    brief:
      'A marketplace serves 6,000 RPS of real users (90% reads). Overnight, scrapers and credential stuffers add 24,000 RPS of bot traffic from thousands of IPs, and it keeps falling over. Keep p99 under 200 ms and real-user errors under 0.1%, with no single point of failure, for at most $5,000/month.',
    starter: {
      nodes: [
        n('users', 'client', 70, 240),
        n('lb', 'lb', 250, 240, 2),
        n('app', 'app', 430, 240, 5),
        n('cache', 'cache', 610, 240, 2),
        n('db', 'db', 790, 240),
        n('rep', 'replica', 790, 380),
      ],
      edges: [
        { from: 'users', to: 'lb' },
        { from: 'lb', to: 'app' },
        { from: 'app', to: 'cache' },
        { from: 'cache', to: 'db' },
        { from: 'db', to: 'rep' },
      ],
    },
    hints: [
      'Tap the cache: why does bot traffic sail straight through it to the database?',
      'Scaling every tier to carry bots costs far more than the budget. Can you stop them before they cost anything?',
      'A rate limiter between users and the load balancer rejects clients over quota with 429. Real users stay under quota.',
      'The limiter sits in front of everything, so one instance is a single point of failure.',
    ],
    takeaway:
      'Shed abusive load at the edge, before it costs anything. Bots bypass caches, so every unfiltered bot request is a database request. Rate limits must be per client and shared across limiter instances.',
  },
  'write-wall': {
    brief:
      'A chat service stores 12,000 RPS, 60% of them new messages (all day, not in a spike). Each write costs the database 2 ops, so one primary tops out near 2,500 writes/s. The messages table is partitioned by created_at. Keep p99 under 200 ms, errors under 0.1%, the queue (if any) keeping up, and spend at most $9,000/month.',
    starter: {
      nodes: [
        n('users', 'client', 70, 240),
        n('lb', 'lb', 250, 240, 2),
        n('app', 'app', 430, 240, 8),
        n('cache', 'cache', 610, 240),
        n('db', 'db', 790, 240, 1, { shardKey: 'time' }),
      ],
      edges: [
        { from: 'users', to: 'lb' },
        { from: 'lb', to: 'app' },
        { from: 'app', to: 'cache' },
        { from: 'cache', to: 'db' },
      ],
    },
    hints: [
      'Replicas replay every write, and a queue only delays writes the database still has to absorb. What actually adds write capacity?',
      'Each database instance can be a shard: its own primary owning part of the keys. Try adding a few.',
      'Look at the per-shard bars. With created_at ranges, which shard receives every new message?',
      'Pick a shard key that spreads writes evenly, then size the shard count for ~70% utilization.',
    ],
    takeaway:
      'Sustained write load needs more primaries: shard. The shard key decides everything. It must spread writes evenly (hash of a high-cardinality key), or one hot shard caps the whole system.',
  },
  'leaderboard-budget': {
    brief:
      "A mobile game's leaderboard takes 24,000 RPS all day. 75% are reads of the global top 100, the same page for every player and fine a few seconds stale. The rest are score submissions: 6,000 writes/s at 2 database ops each. Keep p99 under 200 ms and errors under 0.1% for at most $8,500/month.",
    starter: {
      nodes: [n('users', 'client', 70, 240), n('lb', 'lb', 250, 240, 2), n('app', 'app', 430, 240, 12), n('db', 'db', 700, 240)],
      edges: [
        { from: 'users', to: 'lb' },
        { from: 'lb', to: 'app' },
        { from: 'app', to: 'db' },
      ],
    },
    hints: [
      'Split the load: 18,000 reads/s and 12,000 write ops/s. Which tool fixes each, and which fixes neither?',
      'Replicas replay every write. Count what 6,000 writes/s leave of a replica before it serves a single read.',
      'Every player sees the same top 100. The cheapest request is one your servers never receive.',
      'Price each fix: a shard is $1,100, a cache node $350, a CDN $600, an app server $220. Remove what the cheaper layers made idle.',
    ],
    takeaway:
      'Give each load its cheapest fix. A page every player reads, like the top 100, is ideal to cache at the edge and in memory. Writes need more primaries: replicas replay every write, so only shards add write capacity. Then size every tier to the load it really sees. Adding more of everything meets the latency goal and misses the budget.',
  },
  'mail-attachments': {
    brief:
      "A mail service's storage tier takes 10,000 RPS all day, 30% reads. Half of the requests upload or download a message body or an attachment, a whole object; the rest list, flag and label messages. One primary takes about 2,500 writes/s. Keep every accepted write durable (a queue, if any, must keep up), p99 under 250 ms and errors under 0.1%, for at most $5,500/month.",
    starter: {
      nodes: [n('users', 'client', 70, 240), n('lb', 'lb', 250, 240, 2), n('app', 'app', 430, 240, 6), n('db', 'db', 700, 240)],
      edges: [
        { from: 'users', to: 'lb' },
        { from: 'lb', to: 'app' },
        { from: 'app', to: 'db' },
      ],
    },
    hints: [
      'Tap the database: how much of its load is files that nobody will ever query?',
      'An object store keeps whole files by key, scales far past a database and costs one flat price. What would the database have left to do?',
      'Size the shards for the records alone: of 7,000 writes a second, 3,500 are records, at 2 ops each 7,000 ops, plus the record reads that reach them. Keeping each shard well short of full, that is two shards, against four if the database kept the files too.',
      'In this model a file takes about 25 ms to its first byte (real object stores take tens of milliseconds, more at the tail), against 6 ms for a database read. Leave the app tier enough headroom to keep the p99 under 250 ms.',
    ],
    takeaway:
      'Keep bytes out of the database. Bodies, attachments and images belong in an object store, referenced by key from a metadata row, so the database is sized for the records alone, and its shards shrink with the share of traffic that is files. The store is slower to the first byte, about 25 ms, so leave latency headroom elsewhere.',
  },
  'ledger-month-end': {
    brief:
      "A payments platform records every money movement as a balanced ledger entry: 12,000 RPS all day, half of them new entries and half balance and statement reads. The new entries are transfers that debit a wallet: each checks the balance and commits before it replies, because the caller must know whether the money moved, so no queue may accept them. (Captures from other services already arrive through their outbox; that queue sits upstream of the caller, not between the ledger's reply and its commit.) One primary takes about 2,500 writes/s, and the ledger must survive losing any machine. Keep p99 under 200 ms and errors under 0.1% for at most $11,000/month.",
    starter: {
      nodes: [n('users', 'client', 70, 240), n('lb', 'lb', 250, 240, 2), n('app', 'app', 430, 240, 8), n('db', 'db', 700, 240)],
      edges: [
        { from: 'users', to: 'lb' },
        { from: 'lb', to: 'app' },
        { from: 'app', to: 'db' },
      ],
    },
    hints: [
      'A queue would reply before the balance check commits. What else adds write capacity?',
      'Replicas replay every write, so they help reads only. How many primaries do 6,000 transfers a second at 2 ops each need?',
      'Each shard is a primary that owns some of the accounts. When one dies, its accounts stop: what does every shard need?',
      'Statement pages and balances shown on screens repeat. Something in front of the shards can answer most of them; a balance that decides a transfer is read inside its transaction.',
    ],
    takeaway:
      'Some writes cannot wait. A transfer checks the balance and commits before it answers, so a queue cannot absorb the load and replicas cannot take it: only more primaries add write capacity. Shard the ledger, give every shard a replica to fail over to, and cache the statement and display reads.',
  },
  'reconnect-storm': {
    brief:
      'The control plane was down for 20 minutes. When it returns, all 50,000 agents reconnect at once: for three minutes it takes 16,000 RPS, half polls for desired state and half state reports, every one of which must be kept. One primary takes about 2,500 writes/s. Keep the control plane free of single points of failure, clear the report backlog within 10 minutes of the storm, p99 under 250 ms and errors under 0.1%, for at most $9,000/month.',
    starter: {
      nodes: [
        n('hosts', 'client', 70, 240, 1, { label: 'Host agents' }),
        n('lb', 'lb', 250, 240, 2),
        n('app', 'app', 430, 240, 8, { label: 'Control plane' }),
        n('db', 'db', 700, 240, 1, { label: 'Deploy store' }),
      ],
      edges: [
        { from: 'hosts', to: 'lb' },
        { from: 'lb', to: 'app' },
        { from: 'app', to: 'db' },
      ],
    },
    hints: [
      'The reports arrive in a burst and stop when the storm ends. Must the deploy store take them as fast as they arrive?',
      'A queue accepts a report in milliseconds and workers write it later. How fast can they write before a primary, which still serves reads, falls over?',
      'Every report must be written within the storm plus the deadline: 8,000 a second for 180 s, drained over 180 + 600 s, is about 1,850 a second. One worker drains 1,500 a second: enough? Two drain 3,000, and at 2 ops a write that is 6,000 ops a second: can one primary, with its 5,000, take that?',
      'The desired state changes only when a deploy does, so almost every poll can be answered from memory.',
    ],
    takeaway:
      "A queue buys time, not capacity. It accepts every report at once, but the workers behind it must drain the whole burst within its window plus the deadline, and the database behind them must take what they write: size the workers to the burst and the primaries to the workers. Polls for state that rarely changes belong in a cache. In production the cheapest fix is at the source: agents add random jitter before reconnecting and coalesce reports, since only each host's latest state matters, so the burst is bounded by hosts, not reports.",
  },
};

export const SCENARIOS: Scenario[] = SCENARIO_CATALOG.map(({ id, title, tagline, workload, goals }) => {
  const { brief, starter, hints, takeaway } = DEFINITIONS[id];
  return { id, title, tagline, brief, workload, goals, starter, hints, takeaway, variants: SCENARIO_VARIANTS[id] };
});

export function getScenario(id: string): Scenario | undefined {
  return SCENARIOS.find((s) => s.id === id);
}

/** The mission as it appears on its n-th spaced revisit (1-based). */
export function scenarioVariant(id: string, revisit: number): Scenario | undefined {
  const base = getScenario(id);
  const variant = base?.variants?.[revisit - 1];
  if (!base || !variant) return undefined;
  return {
    ...base,
    title: `${base.title} · Revisit ${revisit}`,
    brief: variant.twist,
    workload: variant.workload,
    goals: variant.goals,
    hints: [],
    revisit: { number: revisit, of: base.variants!.length, twist: variant.twist },
  };
}

export function drainMinutes(result: SimResult, spikeSeconds: number): number {
  return (result.metrics.backlogDrainRatio * spikeSeconds) / 60;
}

export function evaluate(scenario: Scenario, design: Design, result: SimResult = simulate(design, scenario.workload)): GoalCheck[] {
  const g = scenario.goals;
  const m = result.metrics;
  const checks: GoalCheck[] = [
    {
      id: 'p99',
      label: `p99 latency ≤ ${g.maxP99Ms} ms`,
      pass: m.errorRate < 1 && m.p99Ms <= g.maxP99Ms,
      actual: `${Math.round(m.p99Ms)} ms`,
    },
    {
      id: 'errors',
      label: `Error rate ≤ ${(g.maxErrorRate * 100).toFixed(1)}%`,
      pass: m.errorRate <= g.maxErrorRate,
      actual: `${(m.errorRate * 100).toFixed(2)}%`,
    },
    { id: 'cost', label: `Cost ≤ $${fmt(g.maxMonthlyCost)}/mo`, pass: m.monthlyCost <= g.maxMonthlyCost, actual: `$${fmt(m.monthlyCost)}` },
  ];
  if (g.noSinglePointOfFailure) {
    const spofs = result.insights.filter((i) => i.title.startsWith('Single point of failure')).length;
    checks.push({ id: 'spof', label: 'No single point of failure', pass: spofs === 0, actual: spofs === 0 ? 'none' : `${spofs} found` });
  }
  if (g.requireDurableWrites) {
    const bgFailing = result.insights.some((i) => i.title === 'Background writes are failing');
    const pass = m.durableWriteRatio >= 0.999 && !bgFailing;
    checks.push({
      id: 'durable',
      label: 'Every accepted write is persisted',
      pass,
      actual: bgFailing ? 'jobs failing' : `${(m.durableWriteRatio * 100).toFixed(1)}%`,
    });
  }
  if (g.synchronousWrites) {
    const queued = m.queuedWriteRps;
    const persisted = m.durableWriteRatio >= 0.999;
    checks.push({
      id: 'sync',
      label: 'Every write commits before the reply',
      pass: queued < 1 && persisted,
      actual:
        queued >= 1 ? `${fmt(queued)}/s queued` : persisted ? 'all committed' : `${(m.durableWriteRatio * 100).toFixed(1)}% persisted`,
    });
  }
  if (g.noBacklog) {
    const growth = m.backlogGrowthPerSec;
    checks.push({
      id: 'backlog',
      label: 'Queue keeps up with sustained load',
      pass: growth <= 1,
      actual: growth <= 1 ? 'no backlog' : `+${fmt(growth)}/s`,
    });
  }
  if (g.spikeSeconds && g.maxDrainMinutes !== undefined) {
    const minutes = drainMinutes(result, g.spikeSeconds);
    checks.push({
      id: 'drain',
      label: `Backlog clears ≤ ${g.maxDrainMinutes} min after the spike`,
      pass: minutes <= g.maxDrainMinutes,
      actual: Number.isFinite(minutes) ? `${minutes.toFixed(1)} min` : 'never',
    });
  }
  return checks;
}
