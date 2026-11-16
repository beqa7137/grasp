// The Capacity & Scaling widget's model, for the mockup (browser) and enum.cjs (Node). The engine port replaces
// `pipeline()` in libs/engine/src/sysdesign/lessons/widgets.ts with libs/engine/src/sysdesign/lessons/widgets/capacity.ts
// (its only caller was the old widget) and adds capacity-experiments.ts beside the lesson.
//
// A request stream passes three tiers in order: load balancers, app servers, then the database (one primary for writes,
// read replicas for reads, a cache in front of the reads). Each tier is a set of instances with a per-instance limit in
// its own unit; one request costs a fixed amount of work at each tier, so a tier's limit in requests a second is its
// capacity divided by that cost. A tier passes what it can and sheds the rest; a request shed at one tier costs nothing
// below it, and the tiers above it did its work. The database admits a request only when both the primary and the
// replicas have room for it (one admission for the pair, since every request needs both). Every number the learner
// reads comes from `run`.
(function (root) {
  'use strict';

  /** Per-instance limits: load balancers and app servers in requests a second, database machines in queries a second. */
  const LB_RPS = 5000;
  const APP_RPS = 1500;
  /** Each app server's worker pool; a request holds one worker for its whole time. */
  const WORKERS = 100;
  const REQUEST_MS = 50;
  const SLOW_MS = 500;
  /** One request's work at the database: 2 queries, 90% of them reads; the cache serves 90% of reads when it is on. */
  const READS = 1.8;
  const WRITES = 0.2;
  const HIT = 0.9;
  const ZONES = 3;
  /** Database machine sizes: 8,000 queries a second is the largest machine on offer. Replicas match the primary. */
  const SIZES = [4000, 8000];
  const TRAFFIC = [1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000, 10000, 12000, 14000, 16000, 18000, 20000];
  const LB_MAX = 6;
  const APP_MAX = 21;
  const REP_MAX = 6;
  /** The shared axis, in requests a second: it holds the longest lane at any setting (the primary's write ceiling,
   * 8,000 / 0.2), so no lane is ever cut and every instance that is up is drawn at its true width. */
  const AXIS_MAX = 40000;
  /** The cache runs one node in each zone, so losing a zone keeps its hit rate; it counts as that many machines. */
  const CACHE_NODES = 3;

  const BASE = { traffic: 8000, lb: 2, app: 4, size: 8000, replicas: 2, cache: 0, zone: 0, slow: 0 };

  /**
   * Zone A is the largest failure domain: instances are spread A, B, C, A, ... so it holds ceil(n / 3) load balancers
   * and app servers, and the primary. Replicas start in zone B (B, C, A, ...), so it holds floor(n / 3) of them. When
   * zone A fails, a surviving replica is promoted to primary; with none, every write fails.
   */
  function zoneLoss(s) {
    if (!s.zone) return { lb: 0, app: 0, replicas: 0, primary: false };
    return { lb: Math.ceil(s.lb / ZONES), app: Math.ceil(s.app / ZONES), replicas: Math.floor(s.replicas / ZONES), primary: true };
  }

  const ZONE_NAMES = ['A', 'B', 'C'];
  /** The zone of a tier's i-th instance: load balancers and app servers A, B, C, A, ...; replicas B, C, A, B, ... */
  const zoneOf = (tier, i) => ZONE_NAMES[(tier === 'replicas' ? i + 1 : i) % ZONES];
  /**
   * A tier's instances in drawn order, zone B first, then C, then A, so where zone A's group starts on the lane is the
   * limit that survives zone A. Each instance keeps a stable id (tier, zone, index within the zone). With zone A down its
   * group is lost, and a promoted replica (the last survivor in drawn order) leaves the replicas for the primary.
   */
  function zoneLane(tier, n, zoneDown) {
    const all = Array.from({ length: n }, (_, i) => ({ zone: zoneOf(tier, i) }));
    const seen = { A: 0, B: 0, C: 0 };
    for (const x of all) x.id = `${tier}-${x.zone}${seen[x.zone]++}`;
    const order = ['B', 'C', 'A'].flatMap((z) => all.filter((x) => x.zone === z));
    if (!zoneDown) return { order, up: order, lost: [], promoted: null };
    const up = order.filter((x) => x.zone !== 'A');
    const lost = order.filter((x) => x.zone === 'A');
    const promoted = tier === 'replicas' && up.length ? up[up.length - 1] : null;
    return { order, up: promoted ? up.slice(0, -1) : up, lost, promoted };
  }

  function run(settings) {
    const s = { ...BASE, ...settings };
    const lost = zoneLoss(s);
    const lbUp = s.lb - lost.lb;
    const appUp = s.app - lost.app;
    let repUp = s.replicas - lost.replicas;
    const promoted = lost.primary && repUp > 0;
    const outage = lost.primary && !promoted;
    if (promoted) repUp -= 1;

    const ms = s.slow ? SLOW_MS : REQUEST_MS;
    const workerRps = (WORKERS * 1000) / ms;
    const perApp = Math.min(APP_RPS, workerRps);
    const misses = READS * (s.cache ? 1 - HIT : 1);
    const hits = READS - misses;
    const primaryCost = repUp > 0 ? WRITES : WRITES + misses;
    const replicaCost = repUp > 0 ? WRITES + misses / repUp : null;

    const lb = { id: 'lb', n: s.lb, up: lbUp, lost: lost.lb, each: LB_RPS, ceiling: lbUp * LB_RPS };
    const app = {
      id: 'app',
      n: s.app,
      up: appUp,
      lost: lost.app,
      ms,
      workers: WORKERS,
      cpuEach: APP_RPS,
      workerEach: workerRps,
      each: perApp,
      bound: workerRps < APP_RPS ? 'workers' : 'cpu',
      ceiling: appUp * perApp,
    };
    const primary = {
      id: 'primary',
      size: s.size,
      lost: lost.primary,
      promoted,
      outage,
      cost: primaryCost,
      ceiling: outage ? 0 : s.size / primaryCost,
    };
    const replicas = {
      id: 'replicas',
      n: s.replicas,
      up: repUp,
      lost: lost.replicas + (promoted ? 1 : 0),
      cost: replicaCost,
      ceiling: repUp > 0 ? s.size / replicaCost : Infinity,
    };

    const offered = s.traffic;
    lb.arriving = offered;
    lb.passed = Math.min(lb.arriving, lb.ceiling);
    app.arriving = lb.passed;
    app.passed = Math.min(app.arriving, app.ceiling);
    const dbCeiling = Math.min(primary.ceiling, replicas.ceiling);
    const binding = replicas.ceiling < primary.ceiling ? 'replicas' : 'primary';
    const dbArriving = app.passed;
    const served = Math.min(dbArriving, dbCeiling);
    for (const t of [lb, app]) {
      t.shed = t.arriving - t.passed;
      t.util = t.ceiling > 0 ? Math.min(1, t.arriving / t.ceiling) : t.arriving > 0 ? 1 : 0;
    }
    // Inside the database one admission decides; its lanes carry what it admitted.
    primary.arriving = dbArriving;
    primary.passed = served;
    primary.shed = binding === 'primary' ? dbArriving - served : 0;
    primary.util = outage ? (dbArriving > 0 ? 1 : 0) : (served * primaryCost) / s.size;
    primary.writesUtil = outage ? 0 : (served * WRITES) / s.size;
    primary.readsUtil = outage ? 0 : primary.util - primary.writesUtil;
    replicas.arriving = dbArriving;
    replicas.passed = served;
    replicas.shed = binding === 'replicas' ? dbArriving - served : 0;
    replicas.util = repUp > 0 ? (served * replicaCost) / s.size : 0;
    replicas.replayUtil = repUp > 0 ? (served * WRITES) / s.size : 0;
    replicas.readsUtil = replicas.util - replicas.replayUtil;
    replicas.readsEach = repUp > 0 ? (served * misses) / repUp : 0;

    // Workers in flight on each app server (Little's law: in flight = rate x time), and what the arriving load would need.
    app.inFlight = appUp > 0 ? ((app.passed / appUp) * ms) / 1000 : 0;
    app.need = appUp > 0 ? ((app.arriving / appUp) * ms) / 1000 : 0;
    app.cpuUtil = appUp > 0 ? app.passed / (appUp * APP_RPS) : 0;

    const tiers = [lb, app, primary, replicas];
    const lanes = repUp > 0 ? tiers : tiers.slice(0, 3);
    // The bottleneck is the smallest limit: it caps what is served. The next is the smallest of the rest.
    const limits = [
      { id: 'lb', ceiling: lb.ceiling },
      { id: 'app', ceiling: app.ceiling },
      { id: binding, ceiling: dbCeiling },
    ];
    const order = [...limits].sort((a, b) => a.ceiling - b.ceiling);
    const bottleneck = order[0].id;
    const next = order[1].ceiling < Infinity ? order[1].id : null;
    const busiest = lanes.reduce((a, t) => (t.util > a.util + 1e-12 ? t : a), lanes[0]).id;
    const maxUtil = Math.max(...lanes.map((t) => t.util));

    return {
      settings: s,
      offered,
      lb,
      app,
      primary,
      replicas,
      tiers,
      lanes,
      reads: READS,
      writes: WRITES,
      misses,
      hits,
      dbArriving,
      dbCeiling,
      binding,
      served,
      shed: offered - served,
      bottleneck,
      next,
      busiest,
      maxUtil,
      limitOf: (id) => limits.find((l) => l.id === id)?.ceiling ?? (id === 'primary' ? primary.ceiling : replicas.ceiling),
      machines: s.lb + s.app + 1 + s.replicas + CACHE_NODES * s.cache,
    };
  }

  /** The challenge's measures: shed now, headroom on the busiest tier, shed after losing zone A, machines. */
  function metrics(r) {
    const z = run({ ...r.settings, zone: 1 });
    return { shed: r.shed, headroom: (1 - r.maxUtil) * 100, zoneShed: z.shed, machines: r.machines, zone: z };
  }

  /** The stops a ramp steps through, from one traffic to another, and the first stop where a tier sheds. */
  function rampPlan(s, from, to) {
    const stops = TRAFFIC.filter((t) => t >= from && t <= to);
    const runs = stops.map((t) => run({ ...s, traffic: t }));
    const climax = runs.findIndex((r) => r.shed > 1e-9);
    return { stops, runs, climax, full: climax >= 0 ? runs[climax].bottleneck : null };
  }

  // ---------------------------------------------------------------- formatting (the engine's, experiments.ts)
  const trim = (v, d) => String(Number(v.toFixed(d)));
  const GROUPED = new Intl.NumberFormat('en-US');
  const group = (v) => GROUPED.format(Math.round(v));
  const formatPct = (v) => `${trim(v, 1)}%`;
  const formatQps = (v) => `${v < 10 ? trim(v, 1) : group(v)}/s`;
  const formatTimes = (v) => `${v < 10 ? trim(v, 1) : group(v)}×`;
  const formatMs = (v) => `${v < 10 ? trim(v, 2) : group(v)} ms`;
  const formatNum = (v) => (Number.isInteger(v) ? group(v) : trim(v, 2));
  const FORMAT = { pct: formatPct, qps: formatQps, times: formatTimes, ms: formatMs, num: formatNum };
  const formatSlot = (slot) => (slot.unit === 'word' ? slot.value : FORMAT[slot.unit](slot.value));
  const slotOf = (unit) => (value) => ({ value, unit });
  const word = (value) => ({ value, unit: 'word' });
  const pct = slotOf('pct');
  const qps = slotOf('qps');
  const times = slotOf('times');
  const ms = slotOf('ms');
  const num = slotOf('num');
  /** A count the model computes in floating point: a whole number, or the template is lying. */
  const count = (v) => {
    if (Math.abs(v - Math.round(v)) > 1e-6) throw new Error(`${v} is not a whole count`);
    return num(Math.round(v));
  };
  function fillTemplate(t, slots) {
    return t.replace(/\{(\w+)\}/g, (_, k) => {
      if (!slots[k]) throw new Error(`No slot "${k}" for "${t}"`);
      return formatSlot(slots[k]);
    });
  }
  const ALLOWED = ['p99', '100 requests', 'the 99th of 100', 'N+1'];
  function strayDigits(t) {
    let rest = t.replace(/\{\w+\}/g, '');
    for (const p of ALLOWED) rest = rest.split(p).join('');
    return rest.match(/\d+/g) ?? [];
  }
  /** A share as a percentage of one decimal, rounded to the whole percent a choice states. */
  const roundPct = (u) => Math.round(u * 100);
  const roundK = (v) => Math.round(v / 1000) * 1000;

  // ---------------------------------------------------------------- experiments
  const SETUP = {
    tenfold: { traffic: 1000, lb: 2, app: 4, size: 8000, replicas: 0, cache: 0, zone: 0, slow: 0 },
    cache: { traffic: 10000, lb: 3, app: 8, size: 8000, replicas: 0, cache: 0, zone: 0, slow: 0 },
    replay: { traffic: 20000, lb: 6, app: 20, size: 8000, replicas: 2, cache: 1, zone: 0, slow: 0 },
    zone: { traffic: 10000, lb: 3, app: 9, size: 8000, replicas: 3, cache: 1, zone: 0, slow: 0 },
    slow: { traffic: 6000, lb: 2, app: 6, size: 8000, replicas: 2, cache: 1, zone: 0, slow: 0 },
    challenge: { traffic: 16000, lb: 2, app: 8, size: 4000, replicas: 0, cache: 0, zone: 0, slow: 0 },
  };
  const CHALLENGE_BOUNDS = { headroom: 30, machines: 29 };
  const CHALLENGE_GOAL = {
    all: [
      { metric: 'shed', below: 1 },
      { metric: 'headroom', atLeast: CHALLENGE_BOUNDS.headroom },
      { metric: 'zoneShed', below: 1 },
      { metric: 'machines', below: CHALLENGE_BOUNDS.machines + 1 },
    ],
    keep: { traffic: 16000, zone: 0, slow: 0 },
  };
  /** The one setting of the challenge's 3,528 that meets it. */
  const CHALLENGE_SOLUTION = { lb: 6, app: 17, size: 8000, replicas: 2, cache: 1 };
  const after = (spec) => run({ ...spec.setup, ...(spec.act?.set ?? {}) });
  const TIER_WORD = { lb: 'load balancers', app: 'app servers', primary: 'database', replicas: 'database' };

  const EXPERIMENTS = [
    {
      id: 'tenfold',
      title: 'Ten times the traffic',
      setup: SETUP.tenfold,
      act: { set: { traffic: 10000 }, run: 'ramp' },
      ask: 'Today {today} requests a second arrive, and every tier has room to spare. Each request passes a load balancer and an app server, then makes {queries} queries to the database. Traffic grows {growth}, to {target}. Which tier runs out first?',
      choices: [
        { text: 'The load balancers: {lbN} of {lbEach} each', value: 'lb' },
        { text: 'The app servers: {appN} of {appEach} each', value: 'app' },
        { text: 'The database: one primary of {size} queries/s', value: 'db' },
      ],
      truth: 'first',
      reveal:
        'The database, at {dbLimit}: each request costs it {queries} queries, so its {size} queries a second carry only {dbLimitN} requests a second, fewer than the app servers’ {appLimit} or the load balancers’ {lbLimit}. Compare tiers by their limit in requests a second, never by their raw size. At {target} only {served} are served: the app servers, full at {appLimit}, shed {appShed}, and the database sheds {dbShed} more. Cache the reads or add replicas first; the app servers come next, and the load balancers end exactly {lbBusy} busy.',
      focus: ['db', 'sink'],
      hide: ['db'],
      slots: () => {
        const a = run(SETUP.tenfold);
        const b = after(EXPERIMENTS[0]);
        const plan = rampPlan(SETUP.tenfold, SETUP.tenfold.traffic, b.offered);
        return {
          today: num(a.offered),
          queries: num(READS + WRITES),
          growth: times(b.offered / a.offered),
          target: qps(b.offered),
          lbN: num(a.lb.n),
          lbEach: qps(LB_RPS),
          appN: num(a.app.n),
          appEach: qps(APP_RPS),
          size: num(a.settings.size),
          lb: word('lb'),
          app: word('app'),
          db: word('db'),
          first: word(plan.full === 'lb' || plan.full === 'app' ? plan.full : 'db'),
          dbLimit: qps(a.dbCeiling),
          dbLimitN: count(a.dbCeiling),
          appLimit: qps(a.app.ceiling),
          lbLimit: qps(a.lb.ceiling),
          served: qps(b.served),
          appShed: qps(b.app.shed),
          dbShed: qps(b.primary.shed + b.replicas.shed),
          lbBusy: pct(b.lb.util * 100),
        };
      },
    },
    {
      id: 'cache',
      title: 'Cache the reads',
      setup: SETUP.cache,
      act: { set: { cache: 1 }, run: 'flow' },
      ask: 'The database tops out at {before}. Each request makes {reads} reads and {writes} writes, {queries} queries in all, against its {size} queries a second. Put a cache in front of the reads, and {hit} of them hit it. How many requests a second can the database take now?',
      choices: [
        { text: 'About {two}: twice as many', value: 'two' },
        { text: 'About {afterRound}: {ratioRound} as many', value: 'afterRound' },
        { text: '{ten}: {tenX} as many, like the hit rate', value: 'ten' },
      ],
      truth: 'afterRound',
      reveal:
        '{after}, {ratio} as many: the cache answers {hits} of each request’s {reads} reads, so only {misses} reads and the {writes} writes reach the database, {cost} queries a request instead of {queries}. Its {size} queries a second now serve {after}, not the {ten} a {hit} hit rate suggests: writes never hit a cache. All {traffic} are served now, and the app servers, {appBusy} busy, are the busiest tier.',
      focus: ['db'],
      hide: ['after'],
      slots: () => {
        const a = run(SETUP.cache);
        const b = after(EXPERIMENTS[1]);
        return {
          before: qps(a.dbCeiling),
          reads: num(READS),
          writes: num(WRITES),
          queries: num(READS + WRITES),
          size: num(a.settings.size),
          hit: pct(HIT * 100),
          two: qps(a.dbCeiling * 2),
          afterRound: qps(roundK(b.dbCeiling)),
          ratioRound: times(Math.round(b.dbCeiling / a.dbCeiling)),
          ten: qps(a.dbCeiling * 10),
          tenX: times(10),
          after: qps(b.dbCeiling),
          ratio: times(b.dbCeiling / a.dbCeiling),
          hits: num(b.hits),
          misses: num(b.misses),
          cost: num(b.primary.cost),
          traffic: qps(b.offered),
          appBusy: pct(b.app.util * 100),
        };
      },
    },
    {
      id: 'replay',
      title: 'Two more replicas',
      setup: SETUP.replay,
      act: { set: { replicas: 4 }, run: 'flow' },
      ask: 'At {traffic}, the database takes {writesN} writes a second and, after the cache, {readsN} reads. The {repBefore} read replicas share the reads, each {before} busy. Add {added} more. How busy is each replica now?',
      choices: [
        { text: 'About {afterRound}: a little less', value: 'afterRound' },
        { text: 'About {half}: half as busy', value: 'half' },
        { text: '{before}: unchanged, each holds every row', value: 'before' },
      ],
      truth: 'afterRound',
      reveal:
        '{after}: every replica replays every write, {writesN} a second, which takes {replay} of its {size} queries a second however many replicas share the reads. Only the {readsN} reads a second split: {readsBeforeN} each with {repBefore} replicas, {readsAfterN} with {repAfter}. Twice the replicas raise their limit from {limitBefore} to {limitAfter}, {gain} more, and no number of them passes {writeCeiling}, where replaying the writes alone fills a replica. Replicas scale reads, not writes.',
      focus: ['replicas'],
      hide: ['after', 'replay'],
      slots: () => {
        const a = run(SETUP.replay);
        const b = after(EXPERIMENTS[2]);
        return {
          traffic: qps(a.offered),
          writesN: count(a.served * WRITES),
          readsN: count(a.served * a.misses),
          repBefore: num(a.replicas.up),
          repAfter: num(b.replicas.up),
          added: num(b.replicas.up - a.replicas.up),
          before: pct(a.replicas.util * 100),
          after: pct(b.replicas.util * 100),
          afterRound: pct(roundPct(b.replicas.util)),
          half: pct(roundPct(a.replicas.util / 2)),
          replay: pct(b.replicas.replayUtil * 100),
          size: num(a.settings.size),
          readsBeforeN: count(a.replicas.readsEach),
          readsAfterN: count(b.replicas.readsEach),
          limitBefore: qps(a.replicas.ceiling),
          limitAfter: qps(b.replicas.ceiling),
          gain: pct((b.replicas.ceiling / a.replicas.ceiling - 1) * 100),
          writeCeiling: qps(a.settings.size / WRITES),
        };
      },
    },
    {
      id: 'zone',
      title: 'Lose a zone',
      setup: SETUP.zone,
      act: { set: { zone: 1 }, run: 'flow' },
      ask: 'The load balancers and app servers are spread evenly over zones A, B and C, and no tier runs above {maxBusy}; all {traffic} are served. Zone A fails with every instance in it, and a replica takes over from the primary. How many requests a second are shed?',
      choices: [
        { text: 'None: every tier has {spare} to spare', value: 'none' },
        { text: 'About {third}: a third, the zone’s share', value: 'third' },
        { text: '{shed}: a tenth', value: 'shed' },
      ],
      truth: 'shed',
      reveal:
        '{shed}, a tenth: the {appLeft} app servers left can take {appLimit}, so the {appBusy} they ran at becomes {appOver} of what they can serve. Losing one zone of three multiplies the load on what is left by {factor} when a tier is spread evenly, so size every tier so that what survives the largest zone still carries the peak. The load balancers end exactly {lbAfter} busy, with nothing to spare. The database loses its primary and a replica yet keeps room: a replica became the primary (writes fail for the seconds that takes), and the one left runs at {repAfter}.',
      focus: ['app', 'lb'],
      hide: ['after', 'zones'],
      slots: () => {
        const a = run(SETUP.zone);
        const b = after(EXPERIMENTS[3]);
        return {
          maxBusy: pct(a.maxUtil * 100),
          spare: pct((1 - a.maxUtil) * 100),
          traffic: qps(a.offered),
          none: qps(0),
          third: qps(Math.round(a.offered / ZONES / 100) * 100),
          shed: qps(b.shed),
          appLeft: num(b.app.up),
          appLimit: qps(b.app.ceiling),
          appBusy: pct(a.app.util * 100),
          appOver: pct((b.app.arriving / b.app.ceiling) * 100),
          factor: times(ZONES / (ZONES - 1)),
          lbAfter: pct(b.lb.util * 100),
          repAfter: pct(b.replicas.util * 100),
        };
      },
    },
    {
      id: 'slow',
      title: 'A slow database',
      setup: SETUP.slow,
      act: { set: { slow: 1 }, run: 'flow' },
      ask: 'Each app server has {workers} workers, and a request holds one for its whole {fast}: at {traffic}, {inFlight} of each server’s {workers} are busy. Lock waits on a hot row make every request take {slow}, though the database does no more work. How many requests a second are served?',
      choices: [
        { text: '{served}: a fifth', value: 'served' },
        { text: '{traffic}: all of them, each one slower', value: 'traffic' },
        { text: '{tenth}: a tenth, like the slowdown', value: 'tenth' },
      ],
      truth: 'served',
      reveal:
        '{served}, a fifth: requests in flight equal throughput times time (Little’s law). Each server’s {workers} workers hold at most {workers} requests at once, and at {slow} each that is {perServer}; {appN} servers serve {served}. The other {shed} are shed at the app servers while their CPUs sit {cpu} busy: waiting on the database used up the workers in front of it. An autoscaler watching CPU sees {cpu} and adds nothing: scale and load-test on pool saturation and latency. Serving {traffic} at {slow} needs {need} requests in flight. Set timeouts, fix the lock contention, and shed load early rather than only growing the pool.',
      focus: ['app', 'workers'],
      hide: ['after'],
      slots: () => {
        const a = run(SETUP.slow);
        const b = after(EXPERIMENTS[4]);
        return {
          workers: num(WORKERS),
          fast: ms(REQUEST_MS),
          slow: ms(SLOW_MS),
          traffic: qps(a.offered),
          inFlight: count(a.app.inFlight),
          served: qps(b.served),
          tenth: qps(a.offered / 10),
          perServer: qps(b.app.each),
          appN: num(b.app.up),
          shed: qps(b.shed),
          cpu: pct(b.app.cpuUtil * 100),
          need: count((b.offered * SLOW_MS) / 1000),
        };
      },
    },
    {
      id: 'challenge',
      title: 'Challenge: {target} with a zone to spare',
      setup: SETUP.challenge,
      ask: 'Serve {target} with every tier keeping at least {headroom} headroom, nothing shed when zone A fails, and at most {machines} machines in all; a cache runs a node in each of the {zones} zones.',
      goal: CHALLENGE_GOAL,
      reveal:
        'The fleet that fits: {lbN} load balancers, {appN} app servers, a primary of {size} queries/s, {repN} replicas and the cache’s {zones} nodes, {fleet} machines; the busiest tier runs at {maxBusy}. Zone A holds {lbA} of the load balancers and {appA} of the app servers, so losing it leaves {lbLeft} load balancers {lbZone} busy and {appLeft} app servers {appZone} busy, while one replica takes over as primary and the other carries every read at {repZone}. With {appFewer} app servers zone A would hold {appFewerA}, and the {appFewerLeft} left would shed {appFewerShed}; with no replica the primary would fall with its zone and every write with it.',
      focus: ['lb', 'app', 'db'],
      hide: [],
      slots: () => {
        const sol = run({ ...SETUP.challenge, ...CHALLENGE_SOLUTION });
        const z = metrics(sol).zone;
        const fewer = metrics(run({ ...SETUP.challenge, ...CHALLENGE_SOLUTION, app: CHALLENGE_SOLUTION.app - 1 })).zone;
        return {
          target: qps(SETUP.challenge.traffic),
          headroom: pct(CHALLENGE_BOUNDS.headroom),
          machines: num(CHALLENGE_BOUNDS.machines),
          fleet: num(sol.machines),
          zones: num(ZONES),
          maxBusy: pct(sol.maxUtil * 100),
          lbA: num(z.lb.lost),
          appA: num(z.app.lost),
          appFewerA: num(fewer.app.lost),
          appFewerLeft: num(fewer.app.up),
          lbN: num(sol.lb.n),
          appN: num(sol.app.n),
          size: num(sol.settings.size),
          repN: num(sol.replicas.n),
          lbLeft: num(z.lb.up),
          lbZone: pct(z.lb.util * 100),
          appLeft: num(z.app.up),
          appZone: pct(z.app.util * 100),
          repZone: pct(z.replicas.util * 100),
          appFewer: num(CHALLENGE_SOLUTION.app - 1),
          appFewerShed: qps(fewer.shed),
        };
      },
    },
  ];

  function renderExperiment(spec) {
    const slots = spec.slots();
    const fill = (t) => fillTemplate(t, slots);
    const choices = (spec.choices ?? []).map((c) => fill(c.text));
    let answer = -1;
    if (spec.choices && spec.truth) {
      const truth = fill(`{${spec.truth}}`);
      const matches = spec.choices.flatMap((c, i) => (fill(`{${c.value}}`) === truth ? [i] : []));
      if (matches.length !== 1) throw new Error(`${spec.id}: ${matches.length} choices equal the model's ${truth}`);
      answer = matches[0];
    }
    return { id: spec.id, title: fill(spec.title), ask: fill(spec.ask), choices, answer, reveal: fill(spec.reveal), slots, focus: spec.focus, hide: spec.hide ?? [] };
  }

  const boundMet = (b, v) => ('below' in b ? v < b.below : v >= b.atLeast);
  const goalKept = (goal, s) => Object.entries(goal.keep ?? {}).every(([k, v]) => s[k] === v);
  const goalMet = (goal, s, m) => goalKept(goal, s) && goal.all.every((b) => boundMet(b, m[b.metric]));

  const api = {
    LB_RPS,
    APP_RPS,
    WORKERS,
    REQUEST_MS,
    SLOW_MS,
    READS,
    WRITES,
    HIT,
    ZONES,
    SIZES,
    TRAFFIC,
    LB_MAX,
    APP_MAX,
    REP_MAX,
    AXIS_MAX,
    CACHE_NODES,
    ZONE_NAMES,
    zoneOf,
    zoneLane,
    BASE,
    SETUP,
    TIER_WORD,
    run,
    metrics,
    rampPlan,
    zoneLoss,
    formatPct,
    formatQps,
    formatTimes,
    formatMs,
    formatNum,
    formatSlot,
    fillTemplate,
    strayDigits,
    group,
    EXPERIMENTS,
    CHALLENGE_GOAL,
    CHALLENGE_BOUNDS,
    CHALLENGE_SOLUTION,
    renderExperiment,
    goalMet,
    goalKept,
    boundMet,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CapacityModel = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
