import type { BalanceRun, BalanceSettings, Balancer, SdExperiment } from '@grasp/engine';

/** What the lesson widgets ask the simulation worker (REDESIGN.md 3.3, `sim.worker.ts`). */
export type SimRequest = { kind: 'balance'; policy: Balancer; settings: BalanceSettings; samples: number } | { kind: 'lb-experiments' };

export type SimResult<R extends SimRequest> = R extends { kind: 'balance' } ? BalanceRun : SdExperiment[];
