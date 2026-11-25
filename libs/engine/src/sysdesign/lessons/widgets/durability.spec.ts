import { describe, expect, it } from 'vitest';
import {
  DURABILITY_ALONE_HOURS,
  DURABILITY_BASELINE,
  DURABILITY_DISK_WRITE_GBPS,
  DURABILITY_OBJECTS,
  DURABILITY_RACK_EVENT,
  DURABILITY_SCHEMES,
  DURABILITY_SETTINGS,
  durability,
  durabilityAtLeast,
  durabilityScenario,
  durabilityTwoInOneRack,
} from './durability.js';
import {
  bigCount,
  formatAbout,
  formatBillion,
  formatFew,
  formatGbps,
  formatNinesCount,
  formatOverhead,
  formatPerYear,
  formatRatio,
  formatTB,
  oneIn,
} from './durability-format.js';
import {
  durabilityFailedIndex,
  durabilityPlan,
  durabilityPlayState,
  durabilitySources,
  durabilityStagedFailures,
} from './durability-plays.js';

const disks = { afr: 0.02, repairHours: 24 };

describe('durability', () => {
  it('costs three times the space for three copies, and half as much again for 6 + 3 erasure coding', () => {
    expect(durability({ kind: 'replicas', copies: 3 }, disks)).toMatchObject({ overhead: 3, tolerates: 2, repairRead: 1 });
    expect(durability({ kind: 'erasure', data: 6, parity: 3 }, disks)).toMatchObject({ overhead: 1.5, tolerates: 3, repairRead: 6 });
  });

  it('gives erasure coding more nines than three copies for half the space, and fewer to two copies', () => {
    const three = durability({ kind: 'replicas', copies: 3 }, disks).nines;
    expect(durability({ kind: 'erasure', data: 6, parity: 3 }, disks).nines).toBeGreaterThan(three);
    expect(durability({ kind: 'replicas', copies: 2 }, disks).nines).toBeLessThan(three);
  });

  it('loses nines as repairs take longer', () => {
    const fast = durability({ kind: 'replicas', copies: 3 }, disks).nines;
    expect(durability({ kind: 'replicas', copies: 3 }, { ...disks, repairHours: 168 }).nines).toBeLessThan(fast - 1);
  });
});

const SCHEMES_AS_REDUNDANCY = DURABILITY_SCHEMES.map((sc) =>
  sc.kind === 'replicas'
    ? ({ kind: 'replicas', copies: sc.copies! } as const)
    : ({ kind: 'erasure', data: sc.data!, parity: sc.parity! } as const),
);
const none = DURABILITY_SETTINGS.filter((s) => !s.rack);

describe('the durability scenario', () => {
  it('is durability() to the bit at every setting with a rack a piece', () => {
    for (const s of none) {
      const m = durabilityScenario(s);
      const today = durability(SCHEMES_AS_REDUNDANCY[s.scheme], { afr: s.afr / 100, repairHours: s.repair });
      expect(Math.abs(today.annualLoss - m.loss) / today.annualLoss, JSON.stringify(s)).toBeLessThan(1e-12);
      expect([today.tolerates, today.overhead, today.repairRead]).toEqual([m.t, m.overhead, m.repairRead]);
    }
  });

  it('sums the binomial tail as brute force over every failure set does', () => {
    for (const n of [1, 2, 8, 13])
      for (const k of [1, 2, 3, 4].filter((v) => v <= n))
        for (const p of [1e-4, 0.01, 0.2]) {
          let brute = 0;
          for (let mask = 0; mask < 1 << n; mask++) {
            let c = 0;
            for (let i = 0; i < n; i++) if (mask & (1 << i)) c++;
            if (c >= k) brute += p ** c * (1 - p) ** (n - c);
          }
          expect(Math.abs(durabilityAtLeast(n, k, p) - brute)).toBeLessThanOrEqual(1e-12 * brute + 1e-300);
        }
  });

  it('draws steps that multiply to the leading term, within 0.006 nines of the exact model and never below it', () => {
    for (const s of DURABILITY_SETTINGS) {
      const m = durabilityScenario(s);
      expect(m.steps.length).toBe(m.t + 2);
      expect(m.steps[m.steps.length - 1].level / m.lead).toBeCloseTo(1, 9);
      expect(Math.abs(Math.log10(m.lead) - Math.log10(m.first * m.tail))).toBeLessThan(0.0061);
      if (m.replicas) expect(m.exactGap).toBeCloseTo(0, 12);
      else expect(m.exactGap).toBeLessThan(0);
      for (const st of m.steps) {
        expect(-Math.log10(st.level)).toBeGreaterThan(-0.6);
        expect(-Math.log10(st.level)).toBeLessThan(25);
      }
      expect(m.nines).toBeGreaterThan(0);
      expect(m.nines).toBeLessThan(25);
    }
  });

  it('adds a rack event, assumed once in 1,000 years, without losing the independent digits', () => {
    const wide = durabilityScenario({ scheme: 3, afr: 2, repair: 24, rack: 1 });
    expect(wide.loss).toBeCloseTo(DURABILITY_RACK_EVENT, 9);
    expect(durabilityScenario({ scheme: 3, afr: 2, repair: 24, rack: 0 }).nines).toBeCloseTo(14.75, 1);
    expect(-Math.log10(durabilityTwoInOneRack(DURABILITY_BASELINE))).toBeCloseTo(7.26, 2);
  });

  it('lets the window enter the loss once for every failure the scheme tolerates', () => {
    for (const s of none.filter((v) => v.repair < 168)) {
      const a = durabilityScenario(s);
      const b = durabilityScenario({ ...s, repair: 168 });
      expect(Math.abs(Math.log10(b.loss / a.loss) - a.t * Math.log10(168 / s.repair))).toBeLessThan(0.0061);
    }
  });

  it('prices a billion objects: raw bytes, disks, failures, rebuild reads and when a rebuild must spread', () => {
    const m = durabilityScenario({ scheme: 3, afr: 5, repair: 72, rack: 0 });
    expect([m.rawTB, m.disks, m.rebuildTB]).toEqual([1400, 70, 200]);
    expect(m.rebuildGbps).toBeCloseTo(6.17, 2);
    let prod = 1;
    for (let i = 0; i <= m.t; i++) prod *= (m.n - i) / (m.disks - i);
    expect((prod * DURABILITY_OBJECTS) / m.objectsPerLoss).toBeCloseTo(1, 9);
    expect(bigCount(m.objectsPerLoss)).toBe('170,000');
    expect(bigCount(1 / m.lossEventsYear)).toBe('12 million');
    expect(DURABILITY_ALONE_HOURS).toBeCloseTo(22.2, 1);
    for (const s of DURABILITY_SETTINGS) {
      const v = durabilityScenario(s);
      expect(v.spread, JSON.stringify(s)).toBe(s.repair < 24);
      expect(v.spread).toBe(v.writeGbps > DURABILITY_DISK_WRITE_GBPS);
    }
  });

  it('agrees with a discrete-event simulation of disks failing and being rebuilt', () => {
    const mulberry = (seed: number) => () => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    // One object of n pieces, each up for an exponential time at rate lambda a year, then down for exactly W years;
    // lost when more than t are down at once, then stored afresh.
    const simulate = (n: number, t: number, lambda: number, W: number, years: number, seed: number) => {
      const rnd = mulberry(seed);
      let now = 0;
      let losses = 0;
      let ends: number[] = [];
      while (now < years) {
        const next = now - Math.log(1 - rnd()) / (lambda * (n - ends.length));
        if (ends.length && ends[0] <= next) {
          now = ends.shift()!;
          continue;
        }
        now = next;
        ends.push(now + W);
        if (ends.length > t) {
          losses++;
          ends = [];
        }
      }
      return losses / years;
    };
    for (const [scheme, W, years] of [
      [0, 0.01, 2e5],
      [1, 0.02, 3e6],
      [2, 0.03, 3e5],
      [3, 0.03, 5e5],
    ]) {
      const sc = SCHEMES_AS_REDUNDANCY[scheme];
      const n = sc.kind === 'replicas' ? sc.copies : sc.data + sc.parity;
      const t = sc.kind === 'replicas' ? sc.copies - 1 : sc.parity;
      const model = n * durabilityAtLeast(n - 1, t, W);
      const sim = simulate(n, t, 1, W, years, 7 + scheme);
      const sigma = 1 / Math.sqrt(sim * years);
      // The model is the first-order rate, over-counting by O(n p); it never under-counts.
      expect(Math.abs(sim / model - 1), sc.kind + n).toBeLessThan(4 * sigma + n * W);
      expect(sim / model).toBeLessThan(1 + 4 * sigma);
    }
  });
});

describe('the durability formats', () => {
  it('say every number with its unit, as the brief does', () => {
    expect([bigCount(18_262), bigCount(5.6e9), bigCount(6.03e11), bigCount(0.42)]).toEqual([
      '18,000',
      '5.6 billion',
      '600 billion',
      '0.42',
    ]);
    expect([oneIn(5.48e-5), formatNinesCount(9.74), formatNinesCount(3), formatBillion(0.179), formatBillion(180)]).toEqual([
      '1 in 18,000',
      '9.7',
      '3.0',
      '1 every 6 years',
      '180 a year',
    ]);
    expect([formatOverhead(1.5), formatOverhead(3), formatOverhead(1.4), formatTB(1400), formatTB(120), formatGbps(18.52)]).toEqual([
      '1.5×',
      '3×',
      '1.4×',
      '1.4 PB',
      '120 TB',
      '19 Gb/s',
    ]);
    expect([formatRatio(49), formatRatio(7.4e6), formatPerYear(0.18), formatPerYear(1.4), formatFew(1.5), formatAbout(22.2)]).toEqual([
      '49×',
      '7.4 million times',
      '0.18 a year',
      '1.4 a year',
      '1.5',
      'about a day',
    ]);
  });

  it('never print NaN, Infinity, exponents or a bare number at any setting', () => {
    for (const s of DURABILITY_SETTINGS) {
      const m = durabilityScenario(s);
      const said = [formatNinesCount(m.nines), formatBillion(m.perBillion), oneIn(m.p), formatOverhead(m.overhead), formatTB(m.rebuildTB)];
      said.push(formatGbps(m.rebuildGbps), formatTB(m.rawTB), formatPerYear(m.first), oneIn(m.tail), formatFew(m.failsYear));
      for (const t of said) expect(t, JSON.stringify(s)).not.toMatch(/NaN|Infinity|undefined|\de[+-]\d|\u2014/);
      expect(formatBillion(m.perBillion)).toMatch(/ (a year|years)$/);
      expect(oneIn(m.p)).toMatch(/^1 in \d/);
    }
  });
});

describe('the durability plays', () => {
  const kinds = ['repair', 'staged'] as const;

  it('fail the third piece (the second of two) and rebuild it from one copy or the first k survivors', () => {
    const at = (scheme: number) => durabilityScenario({ ...DURABILITY_BASELINE, scheme });
    expect([0, 1, 2, 3].map((v) => durabilityFailedIndex(at(v)))).toEqual([1, 2, 2, 2]);
    expect(durabilitySources(at(1))).toEqual([0]);
    expect(durabilitySources(at(2))).toEqual([0, 1, 3, 4, 5, 6]);
    expect(durabilitySources(at(3)).length).toBe(10);
    expect(durabilityStagedFailures(at(1))).toEqual([0, 1]);
    expect(durabilityStagedFailures(at(3)).length).toBe(4);
  });

  it('run one monotone clock on which nothing lands before its moment', () => {
    for (const s of DURABILITY_SETTINGS)
      for (const kind of kinds) {
        const m = durabilityScenario(s);
        const plan = durabilityPlan(s, kind);
        const times = plan.events.map((e) => e.at);
        expect(times).toEqual([...times].sort((a, b) => a - b));
        expect(plan.total).toBeGreaterThan(plan.finalAt);
        const before = durabilityPlayState(s, kind, 0);
        expect([before.failed, before.lost, before.rebuilt, before.rows.final, before.progress]).toEqual([false, false, false, false, 0]);
        const end = durabilityPlayState(s, kind, null);
        expect(end.done).toBe(true);
        expect(end.lost).toBe(kind === 'staged');
        expect(end.rebuilt).toBe(kind === 'repair');
        expect(end.rows.steps).toBe(m.t);
        if (kind === 'staged' && !s.rack) {
          expect(end.stagedDown.length).toBe(m.t);
          for (const e of plan.events) if (e.kind === 'staged') expect(e.at).toBeLessThan(plan.winEnd);
        }
        if (kind === 'staged' && s.rack) expect([end.rackDown, end.progress]).toEqual([true, 0]);
        let last = -1;
        for (let tau = 0; tau <= plan.total; tau += 0.05) {
          const ps = durabilityPlayState(s, kind, tau);
          expect(ps.progress).toBeGreaterThanOrEqual(last);
          last = ps.progress;
          if (ps.rows.final) expect(ps.rows.ways).toBe(true);
          if (ps.rebuilt) expect(ps.progress).toBe(1);
        }
      }
  });

  it('give a week visibly longer than a day, and no window flashes', () => {
    const day = durabilityPlan(DURABILITY_BASELINE);
    const week = durabilityPlan({ ...DURABILITY_BASELINE, repair: 168 });
    const hour = durabilityPlan({ ...DURABILITY_BASELINE, repair: 1 });
    expect(week.win).toBeCloseTo(3.6, 1);
    expect(day.win).toBeCloseTo(2.23, 1);
    expect(hour.win).toBeGreaterThan(1.5);
  });
});
