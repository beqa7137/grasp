import { ID_BASELINE as B, ID_STEP_AT_US, ID_WINDOW_US, idMint, type IdSettings } from '@grasp/engine';
import type { StageView } from './ids-draw';
import { buildStage } from './ids-layout';
import { momentOf } from './ids-motion';
import { NOTHING_HIDDEN } from './ids-words';

const REST: StageView = { hid: NOTHING_HIDDEN, t: null, inspect: null, ghost: null, focus: [], pair: null, challenge: false };
const MINTS: IdSettings[] = [];
for (const load of [0, 1])
  for (const fault of [0, 1, 2, 3])
    for (const guard of [0, 1]) for (const seq of [0, 10, 12]) MINTS.push({ ...B, load, fault, guard, seq });

describe('Unique IDs motion', { timeout: 120_000 }, () => {
  it('keeps the play clock monotone, at an event or before it, inside the 8 ms', () => {
    for (const s of MINTS) {
      const m = idMint(s);
      let last = 0;
      for (let t = 0; t <= ID_WINDOW_US; t += 25) {
        const at = momentOf(m, t);
        expect(at).toBeGreaterThanOrEqual(last);
        expect(at).toBeLessThanOrEqual(t + 1e-9);
        expect(at === 0 || m.ids.some((x) => x.issued === at)).toBe(true);
        last = at;
      }
    }
  });

  it('draws each id, its row, gauge, wait and repeat marks only once the play clock reaches it', () => {
    for (const s of MINTS.filter((_, i) => i % 2 === 0)) {
      const m = idMint(s);
      for (const t of [0, 800, 2000, 3950, 5600, 7000, 7999]) {
        const at = momentOf(m, t);
        const st = buildStage(620, m, { ...REST, t: at });
        const ids = new Set(st.D.prims().map((p) => p.id));
        for (const x of m.ids.filter((y) => y.issued < ID_WINDOW_US))
          for (const id of [`dot-${x.key}`, `row-key-${x.key}`, `gauge-${x.key}`])
            if (ids.has(id)) expect(x.issued, `${JSON.stringify(s)} ${id} at ${t}`).toBeLessThanOrEqual(at);
        for (const r of m.repeats) if (ids.has(`repeat-ring-${r.key}`)) expect(r.issued).toBeLessThanOrEqual(at);
        expect(st.made.every((x) => x.issued <= at)).toBe(true);
        // A step back, and the ticks its clock reads after it, show only once it happens.
        if (s.fault === 2 && at < ID_STEP_AT_US) {
          expect(ids.has('step-tick'), `${JSON.stringify(s)} step at ${t}`).toBe(false);
          expect([...ids].filter((id) => /^own-1-/.test(id) && +id.split('-')[3] >= ID_STEP_AT_US)).toEqual([]);
        }
        // An id is out of order only once a later-made id that sorts ahead of it exists.
        for (const p of st.D.prims())
          if (p.k === 'circle' && /\blate\b/.test(p.cls) && p.id.startsWith('rdot-')) {
            const x = m.ids.find((y) => p.id === `rdot-${y.key}`)!;
            expect(m.sorted.slice(0, x.rank).some((y) => y.issued <= at && y.issued > x.issued), `${JSON.stringify(s)} ${p.id} at ${t}`).toBe(true);
          }
      }
    }
  });

  it('ends a play on the rest view: the same marks as when nothing plays', () => {
    for (const s of MINTS) {
      const m = idMint(s);
      const end = buildStage(620, m, { ...REST, t: momentOf(m, ID_WINDOW_US) });
      const rest = buildStage(620, m, REST);
      expect(end.made.map((x) => x.key)).toEqual(rest.made.map((x) => x.key));
      expect(end.H).toBe(rest.H);
    }
  });
});
