import { SCENARIO_CATALOG, fmt, type ScenarioId, type ScenarioSummary } from './scenario-catalog.js';
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

type ScenarioDefinition = Omit<Scenario, keyof ScenarioSummary | 'revisit'>;

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
};

export const SCENARIOS: Scenario[] = SCENARIO_CATALOG.map(({ id, title, tagline, workload, goals, variants }) => {
  const { brief, starter, hints, takeaway } = DEFINITIONS[id];
  return { id, title, tagline, brief, workload, goals, starter, hints, takeaway, variants };
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
  const { backlogGrowthPerSec, queueDrainRps } = result.metrics;
  if (backlogGrowthPerSec <= 0) return 0;
  if (queueDrainRps <= 0) return Number.POSITIVE_INFINITY;
  return (backlogGrowthPerSec * spikeSeconds) / queueDrainRps / 60;
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
