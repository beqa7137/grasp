import { Logger, ServiceUnavailableException } from '@nestjs/common';
import { safeErrorDetails } from '../observability/safe-error.js';
import type { CoordinationStore } from '../persistence/stores.js';

const DAY_MS = 86_400_000;
const SPEND_KEY = 'ai-spend-usd';
/** Daily totals are kept for a while as a spend history, then swept. */
const HISTORY_MS = 90 * DAY_MS;

/**
 * Daily AI spend circuit breaker (UTC days), shared by every API instance through the coordination store.
 * The check and the charge are separate, so calls already in flight when the budget runs out can overshoot
 * it by their own cost; that is the price of not holding a lock across a model call.
 */
export class SpendGuard {
  private readonly log = new Logger(SpendGuard.name);

  constructor(
    readonly budgetUsd: number | null,
    private readonly store: CoordinationStore,
  ) {}

  async assertAvailable(): Promise<void> {
    if (this.budgetUsd === null) return;
    let spent: number;
    try {
      spent = await this.spentToday();
    } catch (error) {
      // Fail closed: without the shared total, the only safe answer for a paid call is no.
      this.log.error({ operation: 'interview.read-spend', ...safeErrorDetails(error) });
      throw new ServiceUnavailableException('The AI interviewer is temporarily unavailable. Please try again shortly.');
    }
    if (spent >= this.budgetUsd) {
      throw new ServiceUnavailableException("The AI interviewer has reached today's usage limit. Please try again tomorrow.");
    }
  }

  /** Never throws: the model call already happened, and the learner should still get its result. */
  async record(costUsd: number | null): Promise<void> {
    if (!costUsd) return;
    try {
      await this.store.add(SPEND_KEY, DAY_MS, costUsd, HISTORY_MS);
    } catch (error) {
      this.log.error({ operation: 'interview.record-spend', ...safeErrorDetails(error) });
    }
  }

  spentToday(): Promise<number> {
    return this.store.read(SPEND_KEY, DAY_MS);
  }
}
