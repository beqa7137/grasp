import { describe, expect, it } from 'vitest';
import {
  COPY_FAILS_PER_YEAR,
  COPY_MTBF_H,
  COPY_MTTR_H,
  COPY_UNAVAILABILITY,
  FAILOVER_H,
  RELIABILITY_SETTINGS,
  RELIABILITY_YEAR_H,
  SHARED_SHARE,
  hoursAYear,
  partAvailability,
  reliabilityScenario,
} from './reliability.js';
import { formatAvailability, formatDown, formatHours, formatOneIn } from '../format-time.js';
import { seededRandom } from './seeded-random.js';

const U = COPY_UNAVAILABILITY;
const close = (a: number, b: number, rel: number) => Math.abs(a - b) <= rel * Math.abs(b);

/** The chance no copy is up, by enumerating the 2^n states of copies that fail independently. */
function allDownByStates(n: number, u: number): number {
  let p = 0;
  for (let mask = 0; mask < 1 << n; mask++) {
    let q = 1;
    for (let i = 0; i < n; i++) q *= mask & (1 << i) ? 1 - u : u;
    if (mask === 0) p += q;
  }
  return p;
}

/** 1 − Π(1 − u) by inclusion and exclusion over every set of parts. */
function unionByInclusion(us: readonly number[]): number {
  let p = 0;
  for (let mask = 1; mask < 1 << us.length; mask++) {
    let q = 1;
    let k = 0;
    for (let i = 0; i < us.length; i++)
      if (mask & (1 << i)) {
        q *= us[i];
        k++;
      }
    p += k % 2 ? q : -q;
  }
  return p;
}

/**
 * A discrete-event simulation of one pair: each cause up for an exponential time, then down exactly 1 h; the shared cause
 * takes both copies; requests go to the first copy that is up, and with failover on, a death of the copy in use while
 * the other is up costs 5 min. Returns the part's downtime a year by cause.
 */
function simulatePair(shared: boolean, failover: boolean, years: number, seed: number) {
  const rand = seededRandom(seed);
  const horizon = years * RELIABILITY_YEAR_H;
  const uShared = shared ? SHARED_SHARE * U : 0;
  const uOwn = 1 - (1 - U) / (1 - uShared);
  const outages = (u: number) => {
    const out: number[] = [];
    if (u <= 0) return out;
    const meanUp = (COPY_MTTR_H * (1 - u)) / u;
    for (let t = -Math.log(1 - rand()) * meanUp; t < horizon; t += COPY_MTTR_H - Math.log(1 - rand()) * meanUp) out.push(t);
    return out;
  };
  const a = outages(uOwn);
  const b = outages(uOwn);
  const s = outages(uShared);
  const within = (list: readonly number[], t: number) => {
    let lo = 0;
    let hi = list.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (list[mid] <= t) lo = mid + 1;
      else hi = mid;
    }
    return lo > 0 && t < list[lo - 1] + COPY_MTTR_H;
  };
  const overlapOf = (x: readonly number[], y: readonly number[]) => {
    let total = 0;
    let j = 0;
    for (const t of x) {
      while (j < y.length && y[j] + COPY_MTTR_H <= t) j++;
      for (let k = j; k < y.length && y[k] < t + COPY_MTTR_H; k++) total += Math.min(t, y[k]) + COPY_MTTR_H - Math.max(t, y[k]);
    }
    return total;
  };
  const both = overlapOf(a, b);
  let fo = 0;
  if (failover) for (const t of a) if (!within(b, t) && !within(s, t)) fo += FAILOVER_H;
  const perYear = (h: number) => h / years;
  return { shared: perYear(s.length * COPY_MTTR_H), failover: perYear(fo), both: perYear(both) };
}

describe('the reliability model', () => {
  it('makes a copy 99.9% available, MTBF / (MTBF + MTTR), with 8.76 outages a year', () => {
    expect(COPY_MTBF_H / (COPY_MTBF_H + COPY_MTTR_H)).toBeCloseTo(1 - U, 12);
    expect(COPY_FAILS_PER_YEAR).toBeCloseTo(8.76, 12);
    for (const shared of [false, true]) for (const failover of [false, true]) expect(partAvailability(1, shared, failover).u).toBe(U);
  });

  it('keeps each copy exactly 99.9% with shared failures on: (1 − own)(1 − shared) = 1 − u', () => {
    const uShared = SHARED_SHARE * U;
    for (const n of [2, 3]) {
      const p = partAvailability(n, true, false);
      const uOwn = (p.causes.overlap / (1 - uShared)) ** (1 / n);
      expect((1 - uOwn) * (1 - uShared)).toBeCloseTo(1 - U, 14);
    }
  });

  it('downs a part of independent copies only while all are, as the states enumerate, so each copy adds 3 nines', () => {
    for (const n of [1, 2, 3]) {
      const p = partAvailability(n, false, false);
      expect(close(p.u, allDownByStates(n, U), 1e-9)).toBe(true);
      expect(p.paper).toBeCloseTo(U ** n, 20);
      expect(-Math.log10(p.u)).toBeCloseTo(3 * n, 9);
    }
  });

  it('adds the causes up to the part at every configuration, and more copies never hurt', () => {
    for (const shared of [false, true])
      for (const failover of [false, true]) {
        let last = 1;
        for (const n of [1, 2, 3]) {
          const p = partAvailability(n, shared, failover);
          const sum = p.causes.single + p.causes.shared + p.causes.failover + p.causes.overlap;
          expect(close(sum, p.u, 1e-12)).toBe(true);
          expect(p.u).toBeLessThanOrEqual(last);
          last = p.u;
        }
      }
  });

  it('caps a part with shared failures at four nines, however many copies, and prices failover at 5 min a death', () => {
    for (const n of [2, 3]) {
      expect(partAvailability(n, true, false).u).toBeGreaterThan(SHARED_SHARE * U);
      expect(partAvailability(n, true, false).u).toBeLessThan(1.01 * SHARED_SHARE * U);
    }
    const pair = partAvailability(2, false, true);
    expect(pair.failovers).toBeCloseTo(COPY_FAILS_PER_YEAR * (1 - U), 9);
    expect(hoursAYear(pair.causes.failover) * 60).toBeCloseTo(43.76, 2);
    expect(pair.failsPerYear).toBeCloseTo(8.769, 3);
    expect(partAvailability(2, false, false).overlapsPerYear).toBeCloseTo(0.01752, 5);
  });

  it('multiplies the parts in series, as inclusion and exclusion gives, between the weakest part and the sum', () => {
    for (const s of RELIABILITY_SETTINGS) {
      const m = reliabilityScenario(s);
      const us = m.parts.filter((p) => !p.optional).map((p) => p.u);
      expect(close(m.u, unionByInclusion(us), 1e-9), m.key).toBe(true);
      expect(m.u).toBeGreaterThanOrEqual(Math.max(...us));
      expect(m.u).toBeLessThanOrEqual(us.reduce((a, b) => a + b, 0));
      expect(m.copies).toBe(s.lb + s.app + s.db + s.recs);
    }
    expect(RELIABILITY_SETTINGS).toHaveLength(648);
  });

  it('names as weakest exactly the needed parts that print the worst downtime, and caps from the worst of them', () => {
    for (const s of RELIABILITY_SETTINGS) {
      const m = reliabilityScenario(s);
      const hard = m.parts.filter((p) => !p.optional);
      const worst = Math.max(...hard.map((p) => p.u));
      const printed = formatDown(hoursAYear(worst));
      expect(m.weakest, m.key).toEqual(hard.filter((p) => formatDown(p.downH) === printed).map((p) => p.id));
      expect(m.parts.find((p) => p.id === m.capPart)!.u).toBe(worst);
      expect(m.focusPart).toBe(m.weakest[m.weakest.length - 1]);
    }
  });

  it('matches a simulation of a pair, cause by cause', () => {
    const years = 20_000;
    for (const shared of [false, true])
      for (const failover of [false, true]) {
        const model = partAvailability(2, shared, failover);
        const sim = simulatePair(shared, failover, years, shared ? (failover ? 41 : 42) : failover ? 43 : 44);
        if (shared) expect(close(sim.shared, hoursAYear(model.causes.shared), 0.03), 'shared').toBe(true);
        if (failover) expect(close(sim.failover, hoursAYear(model.causes.failover), 0.03), 'failover').toBe(true);
        if (!shared) expect(close(sim.both, hoursAYear(model.causes.overlap), 0.15), 'both down').toBe(true);
      }
  });
});

describe('the reliability formats', () => {
  it('say a downtime in an interviewer’s unit, never without it and never as 0', () => {
    const ladder = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((k) => formatDown(hoursAYear(10 ** -k)));
    expect(ladder).toEqual(['36.5 d', '3.65 d', '8.8 h', '53 min', '5.3 min', '32 s', '3.2 s', '0.32 s', '0.03 s']);
    expect([1, 35.04, 1e-9, 0, 26.28, 2.2, 17.54].map(formatDown)).toEqual([
      '1 h',
      '35 h',
      'under 0.01 s',
      'under 0.01 s',
      '26.3 h',
      '2.2 h',
      '17.5 h',
    ]);
    for (const s of RELIABILITY_SETTINGS) {
      const m = reliabilityScenario(s);
      for (const h of [m.downH, m.monthH, ...m.parts.flatMap((p) => [p.downH, p.paperDownH])]) {
        expect(formatDown(h)).toMatch(/^(under 0\.01 s|\d[\d.]* (s|min|h|d))$/);
        expect(formatDown(h)).not.toMatch(/^0 /);
      }
    }
  });

  it('say an availability to the digit after its nines, cut there so it never claims a nine the design lacks', () => {
    expect([U, 1e-6, 0.002, 0.00017, 1e-9, 0.001002, 0.00025].map(formatAvailability)).toEqual([
      '99.9%',
      '99.9999%',
      '99.8%',
      '99.983%',
      '99.9999999%',
      '99.89%',
      '99.975%',
    ]);
    for (const s of RELIABILITY_SETTINGS) {
      const m = reliabilityScenario(s);
      for (const u of [m.u, ...m.parts.map((p) => p.u)]) {
        const printed = Number(formatAvailability(u).slice(0, -1));
        expect(printed, m.key).toBeLessThan(100);
        expect(printed, m.key).toBeLessThanOrEqual(100 * (1 - u) + 1e-9);
      }
    }
    expect([formatHours(8.76), formatHours(1), formatOneIn(SHARED_SHARE)]).toEqual(['8.76 h', '1 h', '1 in 10']);
  });
});
