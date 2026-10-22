import type { ScenarioGoals, SimMetrics } from './types.js';

/** Free Build's "Your goals" (REDESIGN.md 4.6): p99 within 200 ms, errors within 1%, and no budget. */
export const FREE_BUILD_GOALS: ScenarioGoals = { maxP99Ms: 200, maxErrorRate: 0.01, maxMonthlyCost: Number.POSITIVE_INFINITY };

/** Met, missed, or not a goal at all (an unlimited budget). */
export type KpiVerdict = 'pass' | 'fail' | 'none';

export interface KpiVerdicts {
  p99: KpiVerdict;
  errors: KpiVerdict;
  cost: KpiVerdict;
}

/** How the run's numbers stand against goals, the rule `evaluate()` grades a mission by, so a KPI's color never disagrees with it. */
export function kpiVerdicts(m: SimMetrics, g: ScenarioGoals): KpiVerdicts {
  const verdict = (limit: number, pass: boolean): KpiVerdict => (limit === Number.POSITIVE_INFINITY ? 'none' : pass ? 'pass' : 'fail');
  return {
    p99: verdict(g.maxP99Ms, m.errorRate < 1 && m.p99Ms <= g.maxP99Ms),
    errors: verdict(g.maxErrorRate >= 1 ? Number.POSITIVE_INFINITY : g.maxErrorRate, m.errorRate <= g.maxErrorRate),
    cost: verdict(g.maxMonthlyCost, m.monthlyCost <= g.maxMonthlyCost),
  };
}
