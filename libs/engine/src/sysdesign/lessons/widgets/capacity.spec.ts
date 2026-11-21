import { describe, expect, it } from 'vitest';
import {
  CAPACITY_APP_MAX,
  CAPACITY_APP_RPS,
  CAPACITY_AXIS_MAX,
  CAPACITY_BASELINE,
  CAPACITY_LB_MAX,
  CAPACITY_LB_RPS,
  CAPACITY_REPLICAS_MAX,
  CAPACITY_TIERS,
  CAPACITY_TRAFFIC,
  CAPACITY_WORKERS,
  CAPACITY_WRITES,
  capacityAllSettings,
  capacityMetrics,
  capacityRamp,
  capacityRun,
  capacityZoneLane,
  capacityZoneLoss,
  type CapacitySettings,
} from './capacity.js';

const at = (s: Partial<CapacitySettings>): CapacitySettings => ({ ...CAPACITY_BASELINE, ...s });
const run = (s: Partial<CapacitySettings>) => capacityRun(at(s));
const near = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) <= eps * Math.max(1, Math.abs(b));
const ALL = capacityAllSettings();

describe('the capacity model', () => {
  it('covers 197,568 settings, each once, and reads a partial setting from the baseline', () => {
    expect(ALL).toHaveLength(14 * 6 * 21 * 2 * 7 * 2 * 2 * 2);
    expect(new Set(ALL.map((s) => Object.values(s).join(' '))).size).toBe(ALL.length);
    expect(capacityRun({}).settings).toEqual(CAPACITY_BASELINE);
    expect(capacityRun({ traffic: 2000 }).settings).toEqual({ ...CAPACITY_BASELINE, traffic: 2000 });
  });

  it('serves what its smallest limit allows, and raising that tier moves the bottleneck to the next', () => {
    // The old widget's first case, in this model's terms: one 8,000-query machine and no replicas carry 4,000 requests.
    const one = run({ replicas: 0 });
    expect([one.lb.ceiling, one.app.ceiling, one.dbCeiling]).toEqual([10_000, 6000, 4000]);
    expect([one.served, one.shed, one.bottleneck, one.next]).toEqual([4000, 4000, 'primary', 'app']);
    expect([one.app.shed, one.primary.shed]).toEqual([2000, 2000]);
    const cached = run({ replicas: 0, cache: 1 });
    expect([cached.served, cached.bottleneck, cached.next]).toEqual([6000, 'app', 'lb']);
    // Behind the app servers' cap the database sees only what they pass on.
    const capped = run({ traffic: 20_000, lb: 4, app: 10, replicas: 6, cache: 1 });
    expect([capped.lb.util, capped.app.util, capped.served, capped.dbArriving]).toEqual([1, 1, 15_000, 15_000]);
    expect(capped.primary.util).toBeCloseTo((15_000 * CAPACITY_WRITES) / 8000, 12);
  });

  it('prices one request at each tier: 5,000 and 1,500 a second an instance, 2 queries, 0.38 with the cache', () => {
    const r = run({ replicas: 0 });
    expect([r.lb.each, r.app.each, r.app.bound, r.primary.cost, r.misses, r.hits]).toEqual([
      CAPACITY_LB_RPS,
      CAPACITY_APP_RPS,
      'cpu',
      2,
      1.8,
      0,
    ]);
    const c = run({ replicas: 0, cache: 1 });
    expect(c.primary.cost).toBeCloseTo(0.38, 12);
    expect(c.misses).toBeCloseTo(0.18, 12);
    expect(c.hits).toBeCloseTo(1.62, 12);
    expect(c.dbCeiling).toBeCloseTo(8000 / 0.38, 9);
    expect(run({ replicas: 0, size: 4000 }).dbCeiling).toBe(2000);
  });

  it('sends the writes to the primary and has every replica replay them beside its share of the reads', () => {
    const r = run({});
    expect(r.primary.cost).toBe(CAPACITY_WRITES);
    expect(r.primary.ceiling).toBeCloseTo(40_000, 9);
    expect(r.replicas.cost).toBeCloseTo(0.2 + 1.8 / 2, 12);
    expect(r.replicas.ceiling).toBeCloseTo(8000 / 1.1, 9);
    expect(r.binding).toBe('replicas');
    for (let n = 1; n <= CAPACITY_REPLICAS_MAX; n++) {
      const x = run({ traffic: 20_000, lb: 6, app: 20, replicas: n, cache: 1 });
      expect(x.replicas.ceiling, `${n}`).toBeLessThan(8000 / CAPACITY_WRITES);
      expect(near(x.replicas.replayUtil, (x.served * CAPACITY_WRITES) / 8000), `${n}`).toBe(true);
      expect(near(x.replicas.util, x.replicas.replayUtil + x.replicas.readsUtil), `${n}`).toBe(true);
    }
    const none = run({ replicas: 0 });
    expect([none.replicas.ceiling, none.replicas.util, none.replicas.cost, none.lanes.map((t) => t.id)]).toEqual([
      Infinity,
      0,
      null,
      ['lb', 'app', 'primary'],
    ]);
  });

  it("sizes an app server by its CPU or its workers (Little's law), whichever is smaller", () => {
    const fast = run({ traffic: 4000 });
    expect([fast.app.ms, fast.app.workerEach, fast.app.each, fast.app.bound]).toEqual([50, 2000, 1500, 'cpu']);
    expect(fast.app.inFlight).toBeCloseTo((4000 / 4) * 0.05, 12);
    const slow = run({ traffic: 4000, slow: 1 });
    expect([slow.app.ms, slow.app.workerEach, slow.app.each, slow.app.bound, slow.app.ceiling]).toEqual([500, 200, 200, 'workers', 800]);
    expect([slow.app.inFlight, slow.app.need]).toEqual([CAPACITY_WORKERS, 500]);
    expect(slow.app.cpuUtil).toBeCloseTo(200 / 1500, 12);
    expect(slow.served).toBe(800);
  });

  it('takes zone A from every tier at once, promotes a replica, and loses the primary when none is left', () => {
    const z = run({ lb: 3, app: 9, replicas: 3, zone: 1 });
    expect([z.lb.up, z.lb.lost, z.app.up, z.app.lost, z.replicas.up, z.replicas.lost]).toEqual([2, 1, 6, 3, 1, 2]);
    expect([z.primary.lost, z.primary.promoted, z.primary.outage, z.primary.up]).toEqual([true, true, false, 1]);
    const uneven = run({ lb: 4, app: 16, replicas: 2, zone: 1 });
    expect([uneven.lb.lost, uneven.app.lost, uneven.replicas.up, uneven.replicas.lost]).toEqual([2, 6, 1, 1]);
    const out = run({ replicas: 0, zone: 1 });
    expect([out.primary.outage, out.primary.ceiling, out.primary.up, out.served, out.bottleneck]).toEqual([true, 0, 0, 0, 'primary']);
    expect(out.primary.util).toBe(1);
    const one = run({ lb: 1, zone: 1 });
    expect([one.lb.up, one.lb.ceiling, one.lb.util, one.served, one.app.arriving]).toEqual([0, 0, 1, 0, 0]);
    const promotedOnly = run({ replicas: 1, zone: 1 });
    expect([promotedOnly.replicas.up, promotedOnly.primary.promoted, promotedOnly.replicas.ceiling]).toEqual([0, true, Infinity]);
    expect(promotedOnly.primary.cost).toBe(2);
  });

  it('holds its invariants at every setting, and no lane passes the end of the axis', () => {
    let broken = 0;
    let longest = 0;
    for (const s of ALL) {
      const r = capacityRun(s);
      const sheds = r.lb.shed + r.app.shed + r.primary.shed + r.replicas.shed;
      const ok =
        near(r.offered, r.served + sheds) &&
        near(r.served, Math.min(r.offered, r.lb.ceiling, r.app.ceiling, r.primary.ceiling, r.replicas.ceiling)) &&
        r.lanes.every((t) => t.util >= -1e-12 && t.util <= 1 + 1e-12) &&
        (r.shed === 0 || near(r[r.bottleneck].ceiling, r.served)) &&
        [r.lb, r.app].every((t) => t.shed <= 1e-9 || near(t.util, 1)) &&
        (r.primary.shed <= 1e-9 || r.primary.outage || near(r.primary.util, 1)) &&
        (r.replicas.shed <= 1e-9 || near(r.replicas.util, 1)) &&
        r.app.inFlight <= CAPACITY_WORKERS + 1e-9 &&
        near(r.replicas.util, r.replicas.replayUtil + r.replicas.readsUtil) &&
        r.machines === s.lb + s.app + 1 + s.replicas + 3 * s.cache;
      if (!ok) broken++;
      for (const id of CAPACITY_TIERS) if (Number.isFinite(r[id].ceiling)) longest = Math.max(longest, r[id].ceiling);
    }
    expect(broken).toBe(0);
    expect(longest).toBeCloseTo(CAPACITY_AXIS_MAX, 6);
  });

  it('measures a challenge: shed, headroom on the busiest tier, shed after zone A, machines', () => {
    const r = run({ traffic: 16_000, lb: 6, app: 17, replicas: 2, cache: 1 });
    const m = capacityMetrics(r);
    expect([m.shed, m.zoneShed, m.machines]).toEqual([0, 0, 29]);
    expect(m.headroom).toBeCloseTo(100 - (16_000 / (17 * 1500)) * 100, 5);
    // A tier at 70% in floating point leaves exactly the 30% it shows.
    expect(capacityMetrics(run({ traffic: 5000, lb: 2, app: 5, size: 4000, replicas: 5, cache: 0 })).headroom).toBe(30);
    expect(capacityZoneLoss(r).settings).toEqual({ ...r.settings, zone: 1 });
    expect(capacityMetrics(run({ traffic: 16_000, lb: 6, app: 16, replicas: 2, cache: 1 })).zoneShed).toBe(1000);
  });
});

describe('a ramp of the traffic', () => {
  it('steps through the stops from one traffic to another and finds the first stop where a tier sheds', () => {
    const plan = capacityRamp(at({ traffic: 10_000, replicas: 0 }), 1000, 10_000);
    expect(plan.stops).toEqual([1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000, 10_000]);
    expect(plan.runs.map((r) => r.offered)).toEqual(plan.stops);
    expect([plan.climax, plan.stops[plan.climax], plan.full]).toEqual([4, 5000, 'primary']);
    const calm = capacityRamp(at({ traffic: 2000 }), 1000, 2000);
    expect([calm.stops, calm.climax, calm.full]).toEqual([[1000, 2000], -1, null]);
    const lowest = capacityRamp(at({ traffic: 1000 }), 1000, 1000);
    expect(lowest.stops).toEqual([1000]);
    expect(capacityRamp(at({}), CAPACITY_TRAFFIC[0], 20_000).stops).toEqual([...CAPACITY_TRAFFIC]);
  });
});

describe('the zones as drawn', () => {
  const MAX = { lb: CAPACITY_LB_MAX, app: CAPACITY_APP_MAX, replicas: CAPACITY_REPLICAS_MAX } as const;

  it('spreads load balancers and app servers A, B, C and replicas B, C, A, and draws zone B first, zone A last', () => {
    expect(capacityZoneLane('lb', 4, false).order.map((x) => x.id)).toEqual(['lb-B0', 'lb-C0', 'lb-A0', 'lb-A1']);
    expect(capacityZoneLane('replicas', 4, false).order.map((x) => x.id)).toEqual([
      'replicas-B0',
      'replicas-B1',
      'replicas-C0',
      'replicas-A0',
    ]);
    const down = capacityZoneLane('replicas', 4, true);
    expect(down.up.map((x) => x.id)).toEqual(['replicas-B0', 'replicas-B1']);
    expect([down.promoted?.id, down.lost.map((x) => x.id)]).toEqual(['replicas-C0', ['replicas-A0']]);
    expect(capacityZoneLane('app', 2, true).promoted).toBeNull();
  });

  it.each(['lb', 'app', 'replicas'] as const)(
    'gives every %s its own id, keeps the survivors in place and loses what zone A held',
    (tier) => {
      for (let n = 0; n <= MAX[tier]; n++) {
        const a = capacityZoneLane(tier, n, false);
        const b = capacityZoneLane(tier, n, true);
        expect(new Set(a.order.map((x) => x.id)).size, `${n}`).toBe(n);
        expect(
          a.order.slice(n - b.lost.length).every((x) => x.zone === 'A'),
          `${n}`,
        ).toBe(true);
        expect(
          b.up.every((x, i) => x.id === a.order[i].id),
          `${n}`,
        ).toBe(true);
        if (!n) continue;
        const r = run({ lb: tier === 'lb' ? n : 2, app: tier === 'app' ? n : 4, replicas: tier === 'replicas' ? n : 2, zone: 1 });
        const t = r[tier];
        expect(b.up.length, `${n}`).toBe(t.up);
        expect(b.lost.length, `${n}`).toBe(t.n - t.up - (tier === 'replicas' && r.primary.promoted ? 1 : 0));
      }
    },
  );

  it("starts zone A's group at the limit that survives it", () => {
    for (const lb of [1, 2, 3, 4, 5, 6])
      for (const app of [1, 2, 4, 9, 16, 17, 21]) {
        const z = run({ lb, app, zone: 1 });
        expect(capacityZoneLane('lb', lb, true).up.length * CAPACITY_LB_RPS, `${lb}`).toBe(z.lb.ceiling);
        expect(capacityZoneLane('app', app, true).up.length * CAPACITY_APP_RPS, `${app}`).toBe(z.app.ceiling);
      }
  });
});
