import { describe, expect, it } from 'vitest';
import {
  CAPACITY_CHALLENGE_BOUNDS,
  CAPACITY_CHALLENGE_GOAL,
  CAPACITY_CHALLENGE_SOLUTION,
  CAPACITY_EXPERIMENTS,
} from './capacity-experiments.js';
import { formatSlot, goalMet, renderExperiment } from './experiments.js';
import { SD_LESSONS } from './index.js';
import {
  CAPACITY_APP_MAX,
  CAPACITY_AXIS_MAX,
  CAPACITY_LB_MAX,
  CAPACITY_REPLICAS_MAX,
  CAPACITY_SIZES,
  CAPACITY_TIERS,
  CAPACITY_WRITES,
  CAPACITY_ZONES,
  capacityMetrics,
  capacityRamp,
  capacityRun,
  type CapacitySettings,
} from './widgets/capacity.js';

const shown = Object.fromEntries(CAPACITY_EXPERIMENTS.map((e) => [e.id, renderExperiment(e)]));
const spec = (id: string) => CAPACITY_EXPERIMENTS.find((e) => e.id === id)!;
const setup = (id: string) => spec(id).setup as CapacitySettings;
const acted = (id: string): CapacitySettings => {
  const e = spec(id);
  return { ...setup(id), ...(e.act && 'set' in e.act ? e.act.set : {}) };
};
const near = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) <= eps * Math.max(1, Math.abs(b));
const met = (s: CapacitySettings) => {
  const r = capacityRun(s);
  return goalMet(CAPACITY_CHALLENGE_GOAL, capacityMetrics(r), r.settings);
};

describe('the Capacity & Scaling experiments', () => {
  it('replace the lesson tryThis, in the order of the interview arc', () => {
    expect(SD_LESSONS['sd-capacity'].widget.experiments).toBe(CAPACITY_EXPERIMENTS);
    expect(SD_LESSONS['sd-capacity'].widget.tryThis).toBeUndefined();
    expect(CAPACITY_EXPERIMENTS.map((e) => e.id)).toEqual(['tenfold', 'cache', 'replay', 'zone', 'slow', 'challenge']);
    expect(CAPACITY_EXPERIMENTS.map((e) => e.act)).toEqual([
      { set: { traffic: 10_000 }, run: 'ramp' },
      { set: { cache: 1 }, run: 'flow' },
      { set: { replicas: 4 }, run: 'flow' },
      { set: { zone: 1 }, run: 'flow' },
      { set: { slow: 1 }, run: 'flow' },
      undefined,
    ]);
  });

  it('put the answers at 3, 2, 2, 3 and 1', () => {
    expect(CAPACITY_EXPERIMENTS.filter((e) => !e.goal).map((e) => renderExperiment(e).answer + 1)).toEqual([3, 2, 2, 3, 1]);
  });

  it('name every region they hide, and point the reveal at the regions it is about', () => {
    expect(CAPACITY_EXPERIMENTS.map((e) => e.hide ?? [])).toEqual([
      ['db'],
      ['after'],
      ['after', 'replay'],
      ['after', 'zones'],
      ['after'],
      [],
    ]);
    expect(CAPACITY_EXPERIMENTS.map((e) => e.focus)).toEqual([
      ['primary', 'sink'],
      ['primary'],
      ['replicas'],
      ['app', 'lb'],
      ['app'],
      ['lb', 'app', 'db'],
    ]);
  });

  it('write every number with its separator, say no rate twice and open no later sentence on a numeral', () => {
    for (const e of Object.values(shown)) {
      for (const text of [e.title, e.ask, ...e.choices, e.reveal]) {
        expect(text.replace(/\d{1,3}(,\d{3})+/g, ''), e.id).not.toMatch(/\d{4}/);
        expect(text, e.id).not.toMatch(/\/s (requests|queries) a second/);
      }
      for (const sentence of e.ask.split(/(?<=[.!?]) /)) expect(sentence, e.id).not.toMatch(/^\d/);
      for (const sentence of e.reveal.split(/(?<=[.!?]) /).slice(1)) expect(sentence, e.id).not.toMatch(/^\d/);
      for (const c of e.choices) expect(c.length, c).toBeLessThan(70);
    }
  });

  it('vary where the answer falls among numeric choices, and give every choice of a question the same shape', () => {
    const value = (c: string) => Number((/^(?:About )?([\d,.]+)/.exec(c)?.[1] ?? (c.startsWith('None') ? '0' : 'NaN')).replace(/,/g, ''));
    let median = 0;
    let numeric = 0;
    for (const e of Object.values(shown)) {
      if (!e.choices.length) continue;
      // Every choice gives a reason after its figure, or none does: a bare answer among reasoned ones stands out.
      const reasoned = e.choices.map((c) => /: .*, /.test(c));
      expect(new Set(reasoned).size, `${e.id}: ${e.choices.join(' / ')}`).toBe(1);
      const vs = e.choices.map(value);
      if (vs.some(Number.isNaN)) continue;
      numeric++;
      const sorted = [...vs].sort((a, b) => a - b);
      if (vs[e.answer] === sorted[1]) median++;
    }
    expect(numeric).toBe(4);
    // At most half the numeric answers are the middle value, so "the middle one" is no strategy.
    expect(median, 'questions whose answer is the median').toBeLessThanOrEqual(numeric / 2);
  });

  it('ask which tier runs out first at ten times the traffic: the database, by what one request costs it', () => {
    const e = shown['tenfold'];
    expect(e.title).toBe('Ten times the traffic');
    expect(e.ask).toBe(
      'Today 1,000 requests a second arrive, and every tier has room to spare. Each request passes a load balancer and an app server, then makes 2 queries to the database. Traffic grows 10×, to 10,000/s. Which tier runs out first?',
    );
    expect(e.choices).toEqual([
      'The load balancers: 2 of 5,000/s each',
      'The app servers: 4 of 1,500/s each',
      'The database: one primary of 8,000 queries/s',
    ]);
    expect(e.reveal).toBe(
      "The database, at 4,000/s: each request costs it 2 queries, so its 8,000 queries a second carry only 4,000 requests a second, fewer than the app servers' 6,000/s or the load balancers' 10,000/s. Compare tiers by their limit in requests a second, never by their raw size. At 10,000/s only 4,000/s are served: the app servers, full at 6,000/s, shed 4,000/s, and the database sheds 2,000/s more. Cache the reads or add 2 or more replicas first; the app servers come next, and the load balancers end exactly 100% busy.",
    );
    const a = capacityRun(setup('tenfold'));
    const b = capacityRun(acted('tenfold'));
    const plan = capacityRamp(setup('tenfold'), a.offered, b.offered);
    expect(a.maxUtil).toBeLessThanOrEqual(0.5);
    expect(plan.stops).toEqual([1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000, 10_000]);
    expect([plan.full, plan.stops[plan.climax]]).toEqual(['primary', 5000]);
    // The app servers shed from 7,000, after the database.
    expect(plan.runs.findIndex((r) => r.app.shed > 0)).toBe(6);
    expect([b.lb.util, b.lb.shed]).toEqual([1, 0]);
    expect(a.dbCeiling < a.app.ceiling && a.app.ceiling < a.lb.ceiling).toBe(true);
    // The trap: the database machine's raw size is above the app tier's limit.
    expect(a.settings.size).toBeGreaterThan(a.app.ceiling);
    expect([b.bottleneck, b.served]).toEqual(['primary', a.dbCeiling]);
  });

  it('ask what a 90% cache buys the database: about 5×, not 10×', () => {
    const e = shown['cache'];
    expect(e.ask).toBe(
      'The database tops out at 4,000/s. Each request makes 1.8 reads and 0.2 writes, 2 queries in all, against its 8,000 queries a second. Put a cache in front of the reads, and 90% of them hit it. How many requests a second can the database take now?',
    );
    expect(e.choices).toEqual([
      'About 8,000/s: twice as many, the cache takes half the work',
      'About 21,000/s: 5× as many, the writes still reach it',
      '40,000/s: 10× as many, like the hit rate',
    ]);
    expect(e.reveal).toBe(
      "21,053/s, 5.3× as many: the cache answers 1.62 of each request's 1.8 reads, so only 0.18 reads and the 0.2 writes reach the database, 0.38 queries a request instead of 2. Its 8,000 queries a second now serve 21,053/s, not the 40,000/s a 90% hit rate suggests: writes always reach the database. All 10,000/s are served now, and the app servers, 83.3% busy, are the busiest tier.",
    );
    const a = capacityRun(setup('cache'));
    const b = capacityRun(acted('cache'));
    expect([a.dbCeiling, a.shed]).toEqual([4000, 6000]);
    expect(near(b.dbCeiling / a.dbCeiling, 2 / 0.38)).toBe(true);
    expect([b.shed, b.busiest]).toEqual([0, 'app']);
    expect(Math.round(b.dbCeiling / 1000) * 1000).toBe(21_000);
  });

  it('ask how busy each replica is after doubling them: a little less, since every one replays every write', () => {
    const e = shown['replay'];
    expect(e.ask).toBe(
      'At 20,000/s, the database takes 4,000 writes a second and, after the cache, 3,600 reads. The 2 read replicas share the reads, each 72.5% busy. Add 2 more. How busy is each replica now?',
    );
    expect(e.choices).toEqual([
      'About 36%: half as busy, the work splits 4 ways',
      'About 61%: a little less, part of the work does not split',
      'About 11%: a replica only serves reads, now split 4 ways',
    ]);
    expect(e.reveal).toBe(
      '61.3%: every replica replays every write, 4,000 a second, which takes 50% of its 8,000 queries a second however many replicas share the reads. Only the 3,600 reads a second split: 1,800 each with 2 replicas, 900 with 4. Twice the replicas raise their limit from 27,586/s to 32,653/s, 18.4% more, and no number of them passes 40,000/s, where replaying the writes alone fills a replica. Replicas scale reads, not writes.',
    );
    const a = capacityRun(setup('replay'));
    const b = capacityRun(acted('replay'));
    expect([a.shed, b.shed]).toEqual([0, 0]);
    for (let n = 1; n <= CAPACITY_REPLICAS_MAX; n++) {
      const r = capacityRun({ ...setup('replay'), replicas: n });
      expect(near(r.replicas.replayUtil, 0.5), `${n}`).toBe(true);
      expect(r.replicas.ceiling, `${n}`).toBeLessThan(r.settings.size / CAPACITY_WRITES);
    }
    expect([Math.round(b.replicas.util * 100), Math.round((a.replicas.util / 2) * 100)]).toEqual([61, 36]);
    expect(Math.round((b.replicas.util - b.replicas.replayUtil) * 100)).toBe(11);
  });

  it('ask what losing a zone of three sheds: a tenth, where the app servers carry 1.5× their load', () => {
    const e = shown['zone'];
    expect(e.ask).toBe(
      'The load balancers and app servers are spread evenly over zones A, B and C, and no tier runs above 74.1%; all 10,000/s are served. Zone A fails with every instance in it, and a replica takes over from the primary. How many requests a second are shed?',
    );
    expect(e.choices).toEqual([
      'None: every tier has room, at least 25.9% to spare',
      "About 3,300/s: a third, the zone's share",
      '1,000/s: a tenth, more than the busiest tier left can take',
    ]);
    expect(e.reveal).toBe(
      '1,000/s, a tenth: the 6 app servers left can take 9,000/s, so the 74.1% they ran at becomes 111.1% of what they can serve. Losing one zone of three multiplies the load on what is left by 1.5× when a tier is spread evenly, so size every tier so that what survives the largest zone still carries the peak. The load balancers end exactly 100% busy, with nothing to spare. The database loses its primary and a replica yet keeps room: a replica became the primary (writes fail until that finishes, seconds to minutes), and the one left runs at 42.8%.',
    );
    const a = capacityRun(setup('zone'));
    const b = capacityRun(acted('zone'));
    expect(a.shed).toBe(0);
    expect(a.maxUtil).toBeLessThan(0.75);
    expect(near(b.shed / a.offered, 0.1)).toBe(true);
    expect([b.app.shed, b.lb.shed, b.primary.shed + b.replicas.shed]).toEqual([b.shed, 0, 0]);
    expect(near(b.lb.util, 1)).toBe(true);
    expect([b.primary.promoted, b.primary.outage, b.replicas.up]).toEqual([true, false, 1]);
    for (const k of ['lb', 'app', 'replicas'] as const) expect(setup('zone')[k] % CAPACITY_ZONES, k).toBe(0);
    expect(Math.round(b.replicas.util * 1000)).toBe(428);
    expect(near(b.app.arriving / b.app.ceiling, a.app.util * 1.5)).toBe(true);
  });

  it('ask what a slow dependency serves: a fifth, with the workers used up and the CPUs idle', () => {
    const e = shown['slow'];
    expect(e.ask).toBe(
      "Each app server has 100 workers, and a request holds one for its whole 50 ms: at 6,000/s, 50 of each server's 100 are busy. A network fault between the app servers and the database adds 450 ms to every request, so each takes 500 ms, though the database does no more work. How many requests a second are served?",
    );
    expect(e.choices).toEqual([
      '1,200/s: a fifth, the workers cap it',
      '6,000/s: all of them, each one slower',
      '3,000/s: half, as the 50 idle workers fill up',
    ]);
    expect(e.reveal).toBe(
      "1,200/s, a fifth: requests in flight equal throughput times latency (Little's law). Each server's 100 workers hold at most 100 requests at once, and at 500 ms each that is 200/s; 6 servers serve 1,200/s. The other 4,800/s are shed at the app servers while their CPUs sit 13.3% busy: waiting on the database used up the workers in front of it. An autoscaler watching CPU sees 13.3% and adds nothing, or even scales in: scale and load-test on pool saturation and latency. Serving 6,000/s at 500 ms needs 3,000 requests in flight. Set timeouts, fix the slow network path, and shed load early rather than only growing the pool.",
    );
    const a = capacityRun(setup('slow'));
    const b = capacityRun(acted('slow'));
    expect(near(a.app.inFlight, 50)).toBe(true);
    expect([b.app.bound, b.app.each]).toEqual(['workers', 200]);
    expect(near(b.served / a.offered, 0.2)).toBe(true);
    expect(near(b.app.cpuUtil, 200 / 1500)).toBe(true);
    expect(b.primary.util).toBeLessThan(a.primary.util);
  });

  it("agree with the lesson's first worked example, whose constants are the widget's", () => {
    const steps = SD_LESSONS['sd-capacity'].examples[0].steps.join(' ');
    const small = { traffic: 1000, lb: 6, app: 21, size: 4000, replicas: 0, cache: 0, zone: 0, slow: 0 };
    expect(capacityRun(small).dbCeiling).toBe(2000);
    expect(steps).toContain('4,000 / 2 = 2,000');
    const cached = capacityRun({ ...small, cache: 1 });
    expect(cached.primary.cost).toBeCloseTo(0.38, 12);
    expect(Math.round(cached.dbCeiling / 500) * 500).toBe(10_500);
    expect(steps).toContain('0.38 queries');
    expect(steps).toContain('about 10,500');
    const big = capacityRun({ ...small, traffic: 20_000, size: 8000, replicas: 3, cache: 1 });
    expect(big.served * (CAPACITY_WRITES + big.misses)).toBeCloseTo(7600, 6);
    expect(steps).toContain('20,000 × 0.38 = 7,600');
    expect(big.primary.util).toBeCloseTo(0.5, 12);
    expect(steps).toContain('the primary is 50% busy');
    // Each replica that size has 70% of 8,000 minus 4,000 of replay, 1,600 reads a second: 3 carry the 3,600, 2 do not.
    expect(big.replicas.readsEach).toBeLessThanOrEqual(0.7 * 8000 - 4000);
    expect(capacityRun({ ...big.settings, replicas: 2 }).replicas.readsEach).toBeGreaterThan(0.7 * 8000 - 4000);
    expect(steps).toContain('1,600 reads a second: 3 replicas');
  });

  it('keep every limit an ask, a reveal or a ghost compares on the axis', () => {
    for (const e of CAPACITY_EXPERIMENTS)
      for (const s of [setup(e.id), acted(e.id)]) {
        const r = capacityRun(s);
        for (const id of CAPACITY_TIERS)
          if (Number.isFinite(r[id].ceiling)) expect(r[id].ceiling, `${e.id} ${id}`).toBeLessThanOrEqual(CAPACITY_AXIS_MAX + 1e-9);
      }
  });

  it('refuse a count that is not whole, so a float never prints as a rounded number', () => {
    for (const e of CAPACITY_EXPERIMENTS)
      for (const [name, slot] of Object.entries(e.slots()))
        if (slot.unit === 'num' && Number.isInteger(slot.value)) expect(formatSlot(slot), `${e.id} ${name}`).toMatch(/^[\d,]+$/);
    const slots = spec('replay').slots();
    expect([slots['writesN'].value, slots['readsN'].value, slots['readsBeforeN'].value, slots['readsAfterN'].value]).toEqual([
      4000, 3600, 1800, 900,
    ]);
  });

  it('set a challenge exactly one of its 3,528 settings passes: 29 machines, every lever needed', () => {
    const e = spec('challenge');
    expect(e.goal).toBe(CAPACITY_CHALLENGE_GOAL);
    expect(shown['challenge'].title).toBe('Challenge: 16,000/s with a zone to spare');
    expect(shown['challenge'].ask).toBe(
      'Serve 16,000/s with every tier keeping at least 30% headroom, nothing shed when zone A fails, and at most 29 machines in all; a cache keeps a full copy in each of the 3 zones.',
    );
    expect(shown['challenge'].reveal).toBe(
      "The fleet that fits: 6 load balancers, 17 app servers, a primary of 8,000 queries/s, 2 replicas and the cache's 3 nodes, 29 machines; the busiest tier runs at 62.7%. Zone A holds 2 of the load balancers and 6 of the app servers, so losing it leaves 4 load balancers 80% busy and 11 app servers 97% busy, while one replica takes over as primary and the other carries every read at 76%. With 16 app servers zone A would hold 6, and the 10 left would shed 1,000/s; with no replica the primary would fall with its zone and every write with it.",
    );
    const passing: CapacitySettings[] = [];
    let count = 0;
    for (let lb = 1; lb <= CAPACITY_LB_MAX; lb++)
      for (let app = 1; app <= CAPACITY_APP_MAX; app++)
        for (const size of CAPACITY_SIZES)
          for (let replicas = 0; replicas <= CAPACITY_REPLICAS_MAX; replicas++)
            for (const cache of [0, 1]) {
              count++;
              const s = { ...setup('challenge'), lb, app, size, replicas, cache };
              if (met(s)) passing.push(s);
            }
    expect(count).toBe(3528);
    const solved = { ...setup('challenge'), ...CAPACITY_CHALLENGE_SOLUTION };
    expect(passing).toEqual([solved]);
    expect(met(setup('challenge'))).toBe(false);
    expect(capacityRun(solved).machines).toBe(CAPACITY_CHALLENGE_BOUNDS.machines);
    for (const back of [{ lb: 5 }, { app: 16 }, { size: 4000 }, { replicas: 1 }, { replicas: 0 }, { cache: 0 }])
      expect(met({ ...solved, ...back }), JSON.stringify(back)).toBe(false);
    // The goal keeps every zone up and the database fast.
    expect(met({ ...solved, zone: 1 })).toBe(false);
    expect(met({ ...solved, slow: 1 })).toBe(false);
    expect(met({ ...solved, traffic: 14_000 })).toBe(false);
    // Without a replica to promote, the zone loss takes the primary and every write with it.
    expect(capacityRun({ ...solved, replicas: 1, zone: 1 }).primary.promoted).toBe(true);
    expect(capacityRun({ ...solved, replicas: 0, zone: 1 }).primary.outage).toBe(true);
  });
});
