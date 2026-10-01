import { describe, expect, it } from 'vitest';
import { HOT_ACCOUNT_LIMITS, hotAccount, hotAccountCheckpoint, subAccountsNeeded, type HotAccountSettings } from './contention.js';

const peak: HotAccountSettings = { offered: 2_300, lockMs: 5, subAccounts: 1, batch: 1 };

function* sweep(): Generator<HotAccountSettings> {
  for (const offered of [100, 700, 2_300, 9_000, 20_000])
    for (const lockMs of [1, 2, 5, 7, 20])
      for (const subAccounts of [1, 3, 16, 64]) for (const batch of [1, 5, 13, 50]) yield { offered, lockMs, subAccounts, batch };
}

describe('hot account contention', () => {
  it('serializes one row at one transaction per lock hold, so a 5 ms lock caps it at 200 postings a second', () => {
    const run = hotAccount(peak);
    expect(run.capacity).toBe(200);
    expect(run.committed).toBe(200);
    expect(run.utilization).toBeCloseTo(11.5);
    expect(run.queuedPerSecond).toBe(2_100);
    expect(run.latencyMs).toBeNull();
    expect(run.balanceRows).toBe(1);
  });

  it('multiplies capacity by the sub-accounts and the batch size, at the price of reads that sum every row and a wait to fill a batch', () => {
    expect(hotAccount({ ...peak, subAccounts: 16 })).toMatchObject({
      capacity: 3_200,
      committed: 2_300,
      queuedPerSecond: 0,
      balanceRows: 16,
    });
    expect(hotAccount({ ...peak, subAccounts: 16 }).queueMs).toBeCloseTo((0.71875 * 5) / (2 * 0.28125));
    const batched = hotAccount({ ...peak, batch: 20 });
    expect(batched.capacity).toBe(4_000);
    expect(batched.batchWaitMs).toBeCloseTo((9.5 * 1000) / 2_300);
    expect(batched.latencyMs).toBeCloseTo(5 + (9.5 * 1000) / 2_300 + (0.575 * 5) / (2 * 0.425));
    expect(hotAccount({ ...peak, subAccounts: 4, batch: 20 }).batchWaitMs).toBeCloseTo((4 * 9.5 * 1000) / 2_300);
  });

  it('matches the closed form on every setting, committing what it can and queueing the rest', () => {
    for (const s of sweep()) {
      const run = hotAccount(s);
      const capacity = (s.subAccounts * s.batch * 1000) / s.lockMs;
      expect(run.capacity).toBeCloseTo(capacity);
      expect(run.committed).toBeCloseTo(Math.min(s.offered, capacity));
      expect(run.committed + run.queuedPerSecond).toBeCloseTo(Math.max(s.offered, run.committed));
      expect(run.latencyMs === null).toBe(s.offered >= capacity);
    }
    expect(hotAccount({ offered: 1_000, lockMs: 1, subAccounts: 1, batch: 1 }).latencyMs).toBeNull();
  });

  it('queues for the lock as an M/D/1 queue, so the wait climbs steeply as the row nears full', () => {
    const wait = (busy: number) => hotAccount({ offered: busy * 200, lockMs: 5, subAccounts: 1, batch: 1 });
    expect(wait(0.1).queueMs).toBeCloseTo(0.5 / 1.8);
    expect(wait(0.7).queueMs).toBeCloseTo(5.833, 3);
    expect(wait(0.9).queueMs).toBeCloseTo(22.5);
    expect(wait(0.995).queueMs).toBeCloseTo(497.5);
    expect(wait(0.995).latencyMs).toBeCloseTo(502.5);
    expect(wait(1).queueMs).toBeNull();
  });

  it('refuses settings that are not positive', () => {
    expect(() => hotAccount({ ...peak, offered: 0 })).toThrow();
    expect(() => hotAccount({ ...peak, subAccounts: 0 })).toThrow();
    expect(() => hotAccount({ ...peak, lockMs: 0 })).toThrow();
    expect(() => hotAccount({ ...peak, batch: 0 })).toThrow();
  });

  it('sizes the sub-accounts to a target utilization', () => {
    expect(subAccountsNeeded(2_315, 5, 1, 0.7)).toBe(17);
    expect(hotAccount({ ...peak, offered: 2_315, subAccounts: 17 }).utilization).toBeLessThanOrEqual(0.7);
    expect(hotAccount({ ...peak, offered: 2_315, subAccounts: 16 }).utilization).toBeGreaterThan(0.7);
    expect(subAccountsNeeded(100, 5, 1, 0.7)).toBe(1);
  });
});

describe('hot account checkpoint', () => {
  it('asks about one change within the limits, and its answer is what the model commits after it', () => {
    for (const s of sweep()) {
      const c = hotAccountCheckpoint(s);
      const changed = (Object.keys(s) as (keyof HotAccountSettings)[]).filter((k) => c.change[k] !== s[k]);
      expect(changed, JSON.stringify(s)).toHaveLength(1);
      for (const k of changed) {
        expect(c.change[k]).toBeGreaterThanOrEqual(HOT_ACCOUNT_LIMITS[k].min);
        expect(c.change[k]).toBeLessThanOrEqual(HOT_ACCOUNT_LIMITS[k].max);
      }
      expect(c.choices.length).toBeGreaterThanOrEqual(3);
      expect(new Set(c.choices).size).toBe(c.choices.length);
      expect(c.choices[c.answer]).toBe(`${Math.round(hotAccount(c.change).committed).toLocaleString('en-US')} postings/s`);
    }
  });

  it('varies the change and the right answer with the settings', () => {
    const settings = [...sweep()];
    const checks = settings.map(hotAccountCheckpoint);
    const keys = checks.map((c, i) => (Object.keys(c.change) as (keyof HotAccountSettings)[]).find((k) => c.change[k] !== settings[i][k]));
    expect(new Set(keys)).toEqual(new Set(['subAccounts', 'batch', 'lockMs']));
    expect(new Set(checks.map((c) => c.answer)).size).toBeGreaterThanOrEqual(3);
    expect(hotAccountCheckpoint(peak).prompt).not.toBe(hotAccountCheckpoint({ ...peak, subAccounts: 2 }).prompt);
  });
});
