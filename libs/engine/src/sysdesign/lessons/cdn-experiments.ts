import { slotOf, word, type ExperimentGoal, type ExperimentSpec } from './experiments.js';
import { cdnRound } from './widgets/cdn-format.js';
import { CDN_BASELINE, CDN_HEAD_RANKS, CDN_OBJECTS, cdnCumShare, cdnHN, cdnScenario, type CdnSettings } from './widgets/cdn.js';

const sig3 = slotOf('sig3');
const about = slotOf('approx');
const share = slotOf('share');
const pathMs = slotOf('pathMs');
const meanMs = slotOf('meanMs');
const rank = slotOf('rank');
const num = slotOf('num');
const ttl = slotOf('ttl');
const ttlA = slotOf('ttlAdj');

/**
 * Each card sets the widget up afresh. E1 asks at a 5-minute TTL, so the load-time stage's half-hit rank is not its
 * answer; E3 and E5 start where their act's other half already is (100 locations, the shield on).
 */
export const CDN_SETUP = {
  objects: { ...CDN_BASELINE, ttl: 300 },
  locations: { ...CDN_BASELINE },
  shield: { ...CDN_BASELINE, pops: 100 },
  traffic: { ...CDN_BASELINE },
  tracking: { ...CDN_BASELINE, shield: 1 },
  challenge: { ...CDN_BASELINE },
} as const satisfies Record<string, CdnSettings>;

export const CDN_CHALLENGE_BOUNDS = { originRps: 500, meanMs: 18, ttl: 300 } as const;
export const CDN_CHALLENGE_GOAL: ExperimentGoal = {
  all: [
    { metric: 'originRps', below: CDN_CHALLENGE_BOUNDS.originRps },
    { metric: 'meanMs', below: CDN_CHALLENGE_BOUNDS.meanMs },
    { metric: 'ttl', atMost: CDN_CHALLENGE_BOUNDS.ttl },
  ],
  keep: { rps: 10_000, variants: 1 },
};
/** The one setting of the 192 that meets the challenge. */
export const CDN_CHALLENGE_SOLUTION: CdnSettings = { rps: 10_000, pops: 100, ttl: 300, shield: 1, variants: 1 };

const run = (s: CdnSettings) => cdnScenario(s);
const after = (s: CdnSettings, set: Partial<CdnSettings>) => run({ ...s, ...set });
const FRACTION: Readonly<Record<number, string>> = { 4: 'a quarter', 5: 'a fifth', 20: 'a twentieth', 100: 'a hundredth' };

export const CDN_EXPERIMENTS: readonly ExperimentSpec[] = [
  {
    id: 'which-objects',
    title: 'Which objects hit',
    setup: CDN_SETUP.objects,
    act: { run: 'timeline' },
    ask: "At {pops} locations with a {ttlAdj} TTL, the object at popularity rank k is asked for about {perRankTotal} ÷ k times a second, spread evenly over the locations. Each location keeps a copy for the TTL after a miss. From about which rank down do most of an object's requests miss at the edge?",
    choices: [
      {
        text: 'From about the {twice}: below it, an object is asked for less than twice per TTL at a location (a miss and a hit)',
        value: 'twice',
      },
      { text: 'From about the {knee}: below it, an object is asked for less than once per TTL at a location', value: 'knee' },
      { text: 'Almost none: across the CDN, even the {lastRank} is asked for about {tailPerTtl} times per TTL', value: 'none' },
    ],
    truth: 'answer',
    reveal:
      "From about the {knee}. A copy lives for the TTL after the miss that fetched it, so what decides a hit is how often its object is asked for at one location within one TTL. Split over {pops} locations, the {knee} most popular object is asked for about once every {ttlWords} at each: one miss, then on average one hit, half its requests. More popular objects hit more often; the {rank25k} hits {lane3Hit} of the time, and the {tailCount} least popular objects, {tailShare} of all requests between them, hit least of all. The green area is the edge's share: {edgeShare}.",
    focus: ['square', 'timeline'],
    hide: ['curve'],
    slots: () => {
      const s = CDN_SETUP.objects;
      const a = run(s);
      const perRankTotal = s.rps / cdnHN() / s.variants;
      const knee = rank(cdnRound(a.edgeKnee, 3));
      return {
        pops: num(s.pops),
        ttlAdj: ttlA(s.ttl),
        ttlWords: ttl(s.ttl),
        perRankTotal: num(Math.round(perRankTotal)),
        twice: rank(cdnRound(a.edgeKnee / 2, 2)),
        knee,
        answer: knee,
        none: word('Almost none'),
        lastRank: rank(CDN_OBJECTS),
        tailPerTtl: num(Number(((perRankTotal / CDN_OBJECTS) * s.ttl).toFixed(1))),
        rank25k: rank(a.lanes[2].rank),
        lane3Hit: share(a.lanes[2].edge),
        tailCount: num(CDN_OBJECTS - CDN_HEAD_RANKS),
        tailShare: share(1 - cdnCumShare(CDN_HEAD_RANKS)),
        edgeShare: share(a.edgeShare),
      };
    },
  },
  {
    id: 'more-locations',
    title: 'More locations',
    setup: CDN_SETUP.locations,
    act: { set: { pops: 100 }, run: 'timeline' },
    ask: 'The CDN serves {rps} requests a second from {pops} locations, and {originRps} a second reach the origin. It moves to {pops2} locations with the same traffic, each nearer its users. How many requests a second reach the origin now?',
    choices: [
      { text: 'About {more}: each location now sees each object less often before its copy expires', value: 'more' },
      { text: 'About {same}: the same requests for the same objects', value: 'same' },
      { text: 'About {fewer}: more caches hold more copies between them', value: 'fewer' },
    ],
    truth: 'outcome',
    reveal:
      'About {more}: {originRps2} a second, up from {originRps}. Every location keeps its own copies, so an object is fetched at most once per location per TTL, not once per CDN. Split over {pops2} locations, each sees each object {popsFraction} as often: the hit rate at the edge falls from {edgeShare} to {edgeShare2}, and the curve moves left (the half-hit rank, from the {knee} to the {knee2}). Users gain on hits: the nearest location is {edgeMs2} away instead of {edgeMs}. The mean response goes from {meanMs} to {meanMs2}.',
    focus: ['tiers', 'square'],
    hide: ['outcome'],
    slots: () => {
      const s = CDN_SETUP.locations;
      const a = run(s);
      const b = after(s, { pops: 100 });
      return {
        rps: num(s.rps),
        pops: num(s.pops),
        pops2: num(100),
        originRps: sig3(a.originRps),
        originRps2: sig3(b.originRps),
        more: about(b.originRps),
        same: about(a.originRps),
        fewer: about(a.originRps * 0.5),
        outcome: about(b.originRps),
        popsFraction: word(FRACTION[100 / s.pops]),
        edgeShare: share(a.edgeShare),
        edgeShare2: share(b.edgeShare),
        knee: rank(a.edgeKnee),
        knee2: rank(b.edgeKnee),
        edgeMs: pathMs(a.paths.edge),
        edgeMs2: pathMs(b.paths.edge),
        meanMs: meanMs(a.meanMs),
        meanMs2: meanMs(b.meanMs),
      };
    },
  },
  {
    id: 'origin-shield',
    title: 'An origin shield',
    setup: CDN_SETUP.shield,
    act: { set: { shield: 1 }, run: 'timeline' },
    ask: 'At {pops} locations, {originRps} requests a second reach the origin. Add an origin shield: one mid tier that every location asks on a miss, before the origin, keeping copies for the same {ttlWords}. How many requests a second reach the origin now?',
    choices: [
      { text: 'About {same}: the shield passes on what the locations miss', value: 'same' },
      { text: 'About {back20}: back where {pops20} locations left it', value: 'back20' },
      { text: 'About {less}: fewer than with {pops20} locations and no shield', value: 'less' },
    ],
    truth: 'outcome',
    reveal:
      "About {less}: {originRps2} a second. The edge still hits {edgeShare}, but the shield sees the misses of all {pops} locations combined, {missRps} a second, so it keeps warm what no one location can: it answers {shieldShare2} of all requests, and its half-hit rank is the {shieldKnee2}, against the edge's {knee}. That is exactly what one location serving everyone would send: behind a shield the origin sees one cache, however many locations there are. The mean response falls from {meanMs} to {meanMs2}.",
    focus: ['tiers', 'square'],
    hide: ['outcome'],
    slots: () => {
      const s = CDN_SETUP.shield;
      const a = run(s);
      const b = after(s, { shield: 1 });
      return {
        pops: num(s.pops),
        pops20: num(20),
        ttlWords: ttl(s.ttl),
        originRps: sig3(a.originRps),
        originRps2: sig3(b.originRps),
        same: about(a.originRps),
        back20: about(run({ ...s, pops: 20 }).originRps),
        less: about(b.originRps),
        outcome: about(b.originRps),
        edgeShare: share(a.edgeShare),
        missRps: sig3(a.missRps),
        shieldShare2: share(b.shieldShare),
        shieldKnee2: rank(b.shieldKnee),
        knee: rank(a.edgeKnee),
        meanMs: meanMs(a.meanMs),
        meanMs2: meanMs(b.meanMs),
      };
    },
  },
  {
    id: 'more-traffic',
    title: 'Ten times the traffic',
    setup: CDN_SETUP.traffic,
    act: { set: { rps: 100_000 }, run: 'timeline' },
    ask: 'At {rps} requests a second, {edgeShare} hit at the edge and {originRps} a second reach the origin. Traffic grows tenfold, to {rps2} requests a second, for the same objects. How many requests a second reach the origin now?',
    choices: [
      { text: 'About {tenfold}: ten times the traffic, ten times the misses', value: 'tenfold' },
      { text: 'About {more}: more misses, but far fewer than ten times as many', value: 'more' },
      { text: 'About {same}: the edge absorbs the extra requests', value: 'same' },
    ],
    truth: 'outcome',
    reveal:
      'About {more}: {originRps2} a second, {growth} times as many, not ten. Each object is asked for ten times as often, so each copy is asked for more times before it expires: the edge hit rate rises from {edgeShare} to {edgeShare2}, and the half-hit rank moves from the {knee} to the {knee2}. A CDN pays off most for the busiest content. The misses that are left come from the long tail: objects asked for so rarely at any one location that even with ten times the traffic they still miss most of the time.',
    focus: ['tiers', 'square'],
    hide: ['outcome'],
    slots: () => {
      const s = CDN_SETUP.traffic;
      const a = run(s);
      const b = after(s, { rps: 100_000 });
      return {
        rps: num(s.rps),
        rps2: num(100_000),
        edgeShare: share(a.edgeShare),
        edgeShare2: share(b.edgeShare),
        originRps: sig3(a.originRps),
        originRps2: sig3(b.originRps),
        tenfold: about(a.originRps * 10),
        more: about(b.originRps),
        same: about(a.originRps),
        outcome: about(b.originRps),
        growth: num(Number((b.originRps / a.originRps).toFixed(1))),
        knee: rank(a.edgeKnee),
        knee2: rank(b.edgeKnee),
      };
    },
  },
  {
    id: 'tracking-parameter',
    title: 'A tracking parameter',
    setup: CDN_SETUP.tracking,
    act: { set: { variants: 10 }, run: 'timeline' },
    ask: 'With the shield on, {originRps} requests a second reach the origin. Marketing links now add a tracking parameter with {variants2} values (?utm_source=…), spread evenly, and the CDN keys its cache on the full URL. The image served is the same. How many requests a second reach the origin now?',
    choices: [
      { text: 'About {split}: the shield still helps, but each copy is asked for a tenth as often', value: 'split' },
      { text: 'About {noShield}: the shield stops helping, as if it were off', value: 'noShield' },
      { text: 'About {tenfold}: ten URLs an image, ten times the misses', value: 'tenfold' },
    ],
    truth: 'outcome',
    reveal:
      'About {split}: {originRps2} a second, up from {originRps}. Each image is now {variants2} keys, each asked for a tenth as often. At the edge that is the same as ten times the locations (the edge hit rate falls from {edgeShare} to {edgeShare2}), but unlike more locations the shield cannot undo it: the shield too sees {variants2} keys an image, each a tenth as often, so it answers {shieldShare2} of all requests, against {shieldShare} before, far less than the edge lost. The fix is the cache key, not the CDN: drop tracking parameters from it (and sort the rest), and the hit rate comes back.',
    focus: ['tiers', 'square'],
    hide: ['outcome'],
    slots: () => {
      const s = CDN_SETUP.tracking;
      const a = run(s);
      const b = after(s, { variants: 10 });
      return {
        originRps: sig3(a.originRps),
        originRps2: sig3(b.originRps),
        variants2: num(10),
        split: about(b.originRps),
        noShield: about(run({ ...s, variants: 10, shield: 0 }).originRps),
        tenfold: about(a.originRps * 10),
        outcome: about(b.originRps),
        edgeShare: share(a.edgeShare),
        edgeShare2: share(b.edgeShare),
        shieldShare: share(a.shieldShare),
        shieldShare2: share(b.shieldShare),
      };
    },
  },
  {
    id: 'fit-the-origin',
    title: 'Challenge: fit the origin',
    setup: CDN_SETUP.challenge,
    goal: CDN_CHALLENGE_GOAL,
    ask: 'Your origin serves {rps} requests a second of images and can take at most {originCap} a second. Product wants a mean response under {msCap}, and each cache may keep an image at most {ttlCap}. Choose the locations, the TTL and the shield.',
    reveal:
      "The one setting that fits is {pops} locations, a {ttlAdj} TTL and the shield. It sends {originRps} a second to the origin, and the mean response is {meanMs}. The TTL is as long as the cap allows; the {pops} locations bring the edge to {edgeMs} from users but split the traffic, so the edge hits only {edgeShare}; the shield, seeing every location's misses, gives the origin its load back. With {pops20} locations the origin takes {origin20} a second too, but users wait {mean20} on average.",
    focus: [],
    hide: [],
    slots: () => {
      const s = CDN_CHALLENGE_SOLUTION;
      const a = run(s);
      const at20 = run({ ...s, pops: 20 });
      return {
        rps: num(CDN_SETUP.challenge.rps),
        originCap: num(CDN_CHALLENGE_BOUNDS.originRps),
        msCap: pathMs(CDN_CHALLENGE_BOUNDS.meanMs),
        ttlCap: ttl(CDN_CHALLENGE_BOUNDS.ttl),
        pops: num(s.pops),
        pops20: num(20),
        ttlAdj: ttlA(s.ttl),
        originRps: sig3(a.originRps),
        meanMs: meanMs(a.meanMs),
        edgeMs: pathMs(a.paths.edge),
        edgeShare: share(a.edgeShare),
        origin20: sig3(at20.originRps),
        mean20: meanMs(at20.meanMs),
      };
    },
  },
];
