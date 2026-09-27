import type { CoordinationStore } from './stores.js';
import {
  assertReservationId,
  assertSpendMicros,
  legacySpendMicros,
  LEGACY_SPEND_KEY,
  safeSpendTotal,
  SPEND_DAY_MS,
  SPEND_HISTORY_MS,
  SpendStore,
  type SpendReservation,
} from './spend.store.js';

interface SpendDay {
  legacy: bigint;
  settled: bigint;
  reserved: bigint;
  expiresAt: number;
}

interface Reservation {
  day: string;
  amount: bigint;
  actual: bigint | null;
}

export class MemorySpendStore extends SpendStore {
  private readonly days = new Map<string, SpendDay>();
  private readonly reservations = new Map<string, Reservation>();

  constructor(
    private readonly coordination: CoordinationStore,
    private readonly now: () => number = Date.now,
  ) {
    super();
  }

  async reserve(id: string, amountMicros: number, budgetMicros: number | null): Promise<SpendReservation | null> {
    assertReservationId(id);
    assertSpendMicros(amountMicros, true);
    if (budgetMicros !== null) assertSpendMicros(budgetMicros);
    const { day, state } = await this.current();
    const key = id.toLowerCase();
    if (this.reservations.has(key)) throw new Error('Spend reservation already exists');
    const amount = BigInt(amountMicros);
    const next = safeSpendTotal(state.legacy + state.settled + state.reserved + amount);
    if (budgetMicros !== null && next > budgetMicros) return null;
    this.reservations.set(key, { day, amount, actual: null });
    state.reserved += amount;
    return { id, day, amountMicros };
  }

  async settle(id: string, actualMicros: number): Promise<void> {
    assertReservationId(id);
    assertSpendMicros(actualMicros);
    const reservation = this.reservations.get(id.toLowerCase());
    if (!reservation || reservation.actual !== null) return;
    const state = this.days.get(reservation.day)!;
    reservation.actual = BigInt(actualMicros);
    state.reserved -= reservation.amount;
    state.settled += reservation.actual;
  }

  async spentToday(): Promise<number> {
    const { state } = await this.current();
    return safeSpendTotal(state.legacy + state.settled + state.reserved);
  }

  async sweep(): Promise<number> {
    const now = this.now();
    let removed = 0;
    for (const [day, state] of this.days) {
      if (state.expiresAt > now) continue;
      this.days.delete(day);
      removed++;
      for (const [id, reservation] of this.reservations) {
        if (reservation.day === day) {
          this.reservations.delete(id);
          removed++;
        }
      }
    }
    return removed;
  }

  private async current(): Promise<{ day: string; state: SpendDay }> {
    const start = Math.floor(this.now() / SPEND_DAY_MS) * SPEND_DAY_MS;
    const day = new Date(start).toISOString().slice(0, 10);
    const legacy = legacySpendMicros(await this.coordination.read(LEGACY_SPEND_KEY, SPEND_DAY_MS));
    let state = this.days.get(day);
    if (!state) {
      state = { legacy, settled: 0n, reserved: 0n, expiresAt: start + SPEND_DAY_MS + SPEND_HISTORY_MS };
      this.days.set(day, state);
    } else if (legacy > state.legacy) {
      state.legacy = legacy;
    }
    return { day, state };
  }
}
