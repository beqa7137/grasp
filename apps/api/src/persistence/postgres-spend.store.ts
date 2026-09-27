import { sql } from 'drizzle-orm';
import type { Db } from './postgres.stores.js';
import { assertReservationId, assertSpendMicros, safeSpendTotal, SpendStore, type SpendReservation } from './spend.store.js';

export class PostgresSpendStore extends SpendStore {
  constructor(private readonly db: Db) {
    super();
  }

  async reserve(id: string, amountMicros: number, budgetMicros: number | null): Promise<SpendReservation | null> {
    assertReservationId(id);
    assertSpendMicros(amountMicros, true);
    if (budgetMicros !== null) assertSpendMicros(budgetMicros);
    const result = await this.db.execute<{ day: string | null }>(sql`
      select reserve_ai_spend(${id}::uuid, ${amountMicros}::bigint, ${budgetMicros}::bigint)::text as day`);
    const day = result.rows[0].day;
    return day ? { id, day, amountMicros } : null;
  }

  async settle(id: string, actualMicros: number): Promise<void> {
    assertReservationId(id);
    assertSpendMicros(actualMicros);
    await this.db.execute(sql`select settle_ai_spend(${id}::uuid, ${actualMicros}::bigint)`);
  }

  async spentToday(): Promise<number> {
    const result = await this.db.execute<{ total: string }>(sql`
      select (legacy_micros::numeric + settled_micros + reserved_micros)::text as total from current_ai_spend_day()`);
    return safeSpendTotal(BigInt(result.rows[0].total));
  }

  async sweep(): Promise<number> {
    return this.db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('statement_timeout', '2500ms', true), set_config('lock_timeout', '1500ms', true)`);
      const result = await tx.execute<{ removed: string }>(sql`
        with expired as (
          select day from ai_spend_days where expires_at <= now() order by day for update
        ), counts as (
          select count(*) as reservations from ai_spend_reservations where day in (select day from expired)
        ), deleted as (
          delete from ai_spend_days where day in (select day from expired) returning day
        )
        select ((select count(*) from deleted) + (select reservations from counts))::text as removed`);
      return Number(result.rows[0].removed);
    });
  }
}
