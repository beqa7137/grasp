import {
  DURABILITY_SETTINGS as ALL,
  durabilityPlan,
  durabilityPlayState,
  durabilityScenario,
  type DurabilityPlayKind,
  type DurabilitySettings,
} from '@grasp/engine';
import { buildStage } from './durability-layout';
import { liveMarks, momentOf, stepTau } from './durability-motion';
import { NOTHING_HIDDEN, momentsOf, raceSentence } from './durability-words';
import { REST } from './durability-views.testing';

const KINDS: DurabilityPlayKind[] = ['repair', 'staged'];
const ids = (s: DurabilitySettings, kind: DurabilityPlayKind, tau: number | null, live = true) =>
  new Set(
    buildStage(412, durabilityScenario(s), { ...REST, kind, tau, live })
      .D.prims()
      .map((p) => p.id),
  );

describe('durability motion', () => {
  it('moves the moment only forward, and only to an event of the play', () => {
    for (const s of ALL.filter((_, i) => i % 5 === 0))
      for (const kind of KINDS) {
        const plan = durabilityPlan(s, kind);
        let last = 0;
        for (let t = 0; t <= plan.total; t += 0.02) {
          const at = momentOf(plan, t);
          expect(at).toBeGreaterThanOrEqual(last);
          expect(at === 0 || plan.events.some((e) => e.at === at)).toBe(true);
          last = at;
        }
      }
  });

  it('draws nothing for an event before its moment', () => {
    for (const s of ALL.filter((_, i) => i % 4 === 0))
      for (const kind of KINDS) {
        const plan = durabilityPlan(s, kind);
        const m = durabilityScenario(s);
        const before = ids(s, kind, plan.fail - 0.01);
        expect(
          [...before].some((id) => /-x$|^staged-x|^rack-x|^obj-x|^band$/.test(id)),
          JSON.stringify(s),
        ).toBe(false);
        for (const e of plan.events) {
          const just = ids(s, kind, e.at - 1e-3);
          const after = ids(s, kind, e.at);
          if (e.kind === 'staged') {
            const id = `staged-x-${m.pieces[e.piece].id}`;
            expect([just.has(id), after.has(id)], `${id} ${JSON.stringify(s)}`).toEqual([false, true]);
          }
          if (e.kind === 'step')
            expect([just.has(`row-window${e.i}-arrow`) || just.has(`row-window${e.i}-from`), after.has(`row-window${e.i}-from`)]).toEqual([
              false,
              true,
            ]);
          if (e.kind === 'final') expect([just.has('final-dot'), after.has('final-dot')]).toEqual([false, true]);
          if (e.kind === 'lost') expect([just.has('obj-x'), after.has('obj-x')]).toEqual([false, true]);
          if (e.kind === 'rebuilt') expect([just.has('band-check-ring'), after.has('band-check-ring')]).toEqual([false, true]);
        }
      }
  });

  it('fills the window and the free disk together, runs the playhead inside the window, one read dot a source', () => {
    for (const s of ALL.filter((v) => !v.rack && v.afr === 2))
      for (const kind of KINDS) {
        const plan = durabilityPlan(s, kind);
        const m = durabilityScenario(s);
        for (let t = 0; t <= plan.total; t += 0.1) {
          const st = buildStage(412, m, { ...REST, kind, tau: momentOf(plan, t), live: true });
          const ps = durabilityPlayState(s, kind, t);
          const live = liveMarks(st.meta.live, ps.lost ? 0 : ps.progress, t);
          expect(live.dots.length).toBeLessThanOrEqual(m.repairRead);
          if (live.band && live.disk) expect(live.band.scale).toBe(live.disk.scale);
          if (live.playhead) {
            expect(live.playhead.x).toBeGreaterThanOrEqual(st.meta.live.band!.x);
            expect(live.playhead.x).toBeLessThanOrEqual(st.meta.live.band!.x + st.meta.live.band!.w + 0.1);
          }
          if (t < plan.winStart) expect(live.band).toBeNull();
          // While the window runs the layout leaves its continuous marks to the component.
          const running = st.meta.ps.failed && !st.meta.ps.rebuilt && !st.meta.ps.lost;
          if (running)
            expect(st.D.prims().some((p) => p.id === 'band-fill' || p.id === 'disk-fill' || p.id.startsWith('playhead'))).toBe(false);
        }
      }
  });

  it('says each Reduced motion moment in a sentence of its own, so a live region reads every press', () => {
    for (const s of ALL)
      for (const kind of KINDS) {
        const m = durabilityScenario(s);
        const plan = durabilityPlan(s, kind);
        const taus = [...[0, 1].slice(0, momentsOf(m, kind) - 1).map((k) => stepTau(plan, k)), null];
        const said = taus.map((tau) => raceSentence(m, durabilityPlayState(s, kind, tau), kind, NOTHING_HIDDEN));
        for (let i = 1; i < said.length; i++) expect(said[i], `${JSON.stringify(s)} ${kind} moment ${i}`).not.toBe(said[i - 1]);
      }
  });

  it('steps Reduced motion through the failure, mid-repair and the end, with every mark at the end', () => {
    const s = ALL[30];
    const plan = durabilityPlan(s, 'repair');
    expect([0, 1, 2].map((k) => stepTau(plan, k))).toEqual([plan.fail + 0.05, plan.winStart + plan.win * 0.55, null]);
    const end = ids(s, 'repair', null, false);
    for (const id of ['band', 'band-check-ring', 'disk-free-name', 'final-dot', 'row-first-arrow']) expect(end.has(id), id).toBe(true);
  });
});
