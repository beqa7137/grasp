import { describe, expect, it } from 'vitest';
import { storageText } from '../email/storage.js';
import {
  CACHE_STOPS,
  HOSTS_STOPS,
  ORIGIN_STOPS,
  SIZE_STOPS,
  TIER_TEXT,
  clearBottleneck,
  distribution,
  distributionCheckpoint,
  secondsSpan,
  type DistributionSettings,
} from './distribution.js';

const base: DistributionSettings = { sizeMb: 500, hosts: 20_000, originGbps: 10, caches: 0, p2p: false, delta: false };

/** Every setting the controls allow. */
function* sweep(): Generator<DistributionSettings> {
  for (const sizeMb of SIZE_STOPS)
    for (const hosts of HOSTS_STOPS)
      for (const originGbps of ORIGIN_STOPS)
        for (const caches of CACHE_STOPS)
          for (const p2p of [false, true]) for (const delta of [false, true]) yield { sizeMb, hosts, originGbps, caches, p2p, delta };
}

const near = (a: number, b: number) => Math.abs(a - b) <= 1e-9 * Math.max(Math.abs(a), Math.abs(b), 1);

describe('the distribution model', () => {
  it('works the example out: one origin, then regional caches, then peers, then a delta', () => {
    const origin = distribution(base);
    expect(origin.seconds).toBe(8_000);
    expect(origin.bottleneck).toBe('origin');
    expect(storageText(origin.originBytes)).toBe('10 TB');
    const cached = distribution({ ...base, caches: 5 });
    expect(cached.seconds).toBe(800);
    expect(cached.bottleneck).toBe('caches');
    expect(cached.tierSeconds.origin).toBe(2);
    expect(storageText(cached.originBytes)).toBe('2.5 GB');
    const swarm = distribution({ ...base, caches: 5, p2p: true });
    expect(swarm.seconds).toBe(4);
    expect(swarm.bottleneck).toBe('hosts');
    const delta = distribution({ ...base, caches: 5, p2p: true, delta: true });
    expect(delta.seconds).toBeCloseTo(0.4, 12);
    expect(storageText(delta.originBytes)).toBe('250 MB');
    expect(storageText(distribution({ ...base, p2p: true }).originBytes)).toBe('500 MB');
    expect([8_000, 800, 4, 0.4].map(secondsSpan)).toEqual(['2 h 13 min', '13 min 20 s', '4 s', '0.4 s']);
  });

  it('takes the slowest of the textbook bounds, on every setting', () => {
    for (const s of sweep()) {
      if (s.caches > s.hosts) continue;
      const run = distribution(s);
      const at = JSON.stringify(s);
      const bits = s.sizeMb * 8e6 * (s.delta ? 0.1 : 1);
      const g = 1e9;
      const swarm = (seedGbps: number, n: number) => Math.max(bits / (seedGbps * g), (n * bits) / ((seedGbps + n) * g), bits / g);
      const server = (seedGbps: number, n: number) => Math.max((n * bits) / (seedGbps * g), bits / g);
      const hostTier = (seedGbps: number, n: number) => (s.p2p ? swarm(seedGbps, n) : server(seedGbps, n));
      const expected =
        s.caches === 0
          ? hostTier(s.originGbps, s.hosts)
          : Math.max(server(s.originGbps, s.caches), bits / (20 * g), hostTier(20, s.hosts / s.caches));
      expect(near(run.seconds, expected), at).toBe(true);
      expect(Math.max(...Object.values(run.tierSeconds)), at).toBe(run.seconds);
      expect(run.tierSeconds[run.bottleneck], at).toBe(run.seconds);
      expect(run.originBytes, at).toBe(run.bytesPerHost * (s.caches || (s.p2p ? 1 : s.hosts)));
      // Sharing pieces never makes it slower, and a delta divides every term by ten.
      expect(run.seconds, at).toBeLessThanOrEqual(distribution({ ...s, p2p: false }).seconds);
      if (s.delta) expect(near(run.seconds, distribution({ ...s, delta: false }).seconds / 10), at).toBe(true);
    }
  });

  it('refuses impossible settings', () => {
    expect(() => distribution({ ...base, hosts: 0 })).toThrow();
    expect(() => distribution({ ...base, caches: 30_000 })).toThrow();
  });

  it('writes spans in the unit that keeps them short', () => {
    expect([0.04, 0.2, 2.5, 13.4, 61, 3_599, 3_600, 86_400].map(secondsSpan)).toEqual([
      '0.04 s',
      '0.2 s',
      '2.5 s',
      '13 s',
      '1 min 1 s',
      '59 min 59 s',
      '1 h',
      '1 d',
    ]);
  });
});

describe('the distribution checkpoint', () => {
  it("has exactly one right answer, the model's, among at least three distinct choices, on every setting", () => {
    const asked = new Set<string>();
    const wrong: string[] = [];
    for (const s of sweep()) {
      if (s.caches > s.hosts) continue;
      const run = distribution(s);
      const c = distributionCheckpoint(s, run);
      const kind = c.prompt.includes('Which links limit') ? 'bottleneck' : c.prompt.includes('how long until') ? 'time' : 'egress';
      asked.add(kind);
      const expected =
        kind === 'bottleneck' ? TIER_TEXT[run.bottleneck] : kind === 'time' ? secondsSpan(run.seconds) : storageText(run.originBytes);
      if (
        c.choices[c.answer] !== expected ||
        c.choices.length < 3 ||
        new Set(c.choices).size !== c.choices.length ||
        (kind === 'bottleneck' && !clearBottleneck(run))
      )
        wrong.push(`${JSON.stringify(s)} ${JSON.stringify(c.choices)}`);
    }
    expect(wrong.slice(0, 5)).toEqual([]);
    expect([...asked].sort()).toEqual(['bottleneck', 'egress', 'time']);
  });

  it('offers only tiers that exist, padded to three choices', () => {
    let withoutCaches = 0;
    for (const s of sweep()) {
      const c = distributionCheckpoint(s);
      if (!c.prompt.includes('Which links limit')) continue;
      expect(c.choices.length).toBeGreaterThanOrEqual(3);
      if (s.caches === 0) {
        withoutCaches++;
        expect(c.choices).not.toContain(TIER_TEXT.caches);
      } else expect(c.choices).toContain(TIER_TEXT.caches);
    }
    expect(withoutCaches).toBeGreaterThan(0);
  });

  it('asks about the bottleneck only when one tier clearly limits', () => {
    const tie = distribution({ ...base, originGbps: 1, p2p: true });
    expect(tie.tierSeconds.origin).toBe(tie.tierSeconds.hosts);
    expect(clearBottleneck(tie)).toBe(false);
    expect(clearBottleneck(distribution(base))).toBe(true);
  });
});
