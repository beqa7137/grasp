import { describe, expect, it } from 'vitest';
import { CAPACITY_EXPERIMENTS } from '../capacity-experiments.js';
import { CAPACITY_APP_RPS, CAPACITY_BASELINE, capacityAllSettings, capacityRun, type CapacitySettings } from './capacity.js';

/**
 * An independent computation of the model: requests arrive evenly and walk the tiers one by one. Each instance is a
 * token bucket refilled at its own limit (written here as numbers, not the model's constants); app servers also hold a
 * worker per request for its whole time and refuse one when all 100 are busy (each pool starts in the state it runs in
 * once saturated); zones are assigned by instance index and a surviving replica is promoted when the primary's zone
 * fails; the database admits a request only when the primary and every replica hold the tokens its writes, replayed
 * writes and reads cost. Load balancers and app servers take requests in turn. Rates are counted over the last four of
 * five seconds.
 */
function simulate(s: CapacitySettings) {
  const lambda = s.traffic;
  const inZoneA = (zone: number) => s.zone === 1 && zone === 0;
  const bucket = (burst: number) => ({ tokens: 0, burst, used: 0 });
  const lbs = [];
  for (let i = 0; i < s.lb; i++) if (!inZoneA(i % 3)) lbs.push(bucket(4));
  const holdS = (s.slow ? 500 : 50) / 1000;
  const warm = () => Array.from({ length: 100 }, (_, i) => (holdS * (i + 1)) / 100);
  const apps = [];
  for (let i = 0; i < s.app; i++) if (!inZoneA(i % 3)) apps.push({ ...bucket(4), releases: warm(), head: 0 });
  // A pool that stays full admits whenever a worker frees, in clumps; the database's buckets hold 50 ms of tokens.
  const dbBurst = s.size * 0.05;
  let reps = [];
  for (let i = 0; i < s.replicas; i++) if (!inZoneA((i + 1) % 3)) reps.push(bucket(dbBurst));
  let primaryUp = true;
  if (s.zone === 1) {
    if (reps.length) reps = reps.slice(1);
    else primaryUp = false;
  }
  const primary = bucket(dbBurst);
  const misses = 1.8 * (s.cache ? 0.1 : 1);
  const writes = 0.2;
  const EPS = 1e-9;
  const SECONDS = 5;
  const refill = (b: { tokens: number; burst: number }, rate: number, dt: number) => (b.tokens = Math.min(b.burst, b.tokens + rate * dt));
  const counts = { served: 0, lb: 0, app: 0, db: 0 };
  let last = 0;
  let rrLb = 0;
  let rrApp = 0;
  for (let k = 0; k < SECONDS * lambda; k++) {
    const t = k / lambda;
    const dt = t - last;
    last = t;
    const measured = t >= 1 - EPS;
    for (const b of lbs) refill(b, 5000, dt);
    for (const b of apps) refill(b, 1500, dt);
    refill(primary, s.size, dt);
    for (const b of reps) refill(b, s.size, dt);
    const lb = lbs.length ? lbs[rrLb++ % lbs.length] : null;
    if (!lb || lb.tokens < 1 - EPS) {
      if (measured) counts.lb++;
      continue;
    }
    lb.tokens -= 1;
    if (measured) lb.used++;
    const ap = apps.length ? apps[rrApp++ % apps.length] : null;
    if (ap) while (ap.head < ap.releases.length && ap.releases[ap.head] <= t + EPS) ap.head++;
    if (!ap || ap.tokens < 1 - EPS || ap.releases.length - ap.head >= 100) {
      if (measured) counts.app++;
      continue;
    }
    ap.tokens -= 1;
    ap.releases.push(t + holdS);
    if (measured) ap.used++;
    let ok = primaryUp;
    if (ok && reps.length) {
      const each = writes + misses / reps.length;
      ok = primary.tokens >= writes - EPS && reps.every((b) => b.tokens >= each - EPS);
      if (ok) {
        primary.tokens -= writes;
        if (measured) primary.used += writes;
        for (const b of reps) {
          b.tokens -= each;
          if (measured) b.used += each;
        }
      }
    } else if (ok) {
      ok = primary.tokens >= writes + misses - EPS;
      if (ok) {
        primary.tokens -= writes + misses;
        if (measured) primary.used += writes + misses;
      }
    }
    if (!ok) {
      if (measured) counts.db++;
      continue;
    }
    if (measured) counts.served++;
  }
  const sum = (bs: readonly { used: number }[]) => bs.reduce((a, b) => a + b.used, 0);
  const w = SECONDS - 1;
  return {
    served: counts.served / w,
    lb: counts.lb / w,
    app: counts.app / w,
    db: counts.db / w,
    util: {
      lb: lbs.length ? sum(lbs) / (lbs.length * 5000 * w) : null,
      app: apps.length ? sum(apps) / (apps.length * 1500 * w) : null,
      primary: primary.used / (s.size * w),
      replicas: reps.length ? sum(reps) / (reps.length * s.size * w) : null,
    },
  };
}

/** Every experiment's setup and act, the challenge's solution with and without zone A, the baseline, and a stride of all. */
const SPECIAL: CapacitySettings[] = [
  ...CAPACITY_EXPERIMENTS.flatMap((e) => [e.setup, { ...e.setup, ...(e.act && 'set' in e.act ? e.act.set : {}) }] as CapacitySettings[]),
  { traffic: 16_000, lb: 6, app: 17, size: 8000, replicas: 2, cache: 1, zone: 0, slow: 0 },
  { traffic: 16_000, lb: 6, app: 17, size: 8000, replicas: 2, cache: 1, zone: 1, slow: 0 },
  CAPACITY_BASELINE,
];
const STRIDE = 331;

describe('the capacity model against a request-by-request simulation', () => {
  it('agrees on what is served, what each tier sheds and how busy each runs', () => {
    const sims = [...SPECIAL, ...capacityAllSettings().filter((_, i) => i % STRIDE === 0)];
    expect(sims.length).toBeGreaterThan(600);
    const fails: string[] = [];
    let worst = 0;
    for (const s of sims) {
      const r = capacityRun(s);
      const sim = simulate(s);
      // Discrete arrivals and buckets: within half a percent of the rate, plus a request per instance.
      const tol = 0.005 * r.offered + s.lb + s.app + s.replicas + 3;
      const served = Math.abs(sim.served - r.served);
      const tier = Math.max(
        Math.abs(sim.lb - r.lb.shed),
        Math.abs(sim.app - r.app.shed),
        Math.abs(sim.db - (r.primary.shed + r.replicas.shed)),
      );
      // The simulation's tokens measure the app servers' CPU, not their pool.
      const cpu = r.app.up ? r.app.passed / (r.app.up * CAPACITY_APP_RPS) : null;
      const util = Math.max(
        sim.util.lb !== null ? Math.abs(sim.util.lb - r.lb.util) : 0,
        sim.util.app !== null && cpu !== null ? Math.abs(sim.util.app - cpu) : 0,
        r.primary.outage ? 0 : Math.abs(sim.util.primary - r.primary.util),
        sim.util.replicas !== null ? Math.abs(sim.util.replicas - r.replicas.util) : 0,
      );
      worst = Math.max(worst, served);
      if (served > tol || tier > tol || util > 0.01) fails.push(`${JSON.stringify(s)}: served ${r.served} against ${sim.served}`);
    }
    expect(fails).toEqual([]);
    expect(worst).toBeLessThan(40);
  });
});
