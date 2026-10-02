import { KEPT, LEDGER, WAVE } from './mission-goals.js';
import type { ScenarioId } from './scenario-catalog.js';
import type { ScenarioVariant } from './types.js';

/** Changed conditions for the spaced revisits of each completed mission, one per revisit. */
export const SCENARIO_VARIANTS: Record<ScenarioId, readonly ScenarioVariant[]> = {
  'first-scale-up': [
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
  'viral-feed': [
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
  'flash-sale': [
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
  'bot-storm': [
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
  'write-wall': [
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
  'leaderboard-budget': [
    {
      twist: 'A new season launches: 36,000 RPS, still 75% reads, all day. Budget $12,000.',
      workload: { rps: 36_000, readRatio: 0.75 },
      goals: { maxP99Ms: 200, maxErrorRate: 0.001, maxMonthlyCost: 12_000 },
    },
    {
      twist:
        'A shard failed during a tournament and a quarter of the scores vanished for an hour. Same load, now with no single point of failure. Budget $12,500.',
      workload: { rps: 24_000, readRatio: 0.75 },
      goals: { maxP99Ms: 200, maxErrorRate: 0.001, maxMonthlyCost: 12_500, noSinglePointOfFailure: true },
    },
    {
      twist: 'A live tournament: every match posts a score, so 20,000 RPS are half writes. Budget $11,000.',
      workload: { rps: 20_000, readRatio: 0.5 },
      goals: { maxP99Ms: 200, maxErrorRate: 0.001, maxMonthlyCost: 11_000 },
    },
  ],
  'mail-attachments': [
    {
      twist: 'Photo sharing took off: 14,000 RPS at 30% reads, and 70% of requests now carry a file. Budget $6,500.',
      workload: { rps: 14_000, readRatio: 0.3, objectShare: 0.7 },
      goals: { ...KEPT, maxP99Ms: 250, maxMonthlyCost: 6_500, noBacklog: true },
    },
    {
      twist:
        'A metadata shard died and its mailboxes went dark for an hour. Same load, now with no single point of failure. Budget $7,500.',
      workload: { rps: 10_000, readRatio: 0.3, objectShare: 0.5 },
      goals: { ...KEPT, maxP99Ms: 250, maxMonthlyCost: 7_500, noBacklog: true, noSinglePointOfFailure: true },
    },
    {
      twist:
        'A client bug forces a full resync of every label and flag: 13,000 RPS at 20% reads, and only 30% of requests touch a body or attachment. Budget $8,000.',
      workload: { rps: 13_000, readRatio: 0.2, objectShare: 0.3 },
      goals: { ...KEPT, maxP99Ms: 250, maxMonthlyCost: 8_000, noBacklog: true },
    },
  ],
  'ledger-month-end': [
    {
      twist: 'A year of growth on top of the holiday peak: 16,000 RPS, still half of them new entries. Budget $14,000.',
      workload: { rps: 16_000, readRatio: 0.5, objectShare: 0 },
      goals: { ...LEDGER, maxMonthlyCost: 14_000 },
    },
    {
      twist: 'The month has closed and merchants pull their statements: 12,000 RPS at 80% reads. Budget $8,000.',
      workload: { rps: 12_000, readRatio: 0.8, objectShare: 0 },
      goals: { ...LEDGER, maxMonthlyCost: 8_000 },
    },
    {
      twist: 'A payout run posts an entry for every merchant: 11,000 RPS at 25% reads. Budget $13,000.',
      workload: { rps: 11_000, readRatio: 0.25, objectShare: 0 },
      goals: { ...LEDGER, maxMonthlyCost: 13_000 },
    },
  ],
  'reconnect-storm': [
    {
      twist:
        'This time the outage lasts 10 minutes, but every agent reconnects within the first minute: 24,000 RPS for 60 seconds, half of them reports. Budget $8,000.',
      workload: { rps: 24_000, readRatio: 0.5, objectShare: 0 },
      goals: { ...WAVE, maxMonthlyCost: 8_000, spikeSeconds: 60 },
    },
    {
      twist:
        'Agents now wait a random delay before reconnecting: the storm spreads over four minutes at 10,000 RPS, half of them reports. Budget $6,000.',
      workload: { rps: 10_000, readRatio: 0.5, objectShare: 0 },
      goals: { ...WAVE, maxMonthlyCost: 6_000, spikeSeconds: 240 },
    },
    {
      twist: 'Agents poll every few seconds while they wait for new state: 20,000 RPS for three minutes at 70% reads. Budget $7,200.',
      workload: { rps: 20_000, readRatio: 0.7, objectShare: 0 },
      goals: { ...WAVE, maxMonthlyCost: 7_200, spikeSeconds: 180 },
    },
  ],
};
