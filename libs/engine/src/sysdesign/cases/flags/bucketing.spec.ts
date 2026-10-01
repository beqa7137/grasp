import { describe, expect, it } from 'vitest';
import {
  BUCKETS,
  FLAG_A,
  POPULATION,
  ROLLOUT_STAGES,
  SALT_VERSIONS,
  bucketingCheckpoint,
  bucketingRun,
  flagBucket,
  flickerChance,
  inRollout,
  rolloutUsers,
  saltOf,
  type Assignment,
  type RolloutState,
} from './bucketing.js';

const MANY = rolloutUsers(100_000);
const share = (test: (id: string) => boolean) => MANY.filter(test).length / MANY.length;
const IN_A = new Map(MANY.map((id) => [id, flagBucket(id, FLAG_A)]));
const SCHEMES: Assignment[] = ['flag-salt', 'user-only', 'random'];

/** Every state the widget can reach: a scheme, a stage and a salt, before or after one change of stage or salt. */
function* reachable(): Generator<[Assignment, RolloutState, RolloutState | null]> {
  for (const scheme of SCHEMES)
    for (const percent of ROLLOUT_STAGES)
      for (let saltVersion = 1; saltVersion <= (scheme === 'flag-salt' ? SALT_VERSIONS : 1); saltVersion++) {
        const now = { percent, saltVersion };
        yield [scheme, now, null];
        for (const before of ROLLOUT_STAGES) if (before !== percent) yield [scheme, now, { percent: before, saltVersion }];
        if (scheme === 'flag-salt') yield [scheme, now, { percent, saltVersion: (saltVersion % SALT_VERSIONS) + 1 }];
      }
}

describe('deterministic bucketing', () => {
  it('spreads 100,000 sequential ids evenly over 100 bins: chi-square under the 0.1% critical value for 99 degrees of freedom', () => {
    const bins = Array.from({ length: 100 }, () => 0);
    for (const b of IN_A.values()) bins[Math.floor(b / (BUCKETS / 100))]++;
    const expected = MANY.length / 100;
    const chiSquare = bins.reduce((sum, n) => sum + (n - expected) ** 2 / expected, 0);
    expect(chiSquare).toBeLessThan(148.23);
    expect(Math.min(...bins)).toBeGreaterThan(expected * 0.9);
  });

  it('puts close to the rollout percentage of users in, at every stage', () => {
    for (const percent of ROLLOUT_STAGES) {
      const p = percent / 100;
      const sd = Math.sqrt((p * (1 - p)) / MANY.length);
      expect(Math.abs(share((id) => inRollout(IN_A.get(id)!, percent)) - p), `${percent}%`).toBeLessThanOrEqual(5 * sd);
    }
    expect(share((id) => inRollout(IN_A.get(id)!, 100))).toBe(1);
  });

  it('keeps every user who was in when the percentage grows, since only the line moves', () => {
    for (const b of IN_A.values()) {
      const stages = ROLLOUT_STAGES.map((p) => inRollout(b, p));
      expect(stages.indexOf(true) === -1 || stages.slice(stages.indexOf(true)).every(Boolean)).toBe(true);
    }
  });

  it('makes two flags independent with a salt each: two 10% rollouts share about 1% of users, and all 10% without salts', () => {
    const both = (a: string | null, b: string | null) =>
      share((id) => inRollout(flagBucket(id, a), 10) && inRollout(flagBucket(id, b), 10));
    const sd = Math.sqrt((0.01 * 0.99) / MANY.length);
    expect(Math.abs(both(FLAG_A, 'search-ranking') - 0.01)).toBeLessThanOrEqual(5 * sd);
    expect(both(null, null)).toBeCloseTo(
      share((id) => inRollout(flagBucket(id, null), 10)),
      10,
    );
  });

  it('reshuffles on a new salt: of the users in at 10%, about 10% are still in', () => {
    const before = MANY.filter((id) => inRollout(flagBucket(id, saltOf(FLAG_A, 1)), 10));
    const kept = before.filter((id) => inRollout(flagBucket(id, saltOf(FLAG_A, 2)), 10)).length / before.length;
    expect(Math.abs(kept - 0.1)).toBeLessThanOrEqual(5 * Math.sqrt((0.1 * 0.9) / before.length));
  });

  it('flickers under a die per request as the closed form says, and never under a hash', () => {
    for (const percent of [5, 25, 50]) {
      const run = bucketingRun({ scheme: 'random', percent, saltVersion: 1 }, null, 20_000);
      const p = flickerChance(percent / 100);
      expect(Math.abs(run.flipped / 20_000 - p), `${percent}%`).toBeLessThanOrEqual(5 * Math.sqrt((p * (1 - p)) / 20_000));
      expect(bucketingRun({ scheme: 'flag-salt', percent, saltVersion: 1 }, null).flipped).toBe(0);
    }
    expect(flickerChance(0.5)).toBeCloseTo(0.9375);
    expect(flickerChance(1)).toBe(0);
  });

  it('counts the users who stayed, left and joined, adding up on both sides of the change', () => {
    for (const [scheme, now, before] of reachable()) {
      const run = bucketingRun({ scheme, ...now }, before);
      expect(run.both).toBeLessThanOrEqual(Math.min(run.inA, run.inB));
      if (!before) {
        expect(run.stayed).toBeNull();
        continue;
      }
      expect(run.stayed! + run.joined!).toBe(run.inA);
      expect(run.stayed! + run.left!).toBe(run.users.filter((u) => u.wasIn).length);
      if (scheme !== 'random' && before.saltVersion === now.saltVersion)
        expect(before.percent < now.percent ? run.left : run.joined, JSON.stringify([scheme, now, before])).toBe(0);
    }
  });
});

describe('bucketing checkpoint', () => {
  it('has exactly one right answer, the count the run gives, on every reachable state', () => {
    for (const [scheme, now, before] of reachable()) {
      const at = JSON.stringify([scheme, now, before]);
      const c = bucketingCheckpoint({ scheme, ...now }, before);
      const run = bucketingRun({ scheme, ...now }, before);
      const counted = before ? run.stayed! : scheme === 'random' ? run.flipped : run.both;
      expect(c.choices[c.answer], at).toBe(`${counted.toLocaleString('en-US')} user${counted === 1 ? '' : 's'}`);
      expect(c.choices.length, at).toBeGreaterThanOrEqual(3);
      expect(new Set(c.choices).size, at).toBe(c.choices.length);
    }
  });

  it('asks about overlap, flicker or stickiness depending on the scheme and the last change', () => {
    expect(bucketingCheckpoint({ scheme: 'flag-salt', percent: 10, saltVersion: 1 }, null).prompt).toContain('also in search-ranking');
    expect(bucketingCheckpoint({ scheme: 'random', percent: 10, saltVersion: 1 }, null).prompt).toContain('see both versions');
    const raised = bucketingCheckpoint({ scheme: 'flag-salt', percent: 25, saltVersion: 1 }, { percent: 10, saltVersion: 1 });
    expect(raised.prompt).toContain('moves from 10% to 25%');
    expect(raised.explain).toContain('all');
    expect(bucketingCheckpoint({ scheme: 'flag-salt', percent: 10, saltVersion: 2 }, { percent: 10, saltVersion: 1 }).prompt).toContain(
      'gets a new salt',
    );
  });

  it('answers the overlap with the whole of the smaller rollout when every flag hashes the user id alone', () => {
    const run = bucketingRun({ scheme: 'user-only', percent: 25, saltVersion: 1 }, null);
    expect(run.both).toBe(run.inA);
    const salted = bucketingRun({ scheme: 'flag-salt', percent: 25, saltVersion: 1 }, null);
    expect(Math.abs(salted.both - salted.inA / 2)).toBeLessThan(salted.inA / 4);
    expect(run.users).toHaveLength(POPULATION);
  });
});
