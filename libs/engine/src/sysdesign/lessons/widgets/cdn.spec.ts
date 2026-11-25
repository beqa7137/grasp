import { describe, expect, it } from 'vitest';
import {
  CDN_BASELINE,
  CDN_DENSE,
  CDN_OBJECTS,
  CDN_ORIGIN_MS,
  CDN_SETTINGS,
  CDN_SHIELD_MS,
  CDN_SHOWN_EXPECTED,
  cdnColumns,
  cdnCumShare,
  cdnEdgeMs,
  cdnEvents,
  cdnHit,
  cdnHN,
  cdnKey,
  cdnSample,
  cdnScenario,
  cdnShare,
  type CdnSettings,
} from './cdn.js';
import {
  cdnSig3,
  formatTimelineClock,
  formatMeanMs,
  formatOften,
  formatPathMs,
  formatRank,
  formatReqRate,
  formatShare,
} from './cdn-format.js';
import { seededRandom } from './seeded-random.js';

const at = (o: Partial<CdnSettings> = {}) => cdnScenario({ ...CDN_BASELINE, ...o });

/** The rule the widget replaced, as it shipped: every location's misses reach the shield, the edge 10 ms at any count. */
function oldOutcome(s: CdnSettings) {
  let edgeHits = 0;
  let shieldHits = 0;
  const hit = (r: number) => (r * s.ttl) / (1 + r * s.ttl);
  for (let k = 1; k <= CDN_OBJECTS; k++) {
    const rate = s.rps * cdnShare(k);
    const e = hit(rate / s.pops);
    const miss = rate * (1 - e);
    edgeHits += rate * e;
    if (s.shield) shieldHits += miss * hit(miss);
  }
  const originRps = s.rps - edgeHits - shieldHits;
  const edgeHitRate = edgeHits / s.rps;
  return { edgeHitRate, originRps, meanMs: 10 + (1 - edgeHitRate) * (s.shield ? 30 : 0) + (originRps / s.rps) * 120 };
}

describe('cdn model', () => {
  it('has 192 settings and a Zipf catalog whose shares add to one', () => {
    expect(CDN_SETTINGS).toHaveLength(192);
    expect(cdnHN()).toBeCloseTo(12.0901, 4);
    expect(cdnCumShare(CDN_OBJECTS)).toBeCloseTo(1, 12);
    expect(cdnShare(1)).toBeCloseTo(0.0827, 4);
    expect(1 - cdnCumShare(10_000)).toBeCloseTo(0.19, 3);
  });

  it('hits by rT / (1 + rT) at one location, and the shield by the other locations’ misses', () => {
    const s = { ...CDN_BASELINE, shield: 1 };
    const q = cdnKey(s, 2_500);
    const r = (s.rps * cdnShare(2_500)) / s.variants;
    expect(q.rate).toBeCloseTo(r, 12);
    expect(q.perPop).toBeCloseTo(r / 20, 12);
    expect(q.edge).toBeCloseTo(cdnHit(r / 20, 60), 12);
    expect(q.toShield).toBeCloseTo(r * (1 - q.edge), 12);
    expect(q.shieldHit).toBeCloseTo(cdnHit((q.toShield * 19) / 20, 60), 12);
    expect(cdnKey({ ...s, pops: 1 }, 2_500).shieldHit).toBe(0);
    expect(cdnHit(3, 1)).toBe(0.75);
  });

  it('keeps the old rule’s edge, and its origin and mean without a shield at 20 locations', () => {
    for (const s of CDN_SETTINGS.filter((x) => x.variants === 1 && x.rps === 10_000)) {
      const a = cdnScenario(s);
      const o = oldOutcome(s);
      expect(a.edgeShare).toBeCloseTo(o.edgeHitRate, 9);
      if (s.shield) continue;
      expect(a.originRps).toBeCloseTo(o.originRps, 6);
      if (s.pops === 20) expect(a.meanMs).toBeCloseTo(o.meanMs, 9);
    }
  });

  it('puts the edge 10 ms × √(20 / n) from users and adds each path’s hop', () => {
    expect(cdnEdgeMs(20)).toBe(10);
    expect(cdnEdgeMs(1)).toBeCloseTo(44.72, 2);
    expect(cdnEdgeMs(100)).toBeCloseTo(4.472, 3);
    const a = at({ shield: 1 });
    expect(a.paths).toEqual({ edge: 10, shield: 10 + CDN_SHIELD_MS, origin: 10 + CDN_SHIELD_MS + CDN_ORIGIN_MS });
    expect(at().paths.origin).toBe(130);
    expect(a.meanMs).toBeCloseTo(a.edgeShare * 10 + a.shieldShare * 40 + a.originShare * 160, 12);
    expect(a.edgeShare + a.shieldShare + a.originShare).toBeCloseTo(1, 12);
  });

  it('gives every number the lesson quotes', () => {
    expect(at().edgeShare).toBeCloseTo(0.692, 3);
    expect(at().originRps).toBeCloseTo(3077, 0);
    expect(at().meanMs).toBeCloseTo(46.9, 1);
    expect(at({ shield: 1 }).originRps).toBeCloseTo(912.8, 1);
    expect(at({ shield: 1 }).meanMs).toBeCloseTo(30.2, 1);
    expect(at({ pops: 1 }).edgeShare).toBeCloseTo(0.909, 3);
    expect(at({ pops: 5 }).edgeShare).toBeCloseTo(0.801, 3);
    expect(at({ pops: 100 }).edgeShare).toBeCloseTo(0.561, 3);
    expect(at({ pops: 100 }).originRps).toBeCloseTo(4392, 0);
    expect(at({ ttl: 5 }).edgeShare).toBeCloseTo(0.489, 3);
    expect(at({ ttl: 300 }).edgeShare).toBeCloseTo(0.818, 3);
    expect(at({ ttl: 3600 }).edgeShare).toBeCloseTo(0.958, 3);
    expect(at({ ttl: 3600, shield: 1 }).originRps).toBeCloseTo(27.3, 1);
    expect(at({ rps: 1000 }).edgeShare).toBeCloseTo(0.504, 3);
    expect(at({ rps: 100_000 }).edgeShare).toBeCloseTo(0.866, 3);
    expect(at({ ttl: 3600, pops: 100 }).edgeShare).toBeCloseTo(0.878, 3);
  });

  it('sends the origin, with a shield, what one cache seeing all the traffic would, at any count of locations', () => {
    for (const s of CDN_SETTINGS.filter((x) => x.shield)) {
      expect(cdnScenario(s).originShare).toBeCloseTo(cdnScenario({ ...s, pops: 1, shield: 0 }).originShare, 9);
      const q = cdnKey(s, 777);
      expect((1 - q.edge) * (1 - q.shieldHit)).toBeCloseTo(1 / (1 + q.rate * s.ttl), 12);
    }
  });

  it('splits each object over ten URLs as a tenth of the traffic', () => {
    for (const s of CDN_SETTINGS.filter((x) => x.variants === 10 && x.rps > 1000)) {
      const a = cdnScenario(s);
      const b = cdnScenario({ ...s, rps: s.rps / 10, variants: 1 });
      expect(a.edgeShare).toBeCloseTo(b.edgeShare, 9);
      expect(a.originShare).toBeCloseTo(b.originShare, 9);
    }
  });

  it('puts the half-hit ranks where a copy is asked for once per TTL', () => {
    const a = at({ ttl: 300 });
    expect(cdnKey(a.settings, Math.round(a.edgeKnee)).edge).toBeCloseTo(0.5, 3);
    const b = at({ shield: 1 });
    const q = cdnKey(b.settings, Math.round(b.shieldKnee));
    expect(q.shieldHit).toBeCloseTo(0.5, 3);
    expect(at({ pops: 1, shield: 1 }).shieldKnee).toBe(0);
    expect(at().edgeKnee).toBeCloseTo(2481, 0);
  });

  it('draws the square’s bands with areas equal to the shares, falling with rank', () => {
    for (const s of CDN_SETTINGS.filter((_, i) => i % 7 === 0)) {
      const a = cdnScenario(s);
      for (const n of [200, 333]) {
        const cols = cdnColumns(a, n);
        expect(cols.reduce((x, c) => x + c.edge, 0) / n).toBeCloseTo(a.edgeShare, 9);
        expect(cols.reduce((x, c) => x + c.shield, 0) / n).toBeCloseTo(a.shieldShare, 9);
        expect(cols.every((c) => c.edge >= -1e-9 && c.edge + c.shield <= 1 + 1e-9)).toBe(true);
        expect(cols.every((c, i) => i === 0 || c.edge <= cols[i - 1].edge + 1e-9)).toBe(true);
      }
    }
  });

  it('agrees with a discrete-event simulation of TTL caches at every location and the shield', () => {
    for (const s of [CDN_BASELINE, { ...CDN_BASELINE, pops: 5, shield: 1 }]) {
      const rand = seededRandom(7);
      const cum = Float64Array.from({ length: CDN_OBJECTS + 1 }, (_, k) => cdnCumShare(k));
      const pick = (u: number) => {
        let lo = 1;
        let hi = CDN_OBJECTS;
        while (lo < hi) {
          const mid = (lo + hi) >> 1;
          if (cum[mid] >= u) hi = mid;
          else lo = mid + 1;
        }
        return lo;
      };
      const edge = new Float64Array(CDN_OBJECTS * s.pops).fill(-1);
      const shield = new Float64Array(CDN_OBJECTS).fill(-1);
      let t = 0;
      let n = 0;
      let origin = 0;
      let edgeHits = 0;
      while (t < 8 * s.ttl) {
        t += -Math.log(1 - rand()) / s.rps;
        const k = pick(rand());
        const i = (k - 1) * s.pops + ((rand() * s.pops) | 0);
        const counted = t > 2 * s.ttl;
        if (counted) n++;
        if (edge[i] > t) {
          if (counted) edgeHits++;
          continue;
        }
        edge[i] = t + s.ttl;
        if (s.shield && shield[k - 1] > t) continue;
        if (s.shield) shield[k - 1] = t + s.ttl;
        if (counted) origin++;
      }
      const a = cdnScenario(s);
      expect(Math.abs(edgeHits / n - a.edgeShare)).toBeLessThan(0.006);
      expect(Math.abs(origin / n - a.originShare)).toBeLessThan(0.006);
    }
  }, 60_000);

  it('has a sample at every setting that keeps the rules the stage draws by', () => {
    for (const s of CDN_SETTINGS) {
      const a = cdnScenario(s);
      const sm = cdnSample(a);
      expect(sm.window).toBe(5 * s.ttl);
      for (const l of sm.lanes) {
        expect(l.reqs.length).toBeLessThanOrEqual(CDN_DENSE + 40);
        expect(l.reqs.every((q, j) => j === 0 || q.at >= l.reqs[j - 1].at)).toBe(true);
        expect(l.copies.every((c) => c.earlier || Math.abs(c.to - c.from - s.ttl) < 1e-6 * s.ttl)).toBe(true);
        expect(l.reqs.filter((q) => !q.hit).every((q) => l.copies.some((c) => c.from === q.at))).toBe(true);
        expect(l.reqs.filter((q) => q.hit).every((q) => l.copies.some((c) => c.from <= q.at && q.at < c.to))).toBe(true);
        if (!s.shield) expect(l.shield).toBeNull();
      }
      const ev = cdnEvents(sm);
      expect(ev.every((e) => (e.hit ? e.where === 'edge' : e.where !== 'edge'))).toBe(true);
      if (!s.shield) expect(ev.some((e) => e.where === 'shield')).toBe(false);
    }
  });

  it('keeps every edge request when the shield turns on, and changes only who answers each miss', () => {
    for (const s of CDN_SETTINGS.filter((x) => !x.shield)) {
      const off = cdnEvents(cdnSample(cdnScenario(s)));
      const on = cdnEvents(cdnSample(cdnScenario({ ...s, shield: 1 })));
      expect(on.map((e) => [e.lane, e.at, e.hit])).toEqual(off.map((e) => [e.lane, e.at, e.hit]));
      expect(on.every((e, i) => e.hit === off[i].hit && (e.hit || off[i].where === 'origin'))).toBe(true);
    }
  });

  it('never draws a shield hit at one location, where its copy expires with the edge one', () => {
    for (const s of CDN_SETTINGS.filter((x) => x.shield && x.pops === 1)) {
      const sm = cdnSample(cdnScenario(s));
      expect(cdnEvents(sm).some((e) => e.where === 'shield')).toBe(false);
      expect(sm.lanes.every((l) => l.shield!.ownHits === 0)).toBe(true);
    }
  });

  it('shows a request in every lane that expects one in its window, and a rare object missing at the defaults', () => {
    for (const s of CDN_SETTINGS)
      for (const l of cdnSample(cdnScenario(s)).lanes)
        if (l.expected >= CDN_SHOWN_EXPECTED) expect(l.hits + l.misses, JSON.stringify(s)).toBeGreaterThan(0);
    for (const s of [CDN_BASELINE, { ...CDN_BASELINE, shield: 1 }]) {
      const tail = cdnSample(cdnScenario(s)).lanes[2];
      expect(tail.misses).toBeGreaterThan(0);
      expect(tail.hits).toBe(0);
    }
  });

  it('staggers a hot lane’s expiries: no copy ends on the window’s ticks, and no two lanes miss in step', () => {
    const phase = (l: { reqs: { at: number; hit: boolean }[] }, ttl: number) => (l.reqs.find((q) => !q.hit)!.at / ttl) % 1;
    const phases: number[] = [];
    let pairs = 0;
    let inStep = 0;
    for (const s of CDN_SETTINGS) {
      const hot = cdnSample(cdnScenario(s)).lanes.filter((l) => l.dense);
      const p = hot.map((l) => phase(l, s.ttl));
      phases.push(...p);
      for (let i = 0; i < p.length; i++)
        for (let j = i + 1; j < p.length; j++) {
          pairs++;
          const d = Math.abs(p[i] - p[j]);
          if (Math.min(d, 1 - d) < 0.02) inStep++;
        }
    }
    expect(phases.length).toBeGreaterThan(100);
    expect(phases.filter((x) => x < 0.01 || x > 0.99).length).toBeLessThanOrEqual(0.05 * phases.length);
    const sorted = [...phases].sort((a, b) => a - b);
    const ks = Math.max(...sorted.map((x, i) => Math.max(Math.abs((i + 1) / sorted.length - x), Math.abs(i / sorted.length - x))));
    expect(ks).toBeLessThan(1.63 / Math.sqrt(sorted.length));
    expect(inStep).toBeLessThanOrEqual(0.1 * pairs);
  });

  it('samples the lanes without bias', () => {
    const a = at();
    const lane = a.lanes[1];
    const rand = seededRandom(99);
    let n = 0;
    let h = 0;
    for (let i = 0; i < 4000; i++) {
      let t = 0;
      let end = rand() < lane.edge ? rand() * 60 : -1;
      for (;;) {
        t += -Math.log(1 - rand()) / lane.perPop;
        if (t >= 300) break;
        n++;
        if (t < end) h++;
        else end = t + 60;
      }
    }
    expect(Math.abs(h / n - lane.edge)).toBeLessThan(0.015);
  });
});

describe('cdn formats', () => {
  it('says each figure as the stage does', () => {
    expect(cdnSig3(3077.4)).toBe('3,080');
    expect(cdnSig3(912.8)).toBe('913');
    expect(cdnSig3(27.3)).toBe('27');
    expect(cdnSig3(4.47)).toBe('4.5');
    expect(formatReqRate(13_437)).toBe('13,400/s');
    expect(formatShare(0.6922)).toBe('69.2%');
    expect(formatShare(0.19)).toBe('19.0%');
    expect(formatShare(0.99999)).toBe('over 99.9%');
    expect(formatShare(0.0001)).toBe('under 0.1%');
    expect(formatPathMs(4.472)).toBe('4.5 ms');
    expect(formatPathMs(130)).toBe('130 ms');
    expect(formatMeanMs(26)).toBe('26.0 ms');
    expect(formatMeanMs(46.93)).toBe('46.9 ms');
    expect(formatRank(2481.4)).toBe('2,481st');
    expect(formatRank(12)).toBe('12th');
    expect(formatRank(112)).toBe('112th');
    expect(formatRank(48_635)).toBe('48,635th');
    expect(formatTimelineClock(0)).toBe('0 s');
    expect(formatTimelineClock(59.7)).toBe('1 min');
    expect(formatTimelineClock(90)).toBe('1.5 min');
    expect(formatTimelineClock(7200)).toBe('2 h');
    expect(formatOften(41.3)).toBe('41 times a second');
    expect(formatOften(1 / 60)).toBe('about once a minute');
    expect(formatOften(1 / 600)).toBe('once every 10 minutes');
    expect(formatOften(1 / 151)).toBe('once every 2.5 minutes');
    expect(formatOften(1 / 6048)).toBe('once every 1.7 hours');
  });
});
