import { LATENCY_EXPERIMENTS, LATENCY_SETTINGS as ALL, latencySample, latencyScenario, playPlan } from '@grasp/engine';
import { samplePath, tw } from './latency-draw';
import { bandAt, buildStage } from './latency-layout';
import { EXIT_MS, INLET_MS, MIN_MOTION_MS, SLIDE_MS, playLength, slideAt, trips, windowAt } from './latency-motion';
import { NOTHING_HIDDEN } from './latency-words';

const REST = { hid: NOTHING_HIDDEN, tau: null, plan: null, ghost: null, qFloor: 0, focus: [] };

describe('latency motion', () => {
  it('runs a free play 25× slower (400 ms in 10 s), and with no steady state 4 s in 8 s', () => {
    expect(playLength(playPlan(latencySample({}), false))).toBe(10_000);
    expect(playLength(playPlan(latencySample({ servers: 3, load: 80, down: 1 }), false))).toBe(8_000);
    const answers = LATENCY_EXPERIMENTS.filter((e) => e.act).map((e) =>
      playLength(playPlan(latencySample({ ...e.setup, ...(e.act && 'set' in e.act ? e.act.set : {}) }), true)),
    );
    expect(answers.map(Math.round)).toEqual([5_000, 5_000, 5_000, 5_000, 4_000]);
  });

  it('maps screen time to window time on one monotone clock that ends at the plan', () => {
    const plan = playPlan(latencySample({ load: 90 }), true);
    let last = -Infinity;
    for (let ms = 0; ms <= playLength(plan) + 500; ms += 37) {
      const t = windowAt(plan, ms);
      expect(t).toBeGreaterThanOrEqual(last);
      expect(t).toBeLessThanOrEqual(plan.to);
      last = t;
    }
    expect(windowAt(plan, 0)).toBe(plan.from);
  });

  it('lands each arrival as the clock reaches it, sends no particle under 120 ms, and none in a fast play', () => {
    for (const s of ALL.filter((_, i) => i % 5 === 0)) {
      const smp = latencySample(s);
      const st = buildStage(620, latencyScenario(s), smp, REST);
      for (const answer of [false, true]) {
        const plan = playPlan(smp, answer);
        const list = trips(smp, st.band, plan);
        if (plan.rate < 25) expect(list, `${s.servers}/${s.load}`).toEqual([]);
        for (const trip of list) {
          expect(trip.duration).toBeGreaterThanOrEqual(MIN_MOTION_MS);
          expect(trip.start).toBeGreaterThanOrEqual(0);
          expect(trip.duration).toBeLessThanOrEqual(Math.max(INLET_MS, EXIT_MS));
        }
        const arrivals = list.filter((tr) => tr.tone === 'arrive');
        for (const tr of arrivals) {
          const landsAt = plan.from + (tr.start + tr.duration) / plan.rate;
          expect(smp.reqs.some((r) => Math.abs(r.arrive - landsAt) < 1e-6)).toBe(true);
        }
        const starts = list.map((tr) => tr.start);
        expect(starts).toEqual([...starts].sort((a, b) => a - b));
      }
    }
  });

  it.each([252, 322, 620])(
    'lands each arrival on its own place in the line, never under the "+N" chip, and starts each departure clear of the next request at %ipx',
    (W) => {
      const out: string[] = [];
      for (const s of ALL.filter((_, i) => i % 3 === W % 3)) {
        const smp = latencySample(s);
        const m = latencyScenario(s);
        const plan = playPlan(smp, false);
        const st = buildStage(W, m, smp, { ...REST, plan, tau: plan.from });
        for (const tr of trips(smp, st.band, plan)) {
          const r = smp.reqs.find((q) => q.id === tr.id)!;
          const t = tr.tone === 'arrive' ? r.arrive : r.leave;
          const [x, y] = tr.tone === 'arrive' ? tr.path[tr.path.length - 1] : tr.path[0];
          const prims = bandAt(st, m, smp, NOTHING_HIDDEN, t, plan.rate);
          const at = `${m.key} ${tr.tone} ${tr.id}`;
          for (const p of prims) {
            if (
              p.k === 'rect' &&
              p.cls === 'chip' &&
              x > p.x - st.band.dotR &&
              x < p.x + p.w + st.band.dotR &&
              Math.abs(y - p.y - p.h / 2) < p.h
            )
              out.push(`${at}: on the "+N" chip`);
            if (p.k === 'circle' && p.id !== `req-${tr.id}` && Math.hypot(p.cx - x, p.cy - y) < p.r + st.band.dotR - 0.01)
              out.push(`${at}: on ${p.id}`);
          }
        }
      }
      expect(out.slice(0, 10)).toEqual([]);
    },
    120_000,
  );

  it.each([252, 322, 620])('keeps every particle off the servers\' names and their "idle" at %ipx', (W) => {
    const out: string[] = [];
    for (const s of ALL.filter((_, i) => i % 4 === W % 4)) {
      const smp = latencySample(s);
      const m = latencyScenario(s);
      const plan = playPlan(smp, false);
      const st = buildStage(W, m, smp, { ...REST, plan, tau: plan.from });
      const b = st.band;
      const labels = b.boxes.flatMap((box, i) => [
        st.D.textBox(b.xs + 9, box.ry + 5, tw(`S${i + 1}`, 'nameS'), 'nameS'),
        st.D.textBox(box.rx - b.ring - 5, box.ry + 4, tw('idle', 'small'), 'small', 'end'),
      ]);
      for (const tr of trips(smp, b, plan))
        for (const [x, y] of samplePath(tr.path, 1)) {
          const hit = labels.find((l) => x + b.dotR > l.x0 && x - b.dotR < l.x1 && y + b.dotR > l.y0 && y - b.dotR < l.y1);
          if (hit) out.push(`${m.key} ${tr.tone} ${tr.id} at ${Math.round(x)},${Math.round(y)}`);
        }
    }
    expect(out.slice(0, 10)).toEqual([]);
  });

  it('draws nothing in the band before its moment, and a ring full where its sweep would run under 120 ms', () => {
    for (const s of ALL.filter((_, i) => i % 7 === 0)) {
      const smp = latencySample(s);
      const m = latencyScenario(s);
      const st = buildStage(322, m, smp, { ...REST, plan: playPlan(smp, false), tau: 0 });
      const plan = playPlan(smp, false);
      for (const f of [0.1, 0.4, 0.7, 0.99]) {
        const t = plan.from + f * (plan.to - plan.from);
        const prims = bandAt(st, m, smp, NOTHING_HIDDEN, t, plan.rate);
        for (const p of prims)
          if (p.id.startsWith('req-')) expect(smp.reqs.find((r) => `req-${r.id}` === p.id)!.arrive).toBeLessThanOrEqual(t);
        for (const p of prims.filter((q) => q.k === 'path' && q.id.startsWith('arc-'))) {
          const i = Number(p.id.slice(4));
          const r = smp.reqs.find((q) => q.server === i && q.start <= t && q.leave > t)!;
          const full = (r.leave - r.start) * plan.rate < MIN_MOTION_MS;
          expect(p.k === 'path' && p.d.split('A').length - 1, `${s.servers}/${s.load} S${i + 1}`).toBe(full ? 2 : 1);
        }
      }
    }
  });

  it('slides a line moving up for at most 240 ms, never past the next change, and steps under 120 ms', () => {
    for (const s of ALL.filter((_, i) => i % 9 === 0)) {
      const smp = latencySample(s);
      const plan = playPlan(smp, false);
      for (let t = plan.from; t < plan.to; t += 7.3) {
        const ms = slideAt(smp, plan, t);
        expect(ms === 0 || (ms >= MIN_MOTION_MS && ms <= SLIDE_MS)).toBe(true);
      }
    }
  });
});
