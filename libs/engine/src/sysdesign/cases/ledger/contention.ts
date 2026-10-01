import { num, type WidgetCheckpoint } from '../widget-checkpoint.js';

/** One hot ledger account taking postings, every posting transaction holding its row lock until it commits. */
export interface HotAccountSettings {
  /** Postings a second sent to the account. */
  offered: number;
  /** How long one transaction holds the balance row's lock, from `SELECT ... FOR UPDATE` to commit. */
  lockMs: number;
  /** Rows the account is split into, postings spread evenly over them; its balance is their sum. */
  subAccounts: number;
  /** Postings applied by one transaction. The commit dominates, so a batch holds the lock as long as one posting. */
  batch: number;
}

export interface HotAccountRun {
  /** Postings a second the account can commit: each row commits one transaction per lock hold. */
  capacity: number;
  /** Postings a second actually committed. */
  committed: number;
  /** Offered over capacity; above 1 the queue of waiting transactions grows without bound. */
  utilization: number;
  /** Postings a second that join the queue when the account is overloaded. */
  queuedPerSecond: number;
  /** Average wait for a batch to fill at the offered rate, counted as if arrivals were evenly spaced. */
  batchWaitMs: number;
  /**
   * Average wait in line for a row's lock: each row is an M/D/1 queue (random arrivals, a fixed lock hold), so the
   * wait is utilization × lock / (2 × (1 - utilization)). Null at or above full, where it grows without bound.
   */
  queueMs: number | null;
  /** Batch wait, queueing and the lock hold, or null at or above full. */
  latencyMs: number | null;
  /** Rows a balance read sums. */
  balanceRows: number;
}

export function hotAccount({ offered, lockMs, subAccounts, batch }: HotAccountSettings): HotAccountRun {
  if (!(offered > 0 && lockMs > 0 && subAccounts >= 1 && batch >= 1)) throw new Error('Settings must be positive');
  const capacity = (subAccounts * batch * 1000) / lockMs;
  const utilization = offered / capacity;
  const batchWaitMs = (((batch - 1) / 2) * subAccounts * 1000) / offered;
  const queueMs = utilization < 1 ? (utilization * lockMs) / (2 * (1 - utilization)) : null;
  return {
    capacity,
    committed: Math.min(offered, capacity),
    utilization,
    queuedPerSecond: Math.max(0, offered - capacity),
    batchWaitMs,
    queueMs,
    latencyMs: queueMs === null ? null : lockMs + batchWaitMs + queueMs,
    balanceRows: subAccounts,
  };
}

/** The fewest rows that keep the account at most `maxUtilization` busy. */
export function subAccountsNeeded(offered: number, lockMs: number, batch: number, maxUtilization: number): number {
  return Math.ceil(offered / (((batch * 1000) / lockMs) * maxUtilization));
}

export const HOT_ACCOUNT_LIMITS = {
  offered: { min: 100, max: 20_000, step: 100 },
  lockMs: { min: 1, max: 20, step: 1 },
  subAccounts: { min: 1, max: 64, step: 1 },
  batch: { min: 1, max: 50, step: 1 },
} as const;

const BATCH_STEPS = [1, 5, 10, 20, 50];

type Change = { setting: 'subAccounts' | 'batch' | 'lockMs'; to: number; says: string };

function changeFor(s: HotAccountSettings): Change {
  const which = (s.offered / 100 + s.lockMs * 7 + s.subAccounts * 13 + s.batch * 31) % 3;
  if (which === 0) {
    const to = s.subAccounts * 2 <= HOT_ACCOUNT_LIMITS.subAccounts.max ? s.subAccounts * 2 : Math.max(1, Math.floor(s.subAccounts / 2));
    return { setting: 'subAccounts', to, says: `split the account into ${to} sub-account${to === 1 ? '' : 's'}` };
  }
  if (which === 1) {
    const to = BATCH_STEPS.find((b) => b > s.batch) ?? 1;
    return { setting: 'batch', to, says: to === 1 ? 'stop batching (one posting a transaction)' : `batch ${to} postings a transaction` };
  }
  const to = s.lockMs >= 2 ? Math.floor(s.lockMs / 2) : s.lockMs * 4;
  return { setting: 'lockMs', to, says: `make each transaction hold the lock for ${to} ms` };
}

/**
 * A prediction about the current settings: one change, picked from the settings so it varies as the learner moves them,
 * and how many postings a second the account then commits. Applying `change` shows the answer on the readouts.
 */
export function hotAccountCheckpoint(s: HotAccountSettings): WidgetCheckpoint & { change: HotAccountSettings } {
  const { setting, to, says } = changeFor(s);
  const change = { ...s, [setting]: to };
  const after = hotAccount(change);
  const before = hotAccount(s);
  const rate = (v: number) => `${num(v)} postings/s`;
  const correct = Math.round(after.committed);
  const candidates = [
    correct,
    Math.round(after.capacity),
    Math.round(before.committed),
    Math.round(s.offered),
    Math.round((1000 / change.lockMs) * change.batch),
    Math.round(after.capacity * 2),
    Math.round(correct / 2),
  ];
  const values = [...new Set(candidates.filter((v) => v > 0))].slice(0, 4).sort((a, b) => a - b);
  const choices = values.map(rate);
  const perRow = 1000 / change.lockMs;
  const formula = `${change.subAccounts} × ${change.batch} × 1,000 / ${change.lockMs} = ${num(after.capacity)}`;
  const verdict =
    after.utilization > 1
      ? `That is less than the ${num(s.offered)} offered, so it commits ${num(after.capacity)} a second and the other ${num(after.queuedPerSecond)} join a queue that keeps growing.`
      : `That covers the ${num(s.offered)} offered, so it commits all of them, ${Math.round(after.utilization * 100)}% busy.`;
  return {
    change,
    prompt: `Predict: if you ${says}, how many postings a second does the account commit?`,
    choices,
    answer: values.indexOf(correct),
    explain: `Each row commits one transaction every ${change.lockMs} ms, ${num(perRow)} a second, and each carries ${change.batch} posting${change.batch === 1 ? '' : 's'}: capacity is ${formula}. ${verdict}`,
  };
}
