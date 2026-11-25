import { RECOVERY_BASELINE as B, RECOVERY_PLANS, recoveryScenario, type RecoverySettings } from '@grasp/engine';
import type { StageView } from './recovery-draw';
import { buildStage } from './recovery-layout';
import { PLAN, momentOf, passedMin, pointOf } from './recovery-motion';
import { NOTHING_HIDDEN } from './recovery-words';

const SETTINGS: RecoverySettings[] = [
  { ...B },
  { ...B, disaster: 1 },
  { ...B, size: 10000, restore: 50, base: 6, replay: 5 },
  { ...B, base: 1, archive: 10, replay: 20, sync: 1 },
  { ...B, disaster: 1, size: 500, restore: 50, base: 6, archive: 300, replay: 5 },
];
const view = (frac: number): StageView => ({
  hid: NOTHING_HIDDEN,
  play: { frac },
  answering: false,
  ghost: null,
  told: false,
  challenge: false,
  focus: [],
});

describe('the Backups & Recovery play', { timeout: 120_000 }, () => {
  it('moves the stage on one monotone clock, at its named moments and on a grid while things move', () => {
    let last = -1;
    for (let f = 0; f <= 1; f += 0.001) {
      const at = momentOf(f);
      expect(at).toBeGreaterThanOrEqual(last);
      expect(at).toBeLessThanOrEqual(f + 1e-9);
      last = at;
    }
    expect(momentOf(PLAN.strike + 0.01)).toBe(PLAN.strike);
    expect(momentOf(PLAN.points[2] + 0.001)).toBe(PLAN.points[2]);
  });

  it('draws and says nothing for an event before its moment, at every 0.05 of the clock and three widths', () => {
    const out: string[] = [];
    for (const s of SETTINGS)
      for (const W of [252, 344, 620])
        for (let i = 0; i <= 20; i++) {
          const frac = Math.min(0.999, i * 0.05);
          const m = recoveryScenario(s);
          const st = buildStage(W, m, view(frac));
          const ids = new Map(st.D.prims().map((p) => [p.id, p]));
          const say = (id: string) => {
            const p = ids.get(id);
            return p && p.k === 'text' ? p.spans.map((x) => x.t).join('') : '';
          };
          const where = `${JSON.stringify(s)} ${W}px ${frac.toFixed(2)}`;
          const struck = frac >= PLAN.strike;
          if (!struck && (ids.has('strike-label') || ids.has('origin-label') || ids.has('strike') || say('a-primary-value')))
            out.push(`${where}: the disaster told before it strikes`);
          if (!struck && /fail|drop/.test(say('a-primary-note') + say('a-standby-note') + say('a-delayed-note')))
            out.push(`${where}: a note tells the disaster before it strikes`);
          for (const k of RECOVERY_PLANS) {
            const before = frac < pointOf(k);
            if (before && (ids.has(`ring-${k}`) || ids.has(`lost-${k}`) || say(`a-${k}-value`)))
              out.push(`${where}: ${k}'s loss before its moment`);
            const passed = passedMin(m, frac);
            const p = m.plans[k];
            const value = say(`b-${k}-value`);
            if (frac < PLAN.recoverStart && (value || ids.has(`never-${k}`) || [...ids.keys()].some((id) => id.startsWith(`bar-${k}-`))))
              out.push(`${where}: ${k}'s recovery before it starts`);
            if (p.recovers && passed < p.rtoMin && (ids.has(`serve-${k}`) || /back in/.test(value)))
              out.push(`${where}: ${k} back before its time`);
            if (frac >= PLAN.recoverStart && p.recovers && passed < p.rtoMin && value !== 'recovering')
              out.push(`${where}: ${k} reads "${value}"`);
            // A ledger prints a step's minutes once the playhead has passed that step's end.
            const said = [...ids.values()]
              .filter((x) => x.k === 'text' && x.id.startsWith(`b-${k}-ledger`))
              .map((x) => (x.k === 'text' ? x.spans.map((y) => y.t).join('') : ''))
              .join(' ');
            let t = 0;
            const done = p.steps.filter((stp) => (t += stp.min) <= passed).length;
            const figures = [...said.matchAll(/[\d,]+ min/g)].length - (/in all/.test(said) ? 1 : 0);
            if (p.recovers && figures !== done) out.push(`${where}: ${k}'s ledger counts ${figures} of ${done} steps done`);
          }
          // In the history nothing is drawn past the cursor.
          if (frac < PLAN.historyEnd) {
            const cursor = st.D.prims().find((p) => p.id === 'cursor-full');
            const cx = cursor && cursor.k === 'line' ? cursor.x1 : -1;
            for (const p of st.D.prims())
              if (p.k === 'rect' && p.cls === 'full-box' && p.x > cx + 0.1) out.push(`${where}: a backup drawn before its moment`);
          }
        }
    expect(out.slice(0, 20)).toEqual([]);
  });

  it('runs the playhead down block B at a uniform speed to the last plan’s time', () => {
    const m = recoveryScenario(B);
    const xs = [0.5, 0.6, 0.7, 0.8].map((f) => {
      const p = buildStage(620, m, view(f))
        .D.prims()
        .find((x) => x.id === 'playhead-full');
      return p && p.k === 'line' ? p.x1 : NaN;
    });
    const steps = xs.slice(1).map((x, i) => x - xs[i]);
    for (const d of steps) expect(d).toBeCloseTo(steps[0], 0);
    expect(passedMin(m, PLAN.recoverEnd - 1e-9)).toBeCloseTo(m.lastRtoMin, 0);
  });
});
