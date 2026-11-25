import { describe, expect, it } from 'vitest';
import { formatDbSize, formatMinutes, formatRecoveryTime, formatRestoreSpeed, formatSpan } from './recovery-format.js';
import {
  RECOVERY_BASELINE,
  RECOVERY_COPY_BACK_MIN,
  RECOVERY_DELAY_H,
  RECOVERY_DISASTER,
  RECOVERY_INSET_MIN,
  RECOVERY_LAG_S,
  RECOVERY_PLANS,
  RECOVERY_SETTINGS,
  recoveryAfterX,
  recoveryBeforeX,
  recoveryInsetX,
  recoveryScenario,
  type RecoveryPlanId,
  type RecoverySettings,
} from './recovery.js';

const DROP = RECOVERY_DISASTER.drop;
const time = (min: number) => formatRecoveryTime(min);

describe('recoveryScenario', () => {
  it("keeps the lesson's numbers at its default: 2 TB at 10 GB/min, a nightly backup, the log every minute, replay at 10×", () => {
    const m = recoveryScenario();
    expect(m.restoreMin).toBe(200);
    expect(m.replayMin).toBe(144);
    expect(m.plans.full).toMatchObject({ recovers: true, rpoS: 86_400, rtoMin: 200 });
    expect(m.plans.pitr).toMatchObject({ recovers: true, rpoS: 60, rtoMin: 344 });
    expect(m.plans.standby).toMatchObject({ recovers: true, rpoS: 5, rtoMin: 1 });
    expect(m.plans.delayed).toMatchObject({ recovers: true, rpoS: 5, rtoMin: 7 });
    expect([time(200), time(344), time(1), time(7)]).toEqual(['3.3 h', '5.7 h', '1 min', '7 min']);
    expect(time(recoveryScenario({ size: 10000 }).plans.pitr.rtoMin)).toBe('19.1 h');
    expect(time(recoveryScenario({ size: 10000, restore: 50 }).plans.pitr.rtoMin)).toBe('5.7 h');
  });

  it('cannot undo a drop with the standby, which applies it; point-in-time recovery and the delayed replica stop just before it', () => {
    const m = recoveryScenario({ disaster: DROP });
    expect(m.plans.standby).toMatchObject({ recovers: false, rpoS: Infinity, rtoMin: Infinity, steps: [] });
    expect(m.plans.pitr).toMatchObject({ rpoS: 0, rtoMin: 345 });
    expect(m.plans.delayed).toMatchObject({ rpoS: 0, rtoMin: 7 });
    expect(m.plans.full.rpoS).toBe(86_400);
    expect(time(m.plans.pitr.rtoMin)).toBe('5.8 h');
    expect(time(recoveryScenario({ disaster: DROP, replay: 5 }).plans.delayed.rtoMin)).toBe('13 min');
  });

  it('pins every formula at every setting', () => {
    for (const s of RECOVERY_SETTINGS) {
      const m = recoveryScenario(s);
      const drop = s.disaster === DROP;
      const copy = drop ? RECOVERY_COPY_BACK_MIN : 0;
      const restore = s.size / s.restore;
      const replay = (s.base * 60) / s.replay;
      expect(m.plans.full.rpoS).toBe(s.base * 3600);
      expect(m.plans.full.rtoMin).toBe(restore + copy);
      expect(m.plans.pitr.rpoS).toBe(drop ? 0 : s.archive);
      expect(m.plans.pitr.rtoMin).toBe(restore + replay + copy);
      expect(m.plans.standby.rpoS).toBe(drop ? Infinity : s.sync ? 0 : RECOVERY_LAG_S);
      expect(m.plans.standby.rtoMin).toBe(drop ? Infinity : 1);
      expect(m.plans.delayed.rpoS).toBe(drop ? 0 : RECOVERY_LAG_S);
      expect(m.plans.delayed.rtoMin).toBe((RECOVERY_DELAY_H * 60) / s.replay + 1);
      expect(m.fullsH).toHaveLength(24 / s.base);
      expect(m.fullsH[0]).toBe(s.base);
      expect(m.lastRtoMin).toBe(Math.max(...RECOVERY_PLANS.filter((p) => m.plans[p].recovers).map((p) => m.plans[p].rtoMin)));
      for (const p of RECOVERY_PLANS) {
        const steps = m.plans[p].steps;
        // Every step is a whole number of minutes, so every ledger adds up as printed.
        for (const st of steps) expect(Number.isInteger(st.min)).toBe(true);
        if (m.plans[p].recovers) expect(steps.reduce((t, st) => t + st.min, 0)).toBe(m.plans[p].rtoMin);
        // After a drop no plan promotes: each recovers beside the primary and copies the table back.
        if (drop && m.plans[p].recovers) {
          expect(steps.at(-1)?.kind).toBe('copyBack');
          expect(steps.some((st) => st.kind === 'promote')).toBe(false);
        }
      }
      // Every time is on the after axis (24 h) and every loss on the before axis (1 s to 24 h, or none).
      for (const p of RECOVERY_PLANS) {
        const r = m.plans[p];
        if (!r.recovers) continue;
        expect(r.rtoMin).toBeLessThanOrEqual(24 * 60);
        expect(r.rpoS === 0 || (r.rpoS >= 1 && r.rpoS <= 86_400)).toBe(true);
      }
    }
    expect(RECOVERY_SETTINGS).toHaveLength(972);
  });

  it('moves the recovery time with size, restore speed, the full backups and the replay, and never with the archive', () => {
    for (const s of RECOVERY_SETTINGS) {
      const m = recoveryScenario(s);
      const archived = recoveryScenario({ ...s, archive: s.archive === 10 ? 300 : 10 });
      for (const p of RECOVERY_PLANS) expect(archived.plans[p].rtoMin).toBe(m.plans[p].rtoMin);
      const big = recoveryScenario({ ...s, size: 10000 });
      for (const p of ['standby', 'delayed'] as RecoveryPlanId[]) expect(big.plans[p].rtoMin).toBe(m.plans[p].rtoMin);
      expect(big.replayMin).toBe(m.replayMin);
    }
  });
});

/**
 * An independent check, second by second: writes every half second, a full backup at every multiple of the cycle, a
 * log segment shipped at every multiple of the archive interval, the standby applying each write its lag later and the
 * delayed replica receiving each write 5 s later. The disaster strikes at many moments of the cycle; the worst loss
 * measured from what the copies hold is the model's, at the cycle's end.
 */
describe('a simulated timeline', () => {
  const DT = 0.5;
  function worstLoss(plan: RecoveryPlanId, s: RecoverySettings): number {
    const C = s.base * 3600;
    const lag = s.sync ? 0 : RECOVERY_LAG_S;
    let worst = 0;
    const step = Math.max(s.archive, Math.round(C / 24 / s.archive) * s.archive);
    const moments: number[] = [];
    for (let T = s.archive - 0.01; T < C; T += step) moments.push(T);
    moments.push(C - 0.01);
    for (const T of moments) {
      let lastFull = 0;
      let archived = 0;
      let standby = 0;
      let received = 0;
      for (let t = 0; t < T; t += DT) {
        if (t % C === 0) lastFull = t;
        if (t > 0 && t % s.archive === 0) archived = t;
        if (t - lag >= 0) standby = t - lag;
        if (t - RECOVERY_LAG_S >= 0) received = t - RECOVERY_LAG_S;
      }
      const last = Math.ceil(T / DT) * DT - DT;
      const drop = s.disaster === DROP;
      const loss =
        plan === 'full'
          ? T - lastFull
          : plan === 'pitr'
            ? drop
              ? T - last
              : T - archived
            : plan === 'standby'
              ? drop
                ? Infinity
                : T - (lag ? standby : last)
              : drop
                ? T - last
                : T - received;
      worst = Math.max(worst, loss);
    }
    return worst;
  }

  it('measures each plan’s worst loss as the model says, for every cycle, interval, standby and disaster', () => {
    for (const base of [24, 6, 1])
      for (const archive of [10, 60, 300])
        for (const sync of [0, 1])
          for (const disaster of [0, 1]) {
            if (base === 24 && archive === 10) continue;
            const s = { ...RECOVERY_BASELINE, base, archive, sync, disaster };
            const m = recoveryScenario(s);
            for (const p of RECOVERY_PLANS) {
              const got = worstLoss(p, s);
              if (m.plans[p].rpoS === Infinity) expect(got).toBe(Infinity);
              else expect(Math.abs(got - m.plans[p].rpoS)).toBeLessThanOrEqual(DT + 0.02);
            }
          }
  }, 30_000);
});

/** A simulated recovery, a minute at a time: copy the base backup, replay the log it needs, then promote or copy back. */
describe('a simulated recovery', () => {
  function minutesTo(plan: RecoveryPlanId, s: RecoverySettings): number {
    const drop = s.disaster === DROP;
    if (plan === 'standby') return drop ? Infinity : 1;
    let t = 0;
    if (plan === 'full' || plan === 'pitr') {
      for (let copied = 0; copied < s.size; copied += s.restore) t++;
      if (plan === 'pitr') {
        // A dead disk's replay stops at the last segment shipped, an archive interval short of the cycle.
        const logS = s.base * 3600 - (drop ? 0 : s.archive);
        for (let replayed = 0; replayed < logS; replayed += s.replay * 60) t++;
      }
    } else for (let replayed = 0; replayed < RECOVERY_DELAY_H * 3600; replayed += s.replay * 60) t++;
    return t + (drop || plan === 'delayed' ? 1 : 0);
  }

  it('is never later than the model, and earlier by at most a minute', () => {
    for (const s of RECOVERY_SETTINGS) {
      const m = recoveryScenario(s);
      for (const p of RECOVERY_PLANS) {
        const sim = minutesTo(p, s);
        if (!m.plans[p].recovers) {
          expect(sim).toBe(Infinity);
          continue;
        }
        expect(sim).toBeLessThanOrEqual(m.plans[p].rtoMin);
        expect(m.plans[p].rtoMin - sim).toBeLessThanOrEqual(1);
        expect(time(sim) === time(m.plans[p].rtoMin) || m.plans[p].rtoMin - sim <= 1).toBe(true);
      }
    }
  });
});

describe('the scales and the formats', () => {
  it('puts the disaster at the right of the before axis and 24 h at its left; the after axis and the inset are linear', () => {
    expect(recoveryBeforeX(0, 20, 300, 14)).toBe(300);
    expect(recoveryBeforeX(86_400, 20, 300, 14)).toBeCloseTo(20);
    expect(recoveryBeforeX(1, 20, 300, 14)).toBeCloseTo(286);
    expect(recoveryBeforeX(60, 20, 300, 14)).toBeLessThan(recoveryBeforeX(5, 20, 300, 14));
    expect(recoveryAfterX(0, 10, 370)).toBe(10);
    expect(recoveryAfterX(720, 10, 370)).toBe(190);
    expect(recoveryAfterX(200, 10, 370) - recoveryAfterX(0, 10, 370)).toBeCloseTo(50);
    expect(recoveryInsetX(45, 0, 90)).toBe(45);
    expect(recoveryInsetX(344, 0, 90)).toBe(90);
    expect(RECOVERY_INSET_MIN).toBe(90);
  });

  it('says spans in seconds, minutes and hours, and sizes and speeds with their units', () => {
    expect([5, 10, 60, 300, 3600, 86_400, 420, 5940, 12_000].map(formatSpan)).toEqual([
      '5 s',
      '10 s',
      '1 min',
      '5 min',
      '1 h',
      '24 h',
      '7 min',
      '99 min',
      '3.3 h',
    ]);
    expect(formatMinutes(1440)).toBe('1,440 min');
    expect([500, 2000, 10000].map(formatDbSize)).toEqual(['500 GB', '2 TB', '10 TB']);
    expect(formatRestoreSpeed(25)).toBe('25 GB/min');
  });
});
