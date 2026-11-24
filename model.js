// The CDNs & Edge widget's model, for the mockup (browser) and enum.cjs (Node). The engine port is
// libs/engine/src/sysdesign/lessons/widgets/cdn.ts (`cdnScenario`, replacing `cdnOutcome` in widgets.ts, whose only
// caller is the old widget) and cdn-experiments.ts.
//
// An analytic model of one CDN: `rps` requests a second for 100,000 objects whose popularity follows a Zipf law
// (exponent 1), spread evenly over `pops` edge locations and, when the cache key is not normalized, over `variants`
// URLs an object. Each cache (one per location, and the shield) keeps a copy for `ttl` seconds after the miss that
// fetched it. Requests are independent Poisson streams, so a key requested at rate r at one cache hits with
// probability rT / (1 + rT) (one miss, then on average rT hits, per copy). The shield sees every location's misses
// combined; a location's own earlier misses can never have left it a copy (they are at least a TTL old), so its miss
// hits the shield by the same rule at the other locations' combined miss rate (enum.cjs simulates it). Objects never
// change during their TTL, caches are unlimited, a miss is fetched at once (request collapsing makes requests that
// arrive during a fetch wait for it, not fetch again).
//
// Every number the learner reads comes from the functions here. The old `cdnOutcome`'s edge hit rate, origin share
// and rate are unchanged at every setting without a shield, and its mean response time too at 20 locations. What
// changed: the shield counts only the other locations' misses (the old rule gave one location and a shield 5.4% shield
// hits, where a simulation finds none, since both copies expire together), and users reach the nearest of `pops` locations in 10 ms × √(20 / pops) (users spread evenly over a plane, so
// the nearest of n evenly spread locations is about 1 / √n away), so more locations bring the edge closer and the
// trade the lesson describes appears in the numbers.
(function (root) {
  'use strict';

  const OBJECTS = 100000;
  const RPS = [1000, 10000, 100000];
  const POPS = [1, 5, 20, 100];
  const TTLS = [5, 60, 300, 3600];
  const VARIANTS = [1, 10];
  /** settings: rps, pops, ttl (seconds), shield (1 or 0), variants (URLs an object: 1 normalized, 10 with a tracking parameter). */
  const BASE = { rps: 10000, pops: 20, ttl: 60, shield: 0, variants: 1 };
  const EDGE_MS_AT_20 = 10;
  const SHIELD_MS = 30;
  const ORIGIN_MS = 120;
  /** The timeline's three objects, by popularity rank, and its window in TTLs. */
  const LANE_RANKS = [1, 2500, 25000];
  const WINDOW_TTLS = 5;

  // H_k and the request share of objects 1..k, exact.
  const H = new Float64Array(OBJECTS + 1);
  for (let k = 1; k <= OBJECTS; k++) H[k] = H[k - 1] + 1 / k;
  const HN = H[OBJECTS];
  const share = (k) => 1 / k / HN;
  const cumShare = (k) => H[k] / HN;

  const hit = (rate, ttl) => (rate * ttl) / (1 + rate * ttl);
  const edgeMs = (pops) => EDGE_MS_AT_20 * Math.sqrt(20 / pops);

  /** One key's rates and hit probabilities: object `k`, one of its URLs. */
  function key(s, k) {
    const rate = (s.rps * share(k)) / s.variants; // one URL, all locations, per second
    const perPop = rate / s.pops;
    const edge = hit(perPop, s.ttl);
    const toShield = rate * (1 - edge); // every location's misses of this URL, combined
    // A location that misses fetched its last copy at least a TTL ago, so only the other locations' misses can have
    // left a copy at the shield: they arrive at (P - 1) / P of the combined rate (enum.cjs: the simulation agrees).
    const shieldHit = s.shield ? hit((toShield * (s.pops - 1)) / s.pops, s.ttl) : 0;
    return { rate, perPop, edge, toShield, shieldHit, perTtl: perPop * s.ttl, shieldPerTtl: toShield * s.ttl };
  }

  const cache = new Map();
  /** Everything the stage reads at one setting. */
  function scenario(s) {
    const id = `${s.rps}/${s.pops}/${s.ttl}/${s.shield}/${s.variants}`;
    if (cache.has(id)) return cache.get(id);
    // F[k]: share of all requests answered at the edge by objects 1..k (G: by the shield), for exact areas.
    const F = new Float64Array(OBJECTS + 1);
    const G = new Float64Array(OBJECTS + 1);
    for (let k = 1; k <= OBJECTS; k++) {
      const q = key(s, k);
      F[k] = F[k - 1] + share(k) * q.edge;
      G[k] = G[k - 1] + share(k) * (1 - q.edge) * q.shieldHit;
    }
    const edgeShare = F[OBJECTS];
    const shieldShare = G[OBJECTS];
    const originShare = 1 - edgeShare - shieldShare;
    const e = edgeMs(s.pops);
    const paths = { edge: e, shield: e + SHIELD_MS, origin: e + (s.shield ? SHIELD_MS : 0) + ORIGIN_MS };
    const meanMs = edgeShare * paths.edge + shieldShare * paths.shield + originShare * paths.origin;
    // The rank whose copies hit half the time: asked for once per TTL at each location (rT = 1).
    const edgeKnee = (s.rps * s.ttl) / (HN * s.variants * s.pops);
    // At the shield, the other locations' misses: rT (1 - h) (P - 1) / P = 1 with h the edge's, so rT = P / (P - 2).
    const shieldKnee = s.shield && s.pops > 2 ? (s.rps * s.ttl * (s.pops - 2)) / (HN * s.variants * s.pops) : 0;
    const out = {
      s,
      edgeShare,
      shieldShare,
      originShare,
      rps: s.rps,
      perPopRps: s.rps / s.pops,
      edgeRps: s.rps * edgeShare,
      shieldRps: s.rps * shieldShare,
      missRps: s.rps * (1 - edgeShare),
      originRps: s.rps * originShare,
      paths,
      meanMs,
      edgeKnee,
      shieldKnee,
      F,
      G,
      lanes: LANE_RANKS.map((k) => ({ rank: k, ...key(s, k) })),
    };
    cache.set(id, out);
    return out;
  }

  /** Request share position (0..1) of the boundary after object k. */
  const xOfRank = (k) => cumShare(Math.min(OBJECTS, Math.max(0, Math.round(k))));
  /** Exact areas: share of requests answered at the edge (and shield) by the objects in [0, x). */
  function areaTo(sc, x) {
    let lo = 0;
    let hi = OBJECTS;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (cumShare(mid) <= x) lo = mid;
      else hi = mid - 1;
    }
    const k = lo; // objects 1..k lie wholly left of x
    if (k >= OBJECTS) return { edge: sc.F[OBJECTS], shield: sc.G[OBJECTS] };
    const part = (x - cumShare(k)) / share(k + 1);
    return {
      edge: sc.F[k] + part * (sc.F[k + 1] - sc.F[k]),
      shield: sc.G[k] + part * (sc.G[k + 1] - sc.G[k]),
    };
  }
  /** The square's columns: for n equal columns, each column's edge and shield height (exact column means). */
  function columns(sc, n) {
    const out = [];
    let prev = { edge: 0, shield: 0 };
    for (let i = 1; i <= n; i++) {
      const cur = areaTo(sc, i / n);
      const w = 1 / n;
      out.push({ edge: (cur.edge - prev.edge) / w, shield: (cur.shield - prev.shield) / w });
      prev = cur;
    }
    return out;
  }

  // A seeded sample of one location's requests for the three lane objects, over WINDOW_TTLS TTLs, and of the shield.
  function mulberry32(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const expo = (rand, rate) => -Math.log(1 - rand()) / rate;
  /** Above this many requests in the window a lane draws its hits as a band, not ticks (bounded by the track's width). */
  const DENSE = 160;

  /**
   * One lane: this location's requests for one URL of object `rank`, in steady state. Copies start at a miss and last
   * the TTL; a copy alive at time 0 began earlier (age uniform over the TTL, the renewal process's stationary state).
   * Dense lanes keep only their misses and copies (the hits between are counted by the model, drawn as a band).
   */
  function laneSample(sc, lane, rand) {
    const T = sc.s.ttl;
    const W = WINDOW_TTLS * T;
    const r = lane.perPop;
    const dense = r * W > DENSE;
    const copies = [];
    const reqs = [];
    let t;
    let copyEnd;
    if (rand() < lane.edge) {
      copyEnd = rand() * T;
      copies.push({ from: copyEnd - T, to: copyEnd, earlier: true });
      t = 0;
    } else {
      copyEnd = -Infinity;
      t = 0;
    }
    let misses = 0;
    let hits = 0;
    if (dense) {
      // From each expiry, the next request is a miss after Exp(r).
      t = copyEnd > 0 ? copyEnd : 0;
      for (;;) {
        t += expo(rand, r);
        if (t >= W) break;
        reqs.push({ at: t, hit: false });
        misses++;
        copies.push({ from: t, to: t + T });
        t += T;
      }
    } else {
      for (;;) {
        t += expo(rand, r);
        if (t >= W) break;
        if (t < copyEnd) {
          reqs.push({ at: t, hit: true });
          hits++;
        } else {
          reqs.push({ at: t, hit: false });
          misses++;
          copyEnd = t + T;
          copies.push({ from: t, to: copyEnd });
        }
      }
    }
    return { rank: lane.rank, dense, reqs, copies, hits, misses, expected: r * W };
  }

  /**
   * The shield's view of one lane's object: every location's misses for it, this location's marked. The others'
   * misses are Poisson at the model's combined rate; there are at most about P per TTL, so all are simulated, and a
   * lane with more than DENSE of them draws them as a band.
   */
  function shieldSample(sc, lane, own, rand) {
    const T = sc.s.ttl;
    const W = WINDOW_TTLS * T;
    const others = lane.toShield * ((sc.s.pops - 1) / sc.s.pops);
    const arrivals = own.reqs.filter((q) => !q.hit).map((q) => ({ at: q.at, own: true }));
    if (others > 0) {
      let t = 0;
      for (;;) {
        t += expo(rand, others);
        if (t >= W) break;
        arrivals.push({ at: t, own: false });
      }
    }
    arrivals.sort((a, b) => a.at - b.at);
    const copies = [];
    let copyEnd = -Infinity;
    if (rand() < lane.shieldHit) {
      copyEnd = rand() * T;
      copies.push({ from: copyEnd - T, to: copyEnd, earlier: true });
    }
    let ownHits = 0;
    let ownMisses = 0;
    for (const a of arrivals) {
      a.hit = a.at < copyEnd;
      if (!a.hit) {
        copyEnd = a.at + T;
        copies.push({ from: a.at, to: copyEnd });
      }
      if (a.own) a.hit ? ownHits++ : ownMisses++;
    }
    const dense = arrivals.length - (ownHits + ownMisses) > DENSE;
    return { dense, arrivals: dense ? arrivals.filter((a) => a.own) : arrivals, copies, ownHits, ownMisses, othersCount: arrivals.length - ownHits - ownMisses };
  }

  /**
   * The drawn sample at a setting: the first seed (from 1) whose lanes look like their model: each sparse lane's request
   * count within max(1, 30%) of its expectation, its hit share within 0.2 of the model's where it has 5 or more
   * requests, and with the shield on, its misses' shield hit share within 0.3 where 4 or more reach the shield. The
   * sample is an illustration; the words beside it are the model's.
   */
  function sample(sc) {
    for (let seed = 1; seed <= 400; seed++) {
      const rand = mulberry32(seed * 7919 + sc.s.pops * 31 + sc.s.ttl);
      const lanes = sc.lanes.map((lane) => {
        const own = laneSample(sc, lane, rand);
        const sh = sc.s.shield ? shieldSample(sc, lane, own, rand) : null;
        return { ...own, shield: sh };
      });
      const ok = lanes.every((l, i) => {
        const m = sc.lanes[i];
        if (!l.dense) {
          const n = l.hits + l.misses;
          if (Math.abs(n - l.expected) > Math.max(1, 0.3 * l.expected)) return false;
          if (n >= 5 && Math.abs(l.hits / n - m.edge) > 0.2) return false;
        }
        if (l.shield) {
          const n = l.shield.ownHits + l.shield.ownMisses;
          if (n >= 4 && Math.abs(l.shield.ownHits / n - m.shieldHit) > 0.3) return false;
        }
        return true;
      });
      if (ok) return { seed, lanes, window: WINDOW_TTLS * sc.s.ttl };
    }
    return null;
  }

  // Words. Every number the learner reads is formatted here, so the stage, the summary, Describe and the experiments
  // print the same figure.
  const group = (n) => Math.round(n).toLocaleString('en-US');
  /** Three significant figures, thousands separated: 3,077 → 3,080; 886; 26. */
  function sig3(n) {
    if (n >= 1000) {
      const p = 10 ** (Math.floor(Math.log10(n)) - 2);
      return group(Math.round(n / p) * p);
    }
    if (n >= 100) return group(n);
    if (n >= 10) return String(Math.round(n));
    return n.toFixed(1).replace(/\.0$/, '');
  }
  /** Two significant figures, for "about": 4,392 → 4,400. */
  function sig2(n) {
    const p = 10 ** Math.max(0, Math.floor(Math.log10(n)) - 1);
    return group(Math.round(n / p) * p);
  }
  const pct = (x) => {
    const v = x * 100;
    if (v >= 99.95 && v < 100) return '99.9%+';
    if (v > 0 && v < 0.05) return 'under 0.1%';
    return `${v.toFixed(1)}%`;
  };
  const ms = (v) => `${v.toFixed(1).replace(/\.0$/, '')} ms`;
  const rate = (v) => `${sig3(v)}/s`;
  const ord = (n) => {
    const r = Math.round(n);
    const t = r % 100;
    const suffix = t >= 11 && t <= 13 ? 'th' : { 1: 'st', 2: 'nd', 3: 'rd' }[r % 10] ?? 'th';
    return `${group(r)}${suffix}`;
  };
  const ttlWords = (t) => ({ 5: '5 seconds', 60: '1 minute', 300: '5 minutes', 3600: '1 hour' })[t];
  const ttlAdj = (t) => ({ 5: '5-second', 60: '1-minute', 300: '5-minute', 3600: '1-hour' })[t];
  const ttlShort = (t) => ({ 5: '5 s', 60: '1 min', 300: '5 min', 3600: '1 h' })[t];
  /** A time on the timeline's axis. */
  function clock(sec) {
    if (sec === 0) return '0';
    if (sec < 60) return `${Math.round(sec)} s`;
    if (sec < 3600) return `${+(sec / 60).toFixed(1)} min`;
    return `${+(sec / 3600).toFixed(1)} h`;
  }
  /** How often one key is asked for at one location: "41 a second", "1.2 a minute", "once every 10 minutes". */
  function often(perSec) {
    if (perSec >= 1.5) return `${sig3(perSec)} times a second`;
    if (perSec >= 1) return 'about once a second';
    if (perSec * 60 >= 59.5) return `${sig3(perSec * 60)} times a minute`;
    if (perSec * 60 >= 1.5) return `${sig3(perSec * 60)} times a minute`;
    if (perSec * 60 >= 1) return 'about once a minute';
    if (perSec * 3600 >= 1) {
      const every = 1 / (perSec * 60);
      return every < 1.5 ? 'about once a minute' : `once every ${Math.round(every)} minutes`;
    }
    const every = 1 / (perSec * 3600);
    return every < 1.5 ? 'about once an hour' : `once every ${Math.round(every)} hours`;
  }

  // The experiments. Templates hold no digit outside a {slot}; enum.cjs checks it and prints every slot's value.
  const EXPERIMENTS = [
    {
      id: 1,
      title: 'Which objects hit',
      setup: { ...BASE, ttl: 300 },
      act: { run: 'timeline' },
      hide: ['curve'],
      ask: 'At {pops} locations with a {ttlAdj} TTL, the object at popularity rank k is asked for about {perRankTotal} ÷ k times a second, spread evenly over the locations. Each location keeps a copy for the TTL after a miss. From about which rank down do most of an object\'s requests miss at the edge?',
      choices: [
        { text: 'From about the {wrongSecond}: below it, an object is asked for less than once a second at a location', right: false },
        { text: 'From about the {wrongMinute}: below it, an object is asked for less than once a minute at a location', right: false },
        { text: 'From about the {knee}: below it, an object is asked for less than once per TTL at a location', right: true },
      ],
      reveal:
        'From about the {knee}. A copy lives for the TTL after the miss that fetched it, so what decides a hit is how often its object is asked for at one location within one TTL. Split over {pops} locations, the {knee} most popular object is asked for about once every {ttlWords} at each: one miss, then on average one hit, half its requests. More popular objects hit more often; the {rank25k} hits {lane3Hit} of the time, and the {tailCount} least popular objects, {tailShare} of all requests between them, hit least of all. The green area is the edge\'s share: {edgeShare}.',
      focus: ['square', 'timeline'],
    },
    {
      id: 2,
      title: 'More locations',
      setup: { ...BASE },
      act: { set: { pops: 100 }, run: 'timeline' },
      hide: ['outcome'],
      ask: 'The CDN serves {rps} requests a second from {pops} locations, and {originRps} a second reach the origin. It moves to {pops2} locations with the same traffic, each nearer its users. How many requests a second reach the origin now?',
      choices: [
        { text: 'About {more}: each location now sees each object less often before its copy expires', right: true },
        { text: 'About {same}: the same requests for the same objects', right: false },
        { text: 'About {fewer}: more caches hold more copies between them', right: false },
      ],
      reveal:
        'About {more}: {originRps2} a second, up from {originRps}. Every location keeps its own copies, so an object is fetched once per location per TTL, not once per CDN. Split over {pops2} locations, each sees each object {popsFraction} as often: the hit rate at the edge falls from {edgeShare} to {edgeShare2}, and the curve moves left (the half-hit rank, from the {knee} to the {knee2}). Users gain on hits: the nearest location is {edgeMs2} away instead of {edgeMs}. The mean response goes from {meanMs} to {meanMs2}.',
      focus: ['tiers', 'square'],
    },
    {
      id: 3,
      title: 'An origin shield',
      setup: { ...BASE, pops: 100 },
      act: { set: { shield: 1 }, run: 'timeline' },
      hide: ['outcome'],
      ask: 'At {pops} locations, {originRps} requests a second reach the origin. Add an origin shield: one mid tier that every location asks on a miss, before the origin, keeping copies for the same {ttlWords}. How many requests a second reach the origin now?',
      choices: [
        { text: 'About {same}: the shield passes on what the locations miss', right: false },
        { text: 'About {back20}: back where {pops20} locations left it', right: false },
        { text: 'About {less}: fewer than with {pops20} locations and no shield', right: true },
      ],
      reveal:
        'About {less}: {originRps2} a second. The edge hit rate does not move ({edgeShare}), but the shield\'s one cache sees the misses of all {pops} locations combined, {missRps} a second, so it keeps warm objects that no single location is asked for often enough: it answers {shieldShare2} of all requests, and its half-hit rank is the {shieldKnee2}, against the edge\'s {knee}. That is about what {pops20} locations and a shield send the origin ({at20Shield} a second): with a shield, origin load hardly depends on the number of locations. A shield hit costs {shieldMsExtra} more than an edge hit, but the mean response falls from {meanMs} to {meanMs2}, because far fewer requests cross to the origin.',
      focus: ['tiers', 'square'],
    },
    {
      id: 4,
      title: 'Ten times the traffic',
      setup: { ...BASE },
      act: { set: { rps: 100000 }, run: 'timeline' },
      hide: ['outcome'],
      ask: 'At {rps} requests a second, {edgeShare} hit at the edge and {originRps} a second reach the origin. Traffic grows tenfold, to {rps2} requests a second, for the same objects. How many requests a second reach the origin now?',
      choices: [
        { text: 'About {tenfold}: ten times the traffic, ten times the misses', right: false },
        { text: 'About {more4}: more misses, but far fewer than ten times as many', right: true },
        { text: 'About {same}: the edge absorbs the extra requests', right: false },
      ],
      reveal:
        'About {more4}: {originRps2} a second, {growth} times as many, not ten. Each object is asked for ten times as often, so its copy is asked for again sooner before it expires: the edge hit rate rises from {edgeShare} to {edgeShare2}, and the half-hit rank moves from the {knee} to the {knee2}. A CDN pays off most for the busiest content. The misses that are left come from the long tail: objects asked for so rarely at any one location that even ten times the traffic leaves most of their copies cold.',
      focus: ['tiers', 'square'],
    },
    {
      id: 5,
      title: 'A tracking parameter',
      setup: { ...BASE, shield: 1 },
      act: { set: { variants: 10 }, run: 'timeline' },
      hide: ['outcome'],
      ask: 'With the shield on, {originRps} requests a second reach the origin. Marketing links now add a tracking parameter with {variants2} values (?utm_source=…), spread evenly, and the CDN keys its cache on the full URL. The image served is the same. How many requests a second reach the origin now?',
      choices: [
        { text: 'About {split}: the shield still helps, but each copy is asked for a tenth as often', right: true },
        { text: 'About {noShield}: the shield stops helping, as if it were off', right: false },
        { text: 'About {tenfold}: ten URLs an image, ten times the misses', right: false },
      ],
      reveal:
        'About {split}: {originRps2} a second, up from {originRps}. Each image is now {variants2} keys, each asked for a tenth as often, at the edge and at the shield alike: to a cache that is the same as ten times the locations. The edge hit rate falls from {edgeShare} to {edgeShare2}; the shield still answers {shieldShare2}, but of far colder keys. The fix is the cache key, not the CDN: drop tracking parameters from it (and sort the rest), and the hit rate comes back.',
      focus: ['tiers', 'square'],
    },
  ];

  const CHALLENGE = {
    id: 6,
    title: 'Fit the origin',
    setup: { ...BASE },
    keep: { rps: 10000, variants: 1 },
    goal: [
      { metric: 'originRps', below: 500, unit: 'rate' },
      { metric: 'meanMs', below: 18, unit: 'ms' },
      { metric: 'ttl', atMost: 300, unit: 'ttl' },
    ],
    ask: 'Your origin serves {rps} requests a second of images and can take at most {originCap} a second. Product wants a mean response under {msCap}, and images may be at most {ttlCapWords} stale. Choose the locations, the TTL and the shield.',
    reveal:
      '{pops} locations, a {ttlAdj} TTL and the shield: {originRps} a second reach the origin and the mean response is {meanMs}. The TTL is as long as freshness allows; the {pops} locations bring the edge to {edgeMs} from users but split the traffic, so the edge hits only {edgeShare}; the shield, seeing every location\'s misses, gives the origin its load back. With {pops20} locations the origin takes {origin20}, but users wait {mean20} on average.',
  };

  /** Slot values for an experiment at its setup (s1) and after its act (s2). */
  function slots(exp, s1, s2) {
    const a = scenario(s1);
    const b = s2 ? scenario(s2) : null;
    const perRankTotal = s1.rps / HN / s1.variants;
    const knee = a.edgeKnee;
    const v = {
      rps: group(s1.rps),
      rps2: b && group(s2.rps),
      pops: String(s1.pops),
      pops2: b && String(s2.pops),
      pops20: '20',
      variants2: b && String(s2.variants),
      ttlWords: ttlWords(s1.ttl),
      ttlAdj: ttlAdj(s1.ttl),
      ttlCapWords: '5 minutes',
      perRankTotal: group(perRankTotal),
      originRps: sig3(a.originRps),
      originRps2: b && sig3(b.originRps),
      edgeShare: pct(a.edgeShare),
      edgeShare2: b && pct(b.edgeShare),
      shieldShare2: b && pct(b.shieldShare),
      missRps: sig3(a.missRps),
      meanMs: ms(a.meanMs),
      meanMs2: b && ms(b.meanMs),
      edgeMs: ms(a.paths.edge),
      edgeMs2: b && ms(b.paths.edge),
      knee: ord(knee),
      knee2: b && ord(b.edgeKnee),
      shieldKnee2: b && ord(b.shieldKnee),
      shieldMsExtra: ms(SHIELD_MS),
      rank25k: ord(25000),
      lane3Hit: pct(a.lanes[2].edge),
      tailCount: group(90000),
      tailShare: pct(1 - cumShare(10000)),
      popsFraction: b && ({ 5: 'a fifth', 4: 'a quarter', 20: 'a twentieth', 100: 'a hundredth' })[s2.pops / s1.pops],
      growth: b && (b.originRps / a.originRps).toFixed(1),
      originCap: '500',
      msCap: '18 ms',
    };
    if (exp.id === 1) {
      v.wrongSecond = ord(sig2n(perRankTotal / s1.pops));
      v.wrongMinute = ord(sig2n((perRankTotal * 60) / s1.pops));
      v.knee = ord(sig3n(knee));
    }
    if (b) {
      v.same = sig2(a.originRps);
      v.more = sig2(b.originRps);
      v.fewer = sig2(a.originRps * 0.5);
      v.less = sig2(b.originRps);
      v.back20 = sig2(scenario({ ...s1, pops: 20 }).originRps);
      v.at20Shield = sig3(scenario({ ...s2, pops: 20 }).originRps);
      v.tenfold = sig2(a.originRps * 10);
      v.more4 = sig2(b.originRps);
      v.noShield = sig2(scenario({ ...s2, shield: 0 }).originRps);
      v.split = sig2(b.originRps);
    }
    return v;
  }
  function sig2n(n) {
    const p = 10 ** Math.max(0, Math.floor(Math.log10(n)) - 1);
    return Math.round(n / p) * p;
  }
  function sig3n(n) {
    const p = 10 ** Math.max(0, Math.floor(Math.log10(n)) - 2);
    return Math.round(n / p) * p;
  }
  function challengeSlots(s) {
    const a = scenario(s);
    const at20 = scenario({ ...s, pops: 20 });
    return {
      rps: group(s.rps),
      originCap: '500',
      msCap: '18 ms',
      ttlCapWords: '5 minutes',
      pops: String(s.pops),
      pops20: '20',
      ttlWords: ttlWords(s.ttl),
      ttlAdj: ttlAdj(s.ttl),
      originRps: sig3(a.originRps),
      meanMs: ms(a.meanMs),
      edgeMs: ms(a.paths.edge),
      edgeShare: pct(a.edgeShare),
      origin20: `${sig3(at20.originRps)} a second`,
      mean20: ms(at20.meanMs),
    };
  }
  const fill = (template, values) =>
    template.replace(/\{(\w+)\}/g, (_, name) => {
      if (values[name] == null) throw new Error(`missing slot ${name}`);
      return values[name];
    });
  function afterAct(exp) {
    return exp.act.set ? { ...exp.setup, ...exp.act.set } : null;
  }
  function goalParts(s) {
    const a = scenario(s);
    const v = { originRps: a.originRps, meanMs: a.meanMs, ttl: s.ttl };
    const parts = CHALLENGE.goal.map((g) => ({
      ...g,
      value: v[g.metric],
      met: g.below != null ? v[g.metric] < g.below : v[g.metric] <= g.atMost,
    }));
    const kept = Object.entries(CHALLENGE.keep).every(([k, val]) => s[k] === val);
    return { parts, kept, met: kept && parts.every((p) => p.met) };
  }
  const SETTINGS = [];
  for (const rps of RPS)
    for (const pops of POPS)
      for (const ttl of TTLS) for (const shield of [0, 1]) for (const variants of VARIANTS) SETTINGS.push({ rps, pops, ttl, shield, variants });

  const api = {
    OBJECTS,
    RPS,
    POPS,
    TTLS,
    VARIANTS,
    BASE,
    EDGE_MS_AT_20,
    SHIELD_MS,
    ORIGIN_MS,
    LANE_RANKS,
    WINDOW_TTLS,
    DENSE,
    HN,
    H,
    SETTINGS,
    EXPERIMENTS,
    CHALLENGE,
    share,
    cumShare,
    hit,
    edgeMs,
    key,
    scenario,
    xOfRank,
    areaTo,
    columns,
    sample,
    mulberry32,
    slots,
    challengeSlots,
    fill,
    afterAct,
    goalParts,
    fmt: { group, sig3, sig2, pct, ms, rate, ord, ttlWords, ttlAdj, ttlShort, clock, often },
  };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CdnModel = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
