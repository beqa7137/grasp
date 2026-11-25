import { CDN_SETTINGS, cdnScenario } from '@grasp/engine';
import { buildStage } from './cdn-layout';
import { RIDE, along, particleAt, playheadX, routePoints } from './cdn-motion';
import { NOTHING_HIDDEN, hiding } from './cdn-words';

const view = { hid: NOTHING_HIDDEN, ghost: null, told: false, focus: [] };
const distance = (pts: readonly (readonly [number, number])[], x: number, y: number) =>
  Math.min(
    ...pts.slice(1).map(([bx, by], i) => {
      const [ax, ay] = pts[i];
      const len = (bx - ax) ** 2 + (by - ay) ** 2;
      const t = len ? Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / len)) : 0;
      return Math.hypot(x - (ax + t * (bx - ax)), y - (ay + t * (by - ay)));
    }),
  );

describe('CDN motion', () => {
  it('rides the particle only along its drawn route, and only after the miss it carries', () => {
    for (const s of CDN_SETTINGS.filter((x) => x.rps === 10_000 && x.variants === 1)) {
      for (const W of [254, 620]) {
        const st = buildStage(W, cdnScenario(s), view);
        const { events, timeline, route } = st.meta;
        const first = events.find((e) => !e.hit);
        for (let f = 0; f < 1; f += 0.0025) {
          const p = particleAt(st.meta, f);
          if (!p) continue;
          const t = f * timeline.window;
          expect(first && first.at <= t).toBe(true);
          const riding = events.filter((e) => !e.hit && e.at <= t && t - e.at < RIDE * timeline.window).at(-1)!;
          const pts = routePoints(route!, riding.where as 'shield' | 'origin');
          expect(distance(pts, p.x, p.y)).toBeLessThan(0.2);
        }
      }
    }
  });

  it('moves the playhead on one monotone clock across the track, so the sample shows only up to it', () => {
    const st = buildStage(620, cdnScenario({ rps: 10_000, pops: 20, ttl: 60, shield: 1, variants: 1 }), view);
    let last = -Infinity;
    for (let f = 0; f <= 1; f += 0.01) {
      const x = playheadX(st.meta, f);
      expect(x).toBeGreaterThanOrEqual(last);
      last = x;
    }
    expect(playheadX(st.meta, 0)).toBe(st.meta.timeline.x0);
    expect(playheadX(st.meta, 1)).toBe(st.meta.timeline.x0 + st.meta.timeline.iw);
    // Every sampled mark sits at its event's time on that same scale, so the clip at the playhead hides what is to come.
    const x = (t: number) => st.meta.timeline.x0 + (st.meta.timeline.iw * t) / st.meta.timeline.window;
    for (const p of st.D.prims(['clip']))
      if (p.k === 'line' && p.id.startsWith('req-')) expect(p.x1).toBeCloseTo(x(Number(p.id.split('-')[2])), 0);
  });

  it('has no particle while the flows are hidden', () => {
    const st = buildStage(620, cdnScenario({ rps: 10_000, pops: 100, ttl: 60, shield: 0, variants: 1 }), {
      ...view,
      hid: hiding(['outcome'], 'playing'),
    });
    for (let f = 0; f < 1; f += 0.01) expect(particleAt(st.meta, f)).toBeNull();
  });

  it('walks a polyline at even speed', () => {
    expect(
      along(
        [
          [0, 0],
          [10, 0],
          [10, 10],
        ],
        0.5,
      ),
    ).toEqual([10, 0]);
    expect(
      along(
        [
          [0, 0],
          [10, 0],
          [10, 10],
        ],
        0.75,
      ),
    ).toEqual([10, 5]);
  });
});
