import { describe, expect, it } from 'vitest';
import { CACHE_EXPERIMENTS } from './caching-experiments.js';
import {
  experimentTemplates,
  fillTemplate,
  formatApprox,
  formatMs,
  formatPct,
  formatQps,
  formatSeconds,
  formatTimes,
  renderExperiment,
  strayDigits,
} from './experiments.js';
import { SD_LESSONS } from './index.js';
import { CACHE_CAPACITY_SNAPS, CACHE_HIT_SNAPS, CACHE_ORIGIN_MS_SNAPS, cacheSteady } from './widgets/caching.js';

describe('experiment formatting', () => {
  it('says each unit the way the readouts do', () => {
    expect([formatMs(1.05), formatMs(1.1), formatMs(2), formatMs(101), formatMs(50.5)]).toEqual([
      '1.05 ms',
      '1.1 ms',
      '2 ms',
      '101 ms',
      '51 ms',
    ]);
    expect([formatPct(99.9), formatPct(90), formatPct(62.44)]).toEqual(['99.9%', '90%', '62.4%']);
    expect([formatQps(10), formatQps(10_000), formatQps(0.5)]).toEqual(['10/s', '10,000/s', '0.5/s']);
    expect([formatTimes(1_000), formatTimes(2), formatTimes(2.5)]).toEqual(['1,000×', '2×', '2.5×']);
    expect([formatSeconds(4.02), formatSeconds(1.51)]).toEqual(['4 s', '1.5 s']);
    expect([formatApprox(16_080), formatApprox(4_540), formatApprox(42)]).toEqual(['16,000', '4,500', '42']);
  });

  it('refuses a placeholder with no slot', () => {
    expect(() => fillTemplate('p99 is {nope}', {})).toThrow(/nope/);
  });

  it('finds digits outside slots and the allowed phrases', () => {
    expect(strayDigits('p99 of {x} in 100 requests')).toEqual([]);
    expect(strayDigits('at 99% hits')).toEqual(['99']);
  });
});

describe('the reveal spec', () => {
  const lessons = Object.entries(SD_LESSONS).filter(([, l]) => l.widget.experiments);

  it('covers the Caching lesson', () => {
    expect(lessons.map(([id]) => id)).toContain('sd-caching');
    expect(SD_LESSONS['sd-caching'].widget.experiments).toBe(CACHE_EXPERIMENTS);
  });

  it.each(lessons)('%s writes every number as a slot the model fills', (_id, lesson) => {
    for (const spec of lesson.widget.experiments!) {
      for (const t of experimentTemplates(spec)) expect(strayDigits(t), `${spec.id}: ${t}`).toEqual([]);
      const shown = renderExperiment(spec);
      for (const t of [shown.title, shown.ask, ...shown.choices, shown.reveal]) expect(t, spec.id).not.toMatch(/[{}]/);
    }
  });

  it.each(lessons)('%s asks questions with exactly one answer, the model value, among distinct choices', (_id, lesson) => {
    for (const spec of lesson.widget.experiments!) {
      const shown = renderExperiment(spec);
      if (spec.goal) {
        expect(shown.choices, spec.id).toEqual([]);
        continue;
      }
      expect(shown.choices.length, spec.id).toBeGreaterThanOrEqual(3);
      expect(new Set(shown.choices).size, spec.id).toBe(shown.choices.length);
      expect(shown.choices[shown.answer], spec.id).toContain(fillTemplate(`{${spec.truth}}`, spec.slots()));
    }
  });
});

describe('the Caching experiments', () => {
  const shown = CACHE_EXPERIMENTS.map(renderExperiment);

  it('set the widget up on its snaps', () => {
    for (const e of CACHE_EXPERIMENTS) {
      const all = { ...e.setup, ...(e.act && 'set' in e.act ? e.act.set : {}) };
      expect(CACHE_HIT_SNAPS, e.id).toContain(all['hitRate']);
      expect(CACHE_ORIGIN_MS_SNAPS, e.id).toContain(all['originMs']);
      expect(CACHE_CAPACITY_SNAPS, e.id).toContain(all['capacity']);
    }
  });

  it('quote what the model gives', () => {
    const byId = Object.fromEntries(shown.map((e) => [e.id, e]));
    expect(byId['each-nine'].reveal).toContain('from 1,000/s to 100/s, 10× less');
    expect(byId['each-nine'].reveal).toContain('p99 from 101 ms to 1 ms');
    expect(byId['p99-miss'].reveal).toContain('p99 stays at 101 ms: 5 of every 100 requests');
    expect(byId['slow-origin'].reveal).toContain('from 1.05 ms to 2 ms');
    expect(byId['slow-origin'].reveal).toContain('from 11 ms to 201 ms');
    expect(byId['miss-storm'].reveal).toContain('from 10/s to 10,000/s: 1,000× more, and 5× what it can answer');
    expect(byId['miss-storm'].reveal).toContain('about 4 s');
    expect(byId['miss-storm'].reveal).toContain('about 16,000 requests time out');
    expect(byId['bigger-origin'].reveal).toMatch(/^About 1\.5 s, under half of 4 s/);
    expect(byId['mean-goal'].reveal).toContain('from 99.5% hits (2 ms) up');
    expect(byId['mean-goal'].reveal).toContain('at 99% it is exactly 3 ms');
  });

  it('set a challenge the handle can just reach', () => {
    const goal = CACHE_EXPERIMENTS.find((e) => e.goal)!;
    const meets = (h: number) => cacheSteady({ hitRate: h, originMs: goal.setup['originMs'] }).meanMs < goal.goal!.below;
    expect(meets(goal.setup['hitRate'])).toBe(false);
    expect(CACHE_HIT_SNAPS.filter(meets)).toEqual([99.5, 99.9]);
  });
});
