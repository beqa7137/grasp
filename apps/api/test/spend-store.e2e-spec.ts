import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { PostgresSpendStore } from '../src/persistence/postgres-spend.store.js';
import { PostgresCoordinationStore, type Db } from '../src/persistence/postgres.stores.js';
import { spendStoreContract } from '../src/persistence/spend-store.contract.js';
import * as schema from '../src/persistence/schema.js';
import { migrateDatabase } from './support/database.js';

const databaseUrl = process.env['TEST_DATABASE_URL'];

describe.runIf(databaseUrl)('Postgres spend ledger', () => {
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 8 });
  const db = drizzle(pool, { schema });
  const make = () => ({
    store: new PostgresSpendStore(db),
    other: new PostgresSpendStore(db),
    legacy: new PostgresCoordinationStore(db),
  });

  beforeAll(async () => {
    await migrateDatabase(databaseUrl!);
  });

  beforeEach(async () => {
    await pool.query('truncate ai_spend_days cascade');
    await pool.query("delete from counters where key = 'ai-spend-usd'");
  });

  afterAll(async () => {
    await pool.end();
  });

  spendStoreContract('Postgres', make);

  it('keeps reservations when a client disconnects and a new client takes over', async () => {
    const firstPool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
    const id = randomUUID();
    try {
      await new PostgresSpendStore(drizzle(firstPool, { schema })).reserve(id, 500, 500);
    } finally {
      await firstPool.end();
    }
    const { store } = make();
    expect(await store.spentToday()).toBe(500);
    expect(await store.reserve(randomUUID(), 1, 500)).toBeNull();
    await store.settle(id, 100);
    expect(await store.spentToday()).toBe(100);
  });

  it('rolls settlement back atomically if its daily update fails', async () => {
    const { store } = make();
    const id = randomUUID();
    await store.reserve(id, 500, 500);
    await pool.query(`
      create function reject_test_spend_settlement() returns trigger language plpgsql as $$
      begin
        if new.settled_micros > old.settled_micros then raise exception 'injected settlement failure'; end if;
        return new;
      end $$;
      create trigger reject_test_spend_settlement before update on ai_spend_days
      for each row execute function reject_test_spend_settlement()`);
    try {
      await expect(store.settle(id, 100)).rejects.toThrow();
      expect(await store.spentToday()).toBe(500);
      const result = await pool.query('select actual_micros from ai_spend_reservations where id = $1', [id]);
      expect(result.rows[0].actual_micros).toBeNull();
    } finally {
      await pool.query('drop trigger reject_test_spend_settlement on ai_spend_days; drop function reject_test_spend_settlement()');
    }
    await store.settle(id, 100);
    expect(await store.spentToday()).toBe(100);
  });

  it('settles once when a committed transaction is reported as a failure', async () => {
    const { store } = make();
    const id = randomUUID();
    await store.reserve(id, 500, 500);
    const ambiguous = new PostgresSpendStore({
      execute: async (query: Parameters<Db['execute']>[0]) => {
        await db.execute(query);
        throw Object.assign(new Error('lost commit acknowledgment'), { code: 'ECONNRESET' });
      },
    } as unknown as Db);
    await expect(ambiguous.settle(id, 100)).rejects.toThrow();
    await store.settle(id, 100);
    expect(await store.spentToday()).toBe(100);
  });

  it('retains liability after an ambiguous admission and refuses duplicate authorization', async () => {
    const id = randomUUID();
    const ambiguous = new PostgresSpendStore({
      execute: async (query: Parameters<Db['execute']>[0]) => {
        await db.execute(query);
        throw Object.assign(new Error('lost commit acknowledgment'), { code: 'ECONNRESET' });
      },
    } as unknown as Db);
    await expect(ambiguous.reserve(id, 500, 500)).rejects.toThrow();
    const { store } = make();
    expect(await store.spentToday()).toBe(500);
    await expect(store.reserve(id, 500, 500)).rejects.toThrow();
  });

  it('bounds lock contention and leaves no reservation after an admission timeout', async () => {
    const { store } = make();
    await store.spentToday();
    const blocker = await pool.connect();
    await blocker.query('begin');
    await blocker.query('select day from ai_spend_days for update');
    const id = randomUUID();
    const start = Date.now();
    try {
      await expect(store.reserve(id, 100, 100)).rejects.toMatchObject({ cause: { code: '55P03' } });
      expect(Date.now() - start).toBeLessThan(3_000);
    } finally {
      await blocker.query('rollback');
      blocker.release();
    }
    expect(await store.spentToday()).toBe(0);
    expect((await pool.query('select id from ai_spend_reservations where id = $1', [id])).rows).toEqual([]);
  });

  it('settles yesterday without charging today and sweeps only expired history', async () => {
    const yesterday = randomUUID();
    const old = randomUUID();
    await pool.query(`
      insert into ai_spend_days (day, reserved_micros, expires_at) values
        ((now() at time zone 'UTC')::date - 1, 500, now() + interval '90 days'),
        ((now() at time zone 'UTC')::date - 92, 900, now() - interval '1 day')`);
    await pool.query(
      `
      insert into ai_spend_reservations (id, day, reserved_micros) values
        ($1, (now() at time zone 'UTC')::date - 1, 500),
        ($2, (now() at time zone 'UTC')::date - 92, 900)`,
      [yesterday, old],
    );
    const { store } = make();
    await store.reserve(randomUUID(), 100, 100);
    await store.settle(yesterday, 750);
    expect(await store.spentToday()).toBe(100);
    expect(await store.sweep()).toBe(2);
    await store.settle(old, 1_000);
    expect(await store.spentToday()).toBe(100);
    const result = await pool.query('select actual_micros from ai_spend_reservations where id = $1', [yesterday]);
    expect(result.rows[0].actual_micros).toBe('750');
    expect((await pool.query('select id from ai_spend_reservations where id = $1', [old])).rows).toEqual([]);
  });

  it('uses the database UTC day even when its session timezone has a different date', async () => {
    const clock = await pool.query(
      "select extract(hour from now() at time zone 'UTC') as hour, (now() at time zone 'UTC')::date::text as day",
    );
    const timezone = Number(clock.rows[0].hour) < 12 ? 'Etc/GMT+12' : 'Etc/GMT-14';
    const zonedPool = new pg.Pool({ connectionString: databaseUrl, max: 1, options: `-c timezone=${timezone}` });
    try {
      const local = await zonedPool.query('select current_date::text as day');
      expect(local.rows[0].day).not.toBe(clock.rows[0].day);
      const store = new PostgresSpendStore(drizzle(zonedPool, { schema }));
      expect(await store.reserve(randomUUID(), 100, null)).toMatchObject({ day: clock.rows[0].day });
      const expiry = await pool.query(
        "select extract(epoch from expires_at - (day::timestamp at time zone 'UTC'))::bigint as seconds from ai_spend_days",
      );
      expect(expiry.rows[0].seconds).toBe(String(91 * 86_400));
    } finally {
      await zonedPool.end();
    }
  });

  it('imports retained legacy totals during migration and accepts later legacy writes', async () => {
    const migration = await readFile(new URL('../drizzle/0010_ai_spend_reservations.sql', import.meta.url), 'utf8');
    const client = await pool.connect();
    await client.query('begin');
    try {
      await client.query(
        'drop function reserve_ai_spend, settle_ai_spend, current_ai_spend_day; drop table ai_spend_reservations; drop table ai_spend_days',
      );
      await client.query(`
        insert into counters (key, window_start, total, expires_at) values
          ('ai-spend-usd', date_trunc('day', now() at time zone 'UTC') at time zone 'UTC', 0.0000011, now() + interval '90 days'),
          ('ai-spend-usd', (date_trunc('day', now() at time zone 'UTC') - interval '1 day') at time zone 'UTC', 2.5, now() + interval '89 days'),
          ('ai-spend-usd', (date_trunc('day', now() at time zone 'UTC') - interval '92 days') at time zone 'UTC', 9, now() - interval '1 day')`);
      await client.query(migration);
      const result = await client.query('select legacy_micros from ai_spend_days order by day');
      expect(result.rows.map((row) => row.legacy_micros)).toEqual(['2500000', '2']);
      await client.query("update counters set total = total + 1 where key = 'ai-spend-usd'");
      const legacy = await client.query("select total from counters where key = 'ai-spend-usd' order by window_start desc limit 1");
      expect(legacy.rows[0].total).toBeCloseTo(1.0000011, 12);
    } finally {
      await client.query('rollback');
      client.release();
    }
  });

  it.each(['-0.0000001', 'NaN', 'Infinity', '9007199254.741'])('refuses migration of invalid legacy dollars %s', async (amount) => {
    const migration = await readFile(new URL('../drizzle/0010_ai_spend_reservations.sql', import.meta.url), 'utf8');
    const client = await pool.connect();
    await client.query('begin');
    try {
      await client.query(
        'drop function reserve_ai_spend, settle_ai_spend, current_ai_spend_day; drop table ai_spend_reservations; drop table ai_spend_days',
      );
      await client.query(
        `
        insert into counters (key, window_start, total, expires_at)
        values ('ai-spend-usd', date_trunc('day', now() at time zone 'UTC') at time zone 'UTC', $1, now() + interval '90 days')`,
        [amount],
      );
      await expect(client.query(migration)).rejects.toThrow();
    } finally {
      await client.query('rollback');
      client.release();
    }
  });
});
