import {
  CAPACITY_APP_MAX,
  CAPACITY_EXPERIMENTS,
  CAPACITY_REPLICAS_MAX,
  capacityActOf,
  capacityAllSettings,
  capacityRun,
  type CapacitySettings,
} from '@grasp/engine';
import { REST_VIEW, buildStage } from './capacity-layout';
import {
  DWELL_MS,
  EASE_BUDGET,
  FLOW_MS,
  MIN_TRANSIT_MS,
  PARTICLE_BUDGET,
  RING_MS,
  STOP_MS,
  Stream,
  clockAt,
  easedMarks,
  eases,
  flowClock,
  playAnchor,
  rampClock,
  restRing,
} from './capacity-motion';
import { NOTHING_HIDDEN, actChange } from './capacity-words';

const exp = (id: string) => CAPACITY_EXPERIMENTS.find((e) => e.id === id)!;
const setupOf = (id: string) => capacityRun(exp(id).setup).settings;
const actOf = (id: string) => capacityActOf(exp(id));
const stageOf = (s: CapacitySettings, W = 322) => buildStage(W, capacityRun(s), { ...REST_VIEW, hid: NOTHING_HIDDEN });
const HEAVIEST: CapacitySettings = {
  traffic: 20_000,
  lb: 6,
  app: CAPACITY_APP_MAX,
  size: 4000,
  replicas: CAPACITY_REPLICAS_MAX,
  cache: 0,
  zone: 1,
  slow: 1,
};

describe('capacity motion', () => {
  it('steps a ramp on one monotone clock, landing the ring at the first stop that sheds and dwelling there', () => {
    const c = rampClock(actOf('tenfold'), setupOf('tenfold').traffic);
    expect(c.ramp.stops).toEqual([1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000, 10_000]);
    expect(c.ringAt).toBe(4);
    expect(c.ring).toBe('primary');
    expect(c.length).toBe(9 * STOP_MS + RING_MS + DWELL_MS);
    let last = -1;
    const at5000: number[] = [];
    for (let ms = 0; ms <= c.length; ms += 10) {
      const a = clockAt(c, ms);
      expect(a.index).toBeGreaterThanOrEqual(last);
      last = a.index;
      // Nothing is drawn for a shed before the stop where its tier's limit is passed.
      const run = c.ramp.runs[a.index];
      if (a.ring) expect(run.primary.shed).toBeGreaterThan(0);
      if (a.index === 4) at5000.push(ms);
    }
    expect(last).toBe(8);
    expect(at5000[at5000.length - 1] - at5000[0]).toBeGreaterThanOrEqual(STOP_MS + RING_MS + DWELL_MS - 10);
    // The app servers shed from 7,000, after the database.
    expect(c.ramp.runs.findIndex((r) => r.app.shed > 0)).toBe(6);
  });

  it('runs the stream at the lowest stop, and rings the busiest lane where nothing sheds', () => {
    const one = rampClock({ ...actOf('cache'), traffic: 1000 });
    expect(one.ramp.stops).toEqual([1000]);
    expect(one.length).toBe(FLOW_MS);
    expect(clockAt(one, 0).ring).toBe(false);
    expect(clockAt(one, FLOW_MS).ring).toBe(true);
    expect(rampClock(actOf('cache')).ring).toBe('app');
    expect(restRing(actOf('cache'))).toBe('app');
    expect(restRing(setupOf('challenge'))).toBe('primary');
  });

  it('flows an answer’s act for its play, ringing the first new shed, and brings its box into view on a phone', () => {
    expect(flowClock(setupOf('cache'), actOf('cache')).ring).toBeNull();
    expect(flowClock(setupOf('replay'), actOf('replay')).ring).toBeNull();
    expect(flowClock(setupOf('zone'), actOf('zone')).ring).toBe('app');
    expect(flowClock(setupOf('slow'), actOf('slow')).ring).toBe('app');
    const anchor = (id: string) => playAnchor(actChange(capacityRun(setupOf(id)), capacityRun(actOf(id))));
    expect(['tenfold', 'cache', 'replay', 'zone', 'slow'].map((id) => (id === 'tenfold' ? 'lb' : anchor(id)))).toEqual([
      'lb',
      'db',
      'db',
      'lb',
      'app',
    ]);
  });

  it('keeps the particles within their budget and their gaps, each critical only in the part the next tier sheds', () => {
    for (const W of [248, 322, 620]) {
      const st = stageOf(HEAVIEST, W);
      const stream = new Stream();
      const live: { until: number }[] = [];
      let most = 0;
      for (let now = 0; now < 10_000; now += 16) {
        for (const d of stream.step(st.gaps, 16)) {
          const gp = st.gaps.find((g) => g.nextId === d.gap)!;
          expect(d.duration).toBeGreaterThanOrEqual(MIN_TRANSIT_MS);
          const [[x0, y0], [x1, y1]] = d.path;
          expect(x0).toBe(x1);
          expect(x0).toBeGreaterThanOrEqual(gp.x0);
          expect(x0).toBeLessThanOrEqual(gp.x1);
          expect(y0).toBeGreaterThanOrEqual(gp.y0);
          expect(y1).toBeLessThanOrEqual(gp.y1);
          expect(d.doomed).toBe(gp.shedNext > 0 && x0 > gp.xPass);
          live.push({ until: now + d.duration });
        }
        most = Math.max(most, live.filter((p) => p.until > now).length);
      }
      expect(most).toBeLessThanOrEqual(PARTICLE_BUDGET + 4);
    }
  });

  it('eases by transform and opacity only, and only marks that are drawn', () => {
    const c = rampClock(actOf('tenfold'), 1000);
    for (let i = 1; i < c.ramp.runs.length; i++) {
      const a = buildStage(322, c.ramp.runs[i - 1], { ...REST_VIEW, hid: NOTHING_HIDDEN });
      const b = buildStage(322, c.ramp.runs[i], { ...REST_VIEW, hid: NOTHING_HIDDEN });
      const ids = new Set(b.D.prims().map((p) => p.id));
      for (const g of b.groups) for (const l of g.loads) for (const p of [...l.fills, ...l.writes]) ids.add(p.id);
      for (const e of eases(a, b)) {
        for (const f of e.frames) for (const k of Object.keys(f)) expect(['transform', 'opacity', 'offset']).toContain(k);
        for (const m of e.selector.matchAll(/data-id="([^"]+)"/g)) expect(ids.has(m[1]), `${i}: ${m[1]}`).toBe(true);
      }
    }
  });

  it('eases at most EASE_BUDGET marks a stop, counting every instance’s load, and easing each from its old reach', () => {
    const all = capacityAllSettings();
    let most = 0;
    for (let i = 0; i < all.length; i += 997) {
      const c = rampClock(all[i]);
      for (let k = 1; k < c.ramp.runs.length; k++) {
        const [a, b] = [stageOf(c.ramp.runs[k - 1].settings), stageOf(c.ramp.runs[k].settings)];
        const es = eases(a, b);
        most = Math.max(most, easedMarks(es, b));
        for (const e of es) {
          const m = /^\.lane-fill\[data-lane="(\w+)"\]$/.exec(e.selector);
          if (!m) continue;
          const id = m[1] as 'lb' | 'app' | 'primary' | 'replicas';
          const ratio = Number(/scaleX\(([\d.e-]+)\)/.exec(String(e.frames[0]['transform']))![1]);
          expect(Math.abs(ratio * b.lanes[id].fill - a.lanes[id].fill)).toBeLessThan(0.5);
        }
      }
    }
    expect(most).toBeLessThanOrEqual(EASE_BUDGET);
    // The heaviest lanes land at once rather than pass the budget.
    const heavy = stageOf({ ...HEAVIEST, zone: 0 });
    const lighter = stageOf({ ...HEAVIEST, zone: 0, traffic: 18_000 });
    expect(easedMarks(eases(lighter, heavy), heavy)).toBeLessThanOrEqual(EASE_BUDGET);
  }, 60_000);
});
