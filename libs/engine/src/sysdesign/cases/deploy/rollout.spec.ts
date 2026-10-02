import { describe, expect, it } from 'vitest';
import { durationText } from '../email/smtp-retry.js';
import {
  BAKE_STOPS,
  CANARY_STOPS,
  DETECT_STOPS,
  FLEET_STOPS,
  HOST_TIME_STOPS,
  UNAVAILABLE_STOPS,
  WAVE_SHAPES,
  WAVE_STOPS,
  batchHosts,
  canaryHosts,
  hostsText,
  rollout,
  rolloutCheckpoint,
  waveSizes,
  type RolloutSettings,
} from './rollout.js';

const base: RolloutSettings = {
  fleet: 2_000,
  canaryPct: 1,
  waves: 4,
  shape: 'equal',
  bakeMin: 30,
  maxUnavailablePct: 5,
  hostMin: 5,
  detectMin: 20,
};

/**
 * Every stop of every slider and both shapes, crossed with each other, except the fleet and the batch time, which take
 * their ends and the example's value: the full product is over a million settings.
 */
function* sweep(): Generator<RolloutSettings> {
  for (const fleet of [FLEET_STOPS[0], 2_000, FLEET_STOPS.at(-1)!])
    for (const canaryPct of CANARY_STOPS)
      for (const waves of WAVE_STOPS)
        for (const shape of WAVE_SHAPES)
          for (const bakeMin of BAKE_STOPS)
            for (const maxUnavailablePct of UNAVAILABLE_STOPS)
              for (const hostMin of [HOST_TIME_STOPS[0], 5, HOST_TIME_STOPS.at(-1)!])
                for (const detectMin of DETECT_STOPS)
                  yield { fleet, canaryPct, waves, shape, bakeMin, maxUnavailablePct, hostMin, detectMin };
}

/** Steps through the rollout one batch at a time, counting the hosts whose batch starts before the alarm. */
function stepThrough(s: RolloutSettings) {
  const batch = batchHosts(s);
  const alarm = s.hostMin + s.detectMin;
  const sizes = waveSizes(s);
  let t = 0;
  let exposed = 0;
  let peak = 0;
  sizes.forEach((hosts, i) => {
    for (let left = hosts; left > 0; left -= batch) {
      const now = Math.min(batch, left);
      if (t < alarm) exposed += now;
      peak = Math.max(peak, now);
      t += s.hostMin;
    }
    if (i < sizes.length - 1) t += s.bakeMin;
  });
  return { total: t, exposed, peak };
}

describe('the rollout model', () => {
  it('works the example plan out: a 1% canary, four equal waves, 30-minute bakes', () => {
    const run = rollout(base);
    expect(run.waves.map((w) => w.hosts)).toEqual([20, 495, 495, 495, 495]);
    expect(run.waves.map((w) => [w.startMin, w.endMin])).toEqual([
      [0, 5],
      [35, 60],
      [90, 115],
      [145, 170],
      [200, 225],
    ]);
    expect(run).toMatchObject({ canary: 20, batch: 100, totalMin: 225, peakDown: 100, detectAtMin: 25, exposed: 20 });
    expect(rollout({ ...base, detectMin: 45 }).exposed).toBe(320);
    expect(rollout({ ...base, bakeMin: 0 }).exposed).toBe(420);
    expect(rollout({ ...base, detectMin: 240 }).exposed).toBe(2_000);
    expect(waveSizes({ ...base, shape: 'doubling' })).toEqual([20, 132, 264, 528, 1_056]);
  });

  it('agrees with stepping through every batch, and keeps a bad build in a one-batch canary that bakes past detection', () => {
    const wrong: string[] = [];
    for (const s of sweep()) {
      const run = rollout(s);
      const stepped = stepThrough(s);
      const bakes = (run.waves.length - 1) * s.bakeMin;
      const updating = run.waves.reduce((a, w) => a + Math.ceil(w.hosts / run.batch) * s.hostMin, 0);
      const ok =
        run.totalMin === stepped.total &&
        run.totalMin === updating + bakes &&
        run.exposed === stepped.exposed &&
        run.peakDown === stepped.peak &&
        run.waves.reduce((a, w) => a + w.hosts, 0) === s.fleet &&
        run.waves.every((w) => w.hosts > 0) &&
        run.exposed >= Math.min(run.canary, run.batch) &&
        run.exposed <= s.fleet &&
        !(run.canary <= run.batch && s.bakeMin >= s.detectMin && run.exposed !== run.canary);
      if (!ok) wrong.push(JSON.stringify(s));
    }
    expect(wrong.slice(0, 5)).toEqual([]);
  });

  it('sizes the canary and the batch from the fleet, at least one host each', () => {
    expect(canaryHosts({ fleet: 100, canaryPct: 0.5 })).toBe(1);
    expect(canaryHosts({ fleet: 20_000, canaryPct: 0.5 })).toBe(100);
    expect(batchHosts({ fleet: 100, maxUnavailablePct: 1 })).toBe(1);
    expect(batchHosts({ fleet: 20_000, maxUnavailablePct: 25 })).toBe(5_000);
    expect(waveSizes({ fleet: 100, canaryPct: 10, waves: 6, shape: 'doubling' })).toEqual([10, 1, 3, 6, 11, 23, 46]);
    expect(() => rollout({ ...base, hostMin: 0 })).toThrow();
  });
});

describe('the rollout checkpoint', () => {
  it("has exactly one right answer, the model's, among at least three distinct choices, on every setting", () => {
    const asked = new Set<string>();
    const wrong: string[] = [];
    for (const s of sweep()) {
      const run = rollout(s);
      const c = rolloutCheckpoint(s, run);
      const duration = c.prompt.includes('How long does the whole rollout take');
      asked.add(duration ? 'duration' : 'blast');
      const expected = duration ? durationText(run.totalMin) : hostsText(run.exposed);
      if (c.choices[c.answer] !== expected || c.choices.length < 3 || new Set(c.choices).size !== c.choices.length)
        wrong.push(`${JSON.stringify(s)} ${JSON.stringify(c.choices)}`);
    }
    expect(wrong.slice(0, 5)).toEqual([]);
    expect([...asked].sort()).toEqual(['blast', 'duration']);
  });

  it('asks a different question as the settings move', () => {
    const prompts = DETECT_STOPS.map((detectMin) =>
      rolloutCheckpoint({ ...base, detectMin })
        .prompt.split('. ')
        .at(-1),
    );
    expect(new Set(prompts).size).toBe(2);
  });

  it('explains where the rollout stands when the alarm fires', () => {
    expect(rolloutCheckpoint({ ...base, detectMin: 45 }).explain).toContain(
      'By then wave 1 has started 300 hosts of its 495: 20 in the canary, 300 in wave 1, 320 hosts (16% of the fleet).',
    );
    const late = rolloutCheckpoint({ ...base, detectMin: 120, bakeMin: 0, maxUnavailablePct: 25 });
    expect(late.explain).toContain('the rollout finished at');
  });
});
