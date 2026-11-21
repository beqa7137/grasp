import { describe, expect, it } from 'vitest';
import {
  FAILOVER_H,
  RELIABILITY_SETTINGS,
  RELIABILITY_SETUPS,
  RELIABILITY_WEEKS,
  reliabilityKey,
  reliabilityScenario,
} from './reliability.js';
import {
  ANSWER_HOLD_WEEKS,
  RELIABILITY_HOLD_GAP,
  RELIABILITY_HOLD_MS,
  RELIABILITY_SAMPLE_SEED,
  RELIABILITY_SWEEP_MS,
  reliabilityAnswerHold,
  reliabilityPlayPlan,
  reliabilityRestMoment,
  reliabilitySeedBounds,
  reliabilityStepMoments,
  reliabilityYear,
  sameMoment,
} from './reliability-sample.js';

const E = RELIABILITY_SETUPS;
const weeksOf = (moments: readonly { week: number }[]) => moments.map((m) => m.week + 1);

describe('the simulated year', () => {
  it('meets every hard bound of its seed', () => {
    const bounds = reliabilitySeedBounds(RELIABILITY_SAMPLE_SEED);
    expect(bounds.filter((b) => !b.ok)).toEqual([]);
    expect(bounds.length).toBe(35);
    expect(reliabilitySeedBounds(1).some((b) => !b.ok)).toBe(true);
  });

  it('draws a copy’s outages once, so adding a copy adds a row and moves no other outage', () => {
    for (const s of RELIABILITY_SETTINGS) {
      const y = reliabilityYear(s);
      for (const id of ['lb', 'app', 'db', 'recs'] as const) {
        if (s[id] === 3) continue;
        const more = reliabilityYear({ ...s, [id]: s[id] + 1 });
        const part = y.parts.find((p) => p.id === id)!;
        const after = more.parts.find((p) => p.id === id)!;
        const weeks = (rows: typeof part.rows) => rows.map((r) => r.map((t) => t.week));
        expect(weeks(after.rows.slice(0, part.n))).toEqual(weeks(part.rows));
      }
    }
  });

  it('fails the request at most once a week, and stands two ticks of a part in one column only in a shared outage', () => {
    for (const s of RELIABILITY_SETTINGS) {
      const y = reliabilityYear(s);
      const weeks = y.fails.map((e) => e.week);
      expect(new Set(weeks).size, reliabilityKey(s)).toBe(weeks.length);
      for (const p of y.parts) {
        const seen = new Map<number, number>();
        for (const r of p.rows) for (const t of r) seen.set(t.week, (seen.get(t.week) ?? 0) + 1);
        for (const [week, n] of seen) {
          if (n < 2) continue;
          expect(p.rows.every((r) => r.some((t) => t.week === week && t.shared))).toBe(true);
          expect(p.events.some((e) => e.week === week && e.kind === 'shared')).toBe(true);
        }
      }
    }
  });

  it('lets through exactly a single copy’s outages, shared outages and a failover’s first minutes, as the union of the parts needed', () => {
    for (const s of RELIABILITY_SETTINGS) {
      const y = reliabilityYear(s);
      for (const p of y.parts) {
        const first = p.rows[0];
        const want = first.filter((t) => p.n === 1 || t.shared || !!s.failover).map((t) => t.week);
        expect(p.events.map((e) => e.week)).toEqual(want);
        for (const e of p.events) expect(e.hours).toBe(e.kind === 'failover' ? FAILOVER_H : 1);
      }
      const union = y.parts
        .filter((p) => !p.optional)
        .flatMap((p) => p.events.map((e) => e.week))
        .sort((a, b) => a - b);
      expect(y.fails.map((e) => e.week)).toEqual(union);
    }
  });

  it('counts within 3 standard deviations of the model’s average failures a year, at every setting', () => {
    for (const s of RELIABILITY_SETTINGS) {
      const expected = reliabilityScenario(s).failsPerYear;
      expect(Math.abs(reliabilityYear(s).count - expected), reliabilityKey(s)).toBeLessThanOrEqual(3 * Math.sqrt(expected) + 1);
    }
  });

  it('counts the experiments’ years as the design’s seed does', () => {
    const count = (s: (typeof E)[keyof typeof E]) => [reliabilityYear(s).count, Number(reliabilityYear(s).hours.toFixed(2))];
    expect(
      [
        E.series,
        E.parallelBefore,
        E.parallelAfter,
        E.weakestBefore,
        E.pairs,
        E.sharedAfter,
        E.failoverAfter,
        E.challenge,
        E.solution,
        E.base,
      ].map(count),
    ).toEqual([
      [35, 35],
      [27, 27],
      [18, 18],
      [9, 9],
      [0, 0],
      [3, 3],
      [27, 2.25],
      [35, 20.33],
      [27, 5],
      [17, 17],
    ]);
  });
});

describe('the year’s moments and plays', () => {
  it('rests on the focus part’s first failure, else on an absorbed outage of its first copy', () => {
    const rest = (s: (typeof E)[keyof typeof E]) => {
      const r = reliabilityRestMoment(s)!;
      return `${r.week + 1} ${r.part} ${r.kind}`;
    };
    expect(Object.values(E).map(rest)).toEqual([
      '3 recs outage',
      '4 db outage',
      '19 app outage',
      '4 db outage',
      '4 db outage',
      '4 db absorbed',
      '44 db shared',
      '4 db failover',
      '3 recs outage',
      '44 db shared',
      '3 recs outage',
    ]);
  });

  it('holds an answer’s play on its climax, nearest the middle of the sweep', () => {
    expect(reliabilityAnswerHold(E.series, [], 'request')).toMatchObject({ week: 26, part: 'app', kind: 'outage' });
    expect(reliabilityAnswerHold(E.series, [], 'request')?.part).not.toBe(reliabilityRestMoment(E.series)?.part);
    expect(reliabilityAnswerHold(E.parallelAfter, ['db'])).toMatchObject({ week: 23, part: 'db', kind: 'absorbed', copy: 0 });
    expect(reliabilityAnswerHold(E.weakestAfter, ['app'], 'request')).toMatchObject({ week: 23, part: 'db', kind: 'outage' });
    expect(reliabilityAnswerHold(E.sharedAfter, ['lb', 'app', 'db'])).toMatchObject({ week: 17, part: 'lb', kind: 'shared' });
    expect(reliabilityAnswerHold(E.failoverAfter, ['lb', 'app', 'db'])).toMatchObject({ week: 26, part: 'app', kind: 'failover' });
    for (const s of RELIABILITY_SETTINGS) {
      const h = reliabilityAnswerHold(s, ['lb', 'app', 'db'], 'request');
      if (h?.fails && reliabilityYear(s).fails.some((f) => f.week >= ANSWER_HOLD_WEEKS[0] && f.week <= ANSWER_HOLD_WEEKS[1]))
        expect(h.week, reliabilityKey(s)).toBeGreaterThanOrEqual(ANSWER_HOLD_WEEKS[0]);
    }
  });

  it('steps through distinct moments, two or more, the first step away from the rest picture', () => {
    for (const s of RELIABILITY_SETTINGS) {
      const steps = reliabilityStepMoments(s);
      const rest = reliabilityRestMoment(s)!;
      expect(steps.length, reliabilityKey(s)).toBeGreaterThanOrEqual(2);
      steps.forEach((m, i) => expect(sameMoment(m, steps[(i + 1) % steps.length]), reliabilityKey(s)).toBe(false));
      expect(steps.map((m) => m.week)).toEqual(steps.map((m) => m.week).sort((a, b) => a - b));
      const at = steps.findIndex((m) => sameMoment(m, rest));
      expect(at, reliabilityKey(s)).toBeGreaterThanOrEqual(0);
      expect(sameMoment(steps[(at + 1) % steps.length], rest)).toBe(false);
      for (const h of reliabilityPlayPlan(s).holds) expect(steps.some((m) => sameMoment(m, h))).toBe(true);
    }
  });

  it('steps through a failure of every part that fails the request before any part repeats', () => {
    const failing = (ms: readonly { part: string; fails: boolean }[]) => [...new Set(ms.filter((m) => m.fails).map((m) => m.part))].sort();
    for (const s of RELIABILITY_SETTINGS) {
      const y = reliabilityYear(s);
      expect(failing(reliabilityStepMoments(s)), reliabilityKey(s)).toEqual(failing(y.fails.map((e) => ({ part: e.part, fails: true }))));
    }
    expect(reliabilityStepMoments(E.series).map((m) => `${m.week + 1} ${m.part}`)).toEqual(['3 recs', '11 lb', '14 db', '19 app']);
  });

  it('holds a free play on the first of each kind, 3 weeks apart or more, never in a week a served hold would contradict', () => {
    expect(weeksOf(reliabilityPlayPlan(E.challenge).holds)).toEqual([3, 11, 18, 23]);
    expect(weeksOf(reliabilityPlayPlan(E.solution).holds)).toEqual([4, 9, 18, 34]);
    for (const s of RELIABILITY_SETTINGS) {
      const y = reliabilityYear(s);
      const bad = new Set(y.fails.map((e) => e.week));
      const plan = reliabilityPlayPlan(s);
      const weeks = plan.holds.map((h) => h.week);
      for (let i = 1; i < weeks.length; i++) expect(weeks[i] - weeks[i - 1]).toBeGreaterThanOrEqual(RELIABILITY_HOLD_GAP);
      for (const h of plan.holds) {
        expect(bad.has(h.week), reliabilityKey(s)).toBe(h.fails);
        if (h.kind === 'absorbed' && !s.failover) expect(h.copy).toBe(0);
      }
      expect(new Set(plan.holds.map((h) => h.kind)).size).toBe(plan.holds.length);
      expect(plan.total).toBe(RELIABILITY_SWEEP_MS + plan.holds.length * RELIABILITY_HOLD_MS);
    }
  });

  it('runs one monotone clock that stands at each held column’s leading edge and ends at week 52', () => {
    for (const s of RELIABILITY_SETTINGS.filter((_, i) => i % 7 === 0)) {
      const plan = reliabilityPlayPlan(s);
      let last = -1;
      for (let t = 0; t <= plan.total; t += 25) {
        const c = plan.at(t);
        expect(c.weeks).toBeGreaterThanOrEqual(last - 1e-9);
        last = c.weeks;
        if (c.hold) expect(c.weeks).toBe(c.hold.week + 1);
      }
      expect(plan.at(plan.total).weeks).toBeCloseTo(RELIABILITY_WEEKS, 9);
      plan.holds.forEach((h, i) => expect(plan.at(plan.holdAt(i, 0.5)).hold).toBe(h));
    }
  });
});
