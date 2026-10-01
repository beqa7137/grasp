import type { CohortMetrics } from '../admin/cohort-metrics.js';

export abstract class MetricsStore {
  /** Pilot metrics over every learner, as of `now`. */
  abstract cohort(now: Date): Promise<CohortMetrics>;
}
