import { KEPT, LEDGER, WAVE } from './mission-goals.js';
import type { ScenarioGoals, Workload } from './types.js';

/** A Design Lab mission as lists, route titles and progress see it. */
export interface ScenarioSummary<Id extends string = string> {
  id: Id;
  title: string;
  tagline: string;
  workload: Workload;
  goals: ScenarioGoals;
}

const CATALOG = [
  {
    id: 'first-scale-up',
    title: 'Your First Scale-Up',
    tagline: 'One server, one database, and a launch tomorrow.',
    workload: { rps: 3_000, readRatio: 0.9 },
    goals: { maxP99Ms: 150, maxErrorRate: 0.001, maxMonthlyCost: 4_000 },
  },
  {
    id: 'viral-feed',
    title: 'The Feed Goes Viral',
    tagline: '40k RPS, almost all reads, and the database is on fire.',
    workload: { rps: 40_000, readRatio: 0.97 },
    goals: { maxP99Ms: 180, maxErrorRate: 0.001, maxMonthlyCost: 9_000, noSinglePointOfFailure: true },
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
  },
  {
    id: 'bot-storm',
    title: 'Bot Storm',
    tagline: 'Your real users are fine. The 24k bots behind them are not.',
    workload: { rps: 6_000, readRatio: 0.9, botRps: 24_000 },
    goals: { maxP99Ms: 200, maxErrorRate: 0.001, maxMonthlyCost: 5_000, noSinglePointOfFailure: true },
  },
  {
    id: 'write-wall',
    title: 'The Write Wall',
    tagline: '7,200 messages a second, forever. One primary takes 2,500.',
    workload: { rps: 12_000, readRatio: 0.4 },
    goals: { maxP99Ms: 200, maxErrorRate: 0.001, maxMonthlyCost: 9_000, requireDurableWrites: true, noBacklog: true },
  },
  {
    id: 'leaderboard-budget',
    title: 'Leaderboard on a Budget',
    tagline: '18k reads and 6k score writes a second, on $8,500 a month.',
    workload: { rps: 24_000, readRatio: 0.75 },
    goals: { maxP99Ms: 200, maxErrorRate: 0.001, maxMonthlyCost: 8_500 },
  },
  {
    id: 'mail-attachments',
    title: 'Attachments Everywhere',
    tagline: '10k RPS all day, and half of them carry a file.',
    workload: { rps: 10_000, readRatio: 0.3, objectShare: 0.5 },
    goals: { ...KEPT, maxP99Ms: 250, maxMonthlyCost: 5_500, noBacklog: true },
  },
  {
    id: 'ledger-month-end',
    title: 'Month-End Ledger',
    tagline: '6,000 transfers a second, and each one commits before it answers.',
    workload: { rps: 12_000, readRatio: 0.5, objectShare: 0 },
    goals: { ...LEDGER, maxMonthlyCost: 11_000 },
  },
  {
    id: 'reconnect-storm',
    title: 'Reconnect Storm',
    tagline: '50,000 agents reconnect at once, for three minutes.',
    workload: { rps: 16_000, readRatio: 0.5, objectShare: 0 },
    goals: { ...WAVE, maxMonthlyCost: 9_000, spikeSeconds: 180 },
  },
] as const satisfies readonly ScenarioSummary[];

export type ScenarioId = (typeof CATALOG)[number]['id'];

/** Every mission, in the order the Design Lab lists them. */
export const SCENARIO_CATALOG: readonly ScenarioSummary<ScenarioId>[] = CATALOG;

export function getScenarioSummary(id: string): ScenarioSummary | undefined {
  return SCENARIO_CATALOG.find((s) => s.id === id);
}
