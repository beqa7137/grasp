import { fmt, simulate } from './simulate.js';
import type { Design, DesignNode, GoalCheck, Scenario, SimResult } from './types.js';

const n = (id: string, kind: Design['nodes'][number]['kind'], x: number, y: number, instances = 1, extra: Partial<DesignNode> = {}) => ({
  id,
  kind,
  x,
  y,
  instances,
  ...extra,
});

export const SCENARIOS: Scenario[] = [
  {
    id: 'first-scale-up',
    title: 'Your First Scale-Up',
    tagline: 'One server, one database, and a launch tomorrow.',
    brief:
      "A startup's REST API runs on a single app server. Marketing expects 3,000 requests/second at launch, 90% reads. Keep p99 under 150 ms and errors near zero without blowing the budget.",
    workload: { rps: 3_000, readRatio: 0.9 },
    goals: { maxP99Ms: 150, maxErrorRate: 0.001, maxMonthlyCost: 4_000 },
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
      'Watch the p99 as you add instances — latency explodes as utilization approaches 100%.',
    ],
    takeaway: 'Horizontal scaling + a load balancer is the first move for a stateless tier. Aim for ≤ 70% utilization so p99 stays flat.',
    variants: [
      {
        twist: 'Launch went well: traffic is up 50% and a new feature added writes. 4,500 RPS, 85% reads, same $4k budget.',
        workload: { rps: 4_500, readRatio: 0.85 },
        goals: { maxP99Ms: 150, maxErrorRate: 0.001, maxMonthlyCost: 4_000 },
      },
      {
        twist: 'An outage last week took the site down. Same traffic, but leadership now wants no single point of failure.',
        workload: { rps: 3_000, readRatio: 0.9 },
        goals: { maxP99Ms: 150, maxErrorRate: 0.001, maxMonthlyCost: 4_000, noSinglePointOfFailure: true },
      },
      {
        twist: 'A press mention: 8,000 RPS, 90% reads. Keep p99 under 150 ms on a $4.5k budget.',
        workload: { rps: 8_000, readRatio: 0.9 },
        goals: { maxP99Ms: 150, maxErrorRate: 0.001, maxMonthlyCost: 4_500 },
      },
    ],
  },
  {
    id: 'viral-feed',
    title: 'The Feed Goes Viral',
    tagline: '40k RPS, almost all reads, and the database is on fire.',
    brief:
      'A social feed hits the front page. Traffic jumps to 40,000 RPS with 97% reads. Keep p99 under 180 ms, errors under 0.1%, no single point of failure, and spend at most $9,000/month.',
    workload: { rps: 40_000, readRatio: 0.97 },
    goals: { maxP99Ms: 180, maxErrorRate: 0.001, maxMonthlyCost: 9_000, noSinglePointOfFailure: true },
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
    variants: [
      {
        twist: 'The feed goes international: 60,000 RPS at 98% reads. Budget grows to $10k.',
        workload: { rps: 60_000, readRatio: 0.98 },
        goals: { maxP99Ms: 180, maxErrorRate: 0.001, maxMonthlyCost: 10_000, noSinglePointOfFailure: true },
      },
      {
        twist: 'Same 40k RPS, but the product team wants the feed snappier: p99 under 120 ms.',
        workload: { rps: 40_000, readRatio: 0.97 },
        goals: { maxP99Ms: 120, maxErrorRate: 0.001, maxMonthlyCost: 9_000, noSinglePointOfFailure: true },
      },
      {
        twist: 'A global event: 80,000 RPS at 98% reads, $11k budget, still no single point of failure.',
        workload: { rps: 80_000, readRatio: 0.98 },
        goals: { maxP99Ms: 180, maxErrorRate: 0.001, maxMonthlyCost: 11_000, noSinglePointOfFailure: true },
      },
    ],
  },
  {
    id: 'flash-sale',
    title: 'Flash Sale at Noon',
    tagline: '10k orders/second for one minute. Every order must be kept.',
    brief:
      'A ticketing site opens sales for a stadium tour: 15,000 RPS for 60 seconds, 70% of them writes (orders). The database can take ~2.5k writes/s. Every accepted order must be durable, p99 under 250 ms, errors under 0.5%, and the backlog must clear within 10 minutes of the spike.',
    workload: { rps: 15_000, readRatio: 0.3 },
    goals: {
      maxP99Ms: 250,
      maxErrorRate: 0.005,
      maxMonthlyCost: 12_000,
      spikeSeconds: 60,
      maxDrainMinutes: 10,
      requireDurableWrites: true,
    },
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
      'More workers drain faster — until they overload the database. Find the balance.',
    ],
    takeaway:
      'Queues decouple accepting work from doing it. Size consumers to what the slowest downstream dependency can sustain, not to peak inflow.',
    variants: [
      {
        twist: 'A bigger tour: 20,000 RPS, 75% of them orders, for 45 seconds.',
        workload: { rps: 20_000, readRatio: 0.25 },
        goals: {
          maxP99Ms: 250,
          maxErrorRate: 0.005,
          maxMonthlyCost: 8_000,
          spikeSeconds: 45,
          maxDrainMinutes: 10,
          requireDurableWrites: true,
        },
      },
      {
        twist: 'Last sale the queue broker died mid-spike. Same load — now with no single point of failure.',
        workload: { rps: 15_000, readRatio: 0.3 },
        goals: {
          maxP99Ms: 250,
          maxErrorRate: 0.005,
          maxMonthlyCost: 8_000,
          spikeSeconds: 60,
          maxDrainMinutes: 10,
          requireDurableWrites: true,
          noSinglePointOfFailure: true,
        },
      },
      {
        twist: 'A slower, longer sale: 12,000 RPS for two full minutes, half of them orders. Clear the backlog within 8 minutes.',
        workload: { rps: 12_000, readRatio: 0.5 },
        goals: {
          maxP99Ms: 250,
          maxErrorRate: 0.005,
          maxMonthlyCost: 6_000,
          spikeSeconds: 120,
          maxDrainMinutes: 8,
          requireDurableWrites: true,
        },
      },
    ],
  },
  {
    id: 'bot-storm',
    title: 'Bot Storm',
    tagline: 'Your real users are fine. The 24k bots behind them are not.',
    brief:
      'A marketplace serves 6,000 RPS of real users (90% reads). Overnight, scrapers and credential stuffers add 24,000 RPS of bot traffic from thousands of IPs, and it keeps falling over. Keep p99 under 200 ms and real-user errors under 0.1%, with no single point of failure, for at most $5,000/month.',
    workload: { rps: 6_000, readRatio: 0.9, botRps: 24_000 },
    goals: { maxP99Ms: 200, maxErrorRate: 0.001, maxMonthlyCost: 5_000, noSinglePointOfFailure: true },
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
    variants: [
      {
        twist: 'The botnet doubles: 60,000 bot RPS on top of the same 6,000 real users. Budget $5,500.',
        workload: { rps: 6_000, readRatio: 0.9, botRps: 60_000 },
        goals: { maxP99Ms: 200, maxErrorRate: 0.001, maxMonthlyCost: 5_500, noSinglePointOfFailure: true },
      },
      {
        twist: 'A marketing push brings real growth: 12,000 user RPS (90% reads) plus 20,000 bot RPS. Budget $7,000.',
        workload: { rps: 12_000, readRatio: 0.9, botRps: 20_000 },
        goals: { maxP99Ms: 200, maxErrorRate: 0.001, maxMonthlyCost: 7_000, noSinglePointOfFailure: true },
      },
      {
        twist: 'A holiday sale: 8,000 user RPS at 80% reads while 40,000 bot RPS probe the checkout. Budget $6,000.',
        workload: { rps: 8_000, readRatio: 0.8, botRps: 40_000 },
        goals: { maxP99Ms: 200, maxErrorRate: 0.001, maxMonthlyCost: 6_000, noSinglePointOfFailure: true },
      },
    ],
  },
  {
    id: 'write-wall',
    title: 'The Write Wall',
    tagline: '7,200 messages a second, forever. One primary takes 2,500.',
    brief:
      'A chat service stores 12,000 RPS, 60% of them new messages — all day, not in a spike. Each write costs the database 2 ops, so one primary tops out near 2,500 writes/s. The messages table is partitioned by created_at. Keep p99 under 200 ms, errors under 0.1%, the queue (if any) keeping up, and spend at most $9,000/month.',
    workload: { rps: 12_000, readRatio: 0.4 },
    goals: { maxP99Ms: 200, maxErrorRate: 0.001, maxMonthlyCost: 9_000, requireDurableWrites: true, noBacklog: true },
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
      'Sustained write load needs more primaries: shard. The shard key decides everything — it must spread writes evenly (hash of a high-cardinality key), or one hot shard caps the whole system.',
    variants: [
      {
        twist: 'Read receipts shipped: 16,000 RPS at 45% reads, still sustained. Budget $10,500.',
        workload: { rps: 16_000, readRatio: 0.45 },
        goals: { maxP99Ms: 200, maxErrorRate: 0.001, maxMonthlyCost: 10_500, requireDurableWrites: true, noBacklog: true },
      },
      {
        twist:
          'A shard died last week and its messages were unreadable for an hour. Same load, but now no single point of failure. Budget $13,500.',
        workload: { rps: 12_000, readRatio: 0.4 },
        goals: {
          maxP99Ms: 200,
          maxErrorRate: 0.001,
          maxMonthlyCost: 13_500,
          requireDurableWrites: true,
          noBacklog: true,
          noSinglePointOfFailure: true,
        },
      },
      {
        twist: 'New Year’s Eve, all evening: 20,000 RPS at 30% reads. Budget $14,000.',
        workload: { rps: 20_000, readRatio: 0.3 },
        goals: { maxP99Ms: 200, maxErrorRate: 0.001, maxMonthlyCost: 14_000, requireDurableWrites: true, noBacklog: true },
      },
    ],
  },
];

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
