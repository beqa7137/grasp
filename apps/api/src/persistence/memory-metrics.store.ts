import { cohortMetrics, type CohortMetrics } from '../admin/cohort-metrics.js';
import { MetricsStore } from './metrics.store.js';
import type { MemoryFeedbackStore, MemoryInterviewStore, MemoryProgressStore } from './memory.stores.js';

export class MemoryMetricsStore extends MetricsStore {
  constructor(
    private readonly progress: MemoryProgressStore,
    private readonly interviews: MemoryInterviewStore,
    private readonly feedback: MemoryFeedbackStore,
  ) {
    super();
  }

  async cohort(now: Date): Promise<CohortMetrics> {
    return cohortMetrics(await this.progress.all(), await this.interviews.all(), await this.feedback.all(), now);
  }
}
