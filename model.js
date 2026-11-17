// The Reliability widget's model, for the mockup (browser) and enum.cjs (Node). The engine port is
// libs/engine/src/sysdesign/lessons/widgets/reliability.ts (the model), reliability-sample.ts (the simulated year) and
// reliability-experiments.ts; `chainAvailability` in widgets.ts is retired with the old widget, its only caller.
//
// Every number the learner reads comes from the closed forms here. The simulated year is separate, seeded and labelled
// as one year: its counts are never quoted as the model's availability.
(function (root) {
  'use strict';

  // ---------------------------------------------------------------- the fixed world
  const YEAR_H = 8760;
  /** The SLO window the lesson uses: 30 days, 43,200 minutes. */
  const MONTH_H = 720;
  const WEEKS = 52;
  /** Every copy of every part: down 1 h for every 999 h up. */
  const COPY_U = 0.001;
  const MTTR_H = 1;
  const CYCLE_H = MTTR_H / COPY_U;
  const MTBF_H = CYCLE_H - MTTR_H;
  const FAILS_PER_YEAR = YEAR_H / CYCLE_H;
  /** With shared failures on, this share of a copy's downtime comes from a cause every copy of its part shares. */
  const BETA = 0.1;
  /** With failover on, traffic takes this long to move off the copy in use when it dies. */
  const FAILOVER_MIN = 5;
  const FAILOVER_H = FAILOVER_MIN / 60;
  const COPIES = [1, 2, 3];
  const PARTS = [
    { id: 'lb', name: 'Load balancer', short: 'LB', the: 'the load balancer', many: 'load balancers', one: 'load balancer' },
    { id: 'app', name: 'App servers', short: 'App', the: 'the app servers', many: 'app servers', one: 'app server' },
    { id: 'db', name: 'Database', short: 'DB', the: 'the database', many: 'databases', one: 'database' },
    { id: 'recs', name: 'Recommendations', short: 'Recs', the: 'recommendations', many: 'recommendations services', one: 'recommendations service' },
  ];
  const BASE = { lb: 2, app: 3, db: 1, recs: 1, optional: 0, shared: 0, failover: 0 };

  // ---------------------------------------------------------------- the exact model
  /**
   * One part: `n` identical copies, any one of which can serve.
   * - One copy: down whenever it is, COPY_U of the time.
   * - Shared failures: a cause that takes every copy at once is down BETA x COPY_U of the time; a copy's own cause makes
   *   up the rest, so that each copy is still exactly COPY_U down: (1 - own)(1 - shared) = 1 - COPY_U.
   * - All copies down on their own causes at once: own^n (independent copies: unavailabilities multiply).
   * - Failover: each time the copy in use dies on its own while another is up, the part is down for FAILOVER_H. The
   *   copy in use is the first that is up, so this is the first copy's outages: one every own cycle (MTTR_H / own).
   *   For 2 copies this is exact for the process enum.cjs simulates; for 3 it leaves out a backup dying while it serves
   *   (2 s a year), which the simulation includes and cannot tell apart.
   * The part is up when the shared cause is not active and neither of the other two holds.
   */
  function partModel(n, shared, failover) {
    const paper = COPY_U ** n;
    if (n === 1) {
      return { n, u: COPY_U, paper, causes: { single: COPY_U, shared: 0, failover: 0, overlap: 0 }, failsPerYear: FAILS_PER_YEAR, failovers: 0, sharedPerYear: 0, overlapsPerYear: 0, ownPerYear: FAILS_PER_YEAR };
    }
    const uShared = shared ? BETA * COPY_U : 0;
    const uOwn = 1 - (1 - COPY_U) / (1 - uShared);
    const ownPerYear = (YEAR_H * uOwn) / MTTR_H;
    const all = uOwn ** n;
    const fo = failover ? ((FAILOVER_H * uOwn) / MTTR_H) * (1 - uOwn ** (n - 1)) : 0;
    const causes = { single: 0, shared: uShared, failover: (1 - uShared) * fo, overlap: (1 - uShared) * all };
    const u = causes.shared + causes.failover + causes.overlap;
    const sharedPerYear = (YEAR_H * uShared) / MTTR_H;
    const failovers = failover ? ownPerYear * (1 - uOwn ** (n - 1)) : 0;
    const overlapsPerYear = n * ownPerYear * uOwn ** (n - 1);
    return { n, u, paper, causes, failsPerYear: sharedPerYear + failovers + overlapsPerYear, failovers, sharedPerYear, overlapsPerYear, ownPerYear };
  }

  const hoursAYear = (u) => u * YEAR_H;
  const nines = (u) => -Math.log10(u);
  /** 1 - the product of (1 - u), without losing the small ones. */
  const seriesU = (us) => -Math.expm1(us.reduce((s, u) => s + Math.log1p(-u), 0));

  /** The whole request: every part that is not optional must be up, and parts fail independently of each other. */
  function chain(settings) {
    const s = { ...BASE, ...settings };
    const parts = PARTS.map((p) => {
      const m = partModel(s[p.id], s.shared, s.failover);
      const optional = p.id === 'recs' && !!s.optional;
      return { ...p, ...m, copies: s[p.id], optional, downH: hoursAYear(m.u), paperDownH: hoursAYear(m.paper), nines: nines(m.u), paperNines: nines(m.paper) };
    });
    const hard = parts.filter((p) => !p.optional);
    const u = seriesU(hard.map((p) => p.u));
    const paperU = seriesU(hard.map((p) => p.paper));
    const worst = Math.max(...hard.map((p) => p.u));
    const weakest = hard.filter((p) => p.u >= worst * (1 - 1e-9)).map((p) => p.id);
    return {
      settings: s,
      parts,
      u,
      availability: 1 - u,
      nines: nines(u),
      downH: hoursAYear(u),
      monthH: u * MONTH_H,
      paperU,
      paperDownH: hoursAYear(paperU),
      weakest,
      /** The part the band rests on: the weakest, and of several tied the last in the chain. */
      focusPart: weakest[weakest.length - 1],
      failsPerYear: hard.reduce((t, p) => t + p.failsPerYear, 0),
      copies: parts.reduce((t, p) => t + p.copies, 0),
    };
  }
  const run = chain;

  // ---------------------------------------------------------------- the simulated year
  function mulberry32(a) {
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function poisson(rand, mean) {
    const limit = Math.exp(-mean);
    let k = 0;
    let p = rand();
    while (p > limit) {
      k++;
      p *= rand();
    }
    return k;
  }
  function shuffled(rand, n) {
    const a = Array.from({ length: n }, (_, i) => i);
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  /**
   * The draws behind every setting's year (common random numbers: a setting only chooses which of them show).
   * Each copy slot gets `own` outages (Poisson, the 90% that are its own) and `extra` ones (Poisson, the 10% that shared
   * failures turn into the part's shared outages). An outage is an hour in one of the year's 52 weeks. The first copies'
   * outages take different weeks across the whole chain, and a part's copies never share a week, so no two ticks that
   * are not one shared outage ever stand in one column: two copies of a part are never down together by chance in this
   * year (the model's average is one such overlap in 57 years for a pair). Returns null when the weeks run out.
   */
  function draws(seed) {
    const rand = mulberry32(seed);
    const counts = PARTS.map(() => [0, 1, 2].map(() => ({ own: poisson(rand, FAILS_PER_YEAR * (1 - BETA)), extra: poisson(rand, FAILS_PER_YEAR * BETA) })));
    const firsts = shuffled(rand, WEEKS);
    let next = 0;
    const out = [];
    for (let p = 0; p < PARTS.length; p++) {
      const used = new Set();
      const copies = [];
      for (let i = 0; i < 3; i++) {
        const c = counts[p][i];
        let weeks;
        if (i === 0) {
          weeks = firsts.slice(next, next + c.own + c.extra);
          next += c.own + c.extra;
          if (next > WEEKS) return null;
        } else {
          weeks = shuffled(rand, WEEKS)
            .filter((w) => !used.has(w))
            .slice(0, c.own + c.extra);
          if (weeks.length < c.own + c.extra) return null;
        }
        for (const w of weeks) used.add(w);
        copies.push({ own: weeks.slice(0, c.own).sort((a, b) => a - b), extra: weeks.slice(c.own).sort((a, b) => a - b) });
      }
      out.push(copies);
    }
    return out;
  }
  const drawCache = new Map();
  const drawsOf = (seed) => {
    if (!drawCache.has(seed)) drawCache.set(seed, draws(seed));
    return drawCache.get(seed);
  };

  /**
   * One simulated year at a setting. Per part: each copy's outages (week, and whether it is a shared one), and what
   * reached the request: `outage` (a single copy down, 1 h), `shared` (every copy down at once, 1 h), `failover` (the
   * copy in use died, FAILOVER_MIN until traffic moved). An optional part's outages are `bypassed`. The request's
   * failures are the union over the parts it needs.
   */
  function sample(settings, seed = api.SAMPLE_SEED) {
    const s = { ...BASE, ...settings };
    const d = drawsOf(seed);
    const parts = PARTS.map((p, pi) => {
      const n = s[p.id];
      const optional = p.id === 'recs' && !!s.optional;
      const sharedOn = !!s.shared && n >= 2;
      const rows = [];
      for (let i = 0; i < n; i++) {
        const c = d[pi][i];
        const ticks = c.own.map((week) => ({ week, shared: false }));
        if (sharedOn) for (const week of d[pi][0].extra) ticks.push({ week, shared: true });
        else for (const week of c.extra) ticks.push({ week, shared: false });
        rows.push(ticks.sort((a, b) => a.week - b.week));
      }
      const events = [];
      for (const t of rows[0]) {
        if (n === 1) events.push({ week: t.week, kind: 'outage', hours: MTTR_H });
        else if (t.shared) events.push({ week: t.week, kind: 'shared', hours: MTTR_H });
        else if (s.failover) events.push({ week: t.week, kind: 'failover', hours: FAILOVER_H });
      }
      const absorbed = [];
      rows.forEach((r, i) => {
        for (const t of r) if (!events.some((e) => e.week === t.week)) absorbed.push({ week: t.week, copy: i });
      });
      absorbed.sort((a, b) => a.week - b.week);
      return { id: p.id, n, optional, rows, events: events.map((e) => ({ ...e, part: p.id, bypassed: optional })), absorbed };
    });
    const fails = parts
      .filter((p) => !p.optional)
      .flatMap((p) => p.events)
      .sort((a, b) => a.week - b.week);
    return { parts, fails, count: fails.length, hours: fails.reduce((t, e) => t + e.hours, 0) };
  }

  /**
   * The moment the band rests on: the first failure of the request that the focus part causes, of the kind that costs
   * that part the most (a single copy's outage; else a shared outage before a failover); with no such failure, the first
   * outage of the focus part's first copy, which another copy absorbed.
   */
  function restMoment(settings, seed = api.SAMPLE_SEED) {
    const m = chain(settings);
    const smp = sample(settings, seed);
    const part = smp.parts.find((p) => p.id === m.focusPart);
    for (const kind of ['outage', 'shared', 'failover']) {
      const e = part.events.find((x) => x.kind === kind);
      if (e) return { week: e.week, part: part.id, kind, copy: 0, fails: true, hours: e.hours };
    }
    const a = part.absorbed.find((x) => x.copy === 0) ?? part.absorbed[0];
    return a ? { week: a.week, part: part.id, kind: 'absorbed', copy: a.copy, fails: false, hours: MTTR_H } : null;
  }

  /** Screen time: the year sweeps in SWEEP_MS, and the clock holds HOLD_MS on each moment the band acts out. */
  const SWEEP_MS = 5200;
  const HOLD_MS = 1100;
  /**
   * A free play holds on the first event of each kind the year has (absorbed, failover, shared, outage), in time order.
   * An answer's play holds once, on its climax: the first event in a part the act changed, a shared outage before a
   * failover before an absorbed outage of its first copy (so a new second database is seen carrying the request the
   * first time the first one dies); with no part changed, the rest moment. Returns the holds and a monotone map from
   * screen time to model time (weeks).
   */
  function answerHold(settings, changed, seed = api.SAMPLE_SEED) {
    const smp = sample(settings, seed);
    const parts = smp.parts.filter((p) => (changed ?? []).includes(p.id) && !p.optional);
    for (const kind of ['shared', 'failover', 'outage']) {
      const e = parts.flatMap((p) => p.events.filter((x) => x.kind === kind)).sort((a, b) => a.week - b.week)[0];
      if (e) return { week: e.week, part: e.part, kind, copy: 0, fails: true, hours: e.hours };
    }
    const a = parts.flatMap((p) => p.absorbed.filter((x) => x.copy === 0).map((x) => ({ ...x, part: p.id }))).sort((x, y) => x.week - y.week)[0];
    return a ? { week: a.week, part: a.part, kind: 'absorbed', copy: 0, fails: false, hours: MTTR_H } : restMoment(settings, seed);
  }
  function playPlan(settings, answer = false, changed = null, seed = api.SAMPLE_SEED) {
    const smp = sample(settings, seed);
    let holds = [];
    if (answer) {
      const h = answerHold(settings, changed, seed);
      holds = h ? [h] : [];
    } else {
      const firstOf = (kind) => smp.fails.find((e) => e.kind === kind);
      const hard = smp.parts.filter((p) => !p.optional);
      const firstAbsorbed = hard.flatMap((p) => p.absorbed.map((a) => ({ ...a, part: p.id }))).sort((a, b) => a.week - b.week)[0];
      for (const kind of ['outage', 'shared', 'failover']) {
        const e = firstOf(kind);
        if (e) holds.push({ week: e.week, part: e.part, kind, copy: 0, fails: true, hours: e.hours });
      }
      if (firstAbsorbed) holds.push({ week: firstAbsorbed.week, part: firstAbsorbed.part, kind: 'absorbed', copy: firstAbsorbed.copy, fails: false, hours: MTTR_H });
      holds.sort((a, b) => a.week - b.week);
    }
    const total = SWEEP_MS + holds.length * HOLD_MS;
    /** Model time (weeks, 0 to 52) at a screen time; `hold` is the moment the band acts out then, if any. */
    const at = (ms) => {
      let t = Math.max(0, Math.min(total, ms));
      let spent = 0;
      for (const h of holds) {
        const reach = ((h.week + 0.5) / WEEKS) * SWEEP_MS + spent;
        if (t < reach) break;
        if (t < reach + HOLD_MS) return { weeks: h.week + 0.5, hold: h, into: (t - reach) / HOLD_MS };
        spent += HOLD_MS;
      }
      return { weeks: ((t - spent) / SWEEP_MS) * WEEKS, hold: null, into: 0 };
    };
    return { holds, total, at };
  }

  // ---------------------------------------------------------------- the search for the year's seed
  const EXPERIMENT_SETTINGS = () => ({
    series: { lb: 1, app: 1, db: 1, recs: 1, optional: 0, shared: 0, failover: 0 },
    parallelBefore: { lb: 1, app: 1, db: 1, recs: 1, optional: 1, shared: 0, failover: 0 },
    parallelAfter: { lb: 1, app: 1, db: 2, recs: 1, optional: 1, shared: 0, failover: 0 },
    weakestBefore: { lb: 2, app: 2, db: 1, recs: 1, optional: 1, shared: 0, failover: 0 },
    weakestAfter: { lb: 2, app: 3, db: 1, recs: 1, optional: 1, shared: 0, failover: 0 },
    pairs: { lb: 2, app: 2, db: 2, recs: 1, optional: 1, shared: 0, failover: 0 },
    sharedAfter: { lb: 2, app: 2, db: 2, recs: 1, optional: 1, shared: 1, failover: 0 },
    failoverAfter: { lb: 2, app: 2, db: 2, recs: 1, optional: 1, shared: 0, failover: 1 },
    challenge: { lb: 2, app: 3, db: 1, recs: 1, optional: 0, shared: 1, failover: 1 },
    solution: { lb: 2, app: 2, db: 2, recs: 1, optional: 1, shared: 1, failover: 1 },
    base: { ...BASE },
  });
  /**
   * The hard bounds a seed must meet, each with its value (enum.cjs prints them and fails if SAMPLE_SEED misses one).
   * They keep the one drawn year typical where a learner compares it with the model: counts beside the averages they
   * stand next to, one shared outage a part (the average is 0.88), and each experiment's climax away from the year's ends.
   */
  function seedBounds(seed) {
    const d = drawsOf(seed);
    if (!d) return [{ name: 'the weeks do not run out', ok: false, value: 'ran out' }];
    const firstCount = d.map((part) => part[0].own.length + part[0].extra.length);
    const others = d.flatMap((part) => part.slice(1).map((c) => c.own.length + c.extra.length));
    const E = EXPERIMENT_SETTINGS();
    const out = [];
    const add = (name, value, ok) => out.push({ name, value, ok });
    add('every first copy has 8 to 10 outages (the average is 8.76)', firstCount.join(', '), firstCount.every((c) => c >= 8 && c <= 10));
    add('every other copy has 5 to 12 outages', others.join(', '), others.every((c) => c >= 5 && c <= 12));
    add(
      'every part has exactly one shared outage (the average is 0.88)',
      d.map((p) => p[0].extra.length).join(', '),
      d.every((p) => p[0].extra.length === 1),
    );
    const count = (s) => sample(s, seed).count;
    const within = (name, s, lo, hi) => add(name, count(s), count(s) >= lo && count(s) <= hi);
    within('four single parts fail the request 35 times (the model: 35.04)', E.series, 35, 35);
    within('the default fails it 17 or 18 times (17.5)', E.base, 17, 18);
    within('pairs with failover fail it 26 or 27 times (26.3)', E.failoverAfter, 26, 27);
    within('pairs with shared failures fail it 3 times (2.6)', E.sharedAfter, 3, 3);
    add('pairs on paper never fail in the year', count(E.pairs), count(E.pairs) === 0);
    for (const [name, s] of Object.entries(E)) {
      const r = restMoment(s, seed);
      add(`${name}: the rest moment falls in weeks 3 to 48`, r ? r.week + 1 : 'none', !!r && r.week >= 2 && r.week <= 47);
    }
    // A free play's holds stand at least 2 weeks apart, so each reads as its own beat.
    for (const [name, s] of Object.entries(E)) {
      const h = playPlan(s, false, null, seed).holds.map((x) => x.week);
      const gaps = h.slice(1).map((w, i) => w - h[i]);
      add(`${name}: a free play's holds are 2 weeks apart or more`, h.map((w) => w + 1).join(', '), gaps.every((g) => g >= 2));
    }
    return out;
  }
  /** The count bounds alone, from the first draws: the search's fast path. */
  function countsOk(seed) {
    const rand = mulberry32(seed);
    const c = PARTS.map(() => [0, 1, 2].map(() => ({ own: poisson(rand, FAILS_PER_YEAR * (1 - BETA)), extra: poisson(rand, FAILS_PER_YEAR * BETA) })));
    const first = c.map((p) => p[0].own + p[0].extra);
    return (
      c.every((p) => p[0].extra === 1) &&
      first.every((n) => n >= 8 && n <= 10) &&
      first.reduce((a, b) => a + b, 0) === 35 &&
      c.every((p) => p.slice(1).every((x) => x.own + x.extra >= 5 && x.own + x.extra <= 12))
    );
  }
  function seedOk(seed) {
    if (!countsOk(seed)) return false;
    const ok = seedBounds(seed).every((b) => b.ok);
    drawCache.delete(seed);
    return ok;
  }

  // ---------------------------------------------------------------- formatting
  const trim = (v, d) => String(Number(v.toFixed(d)));
  const GROUPED = new Intl.NumberFormat('en-US');
  const group = (v) => GROUPED.format(Math.round(v));
  /** A downtime, from hours: the unit an interviewer would say it in, never without a unit. */
  function formatDown(hours) {
    const s = hours * 3600;
    if (s < 0.005) return 'under 0.01 s';
    if (s < 0.995) return `${trim(s, 2)} s`;
    if (s < 9.95) return `${trim(s, 1)} s`;
    if (s < 119.5) return `${Math.round(s)} s`;
    const min = s / 60;
    if (min < 9.95) return `${trim(min, 1)} min`;
    if (min < 119.5) return `${Math.round(min)} min`;
    if (hours < 72) return `${trim(hours, 1)} h`;
    const d = hours / 24;
    return `${d < 10 ? trim(d, 2) : trim(d, 1)} d`;
  }
  /** An availability from its unavailability, to the digit after its nines: 99.8%, 99.983%, 99.9999%. */
  function formatAvail(u) {
    const d = Math.min(10, Math.max(1, Math.ceil(-Math.log10(u) - 1e-9) - 1));
    return `${trim(100 * (1 - u), d)}%`;
  }
  const formatPct = (v) => `${trim(v, 2)}%`;
  const formatNum = (v) => (Number.isInteger(v) ? group(v) : trim(v, 2));
  const formatTimes = (v) => `${v < 10 ? trim(v, 1) : group(v)}×`;
  const formatMin = (v) => `${trim(v, 1)} min`;
  const formatHours = (v) => `${trim(v, 2)} h`;
  const FORMAT = { down: formatDown, avail: formatAvail, pct: formatPct, num: formatNum, times: formatTimes, min: formatMin, hours: formatHours };
  const formatSlot = (slot) => (slot.unit === 'word' ? slot.value : FORMAT[slot.unit](slot.value));
  const slotOf = (unit) => (value) => ({ value, unit });
  const word = (value) => ({ value, unit: 'word' });
  const down = slotOf('down');
  const avail = slotOf('avail');
  const pct = slotOf('pct');
  const num = slotOf('num');
  const times = slotOf('times');
  const min = slotOf('min');
  const hours = slotOf('hours');
  function fillTemplate(t, slots) {
    return t.replace(/\{(\w+)\}/g, (_, k) => {
      if (!slots[k]) throw new Error(`No slot "${k}" for "${t}"`);
      return formatSlot(slots[k]);
    });
  }
  /** Digits a template may hold outside its slots: none here. */
  const ALLOWED = [];
  function strayDigits(t) {
    let rest = t.replace(/\{\w+\}/g, '');
    for (const p of ALLOWED) rest = rest.split(p).join('');
    return rest.match(/\d+/g) ?? [];
  }

  // ---------------------------------------------------------------- experiments
  const E = EXPERIMENT_SETTINGS();
  const CHALLENGE_BOUNDS = { down: COPY_U * YEAR_H, copies: 8 };
  const CHALLENGE_GOAL = {
    all: [
      { metric: 'down', below: CHALLENGE_BOUNDS.down },
      { metric: 'copies', below: CHALLENGE_BOUNDS.copies },
    ],
    keep: { shared: 1, failover: 1 },
  };
  /** The one setting that meets the challenge (enum.cjs proves it is the only one of 162). */
  const CHALLENGE_SOLUTION = { lb: 2, app: 2, db: 2, recs: 1, optional: 1 };
  const partOf = (m, id) => m.parts.find((p) => p.id === id);
  const SHARE_WORDS = '1 in 10';

  const EXPERIMENTS = [
    {
      id: 'series',
      title: 'Four parts in a row',
      setup: E.series,
      act: { run: 'year' },
      ask: 'A page request needs {parts} parts in turn: a load balancer, an app server, a database and a recommendations service. There is one copy of each, and each is {each} available: down {eachDown} a year, in outages of {mttr}. How long is the request down a year?',
      choices: [
        { text: '{eachDown}: a chain is as good as its weakest part', value: 'eachDown' },
        { text: '{half}: twice that, as outages often coincide', value: 'half' },
        { text: '{down}: every part’s outages count in full', value: 'down' },
      ],
      truth: 'down',
      reveal:
        '{down}: the request needs every part, so it fails whenever any one of them is down. Outages of {mttr} that strike independently almost never coincide, so the downtime of {parts} parts adds up: {parts} × {eachDown} is {down}, and the availabilities multiply to {avail}. A chain is always worse than its weakest part, and every hard dependency you add costs its whole downtime.',
      focus: ['timeline', 'ruler'],
      hide: ['sample', 'request'],
      slots: () => {
        const m = run(E.series);
        return {
          parts: num(PARTS.length),
          each: avail(COPY_U),
          eachDown: down(hoursAYear(COPY_U)),
          mttr: hours(MTTR_H),
          half: down(2 * hoursAYear(COPY_U)),
          down: down(m.downH),
          avail: avail(m.u),
        };
      },
    },
    {
      id: 'parallel',
      title: 'A second database',
      setup: E.parallelBefore,
      act: { set: { db: 2 }, run: 'year' },
      ask: 'A load balancer, an app server and a database, one copy of each, and each down {dbDown} a year; recommendations are optional now. Give the database a second copy that fails independently of the first, and say traffic moves to it at once. How long is the database part down a year now?',
      choices: [
        { text: '{pair}: only while both are down at once', value: 'pair' },
        { text: '{tenth}: a tenth, a copy buys one more nine', value: 'tenth' },
        { text: '{halved}: half, two copies share the failures', value: 'halved' },
      ],
      truth: 'pair',
      reveal:
        '{pair}: the part is down only while both copies are down at once. Each is down {u} of the time, so both are down {u} of {u}: {pairAvail} available, {pair} a year against {dbDown}. Unavailabilities multiply, so each independent copy adds {nines} nines. The request is still down {reqAfter} a year, because the two parts left with one copy now set it. And {pair} is the ceiling of the arithmetic, not a forecast: it holds only if the copies never fail together and traffic moves instantly.',
      focus: ['timeline', 'ruler'],
      hide: ['after'],
      slots: () => {
        const a = run(E.parallelBefore);
        const b = run(E.parallelAfter);
        return {
          dbDown: down(partOf(a, 'db').downH),
          halved: down(partOf(a, 'db').downH / 2),
          tenth: down(partOf(a, 'db').downH / 10),
          pair: down(partOf(b, 'db').downH),
          u: pct(COPY_U * 100),
          pairAvail: avail(partOf(b, 'db').u),
          nines: num(Math.round(nines(COPY_U))),
          reqAfter: down(b.downH),
        };
      },
    },
    {
      id: 'weakest',
      title: 'One more app server',
      setup: E.weakestBefore,
      act: { set: { app: 3 }, run: 'year' },
      ask: 'The request passes {lb} load balancers, {app} app servers and {db} database, every copy {each} available; recommendations are optional. It is down {before} a year. Add a third app server. How long is the request down a year now?',
      choices: [
        { text: '{halved}: half, as three app servers never fail together', value: 'halved' },
        { text: '{third}: a third less, like the share of servers added', value: 'third' },
        { text: '{after}: unchanged, the app servers were never the limit', value: 'after' },
      ],
      truth: 'after',
      reveal:
        '{after}, unchanged: the request is down because of the database, a single copy down {dbDown} a year. The app servers were down together only {appBefore} a year as a pair, and {appAfter} as three. Polishing a strong part buys nothing you can measure: the weakest link caps the chain, so find the single point of failure before adding copies anywhere else.',
      focus: ['ruler', 'chain'],
      hide: ['after'],
      slots: () => {
        const a = run(E.weakestBefore);
        const b = run(E.weakestAfter);
        return {
          lb: num(a.settings.lb),
          app: num(a.settings.app),
          db: num(a.settings.db),
          each: avail(COPY_U),
          before: down(a.downH),
          after: down(b.downH),
          third: down((a.downH * 2) / 3),
          halved: down(a.downH / 2),
          dbDown: down(partOf(b, 'db').downH),
          appBefore: down(partOf(a, 'app').downH),
          appAfter: down(partOf(b, 'app').downH),
        };
      },
    },
    {
      id: 'shared',
      title: 'Failures the copies share',
      setup: E.pairs,
      act: { set: { shared: 1 }, run: 'year' },
      ask: 'Two copies of every part: on paper the request is down only {paper} a year. Now say {share} of a copy’s outages come from something its twin shares, such as the zone both run in or a bad deploy that reaches both. How long is the request down a year now?',
      choices: [
        { text: '{tenthMore}: a tenth more than on paper', value: 'tenthMore' },
        { text: '{real}: about {ratio} what the paper says', value: 'real' },
        { text: '{singles}: as much as with one copy of each', value: 'singles' },
      ],
      truth: 'real',
      reveal:
        '{real}, about {ratio} the paper’s {paper}. A second copy removes only the outages that are a copy’s own. A shared one takes both copies down together, so it passes straight through: {sharedDown} a year for each part, however many copies it has. With {share} of outages shared, copies buy at most one more nine, {capAvail} a part and not {pairAvail}. So spread copies across zones, roll changes out in stages and split users into cells: the fix is fewer shared causes, not more copies.',
      focus: ['timeline', 'ruler'],
      hide: ['after'],
      slots: () => {
        const a = run(E.pairs);
        const b = run(E.sharedAfter);
        const singles = run({ ...E.pairs, lb: 1, app: 1, db: 1 });
        return {
          paper: down(a.downH),
          share: word(SHARE_WORDS),
          tenthMore: down(a.downH * (1 + BETA)),
          real: down(b.downH),
          ratio: times(Math.round(b.u / a.u / 10) * 10),
          singles: down(singles.downH),
          sharedDown: down(hoursAYear(partOf(b, 'db').causes.shared)),
          capAvail: avail(partOf(b, 'db').causes.shared),
          pairAvail: avail(partOf(a, 'db').u),
        };
      },
    },
    {
      id: 'failover',
      title: 'Failover takes time',
      setup: E.pairs,
      act: { set: { failover: 1 }, run: 'year' },
      ask: 'Two copies of every part, failing independently: on paper the request fails only when both copies of a part are down at once, about once in {paperYears} years. But moving traffic off a dead copy takes {fo}: health checks must notice, then the switch happens. About how many times a year does the request fail now?',
      choices: [
        { text: 'About {real} times: at every failure of a copy in use', value: 'real' },
        { text: 'About {one} times: as often as a single copy fails', value: 'one' },
        { text: 'Still about once in {paperYears} years: the standby was ready', value: 'never' },
      ],
      truth: 'real',
      reveal:
        'About {real} times a year, {fo} each: {foDown} a year instead of {paper}. Redundancy does not remove a copy’s failures, it shortens them: each of the {perCopy} outages a year of the copy in use now ends when traffic has moved, after {fo}, not when the repair is done, after {mttr}. Availability is MTBF / (MTBF + MTTR), and a standby turns the time to recover from the repair time into the failover time. So past four nines no human can be in the loop: detection and the switch must be automatic, and rehearsed.',
      focus: ['timeline', 'chain'],
      hide: ['after'],
      slots: () => {
        const a = run(E.pairs);
        const b = run(E.failoverAfter);
        return {
          paperYears: num(Math.round(1 / a.failsPerYear)),
          fo: down(FAILOVER_H),
          real: num(Math.round(b.failsPerYear)),
          one: num(Math.round(FAILS_PER_YEAR)),
          never: num(Number(a.failsPerYear.toFixed(2))),
          foDown: down(b.downH),
          paper: down(a.downH),
          perCopy: num(Number(partOf(b, 'db').ownPerYear.toFixed(2))),
          mttr: hours(MTTR_H),
        };
      },
    },
    {
      id: 'add-a-nine',
      title: 'Three nines from seven copies',
      setup: E.challenge,
      ask: 'This design has shared failures and a {fo} failover, as real ones do, and the request is down {start} a year. Promise three nines: bring it under {target} a year, {targetAvail}, with no more than the {copies} copies it runs now.',
      goal: CHALLENGE_GOAL,
      reveal:
        'Run {lb} load balancers, {app} app servers and {db} databases, with recommendations optional: down {down} a year, {avail}. Moving one app server to the database removes the single point of failure, and making recommendations optional takes a whole part out of the chain; the third app server was buying nothing. The {down} left are shared outages and failovers, which no further copy removes: the next nine comes from fewer shared causes and a faster switch.',
      focus: ['ruler', 'chain'],
      hide: [],
      slots: () => {
        const a = run(E.challenge);
        const b = run({ ...E.challenge, ...CHALLENGE_SOLUTION });
        return {
          fo: down(FAILOVER_H),
          start: down(a.downH),
          target: down(CHALLENGE_BOUNDS.down),
          targetAvail: avail(COPY_U),
          copies: num(a.copies),
          lb: num(b.settings.lb),
          app: num(b.settings.app),
          db: num(b.settings.db),
          down: down(b.downH),
          avail: avail(b.u),
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
    return { id: spec.id, title: fill(spec.title), ask: fill(spec.ask), choices, answer, reveal: fill(spec.reveal), slots, focus: spec.focus, hide: spec.hide };
  }

  const boundMet = (b, v) => ('below' in b ? v < b.below : v >= b.atLeast);
  const goalKept = (goal, s) => Object.entries(goal.keep ?? {}).every(([k, v]) => s[k] === v);
  const metricsOf = (m) => ({ down: m.downH, copies: m.copies });
  const goalMet = (goal, s) => goalKept(goal, s) && goal.all.every((b) => boundMet(b, metricsOf(chain(s))[b.metric]));

  const api = {
    YEAR_H,
    MONTH_H,
    WEEKS,
    COPY_U,
    MTTR_H,
    MTBF_H,
    CYCLE_H,
    FAILS_PER_YEAR,
    BETA,
    FAILOVER_MIN,
    FAILOVER_H,
    COPIES,
    PARTS,
    BASE,
    SHARE_WORDS,
    SWEEP_MS,
    HOLD_MS,
    SAMPLE_SEED: 0,
    partModel,
    chain,
    run,
    seriesU,
    nines,
    hoursAYear,
    mulberry32,
    poisson,
    draws,
    sample,
    restMoment,
    answerHold,
    playPlan,
    seedBounds,
    seedOk,
    EXPERIMENT_SETTINGS,
    formatDown,
    formatAvail,
    formatPct,
    formatNum,
    formatTimes,
    formatSlot,
    fillTemplate,
    strayDigits,
    EXPERIMENTS,
    CHALLENGE_GOAL,
    CHALLENGE_BOUNDS,
    CHALLENGE_SOLUTION,
    renderExperiment,
    goalMet,
    goalKept,
    boundMet,
    metricsOf,
  };
  /** The year's seed: the first that meets every bound in `seedBounds` (enum.cjs --search=1-N reruns the search). */
  api.SAMPLE_SEED = 3282478;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ReliabilityModel = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
