import { ServiceUnavailableException } from '@nestjs/common';

/**
 * Daily AI spend circuit breaker (UTC days). State is per process, so with several API instances
 * the effective ceiling is budget × instances.
 */
export class SpendGuard {
  private day = '';
  private spent = 0;

  constructor(
    readonly budgetUsd: number | null,
    private readonly now: () => Date = () => new Date(),
  ) {}

  assertAvailable() {
    if (this.budgetUsd !== null && this.spentToday() >= this.budgetUsd) {
      throw new ServiceUnavailableException("The AI interviewer has reached today's usage limit. Please try again tomorrow.");
    }
  }

  record(costUsd: number | null) {
    this.spentToday();
    this.spent += costUsd ?? 0;
  }

  spentToday(): number {
    const today = this.now().toISOString().slice(0, 10);
    if (today !== this.day) {
      this.day = today;
      this.spent = 0;
    }
    return this.spent;
  }
}
