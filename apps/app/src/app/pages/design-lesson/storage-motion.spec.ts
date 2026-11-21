import { STORAGE_BASELINE as B, STORAGE_SETTINGS as ALL, storageScenario } from '@grasp/engine';
import type { StageView } from './storage-draw';
import { buildStage } from './storage-layout';
import { departures, keyAt, keyPosition, momentOf, planOf, stationsOf, type Engine } from './storage-motion';
import { NOTHING_HIDDEN, stepForms } from './storage-words';

const REST: StageView = { hid: NOTHING_HIDDEN, play: null, ghost: null, told: null, focus: [] };
const ENGINES: Engine[] = ['btree', 'lsm'];

describe('storage motion', { timeout: 60_000 }, () => {
  it('runs each play for its stated length: the B-tree 4 s or 2.6 s, the LSM tree by its levels', () => {
    const m = storageScenario(B);
    expect(planOf('btree', m).seconds).toBe(4);
    expect(planOf('btree', storageScenario({ ...B, op: 1 })).seconds).toBe(2.6);
    expect(planOf('lsm', m).seconds).toBe(6 + 0.5 * 4);
    expect(planOf('lsm', storageScenario({ ...B, op: 1 })).seconds).toBe(1.6 + 0.5 * 5);
  });

  it('keeps every step on one monotone clock inside the play, the staircase in its own beat', () => {
    for (const s of ALL.filter((_, i) => i % 5 === 0))
      for (const engine of ENGINES) {
        const m = storageScenario(s);
        const P = planOf(engine, m);
        const steps = Object.entries(P).filter(([k]) => k !== 'seconds');
        for (const [, v] of steps) {
          expect(v).toBeGreaterThanOrEqual(0);
          expect(v).toBeLessThanOrEqual(1);
        }
        if (engine === 'lsm') {
          const runs = Array.from({ length: m.lsm.levels + 1 }, (_, j) => P[`run${j}`]);
          expect(runs).toEqual([...runs].sort((a, b) => a - b));
          if (s.op === 0) {
            // The record holds at L2 while the staircase draws, then goes on.
            expect(P['run2']).toBeLessThan(P['stair0']);
            if (m.lsm.levels > 2) expect(P['run3']).toBeGreaterThan(P['stair1']);
            expect(P['ledger']).toBeGreaterThan(runs[runs.length - 1]);
          } else expect(P['found']).toBeGreaterThan(runs[runs.length - 1]);
        } else {
          const walk = Array.from({ length: m.btree.height }, (_, k) => P[`walk${k}`]);
          expect(walk).toEqual([...walk].sort((a, b) => a - b));
          if (s.op === 0)
            expect([walk[walk.length - 1] < P['slice'], P['slice'] < P['log'], P['log'] < P['page'], P['page'] < P['ledger']]).toEqual([
              true,
              true,
              true,
              true,
            ]);
        }
        let last = 0;
        for (let f = 0; f <= 1; f += 0.005) {
          const at = momentOf(engine, m, f);
          expect(at).toBeGreaterThanOrEqual(last - 1e-9);
          last = at;
        }
      }
  });

  it('draws nothing for an event before its moment: the staircase row by row, its sentence once every row is drawn', () => {
    for (const ratio of [4, 5, 10, 20]) {
      const s = { ...B, ratio };
      const m = storageScenario(s);
      const P = planOf('lsm', m);
      for (let f = 0; f <= 1; f += 0.01) {
        const st = buildStage(620, m, { ...REST, play: { engine: 'lsm', frac: momentOf('lsm', m, f) } });
        const ids = new Set(st.D.prims().map((p) => p.id));
        const stair = st.D.prims().find((p) => p.id === 'stair-new');
        const rows = stair && stair.k === 'path' ? stair.d.split('M').length - 1 : 0;
        const from = Math.max(0, Math.min(1, (f - P['stair0']) / (P['stair1'] - P['stair0'])));
        // A row is drawn once the clock enters its merge, never sooner.
        expect(rows).toBe(Math.max(0, Math.ceil(ratio * from - 1e-9)) + 0);
        expect(ids.has('stair-text')).toBe(f >= P['stair1'] - 1e-9);
        expect(ids.has('lsm-total')).toBe(f >= P['ledger'] - 1e-9);
        for (let j = 0; j <= m.lsm.levels; j++) expect(ids.has(`chip-${j}`)).toBe(f >= P[`run${j}`] - 1e-9);
      }
    }
  });

  it('moves the key only on the walk and the trail, in the start of the step toward each arrival', () => {
    for (const s of [B, { ...B, op: 1 }, { ...B, data: 1000, ratio: 4 }])
      for (const engine of ENGINES) {
        const m = storageScenario(s);
        const st = buildStage(620, m, { ...REST, play: { engine, frac: 0 } });
        const legs = st.meta.keys;
        expect(legs.length).toBeGreaterThan(0);
        for (let f = 0; f <= 1; f += 0.002) {
          const k = keyPosition(legs, f);
          if (!k) continue;
          const leg = legs.find((g) => keyAt(f, g.from, g.to) !== null)!;
          const along =
            Math.abs((leg.x2 - leg.x1) * (k.y - leg.y1) - (leg.y2 - leg.y1) * (k.x - leg.x1)) /
            Math.hypot(leg.x2 - leg.x1, leg.y2 - leg.y1);
          expect(along).toBeLessThan(0.2);
        }
        expect(keyPosition(legs, 1)).toBeNull();
      }
  });

  it("names in each step's line the station the key is at or on its way to, and holds the key there at the step's midpoint", () => {
    const out: string[] = [];
    for (const s of [
      B,
      { ...B, op: 1 },
      { ...B, data: 1000, ratio: 4 },
      { ...B, data: 10, page: 16 },
      { ...B, op: 1, bloom: 0, ratio: 20 },
    ])
      for (const engine of ENGINES) {
        const m = storageScenario(s);
        const P = planOf(engine, m);
        const legs = buildStage(620, m, { ...REST, play: { engine, frac: 0 } }).meta.keys;
        const starts = departures(engine, m);
        const stations = stationsOf(engine, m);
        // The line each station's step shows, read at the key's arrival there.
        const lineAt = (f: number) => stepForms(engine, m, momentOf(engine, m, f), NOTHING_HIDDEN)[0];
        for (let i = 1; i < stations.length; i++) {
          const st = stations[i];
          const named = lineAt(P[st]);
          const leg = legs.find((g) => g.to === P[st])!;
          for (let f = starts[st]; f < P[st]; f += 0.001) {
            if (keyPosition(legs, f) && lineAt(f) !== named)
              out.push(`${engine} ${st} at ${f.toFixed(3)}: "${lineAt(f)}" while the key goes there`);
          }
          // The step runs from its line's start to the next change of line; at its middle the key has arrived and holds.
          let end = P[st];
          while (end < 1 && lineAt(end) === named) end += 0.001;
          const mid = (starts[st] + end) / 2;
          if (mid < P[st] || keyPosition(legs, mid)) out.push(`${engine} ${st}: the key is still moving at the step's middle`);
          if (Math.abs(leg.y2 - (keyPosition(legs, P[st] - 1e-6)?.y ?? leg.y2)) > 0.5)
            out.push(`${engine} ${st}: the leg does not end at its station`);
        }
      }
    expect(out).toEqual([]);
  });
});
