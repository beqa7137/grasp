import type { ScenarioGoals, ScenarioVariant, Workload } from './types.js';

/** Short numbers such as 25k or 1.2M. Here rather than in its own module so the mission list needs no extra chunk. */
export function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `${Math.round(n / 1000)}k`;
  if (n >= 1_000) return `${(n / 1000).toFixed(1)}k`;
  return `${Math.round(n)}`;
}

/** A Design Lab mission as lists, route titles and progress see it. */
export interface ScenarioSummary<Id extends string = string> {
  id: Id;
  title: string;
  tagline: string;
  workload: Workload;
  goals: ScenarioGoals;
  /** Changed conditions for the spaced revisits of a completed mission, one per revisit. */
  variants: readonly ScenarioVariant[];
}

const CATALOG = [
  {
    id: 'first-scale-up',
    title: 'Your First Scale-Up',
    tagline: 'One server, one database, and a launch tomorrow.',
    workload: { rps: 3_000, readRatio: 0.9 },
    goals: { maxP99Ms: 150, maxErrorRate: 0.001, maxMonthlyCost: 4_000 },
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
    workload: { rps: 40_000, readRatio: 0.97 },
    goals: { maxP99Ms: 180, maxErrorRate: 0.001, maxMonthlyCost: 9_000, noSinglePointOfFailure: true },
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
    workload: { rps: 15_000, readRatio: 0.3 },
    goals: {
      maxP99Ms: 250,
      maxErrorRate: 0.005,
      maxMonthlyCost: 12_000,
      spikeSeconds: 60,
      maxDrainMinutes: 10,
      requireDurableWrites: true,
    },
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
        twist: 'Last sale the queue broker died mid-spike. Same load, now with no single point of failure.',
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
    workload: { rps: 6_000, readRatio: 0.9, botRps: 24_000 },
    goals: { maxP99Ms: 200, maxErrorRate: 0.001, maxMonthlyCost: 5_000, noSinglePointOfFailure: true },
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
    workload: { rps: 12_000, readRatio: 0.4 },
    goals: { maxP99Ms: 200, maxErrorRate: 0.001, maxMonthlyCost: 9_000, requireDurableWrites: true, noBacklog: true },
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
] as const satisfies readonly ScenarioSummary[];

export type ScenarioId = (typeof CATALOG)[number]['id'];

/** Every mission, in the order the Design Lab lists them. */
export const SCENARIO_CATALOG: readonly ScenarioSummary<ScenarioId>[] = CATALOG;

export function getScenarioSummary(id: string): ScenarioSummary | undefined {
  return SCENARIO_CATALOG.find((s) => s.id === id);
}
