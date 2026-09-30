export type TenancyPolicy = 'shared' | 'quota' | 'fair';

export interface TenancyRun {
  /** Share of each quiet tenant's requests served, in percent. */
  quietServedPct: number;
  /** Share of the noisy tenant's requests served, in percent. */
  noisyServedPct: number;
  /** Share of the pool's capacity in use, in percent. */
  utilizationPct: number;
}

/** Each round gives every unsatisfied tenant an equal cut of what is left, until the capacity or the demand runs out. */
function waterFill(demands: number[], capacity: number): number[] {
  const served = demands.map(() => 0);
  let left = capacity;
  let open = demands.map((_, i) => i);
  while (open.length && left > 1e-9) {
    const each = left / open.length;
    for (const i of open) {
      const give = Math.min(demands[i] - served[i], each);
      served[i] += give;
      left -= give;
    }
    open = open.filter((i) => demands[i] - served[i] > 1e-9);
  }
  return served;
}

/**
 * `tenants` share a pool. The quiet ones together ask for `quietLoadPct` of its capacity, evenly; one noisy tenant asks
 * `burst` times what a quiet one does. Shared, requests are served first come first served, so when the pool is short
 * every tenant loses the same share. A quota caps each tenant at `quotaPct` of the pool, whatever the others are doing.
 * Fair sharing gives every tenant an equal share and hands what a tenant leaves unused to the others (max-min fairness).
 */
export function tenancyRun(
  policy: TenancyPolicy,
  options: { tenants: number; quietLoadPct: number; burst: number; quotaPct: number },
): TenancyRun {
  const { tenants, quietLoadPct, burst, quotaPct } = options;
  const capacity = 100;
  const quiet = quietLoadPct / (tenants - 1);
  const demands = [...Array.from({ length: tenants - 1 }, () => quiet), quiet * burst];
  const scale = (asked: number[]) => {
    const total = asked.reduce((a, b) => a + b, 0);
    return total <= capacity ? asked : asked.map((d) => (d * capacity) / total);
  };
  const served =
    policy === 'shared'
      ? scale(demands)
      : policy === 'quota'
        ? scale(demands.map((d) => Math.min(d, (quotaPct / 100) * capacity)))
        : waterFill(demands, capacity);
  const pct = (i: number) => (demands[i] > 0 ? (served[i] / demands[i]) * 100 : 100);
  return {
    quietServedPct: pct(0),
    noisyServedPct: pct(tenants - 1),
    utilizationPct: served.reduce((a, b) => a + b, 0),
  };
}
