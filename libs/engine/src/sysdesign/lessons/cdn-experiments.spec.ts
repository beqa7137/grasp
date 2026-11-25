import { describe, expect, it } from 'vitest';
import { CDN_LESSON } from './cdn.js';
import { CDN_CHALLENGE_GOAL, CDN_CHALLENGE_SOLUTION, CDN_EXPERIMENTS, CDN_SETUP } from './cdn-experiments.js';
import { experimentTemplates, goalMet, renderExperiment, strayDigits } from './experiments.js';
import { CDN_OBJECTS, CDN_SETTINGS, cdnKey, cdnScenario, type CdnSettings } from './widgets/cdn.js';
import { cdnSig3, formatRank } from './widgets/cdn-format.js';

const shown = Object.fromEntries(CDN_EXPERIMENTS.map((e) => [e.id, renderExperiment(e)]));
const actOf = (id: string) => {
  const e = shown[id];
  return cdnScenario({ ...e.setup, ...(e.act && 'set' in e.act ? e.act.set : {}) } as unknown as CdnSettings);
};
const base = cdnScenario(CDN_SETUP.locations);

/** The brief's wording, every number filled from the model (enum.cjs prints the same). */
const EXPECTED: Record<string, { ask: string; choices: string[]; reveal: string }> = {
  'which-objects': {
    ask: "At 20 locations with a 5-minute TTL, the object at popularity rank k is asked for about 827 ÷ k times a second, spread evenly over the locations. Each location keeps a copy for the TTL after a miss. From about which rank down do most of an object's requests miss at the edge?",
    choices: [
      'From about the 6,200th: below it, an object is asked for less than twice per TTL at a location (a miss and a hit)',
      'From about the 12,400th: below it, an object is asked for less than once per TTL at a location',
      'Almost none: across the CDN, even the 100,000th is asked for about 2.5 times per TTL',
    ],
    reveal:
      "From about the 12,400th. A copy lives for the TTL after the miss that fetched it, so what decides a hit is how often its object is asked for at one location within one TTL. Split over 20 locations, the 12,400th most popular object is asked for about once every 5 minutes at each: one miss, then on average one hit, half its requests. More popular objects hit more often; the 25,000th hits 33.2% of the time, and the 90,000 least popular objects, 19.0% of all requests between them, hit least of all. The green area is the edge's share: 81.8%.",
  },
  'more-locations': {
    ask: 'The CDN serves 10,000 requests a second from 20 locations, and 3,080 a second reach the origin. It moves to 100 locations with the same traffic, each nearer its users. How many requests a second reach the origin now?',
    choices: [
      'About 4,400: each location now sees each object less often before its copy expires',
      'About 3,100: the same requests for the same objects',
      'About 1,500: more caches hold more copies between them',
    ],
    reveal:
      'About 4,400: 4,390 a second, up from 3,080. Every location keeps its own copies, so an object is fetched at most once per location per TTL, not once per CDN. Split over 100 locations, each sees each object a fifth as often: the hit rate at the edge falls from 69.2% to 56.1%, and the curve moves left (the half-hit rank, from the 2,481st to the 496th). Users gain on hits: the nearest location is 4.5 ms away instead of 10 ms. The mean response goes from 46.9 ms to 57.2 ms.',
  },
  'origin-shield': {
    ask: 'At 100 locations, 4,390 requests a second reach the origin. Add an origin shield: one mid tier that every location asks on a miss, before the origin, keeping copies for the same 1 minute. How many requests a second reach the origin now?',
    choices: [
      'About 4,400: the shield passes on what the locations miss',
      'About 3,100: back where 20 locations left it',
      'About 910: fewer than with 20 locations and no shield',
    ],
    reveal:
      "About 910: 913 a second. The edge still hits 56.1%, but the shield sees the misses of all 100 locations combined, 4,390 a second, so it keeps warm what no one location can: it answers 34.8% of all requests, and its half-hit rank is the 48,635th, against the edge's 496th. That is exactly what one location serving everyone would send: behind a shield the origin sees one cache, however many locations there are. The mean response falls from 57.2 ms to 28.6 ms.",
  },
  'more-traffic': {
    ask: 'At 10,000 requests a second, 69.2% hit at the edge and 3,080 a second reach the origin. Traffic grows tenfold, to 100,000 requests a second, for the same objects. How many requests a second reach the origin now?',
    choices: [
      'About 31,000: ten times the traffic, ten times the misses',
      'About 13,000: more misses, but far fewer than ten times as many',
      'About 3,100: the edge absorbs the extra requests',
    ],
    reveal:
      'About 13,000: 13,400 a second, 4.3 times as many, not ten. Each object is asked for ten times as often, so each copy is asked for more times before it expires: the edge hit rate rises from 69.2% to 86.6%, and the half-hit rank moves from the 2,481st to the 24,814th. A CDN pays off most for the busiest content. The misses that are left come from the long tail: objects asked for so rarely at any one location that even with ten times the traffic they still miss most of the time.',
  },
  'tracking-parameter': {
    ask: 'With the shield on, 913 requests a second reach the origin. Marketing links now add a tracking parameter with 10 values (?utm_source=…), spread evenly, and the CDN keys its cache on the full URL. The image served is the same. How many requests a second reach the origin now?',
    choices: [
      'About 2,500: the shield still helps, but each copy is asked for a tenth as often',
      'About 5,000: the shield stops helping, as if it were off',
      'About 9,100: ten URLs an image, ten times the misses',
    ],
    reveal:
      'About 2,500: 2,520 a second, up from 913. Each image is now 10 keys, each asked for a tenth as often. At the edge that is the same as ten times the locations (the edge hit rate falls from 69.2% to 50.4%), but unlike more locations the shield cannot undo it: the shield too sees 10 keys an image, each a tenth as often, so it answers 24.4% of all requests, against 21.6% before, far less than the edge lost. The fix is the cache key, not the CDN: drop tracking parameters from it (and sort the rest), and the hit rate comes back.',
  },
};

describe('cdn experiments', () => {
  it('reads as the brief wrote it, every number from the model', () => {
    for (const [id, want] of Object.entries(EXPECTED)) {
      expect(shown[id].ask).toBe(want.ask);
      expect(shown[id].choices).toEqual(want.choices);
      expect(shown[id].reveal).toBe(want.reveal);
    }
    expect(shown['fit-the-origin'].ask).toBe(
      'Your origin serves 10,000 requests a second of images and can take at most 500 a second. Product wants a mean response under 18 ms, and each cache may keep an image at most 5 minutes. Choose the locations, the TTL and the shield.',
    );
    expect(shown['fit-the-origin'].reveal).toBe(
      "The one setting that fits is 100 locations, a 5-minute TTL and the shield. It sends 280 a second to the origin, and the mean response is 17.1 ms. The TTL is as long as the cap allows; the 100 locations bring the edge to 4.5 ms from users but split the traffic, so the edge hits only 69.2%; the shield, seeing every location's misses, gives the origin its load back. With 20 locations the origin takes 280 a second too, but users wait 18.8 ms on average.",
    );
  });

  it('finds the answer from the model, in positions 2, 1, 3, 2, 1', () => {
    expect(CDN_EXPERIMENTS.slice(0, 5).map((e) => shown[e.id].answer + 1)).toEqual([2, 1, 3, 2, 1]);
    expect(shown['fit-the-origin'].answer).toBe(-1);
  });

  it('keeps every digit in a slot, every sentence off a numeral, and no em dash or non-breaking space', () => {
    for (const e of CDN_EXPERIMENTS) {
      for (const t of experimentTemplates(e)) expect(strayDigits(t)).toEqual([]);
      const r = shown[e.id];
      for (const t of [r.ask, ...r.choices, r.reveal]) {
        expect(t).not.toMatch(/(^|[.!?] )\d/);
        expect(t).not.toMatch(/[\u2014\u00a0]/);
        expect(t.replace(/\d{1,3}(,\d{3})+/g, '')).not.toMatch(/\d{4,}/);
      }
    }
  });

  it('makes the word claims true by the model', () => {
    const e1 = CDN_SETUP.objects;
    const a1 = cdnScenario(e1);
    expect(cdnKey(e1, Math.round(a1.edgeKnee)).edge).toBeCloseTo(0.5, 3);
    expect(cdnKey(e1, CDN_OBJECTS).rate * e1.ttl).toBeCloseTo(2.48, 2);
    expect(cdnKey(e1, 2_500).perPop * 60).toBeCloseTo(1, 1);
    expect(a1.lanes[2].edge).toBeLessThan(0.5);
    expect(formatRank(base.edgeKnee)).not.toBe('12,400th');
    const b2 = actOf('more-locations');
    expect(b2.originRps > base.originRps && b2.edgeShare < base.edgeShare && b2.paths.edge < base.paths.edge).toBe(true);
    const a3 = cdnScenario(CDN_SETUP.shield);
    const b3 = actOf('origin-shield');
    expect(b3.edgeShare).toBe(a3.edgeShare);
    expect(b3.originRps).toBeLessThan(base.originRps);
    expect(b3.meanMs).toBeLessThan(a3.meanMs);
    expect(b3.shieldKnee).toBeGreaterThan(50 * b3.edgeKnee);
    for (const s of CDN_SETTINGS.filter((x) => x.shield))
      expect(cdnScenario(s).originRps).toBeCloseTo(cdnScenario({ ...s, pops: 1, shield: 0 }).originRps, 6);
    expect(cdnKey(e1, Math.round(a1.edgeKnee / 2)).perPop * e1.ttl).toBeCloseTo(2, 2);
    const b4 = actOf('more-traffic');
    expect(b4.originRps > base.originRps && b4.originRps < 5 * base.originRps && b4.edgeShare > base.edgeShare).toBe(true);
    const a5 = cdnScenario(CDN_SETUP.tracking);
    const b5 = actOf('tracking-parameter');
    const off5 = cdnScenario({ ...CDN_SETUP.tracking, variants: 10, shield: 0 });
    expect(b5.originRps > a5.originRps && b5.originRps < off5.originRps && b5.shieldShare > 0.2).toBe(true);
    const p200 = cdnScenario({ ...CDN_SETUP.tracking, pops: 200 });
    expect(b5.edgeShare).toBeCloseTo(p200.edgeShare, 9);
    expect(p200.originRps).toBeCloseTo(a5.originRps, 6);
    expect(b5.originRps).toBeGreaterThan(p200.originRps + 1000);
    expect(b5.shieldShare - a5.shieldShare).toBeLessThan(a5.edgeShare - b5.edgeShare);
    for (const id of ['more-locations', 'origin-shield', 'more-traffic', 'tracking-parameter'])
      expect(cdnSig3(actOf(id).originRps)).not.toBe(cdnSig3(base.originRps));
  });

  it('meets the challenge at exactly one of the 192 settings, with margin', () => {
    const pass = CDN_SETTINGS.filter((s) => goalMet(CDN_CHALLENGE_GOAL, cdnScenario(s).metrics, { ...s }));
    expect(pass).toEqual([CDN_CHALLENGE_SOLUTION]);
    const sol = cdnScenario(CDN_CHALLENGE_SOLUTION);
    expect(sol.originRps).toBeLessThan(500 * 0.6);
    expect(sol.meanMs).toBeLessThan(18 * 0.96);
    expect(goalMet(CDN_CHALLENGE_GOAL, sol.metrics, { ...CDN_CHALLENGE_SOLUTION, rps: 1000 })).toBe(false);
    expect(cdnScenario({ ...CDN_CHALLENGE_SOLUTION, pops: 20 }).meanMs).toBeGreaterThan(18);
  });

  it('is the lesson’s widget, with no tryThis left', () => {
    expect(CDN_LESSON.widget.experiments).toBe(CDN_EXPERIMENTS);
    expect(CDN_LESSON.widget.tryThis).toBeUndefined();
  });
});
