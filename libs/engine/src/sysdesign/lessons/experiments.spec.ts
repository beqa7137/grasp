import { describe, expect, it } from 'vitest';
import { CACHE_EXPERIMENTS } from './caching-experiments.js';
import { FEED_CHALLENGE_GOAL, FEED_EXPERIMENTS } from './data-modeling-experiments.js';
import {
  experimentTemplates,
  fillTemplate,
  formatApprox,
  formatDuration,
  formatMs,
  formatPct,
  formatQps,
  formatSeconds,
  formatTimes,
  goalBounds,
  goalMet,
  renderExperiment,
  strayDigits,
} from './experiments.js';
import { SD_LESSONS } from './index.js';
import { LB_EXPERIMENTS } from './load-balancing-experiments.js';
import { REPLICA_EXPERIMENTS } from './replication-experiments.js';
import { balanceRun } from './widgets/balancing.js';
import { LB_LOADS, LB_POLICIES, LB_SERVER_SNAPS, LB_SLOWDOWNS } from './widgets/balancing-settings.js';
import { CACHE_CAPACITY_SNAPS, CACHE_HIT_SNAPS, CACHE_ORIGIN_MS_SNAPS, cacheSteady } from './widgets/caching.js';
import {
  FEED_BASELINE,
  FEED_PAGES_PER_S,
  FEED_PAGE_SIZES,
  FEED_PLACES,
  FEED_POSTS_PER_AUTHOR,
  FEED_READS,
  FEED_RENAMES_PER_S,
  feedAt,
  type FeedSettings,
} from './widgets/data-modeling.js';
import { REPLICA_PIN_SNAPS, REPLICA_TIMES, replicaOutcome } from './widgets/replication.js';

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
    expect([formatDuration(82.4), formatDuration(1_200), formatDuration(64_707), formatDuration(409_918)]).toEqual([
      '82 ms',
      '1.2 s',
      '64.7 s',
      '410 s',
    ]);
    expect([fillTemplate('{n}', { n: { value: 1_380, unit: 'num' } }), fillTemplate('{n}', { n: { value: 2.5, unit: 'num' } })]).toEqual([
      '1,380',
      '2.5',
    ]);
  });

  it('meets a goal only while the settings it keeps hold', () => {
    const goal = { metric: 'p99Ms', below: 100, keep: { slowdown: 5 } };
    expect(goalMet(goal, { p99Ms: 96 }, { slowdown: 5, policy: 2 })).toBe(true);
    expect(goalMet(goal, { p99Ms: 82 }, { slowdown: 1, policy: 0 })).toBe(false);
    expect(goalMet(goal, { p99Ms: 163 }, { slowdown: 5 })).toBe(false);
  });

  it('meets a goal of several bounds only when every one holds', () => {
    const goal = {
      all: [
        { metric: 'waitMs', below: 5 },
        { metric: 'staleMs', below: 1_000 },
      ],
      keep: { place: 2 },
    };
    expect(goalMet(goal, { waitMs: 2, staleMs: 100 }, { place: 2 })).toBe(true);
    expect(goalMet(goal, { waitMs: 2, staleMs: 1_000 }, { place: 2 })).toBe(false);
    expect(goalMet(goal, { waitMs: 2, staleMs: 100 }, { place: 1 })).toBe(false);
    expect(goalBounds({ metric: 'p99Ms', below: 100 })).toEqual([{ metric: 'p99Ms', below: 100 }]);
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

  it('covers the Caching, Load Balancing, Replication and Data Modeling lessons', () => {
    expect(lessons.map(([id]) => id)).toEqual(
      expect.arrayContaining(['sd-caching', 'sd-load-balancing', 'sd-replication', 'sd-data-modeling']),
    );
    expect(SD_LESSONS['sd-data-modeling'].widget.experiments).toBe(FEED_EXPERIMENTS);
    expect(SD_LESSONS['sd-data-modeling'].widget.tryThis).toBeUndefined();
    expect(SD_LESSONS['sd-caching'].widget.experiments).toBe(CACHE_EXPERIMENTS);
    expect(SD_LESSONS['sd-load-balancing'].widget.experiments).toBe(LB_EXPERIMENTS);
    expect(SD_LESSONS['sd-replication'].widget.experiments).toBe(REPLICA_EXPERIMENTS);
  });

  it.each(lessons)('%s writes every number as a slot the model fills', (_id, lesson) => {
    for (const spec of lesson.widget.experiments!) {
      for (const t of experimentTemplates(spec)) expect(strayDigits(t), `${spec.id}: ${t}`).toEqual([]);
      for (const [name, slot] of Object.entries(spec.slots()))
        if (slot.unit === 'word') expect(slot.value, `${spec.id}: {${name}}`).not.toMatch(/\d/);
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
    const meets = (h: number) => cacheSteady({ hitRate: h, originMs: goal.setup['originMs'] }).meanMs < goalBounds(goal.goal!)[0].below;
    expect(meets(goal.setup['hitRate'])).toBe(false);
    expect(CACHE_HIT_SNAPS.filter(meets)).toEqual([99.5, 99.9]);
  });
});

describe('the Load Balancing experiments', () => {
  const shown = Object.fromEntries(LB_EXPERIMENTS.map((e) => [e.id, renderExperiment(e)]));
  const run = (policy: number, slowdown: number, load = 70) => balanceRun(LB_POLICIES[policy], { servers: 10, load: load / 100, slowdown });

  it('name their cards without slots, so the cards show before the worker renders them', () => {
    for (const e of LB_EXPERIMENTS) expect(e.title, e.id).not.toMatch(/[{}]/);
  });

  it('set the widget up on its snaps', () => {
    for (const e of LB_EXPERIMENTS) {
      const all = { ...e.setup, ...(e.act && 'set' in e.act ? e.act.set : {}) };
      expect(LB_POLICIES[all['policy']], e.id).toBeDefined();
      expect(LB_SERVER_SNAPS, e.id).toContain(all['servers']);
      expect(LB_LOADS, e.id).toContain(all['load']);
      expect(LB_SLOWDOWNS, e.id).toContain(all['slowdown']);
    }
  });

  it('quote what balanceRun gives for their setup', () => {
    expect(shown['look-at-servers'].ask).toContain('p99 is 82 ms');
    expect(shown['look-at-servers'].reveal).toMatch(/^p99 falls from 82 ms to 51 ms/);
    expect(shown['look-at-servers'].reveal).toContain('the worst at 175 ms');
    expect(shown['one-slow-server'].reveal).toContain('from 82 ms to 64.7 s, 789× worse');
    expect(shown['one-slow-server'].reveal).toContain('10% of the requests, but at 70% load it can keep up with only 3.1%');
    expect(shown['one-slow-server'].reveal).toContain('to 1,379 requests');
    expect(shown['one-slow-server'].choices[shown['one-slow-server'].answer]).toBe('About 1,000×');
    expect(shown['backs-off'].reveal).toMatch(/^2\.8%, just under the 3\.1% it can keep up with/);
    expect(shown['two-choices'].reveal).toMatch(/^163 ms/);
    expect(shown['rising-load'].reveal).toMatch(/^10\.1 s\. At 50% the slow server is sent 95%/);
    expect(shown['rising-load'].reveal).toContain('at 70% it is sent 133%');
    expect(shown['p99-goal'].reveal).toMatch(/^Least connections meets it at 81 ms/);
    expect([run(0, 1).p99Ms, run(2, 1).p99Ms, run(0, 5).p99Ms, run(2, 5).p99Ms].map(Math.round)).toEqual([82, 51, 64_707, 81]);
    const lc = run(2, 5);
    expect(lc.slowShare).toBeLessThan(lc.slowCapacityShare / 0.7);
    expect(run(0, 5).slowQueueAtEnd).toBe(1_379);
  });

  it('set a challenge that least connections meets and the slow server cannot be dropped to meet', () => {
    const goal = LB_EXPERIMENTS.find((e) => e.goal)!;
    const metrics = (policy: number, slowdown: number) => ({ p99Ms: run(policy, slowdown).p99Ms });
    const settings = (policy: number, slowdown: number) => ({ ...goal.setup, policy, slowdown });
    expect(goalMet(goal.goal!, metrics(0, 5), settings(0, 5))).toBe(false);
    expect(goalMet(goal.goal!, metrics(2, 5), settings(2, 5))).toBe(true);
    expect(goalMet(goal.goal!, metrics(3, 5), settings(3, 5))).toBe(false);
    expect(goalMet(goal.goal!, metrics(0, 1), settings(0, 1))).toBe(false);
  });
});

describe('the Replication experiments', () => {
  const shown = Object.fromEntries(REPLICA_EXPERIMENTS.map((e) => [e.id, renderExperiment(e)]));

  it('set the widget up on its snaps', () => {
    for (const e of REPLICA_EXPERIMENTS) {
      const all = { ...e.setup, ...(e.act && 'set' in e.act ? e.act.set : {}) };
      expect(REPLICA_TIMES, e.id).toContain(all['lag']);
      expect(REPLICA_TIMES, e.id).toContain(all['read']);
      expect(REPLICA_PIN_SNAPS, e.id).toContain(all['pin']);
      expect([0, 1], e.id).toContain(all['ryw']);
    }
  });

  it('answer with what the replica model says the read returns', () => {
    for (const e of REPLICA_EXPERIMENTS.filter((x) => x.choices)) {
      const s = { ...e.setup, ...(e.act && 'set' in e.act ? e.act.set : {}) };
      const o = replicaOutcome({ lagMs: s['lag'], readMs: s['read'], readYourWrites: s['ryw'] === 1, pinMs: s['pin'] });
      expect(shown[e.id].choices[shown[e.id].answer], e.id).toBe(o.stale ? 'The old value' : 'The new value');
    }
    expect(shown['too-soon'].reveal).toContain('500 ms before it applied');
    expect(shown['lag-outlasts-pin'].reveal).toContain('a 1 s window');
    expect(shown['no-stale-goal'].reveal).toMatch(/^The shortest pin that covers the lag is 2 s/);
  });

  it('set a challenge the pin handle can just reach', () => {
    const goal = REPLICA_EXPERIMENTS.find((e) => e.goal)!;
    const stale = (pin: number) => replicaOutcome({ lagMs: 2_000, readMs: 1_200, readYourWrites: true, pinMs: pin }).staleMs;
    expect(goalMet(goal.goal!, { staleMs: stale(goal.setup['pin']) }, goal.setup)).toBe(false);
    expect(REPLICA_PIN_SNAPS.filter((pin) => goalMet(goal.goal!, { staleMs: stale(pin) }, { ...goal.setup, pin }))).toEqual([
      2_000, 2_500, 3_000,
    ]);
  });
});

describe('the Data Modeling experiments', () => {
  const shown = Object.fromEntries(FEED_EXPERIMENTS.map((e) => [e.id, renderExperiment(e)]));
  const settingsOf = (e: (typeof FEED_EXPERIMENTS)[number]): FeedSettings =>
    ({ ...FEED_BASELINE, ...e.setup, ...(e.act && 'set' in e.act ? e.act.set : {}) }) as FeedSettings;

  it('set the widget up on its snaps, in the order of the interview arc', () => {
    expect(FEED_EXPERIMENTS.map((e) => e.id)).toEqual(['trips-not-rows', 'read-heavy', 'old-name', 'frequent-renames', 'pick-schema']);
    for (const e of FEED_EXPERIMENTS) {
      const s = settingsOf(e);
      expect([0, 1], e.id).toContain(s.schema);
      expect(FEED_READS[s.read], e.id).toBeDefined();
      expect(FEED_PLACES[s.place], e.id).toBeDefined();
      expect(FEED_PAGE_SIZES, e.id).toContain(s.pageSize);
      expect(FEED_POSTS_PER_AUTHOR, e.id).toContain(s.postsPerAuthor);
      expect(FEED_PAGES_PER_S, e.id).toContain(s.pagesPerSecond);
      expect(FEED_RENAMES_PER_S, e.id).toContain(s.renamesPerSecond);
    }
  });

  it('quote what feedCost gives for their setup', () => {
    expect(shown['trips-not-rows'].ask).toContain('same 200 rows');
    expect(shown['trips-not-rows'].choices).toEqual(['About the same', 'About 2× longer', 'About 101× longer']);
    expect(shown['trips-not-rows'].reveal).toMatch(/^101×: 101 ms against 1 ms, for the same 200 rows/);
    expect(shown['trips-not-rows'].reveal).toContain('batched IN pays 2 (2 ms)');
    expect(shown['trips-not-rows'].reveal).toContain('N+1 waits 3 s and the join 30 ms');
    expect(shown['read-heavy'].choices).toEqual(['It about halves, to 200,501', 'It stays about 400,001', 'It doubles, to 800,002']);
    expect(shown['read-heavy'].reveal).toContain('saving 200,000 rows a second, while a rename now writes 501 rows instead of 1');
    expect(shown['read-heavy'].reveal).toContain('pays up to 400 renames a second, but the copy rewrite falls behind above 10');
    expect(shown['read-heavy'].reveal).toContain('on some copies for 100 ms.');
    expect(shown['old-name'].choices).toEqual(['About 2 s', 'About 20 s', 'About 200 s']);
    expect(shown['old-name'].reveal).toMatch(/^About 20 s: 100,000 copies at 5,000 a second, and 20,000 pages/);
    expect(shown['frequent-renames'].choices).toEqual([
      'They clear within 1 s of each rename, as before',
      'They clear within 10 s: each rename waits behind the last',
      'Never: the rewrite falls further behind every second',
    ]);
    expect(shown['frequent-renames'].answer).toBe(2);
    expect(shown['frequent-renames'].reveal).toContain('50,000 copy rows a second against the rewrite’s 5,000: 10×'.replace('’', "'"));
    expect(shown['frequent-renames'].reveal).toContain('the backlog grows by 45,000 rows a second');
    expect(shown['frequent-renames'].reveal).toContain(
      'Rows got worse too: 70,010 a second against 40,010 with the join, since 10 renames a second is past the break-even of 4.',
    );
    expect(shown['pick-schema'].ask).toMatch(
      /^10,000 pages a second of 20 posts, the database in another zone\. Keep the page wait under 5 ms, old names gone within 1 s, and the database under 350,000 rows/,
    );
    expect(shown['pick-schema'].reveal).toMatch(/^Denormalized meets all three: 2 ms, old name for 100 ms, 200,501 rows a second/);
    expect(shown['pick-schema'].reveal).toContain('one rename takes 20 s to rewrite while renames arrive every second');
    expect(shown['pick-schema'].reveal).toContain('2 round trips, 1 row per rename');
  });

  it('play the answer on the picture, and hide what would give it away while asking', () => {
    expect(FEED_EXPERIMENTS.map((e) => e.act)).toEqual([
      { set: { read: 0 }, run: 'load' },
      { set: { schema: 1 } },
      { run: 'rename' },
      { set: { renamesPerSecond: 10 }, run: 'rename' },
      undefined,
    ]);
    expect(FEED_EXPERIMENTS.map((e) => renderExperiment(e).hide)).toEqual([[], ['denormalized'], ['stale'], ['behind'], []]);
    const asked = settingsOf(FEED_EXPERIMENTS[0]);
    expect({ ...asked, read: 2 }).toMatchObject(FEED_EXPERIMENTS[0].setup);
  });

  it('answer frequent renames from the model: the rewrite falls behind, where it kept up at the setup', () => {
    const e = FEED_EXPERIMENTS.find((x) => x.id === 'frequent-renames')!;
    expect(feedAt({ ...FEED_BASELINE, ...e.setup } as FeedSettings).fanoutLoad).toBeLessThan(1);
    expect(feedAt(settingsOf(e))).toMatchObject({ fanoutLoad: 10, staleMs: Infinity });
  });

  it('set a challenge that exactly one schema and read passes, and only at the settings it keeps', () => {
    const e = FEED_EXPERIMENTS.find((x) => x.goal)!;
    expect(e.goal).toBe(FEED_CHALLENGE_GOAL);
    const base = { ...FEED_BASELINE, ...e.setup } as FeedSettings;
    const passes = (s: FeedSettings) => {
      const c = feedAt(s);
      return goalMet(FEED_CHALLENGE_GOAL, { waitMs: c.waitMs, staleMs: c.staleMs, rowsPerSecond: c.rowsPerSecond }, { ...s });
    };
    const picks = [
      { schema: 0, read: 0 },
      { schema: 0, read: 1 },
      { schema: 0, read: 2 },
      { schema: 1, read: 0 },
      { schema: 1, read: 1 },
      { schema: 1, read: 2 },
    ];
    expect(picks.filter((p) => passes({ ...base, ...p })).map((p) => p.schema)).toEqual([1, 1, 1]);
    expect(passes(base)).toBe(false);
    expect(picks.map((p) => feedAt({ ...base, ...p }).waitMs).slice(0, 4)).toEqual([42, 4, 2, 2]);
    expect(feedAt({ ...base, read: 2 }).rowsPerSecond).toBe(400_001);
    expect(feedAt({ ...base, schema: 1 })).toMatchObject({ staleMs: 100, rowsPerSecond: 200_501 });
    let free = 0;
    for (const pageSize of FEED_PAGE_SIZES)
      for (const postsPerAuthor of FEED_POSTS_PER_AUTHOR)
        for (const pagesPerSecond of FEED_PAGES_PER_S)
          for (const renamesPerSecond of FEED_RENAMES_PER_S)
            for (const place of FEED_PLACES.keys())
              for (const p of picks) {
                const s = { ...p, pageSize, postsPerAuthor, pagesPerSecond, renamesPerSecond, place };
                if (passes(s)) {
                  free++;
                  expect(s).toMatchObject({ ...e.goal!.keep, schema: 1 });
                }
              }
    expect(free).toBe(3);
  });
});
