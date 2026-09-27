import { Logger, ServiceUnavailableException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { safeErrorDetails } from '../observability/safe-error.js';
import type { SpendReservation, SpendStore } from '../persistence/spend.store.js';

const MICROS_PER_USD = 1_000_000;
const UNAVAILABLE = 'The AI interviewer is temporarily unavailable. Please try again shortly.';

export class SpendGuard {
  private readonly log = new Logger(SpendGuard.name);
  private readonly budgetMicros: number | null;

  constructor(
    readonly budgetUsd: number | null,
    private readonly store: SpendStore,
  ) {
    this.budgetMicros = budgetUsd === null ? null : Math.floor(budgetUsd * MICROS_PER_USD);
    if (this.budgetMicros !== null && (!Number.isSafeInteger(this.budgetMicros) || this.budgetMicros < 0)) {
      throw new RangeError('AI budget exceeds the supported monetary range.');
    }
  }

  async reserve(maximumCostUsd: number): Promise<SpendReservation> {
    const amountMicros = Math.ceil(maximumCostUsd * MICROS_PER_USD);
    if (!Number.isSafeInteger(amountMicros) || amountMicros <= 0) throw new ServiceUnavailableException(UNAVAILABLE);
    let reservation: SpendReservation | null;
    try {
      reservation = await this.store.reserve(randomUUID(), amountMicros, this.budgetMicros);
    } catch (error) {
      this.log.error({ operation: 'interview.reserve-spend', ...safeErrorDetails(error) });
      throw new ServiceUnavailableException(UNAVAILABLE);
    }
    if (!reservation) {
      throw new ServiceUnavailableException('The AI interviewer has reached its current usage limit. Please try again later.');
    }
    return reservation;
  }

  async settle(reservation: SpendReservation, costUsd: number | null): Promise<void> {
    const actualMicros = costUsd === null ? NaN : Math.ceil(costUsd * MICROS_PER_USD);
    if (!Number.isSafeInteger(actualMicros) || actualMicros < 0) {
      this.log.warn({ operation: 'interview.unknown-spend' });
      return;
    }
    if (actualMicros > reservation.amountMicros) this.log.error({ operation: 'interview.spend-bound-exceeded' });
    try {
      await this.store.settle(reservation.id, actualMicros);
    } catch (error) {
      this.log.error({ operation: 'interview.settle-spend', ...safeErrorDetails(error) });
    }
  }

  async spentToday(): Promise<number> {
    return (await this.store.spentToday()) / MICROS_PER_USD;
  }
}
