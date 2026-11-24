// The Durability widget's model, for the mockup (browser) and enum.cjs (Node). The engine port is
// libs/engine/src/sysdesign/lessons/widgets/durability.ts (the model, which keeps today's `durability()` formulas and
// adds the steps, the rack event and the cost), durability-format.ts (how its numbers are said), durability-plays.ts
// (the play clock and the staged loss) and libs/engine/src/sysdesign/lessons/durability-experiments.ts.
//
// Every number the learner reads comes from the closed forms here. The plays draw one repair: a typical one, in which
// nothing else fails (the outcome of about 99.96% of repairs at the default), or a staged loss, named as staged, whose
// own chance is the model's. Neither is a sample whose counts could be read as the yearly loss.
(function (root) {
  'use strict';

  // ---------------------------------------------------------------- the fixed world
  const YEAR_H = 8760;
  const DISK_TB = 20;
  /** A billion objects of 1 MB: 1 PB of data, the interview question's store. */
  const OBJECTS = 1e9;
  const OBJECT_MB = 1;
  const DATA_TB = (OBJECTS * OBJECT_MB) / 1e6;
  /** A rack-wide event that destroys every disk in the rack (a fire, a power fault, a bad firmware push): an assumption,
   * said as one wherever it is used. With one piece a rack it is one more disk failure, part of the AFR. */
  const RACK_EVENT = 0.001;
  /** What one disk writes, sustained: about 250 MB/s, so a 20 TB disk refilled alone takes about a day. A faster repair
   * must spread the failed disk's pieces over many disks, each rebuilt in parallel (declustered placement). */
  const DISK_WRITE_GBPS = 2;
  const SCHEMES = [
    { id: 'r2', kind: 'replicas', copies: 2, label: '2 copies', short: '2 copies' },
    { id: 'r3', kind: 'replicas', copies: 3, label: '3 copies', short: '3 copies' },
    { id: 'ec63', kind: 'erasure', data: 6, parity: 3, label: '6 + 3 erasure', short: '6 + 3' },
    { id: 'ec104', kind: 'erasure', data: 10, parity: 4, label: '10 + 4 erasure', short: '10 + 4' },
  ];
  const AFRS = [1, 2, 5, 10];
  const REPAIRS = [1, 6, 24, 72, 168];
  const BASE = { scheme: 1, afr: 2, repair: 24, rack: 0 };
  const ALL_SETTINGS = [];
  for (let scheme = 0; scheme < SCHEMES.length; scheme++)
    for (const afr of AFRS) for (const repair of REPAIRS) for (const rack of [0, 1]) ALL_SETTINGS.push({ scheme, afr, repair, rack });

  // ---------------------------------------------------------------- the exact model (today's `durability()`, extended)
  /** P(at least k of n independent pieces fail), each with chance p: the binomial tail, summed term by term. */
  function atLeast(n, k, p) {
    let total = 0;
    let term = (1 - p) ** n;
    for (let i = 0; i <= n; i++) {
      if (i >= k) total += term;
      term *= ((n - i) / (i + 1)) * (p / (1 - p));
    }
    return total;
  }
  function choose(n, k) {
    let c = 1;
    for (let i = 1; i <= k; i++) c = (c * (n - k + i)) / i;
    return Math.round(c);
  }
  /**
   * One object stored under a scheme, each piece on its own disk. Disks fail independently at `afr` a year and a failed
   * piece is rebuilt in `repair` hours. The object is lost when, after one piece fails, more than the tolerated number of
   * the rest fail before that repair ends: yearly loss = pieces x AFR x P(at least t of the other n - 1 fail inside the
   * window), each with chance p = AFR x repair / 8,760 (today's formula, unchanged). With every piece in one rack, a rack
   * event (RACK_EVENT a year, assumed) takes them all at once, and needs no window.
   *
   * The steps are the leading term of the same product, drawn as factors: first failures a year, then p once for each
   * further failure a loss needs, then the number of ways to choose those pieces, C(n - 1, t). The exact tail adds the
   * cases with more than t further failures; enum.cjs bounds the difference at every setting.
   */
  function run(settings) {
    const s = { ...BASE, ...settings };
    const sc = SCHEMES[s.scheme];
    const replicas = sc.kind === 'replicas';
    const n = replicas ? sc.copies : sc.data + sc.parity;
    const t = replicas ? sc.copies - 1 : sc.parity;
    const need = replicas ? 1 : sc.data;
    const overhead = replicas ? sc.copies : n / sc.data;
    const afr = s.afr / 100;
    const p = (afr * s.repair) / YEAR_H;
    const first = n * afr;
    const ways = choose(n - 1, t);
    const tail = atLeast(n - 1, t, p);
    const indep = Math.min(1, first * tail);
    const rack = s.rack ? RACK_EVENT : 0;
    // Either cause loses it: indep + rack - both, written so a tiny indep keeps its digits.
    const loss = indep + rack - indep * rack;
    const lead = first * p ** t * ways;
    const steps = [{ kind: 'first', factor: first, level: first }];
    let level = first;
    for (let i = 1; i <= t; i++) {
      level *= p;
      steps.push({ kind: 'window', i, factor: p, level });
    }
    level *= ways;
    steps.push({ kind: 'ways', factor: ways, level });
    // The cost of a billion 1 MB objects, 1 PB: the raw bytes, the disks, their failures, and the rebuilds they cost.
    const rawTB = DATA_TB * overhead;
    const disks = rawTB / DISK_TB;
    const failsYear = disks * afr;
    const rebuildTB = (replicas ? 1 : sc.data) * DISK_TB;
    const rebuildGbps = (rebuildTB * 1e12 * 8) / (s.repair * 3600) / 1e9;
    // The rebuild writes one disk's worth; above one disk's write rate it must be spread over many disks.
    const writeGbps = (DISK_TB * 1e12 * 8) / (s.repair * 3600) / 1e9;
    const objectsPerLoss = objectsPerLossOf(n, t, Math.round(disks));
    return {
      settings: s,
      scheme: sc,
      replicas,
      n,
      t,
      need,
      overhead,
      afr,
      p,
      first,
      ways,
      tail,
      indep,
      rack,
      loss,
      lead,
      steps,
      nines: -Math.log10(loss),
      indepNines: -Math.log10(indep),
      perBillion: loss * OBJECTS,
      repairRead: replicas ? 1 : sc.data,
      rawTB,
      disks,
      failsYear,
      rebuildTB,
      rebuildGbps,
      writeGbps,
      spread: writeGbps > DISK_WRITE_GBPS,
      trafficTB: failsYear * rebuildTB,
      // The steps (the leading term) against the exact tail: 0 for copies, whose loss needs every other copy.
      exactGap: (first * tail) / lead - 1,
      objectsPerLoss,
      lossEventsYear: (loss * OBJECTS) / objectsPerLoss,
    };
  }

  /** How many objects one loss takes: the billion objects' pieces lie on the store's D disks, so t + 1 disks down at once
   * lose every object with a piece on each of them, OBJECTS x C(D - t - 1, n - t - 1) / C(D, n) with random placement. */
  function objectsPerLossOf(n, t, D) {
    const c = (a, b) => {
      let v = 1;
      for (let i = 1; i <= b; i++) v = (v * (a - b + i)) / i;
      return v;
    };
    return (OBJECTS * c(D - t - 1, n - t - 1)) / c(D, n);
  }
  /** The time one disk takes to refill a whole disk alone. */
  const ALONE_HOURS = (DISK_TB * 1e12 * 8) / (DISK_WRITE_GBPS * 1e9) / 3600;

  /** Today's engine function, unchanged, for the regression check in enum.cjs. */
  function durabilityToday(redundancy, options) {
    const { afr, repairHours } = options;
    const pieces = redundancy.kind === 'replicas' ? redundancy.copies : redundancy.data + redundancy.parity;
    const tolerates = redundancy.kind === 'replicas' ? redundancy.copies - 1 : redundancy.parity;
    const overhead = redundancy.kind === 'replicas' ? redundancy.copies : pieces / redundancy.data;
    const pDuringRepair = afr * (repairHours / 8760);
    const annualLoss = Math.min(1, pieces * afr * atLeast(pieces - 1, tolerates, pDuringRepair));
    return { overhead, tolerates, annualLoss, nines: annualLoss > 0 ? -Math.log10(annualLoss) : Infinity, repairRead: redundancy.kind === 'replicas' ? 1 : redundancy.data };
  }

  // ---------------------------------------------------------------- pieces, the failed one, the rebuild's sources
  /** Piece names: copies c1..cn; data d1..dk and parity p1..pm. */
  function pieces(m) {
    if (m.replicas) return Array.from({ length: m.n }, (_, i) => ({ id: `c${i + 1}`, kind: 'copy', size: 1 }));
    const k = m.scheme.data;
    return Array.from({ length: m.n }, (_, i) => (i < k ? { id: `d${i + 1}`, kind: 'data', size: 1 / k } : { id: `p${i - k + 1}`, kind: 'parity', size: 1 / k }));
  }
  /** The piece that fails in every play: the third (c3, d3), so it sits mid-row and its sources lie on both sides; of
   * two copies, the second. */
  const failedIndex = (m) => (m.n > 2 ? 2 : 1);
  /** The pieces a rebuild reads: any one copy, or any k of the survivors (the first k, skipping the failed one). */
  function sources(m) {
    const ids = pieces(m).map((_, i) => i).filter((i) => i !== failedIndex(m));
    return m.replicas ? [ids[0]] : ids.slice(0, m.scheme.data);
  }
  /** The staged loss: after the first failure, t more pieces fail inside the window (spread over the row, so the
   * picture reads as chance and not as a block), the last of them before the repair ends. */
  function stagedFailures(m) {
    const others = pieces(m).map((_, i) => i).filter((i) => i !== failedIndex(m));
    if (m.replicas) return others;
    const out = [];
    for (let j = 0; j < m.t; j++) out.push(others[Math.round(((j + 0.5) * others.length) / m.t - 0.5)]);
    return [...new Set(out)];
  }
  /** When, as a fraction of the window, each staged failure strikes. */
  const stagedAt = (j, t) => (j + 1) / (t + 1.6);

  // ---------------------------------------------------------------- the play clock (one monotone clock per play)
  /**
   * A play is beats on one clock (seconds): the failure, the window (its length grows with the repair time, so a week
   * visibly lasts longer than a day, but never under 1.4 s), the rebuild landing, then the model's last two rows.
   * A staged loss strikes its further failures inside the window, at stagedAt; a rack event strikes all at once.
   */
  function playPlan(s, kind = 'repair') {
    const m = run(s);
    const fail = 0.35;
    const winStart = 0.9;
    const rackEvent = kind === 'staged' && !!s.rack;
    const win = rackEvent ? 0 : 1.4 + 2.2 * Math.sqrt(s.repair / 168);
    const winEnd = winStart + win;
    const events = [{ at: fail, kind: 'fail' }];
    if (rackEvent) events.push({ at: fail, kind: 'rack' });
    else {
      for (let i = 1; i <= m.t; i++) events.push({ at: winStart + (win * i) / (m.t + 1), kind: 'step', i });
      if (kind === 'staged') stagedFailures(m).forEach((piece, j) => events.push({ at: winStart + win * stagedAt(j, m.t), kind: 'staged', piece, j }));
    }
    const lostAt = kind === 'staged' ? (rackEvent ? fail : Math.max(...events.filter((e) => e.kind === 'staged').map((e) => e.at))) : null;
    const rebuiltAt = kind === 'staged' ? null : winEnd;
    const waysAt = (rackEvent ? 0.9 : winEnd) + 0.45;
    const finalAt = waysAt + 0.5;
    const total = finalAt + 0.9;
    events.push({ at: waysAt, kind: 'ways' }, { at: finalAt, kind: 'final' });
    if (rebuiltAt) events.push({ at: rebuiltAt, kind: 'rebuilt' });
    if (lostAt !== null) events.push({ at: lostAt, kind: 'lost' });
    events.sort((a, b) => a.at - b.at);
    return { kind, rackEvent, fail, winStart, winEnd, win, lostAt, rebuiltAt, waysAt, finalAt, total, events };
  }
  /** What the clock has reached: the window's progress (0 to 1) and which marks are drawn. Nothing for an event shows
   * before its moment. At rest (tau null) the play's end state is drawn. */
  function playState(s, kind, tau) {
    const plan = playPlan(s, kind);
    const T = tau === null || tau === undefined ? Infinity : tau;
    const reached = (at) => at <= T + 1e-9;
    const m = run(s);
    const failed = reached(plan.fail);
    const stagedDown = plan.events.filter((e) => e.kind === 'staged' && reached(e.at)).map((e) => e.piece);
    const lost = plan.lostAt !== null && reached(plan.lostAt);
    let progress = 0;
    if (!plan.rackEvent) {
      const stop = lost ? plan.lostAt : plan.winEnd;
      const now = Math.min(T, stop);
      progress = Math.max(0, Math.min(1, (now - plan.winStart) / plan.win));
    }
    const stepsShown = plan.events.filter((e) => e.kind === 'step' && reached(e.at)).length;
    return {
      plan,
      failed,
      rackDown: plan.rackEvent && failed,
      stagedDown,
      lost,
      progress,
      // The window runs from the failure; with a rack event there is no repair to run.
      hoursNow: progress * s.repair,
      rebuilt: plan.rebuiltAt !== null && reached(plan.rebuiltAt),
      rows: {
        first: failed,
        steps: Math.min(m.t, stepsShown + (plan.rackEvent && failed ? m.t : 0)),
        ways: reached(plan.waysAt),
        rack: s.rack ? reached(plan.rackEvent ? plan.fail : plan.waysAt) : false,
        final: reached(plan.finalAt),
      },
      done: T >= plan.total,
    };
  }

  // ---------------------------------------------------------------- formats: one place for how a number is said
  const GROUPED = new Intl.NumberFormat('en-US');
  const sig2 = (v) => {
    if (v === 0) return 0;
    const d = Math.floor(Math.log10(Math.abs(v))) - 1;
    return Math.round(v / 10 ** d) * 10 ** d;
  };
  const trim = (v, decimals) => String(Number(v.toFixed(decimals)));
  const NAMES = [
    [1e21, 'sextillion'],
    [1e18, 'quintillion'],
    [1e15, 'quadrillion'],
    [1e12, 'trillion'],
    [1e9, 'billion'],
    [1e6, 'million'],
  ];
  /** A large count in words: 18,000; 5.6 billion; 600 billion. Two significant figures. */
  function bigCount(v) {
    const r = sig2(v);
    for (const [scale, name] of NAMES) if (r >= scale) return `${trim(r / scale, 1)} ${name}`;
    return r >= 1 ? GROUPED.format(Math.round(r)) : trim(r, 2);
  }
  /** A chance as "1 in N": 1 in 18,000; 1 in 5.6 billion. */
  const oneIn = (prob) => `1 in ${bigCount(1 / prob)}`;
  const formatNines = (n) => (n >= 0.05 ? trim(Math.round(n * 10) / 10, 1).replace(/^(\d+)$/, '$1.0') : '0.0');
  /** Objects lost a year among a billion: "180 a year", "1 every 600 years". */
  function formatBillion(v) {
    if (v >= 0.995) return `${bigCount(v)} a year`;
    return `1 every ${bigCount(1 / v)} years`;
  }
  const formatPct = (pct) => `${trim(pct, 2)}%`;
  /** A small count with two significant figures: 1.5, 0.18, 70. */
  const formatFew = (r) => (r >= 1 ? trim(sig2(r), 1) : trim(r, 3));
  const formatRate = (r) => `${formatFew(r)} a year`;
  /** A duration in words: "about a day" near 24 h, else hours. */
  const formatAbout = (h) => (h >= 18 && h <= 30 ? 'about a day' : `about ${formatHours(Math.round(h))}`);
  const formatX = (x) => `${trim(Math.round(x * 100) / 100, 2)}×`;
  const formatTB = (tb) => (tb >= 995 ? `${trim(sig2(tb) / 1000, 1)} PB` : `${GROUPED.format(Math.round(sig2(tb)))} TB`);
  const formatGbps = (g) => `${trim(sig2(g), 1)} Gb/s`;
  const formatHours = (h) => `${GROUPED.format(h)} h`;
  const formatCount = (v) => GROUPED.format(Math.round(v));
  /** A ratio: 49×, 1,200×; past a million in words, 7.5 million times. */
  const formatRatio = (r) => (r >= 1e6 ? `${bigCount(r)} times` : `${bigCount(r)}×`);
  const ordinal = (i) => ['', 'first', 'second', 'third', 'fourth'][i];
  const plural = (n, one, many) => (n === 1 ? one : many);
  const listOf = (items) => (items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`);


  // ---------------------------------------------------------------- words (durability-words.ts): every sentence is
  // computed for its setting from these functions, on the stage, in the page and in Describe alike.
  const SC = (m) => m.scheme.short;
  const pieceWord = (m, n = 2) => (m.replicas ? plural(n, 'copy', 'copies') : plural(n, 'piece', 'pieces'));
  const failedName = (m) => pieces(m)[failedIndex(m)].id;
  function storedWords(m) {
    if (m.replicas) return `${m.n} full copies, ${formatX(m.overhead)} its size`;
    return `${m.n} pieces, ${m.scheme.data} of data and ${m.scheme.parity} of parity, each a ${m.scheme.data === 6 ? 'sixth' : 'tenth'} of its size: ${formatX(m.overhead)} in all`;
  }
  function placeWords(m) {
    return m.settings.rack ? `every ${pieceWord(m, 1)} on its own disk, all in one rack` : `every ${pieceWord(m, 1)} on its own disk in its own rack`;
  }
  /** Objects lost a year among a billion, said as the average it is. */
  const billionWords = (m) => `on average ${formatBillion(m.perBillion)}`;
  function lossWords(m) {
    return `${formatNines(m.nines)} nines, a yearly loss chance of ${oneIn(m.loss)}: among a billion such objects, ${billionWords(m)}`;
  }
  function summary(m, hid) {
    const s = m.settings;
    const a = `One object stored as ${SC(m)}${m.replicas ? '' : ' erasure coding'}: ${storedWords(m)}, ${placeWords(m)}. Disks fail independently at ${formatPct(s.afr)} a year, and a lost ${pieceWord(m, 1)} is detected and rebuilt in ${formatHours(s.repair)}. It survives any ${m.t} lost ${pieceWord(m, m.t)}.`;
    if (hid.loss) return `${a} The model’s yearly loss shows after your answer.`;
    return `${a} The model gives ${lossWords(m)}.`;
  }
  function settingSentence(m) {
    const s = m.settings;
    return `Stored as ${SC(m)}${m.replicas ? '' : ' erasure coding'} at ${formatPct(s.afr)} a year with ${formatHours(s.repair)} repairs${s.rack ? ', all in one rack' : ''}: ${formatNines(m.nines)} nines, ${billionWords(m)} among a billion objects, at ${formatX(m.overhead)} storage.`;
  }
  function readoutText(m, hid) {
    return `Stored as ${SC(m)}, ${formatX(m.overhead)} · ${hid.loss ? '? nines' : `${formatNines(m.nines)} nines, ${billionWords(m)} among a billion`}`;
  }
  /** The clause every faster-than-one-disk rebuild prints: what makes the window physically possible. */
  const SPREAD = 'spread over many disks';
  /** The race's sentence: what the drawn repair is, and what a loss would take. */
  function raceSentence(m, ps, kind, hid) {
    const s = m.settings;
    const f = failedName(m);
    const others = m.n - 1;
    if (kind === 'staged' && s.rack) {
      if (!ps.lost) return `Staged, not sampled: a rack event is coming.`;
      return `Staged, not sampled: a rack event destroys the one rack and every ${pieceWord(m, 1)} in it at once, before any repair can start, so nothing is left to rebuild from. A rack event is assumed here once in ${formatCount(1 / RACK_EVENT)} years.`;
    }
    if (kind === 'staged') {
      const names = ps.stagedDown.map((i) => pieces(m)[i].id);
      if (!ps.failed) return `Staged, not sampled: a loss is coming.`;
      if (!ps.lost) return `Staged, not sampled: ${f} fails, and its repair starts.${names.length ? ` Then ${listOf(names)} ${names.length === 1 ? 'fails' : 'fail'} too.` : ''}`;
      const left = m.n - 1 - names.length;
      const chance = hid.steps ? '' : ` A first failure leads here about once in ${bigCount(1 / m.tail)} times.`;
      return m.replicas
        ? `Staged, not sampled: ${f} fails, and before its ${formatHours(s.repair)} repair ends ${listOf(names)} ${names.length === 1 ? 'fails' : 'fail'} too. No copy is left: the object is lost.${chance}`
        : `Staged, not sampled: ${f} fails, and before its ${formatHours(s.repair)} repair ends ${listOf(names)} fail too. Only ${left} pieces are left, and any rebuild needs ${m.need}: the object is lost.${chance}`;
    }
    if (!ps.failed) return `Every ${pieceWord(m, 1)} is whole. Play a repair: a disk fails, and its ${pieceWord(m, 1)} is rebuilt on a free disk.`;
    const reads = hid.reads ? '' : `, read from ${m.replicas ? 'a surviving copy' : `${m.repairRead} of the others`}`;
    const spread = m.spread ? `, while the rest of the failed disk is rebuilt at once, ${SPREAD}` : '';
    const head = ps.rebuilt ? `${f} is rebuilt on a free disk in ${formatHours(s.repair)}${reads}${spread}.` : `${f} fails, and it is being rebuilt on a free disk${reads}${spread}.`;
    const need = m.t === m.n - 1 ? (m.t === 1 ? `the other copy` : m.t === 2 ? 'both other copies' : `all ${others} others`) : `${m.t} of the ${others} others`;
    const chance = hid.steps ? ` The chance of that shows after your answer.` : ` Each fails within ${formatHours(s.repair)} with chance ${oneIn(m.p)}, so in a typical repair none does.`;
    const rack = s.rack ? ` All ${m.n} share one rack: a rack event would take them at once.` : '';
    return `${head} A loss would need ${need} to fail before it ends.${chance}${rack}`;
  }
  /** The facts at the stage's foot: the cost of a billion objects, the rebuild's reads, and what a short window takes. */
  function factsSentence(m, hid, ghostM) {
    const s = m.settings;
    const cost = `A billion 1 MB objects, ${formatTB(DATA_TB)}, take ${formatTB(m.rawTB)} on ${formatCount(m.disks)} disks of ${formatTB(DISK_TB)}; at ${formatPct(s.afr)}, about ${formatFew(m.failsYear)} of them fail a year.`;
    const reads = hid.reads ? ` The rebuild’s reads show after your answer.` : ` Each rebuild reads ${formatTB(m.rebuildTB)}: ${formatGbps(m.rebuildGbps)} to finish in ${formatHours(s.repair)}.`;
    const alone = ` One disk writes about ${formatGbps(DISK_WRITE_GBPS)}, so a ${formatTB(DISK_TB)} disk refilled alone takes ${formatAbout(ALONE_HOURS)}; a faster repair spreads the lost pieces over many disks, each rebuilt in parallel.`;
    const ghost = ghostM && !hid.ghost ? ` Before this change: ${formatNines(ghostM.nines)} nines.` : '';
    return cost + reads + alone + ghost;
  }
  /** Describe's note on the steps against the exact model, computed for the setting. */
  function exactWords(m) {
    if (m.replicas) return 'For copies the steps are the model exactly: a loss needs every other copy.';
    const g = m.exactGap;
    const pct = Math.abs(g) * 100;
    const said = pct < 0.01 ? 'under 0.01%' : `${trim(sig2(pct), 2)}%`;
    return `The steps multiply the leading term of the model; its exact sum also weighs the other pieces surviving the window and the rarer cases of more failures, ${said} ${g < 0 ? 'less' : 'more'} here.`;
  }
  /** A step row's words, longest first: the stage's rows and Describe's row headers both take them. */
  function stepWords(m, row, hidLoss = false) {
    const s = m.settings;
    const tFmt = formatHours(s.repair);
    if (row.kind === 'first') return [`First failures: ${m.n} ${pieceWord(m, m.n)} × ${formatPct(s.afr)} a year`, `First failures: ${m.n} × ${formatPct(s.afr)}`, 'First failures'];
    if (row.kind === 'window') {
      if (row.i === 1) return [`A given other ${pieceWord(m, 1)} fails before the ${tFmt} repair ends`, `Another fails within ${tFmt}`, `One more within ${tFmt}`];
      return [`And a ${ordinal(row.i)} given ${pieceWord(m, 1)}`, `And a ${ordinal(row.i)}`];
    }
    if (row.kind === 'ways') {
      if (m.ways === 1) return [`One choice only: ${m.t === 1 ? 'the other copy' : m.t === 2 ? 'both other copies' : `all ${m.t} other copies`}`, 'One choice only'];
      return [`Any ${m.t} of the ${m.n - 1} others will do`, `Any ${m.t} of the ${m.n - 1}`, `Any ${m.t} of ${m.n - 1}`];
    }
    if (row.kind === 'rack') return [`Or a rack event takes every ${pieceWord(m, 1)} at once (assumed)`, 'Or a rack event (assumed)', 'Rack event'];
    if (hidLoss) return ['Lost in a year'];
    const rack = s.rack ? [', set by the rack event (assumed)', ' (rack event)'] : ['', ''];
    return [`Lost in a year: ${oneIn(m.loss)}${rack[0]}`, `Lost a year: ${oneIn(m.loss)}${rack[0]}`, `Lost a year: ${oneIn(m.loss)}${rack[1]}`];
  }

  // ---------------------------------------------------------------- experiments
  const E = {
    copies: { scheme: 1, afr: 2, repair: 24, rack: 0 },
    wide: { scheme: 3, afr: 2, repair: 24, rack: 0 },
    challengeStart: { scheme: 1, afr: 5, repair: 24, rack: 0 },
  };
  /** The distractor of E5: two copies in one rack and the third elsewhere. A rack event then leaves one copy, which must
   * not fail before the two are rebuilt: RACK_EVENT x p, plus the independent loss. Said as a value, computed here. */
  const twoInOneRack = (s) => {
    const m = run({ ...s, rack: 0 });
    const r = RACK_EVENT * atLeast(1, 1, m.p);
    return m.indep + r - m.indep * r;
  };
  const nines = (loss) => -Math.log10(loss);
  const lossRatio = (a, b) => run(b).loss / run(a).loss;

  const CHALLENGE_BOUNDS = { perBillion: 0.1, overhead: 1.6, rebuildGbps: 10 };
  const CHALLENGE_GOAL = {
    all: [
      { metric: 'perBillion', below: CHALLENGE_BOUNDS.perBillion },
      { metric: 'overhead', below: CHALLENGE_BOUNDS.overhead },
      { metric: 'rebuildGbps', below: CHALLENGE_BOUNDS.rebuildGbps },
    ],
    keep: { afr: 5 },
  };
  /** The one setting that meets the challenge (enum.cjs proves it is the only one of 160). */
  const CHALLENGE_SOLUTION = { scheme: 3, afr: 5, repair: 72, rack: 0 };

  const EXPERIMENTS = [
    {
      id: 'half',
      title: 'Half the storage',
      setup: E.copies,
      act: { set: { scheme: 2 }, run: 'repair' },
      ask: 'Three copies on separate disks store {ohBefore} and survive any {tBefore} lost copies; with disks failing at {afr} a year and {win} repairs the model gives {ninesBefore} nines. Switch to 6 + 3 erasure coding: 6 data pieces and 3 parity pieces, any 6 of which rebuild the object, stored at {ohAfter}, half as much. How likely is a loss in a year now?',
      choices: [
        { text: 'About {ratio} less likely: a loss now takes 4 failures inside one repair', value: 'ratio' },
        { text: 'About as likely: 3 more pieces to fail cancel the extra parity', value: 'same' },
        { text: 'About {more} likelier: 9 disks see {more} as many first failures as 3', value: 'more' },
      ],
      truth: 'ratio',
      reveal:
        'About {ratio} less likely: {ninesAfter} nines against {ninesBefore}. Nine disks do see {more} as many first failures, {firstAfter} against {firstBefore}, and any {tAfter} of the 8 others can finish the job, {ways} ways. But a loss now needs {tAfter} more failures inside one {win} repair instead of {tBefore}, and each is a {p} chance: one more such factor outweighs {more} and {ways}. Half the storage buys two more nines; the price moves to the repair, which now reads {readAfter} pieces instead of 1.',
      focus: ['steps', 'pieces'],
      hide: ['after'],
      slots: () => {
        const a = run(E.copies);
        const b = run({ ...E.copies, scheme: 2 });
        return {
          ohBefore: formatX(a.overhead),
          ohAfter: formatX(b.overhead),
          tBefore: formatCount(a.t),
          tAfter: formatCount(b.t),
          afr: formatPct(E.copies.afr),
          win: formatHours(E.copies.repair),
          ninesBefore: formatNines(a.nines),
          ninesAfter: formatNines(b.nines),
          ratio: formatRatio(lossRatio({ ...E.copies, scheme: 2 }, E.copies)),
          same: 'same',
          more: formatRatio(b.first / a.first),
          firstBefore: formatRate(a.first),
          firstAfter: formatRate(b.first),
          ways: formatCount(b.ways),
          p: oneIn(b.p),
          readAfter: formatCount(b.repairRead),
        };
      },
    },
    {
      id: 'window',
      title: 'A week to repair',
      setup: E.copies,
      act: { set: { repair: 168 }, run: 'repair' },
      ask: 'Three copies at {afr} a year, each lost copy rebuilt in {before}: {ninesBefore} nines. A busy cluster throttles its repairs, and each now takes a week, {after}, {k} longer. How much likelier is a loss in a year?',
      choices: [
        { text: '{k} likelier: the danger lasts {k} as long', value: 'k' },
        { text: '{k2} likelier: both other copies must fail inside the longer window', value: 'k2' },
        { text: '{k3} likelier: all three copies spend {k} as long in the window', value: 'k3' },
      ],
      truth: 'ratio',
      reveal:
        '{ratio} likelier: {ninesAfter} nines against {ninesBefore}. A loss needs both other copies to fail before the repair ends, and each one’s chance of failing inside the window grows with the window, from {pBefore} to {pAfter}. Two such chances multiply: {kn} × {kn} is {k2n}. The window enters the loss once for every failure the scheme tolerates, which is why systems rebuild from many disks in parallel and put repairs ahead of other work. The window runs from the failure to full redundancy: a slow failure detector lengthens it just as a slow rebuild does.',
      focus: ['steps', 'race'],
      hide: ['steps', 'after'],
      slots: () => {
        const a = run(E.copies);
        const b = run({ ...E.copies, repair: 168 });
        const k = 168 / E.copies.repair;
        return {
          afr: formatPct(E.copies.afr),
          before: formatHours(E.copies.repair),
          after: formatHours(168),
          ninesBefore: formatNines(a.nines),
          ninesAfter: formatNines(b.nines),
          k: formatRatio(k),
          k2: formatRatio(k * k),
          k3: formatRatio(k ** 3),
          kn: formatCount(k),
          k2n: formatCount(k * k),
          ratio: formatRatio(lossRatio(E.copies, { ...E.copies, repair: 168 })),
          pBefore: oneIn(a.p),
          pAfter: oneIn(b.p),
        };
      },
    },
    {
      id: 'reads',
      title: 'The repair bill',
      setup: E.copies,
      act: { set: { scheme: 3 }, run: 'repair' },
      ask: 'A {disk} disk fails. Under three copies its rebuild reads {readBefore}: each lost copy is copied from a surviving one. Switch to 10 + 4 erasure coding, which stores {ohAfter}: any 10 of its 14 pieces rebuild the object. How much does rebuilding the same {disk} disk read now?',
      choices: [
        { text: '{readBefore}: one piece rebuilds one piece', value: 'readBefore' },
        { text: '{asStored}: {ohAfter} the disk, like its storage', value: 'asStored' },
        { text: '{readAfter}: 10 pieces for every lost one', value: 'readAfter' },
      ],
      truth: 'readAfter',
      reveal:
        '{readAfter}: a lost piece is decoded, not copied, and decoding takes any 10 of the 13 pieces left. So a 10 + 4 rebuild reads {kAfter} the lost data, and finishing it in {win} takes {gbpsAfter} of reads against {gbpsBefore} for copies. That is the price of {ohAfter} storage: repair traffic, and slower reads of a missing piece. Locally repairable codes cut it: Azure’s code splits 12 data pieces into two groups of 6, each with a local parity, and rebuilds a lost data piece from the 6 of its group.',
      focus: ['pieces', 'race'],
      hide: ['after', 'reads'],
      slots: () => {
        const a = run(E.copies);
        const b = run({ ...E.copies, scheme: 3 });
        return {
          disk: formatTB(DISK_TB),
          readBefore: formatTB(a.rebuildTB),
          readAfter: formatTB(b.rebuildTB),
          asStored: formatTB(DISK_TB * b.overhead),
          ohAfter: formatX(b.overhead),
          kAfter: formatRatio(b.repairRead),
          win: formatHours(E.copies.repair),
          gbpsAfter: formatGbps(b.rebuildGbps),
          gbpsBefore: formatGbps(a.rebuildGbps),
        };
      },
    },
    {
      id: 'batch',
      title: 'A bad batch',
      setup: E.wide,
      act: { set: { afr: 10, repair: 168 }, run: 'repair' },
      ask: '10 + 4 erasure coding at {afrBefore} a year with {winBefore} repairs: {ninesBefore} nines. Then a bad batch of disks starts failing at {afrAfter} a year, {fa} more, and the strained cluster takes a week, {winAfter}, to rebuild each one, {fw} longer. How many nines are left?',
      choices: [
        { text: '{linear}: a loss is {linRatio} likelier, {fa} the failures in a {fw} longer window', value: 'linear' },
        { text: '{squared}: about {sqRatio} likelier, as if two failures had to line up', value: 'squared' },
        { text: '{after}: the rate and the window count once for every failure a loss needs', value: 'after' },
      ],
      truth: 'after',
      reveal:
        '{after} nines: a loss is about {ratio} likelier. The failure rate enters 5 times, once for the first failure and once for each of the {t} more a loss needs, and the window enters {t} times, once for each of those: about {pa} from the rate and {pw} from the window. The more failures a scheme tolerates, the harder a worse failure rate and a slower repair hit it, though it still keeps the most nines: two copies at these settings keep {twoAfter}. Measure failure rates and repair times in production, and re-run the numbers when they move.',
      focus: ['steps', 'headline'],
      hide: ['steps', 'after'],
      slots: () => {
        const a = run(E.wide);
        const after = { ...E.wide, afr: 10, repair: 168 };
        const b = run(after);
        const fa = 10 / E.wide.afr;
        const fw = 168 / E.wide.repair;
        const lin = fa * fw;
        return {
          afrBefore: formatPct(E.wide.afr),
          afrAfter: formatPct(10),
          winBefore: formatHours(E.wide.repair),
          winAfter: formatHours(168),
          ninesBefore: formatNines(a.nines),
          fa: formatRatio(fa),
          fw: formatRatio(fw),
          linear: formatNines(nines(a.loss * lin)),
          linRatio: formatRatio(lin),
          squared: formatNines(nines(a.loss * lin * lin)),
          sqRatio: formatRatio(lin * lin),
          after: formatNines(b.nines),
          ratio: formatRatio(b.loss / a.loss),
          t: formatCount(b.t),
          pa: formatCount(Math.round(fa ** (b.t + 1) / 100) * 100),
          pw: formatCount(Math.round(fw ** b.t / 100) * 100),
          twoAfter: formatNines(run({ ...after, scheme: 0 }).nines),
        };
      },
    },
    {
      id: 'rack',
      title: 'One rack',
      setup: E.copies,
      act: { set: { rack: 1 }, run: 'staged' },
      ask: 'Three copies at {afr} and {win}: {ninesBefore} nines, each copy in its own rack. Now put all three in one rack, and say a rack-wide event that destroys every disk in it (a fire, a power fault, a bad firmware push) strikes a rack once in {rackYears} years. How many nines are left?',
      choices: [
        { text: '{after}: one event takes every copy at once', value: 'after' },
        { text: '{two}: the event must still race a repair', value: 'two' },
        { text: '{ninesBefore}: three disks still have to fail', value: 'ninesBefore' },
      ],
      truth: 'after',
      reveal:
        '{after} nines: a loss once in {rackYears} years, about {ratio} likelier than at {ninesBefore} nines. A rack event needs no repair window to lose the object: it takes all three copies at once, so no small chance multiplies it down. This is why correlated failures, not independent disks, set real losses. Place pieces so no rack or zone holds more than the scheme can lose: if only two copies shared a rack, an event would leave the third racing its repair, {two} nines; 6 + 3 across 3 zones, 3 pieces each, survives a zone, with no spare until it returns.',
      focus: ['pieces', 'steps'],
      hide: ['after'],
      slots: () => {
        const a = run(E.copies);
        const b = run({ ...E.copies, rack: 1 });
        return {
          afr: formatPct(E.copies.afr),
          win: formatHours(E.copies.repair),
          ninesBefore: formatNines(a.nines),
          rackYears: formatCount(1 / RACK_EVENT),
          after: formatNines(b.nines),
          two: formatNines(nines(twoInOneRack(E.copies))),
          ratio: formatRatio(b.loss / a.loss),
        };
      },
    },
    {
      id: 'billion',
      title: 'A billion objects',
      setup: E.challengeStart,
      goal: CHALLENGE_GOAL,
      ask: 'Your disks fail at {afr} a year. Store a billion objects of 1 MB, {data} in all, and lose fewer than 1 in {margin} years: a {marginX} margin on 1 a year for what the simple model rounds off. Correlated failures are met by placement, not by margin, so keep pieces in separate racks. Store at most {oh}, and keep any one disk’s rebuild under {gbps} of reads.',
      reveal:
        '10 + 4 in separate racks, rebuilt in {win}: {nines} nines, {billion} among a billion, at {oh2} storage, {raw} on {disks} disks. That is an average: the billion objects share {disks} disks, so a loss, when it comes, takes about {perLoss} objects at once, about once in {eventYears} years; limiting which disks share objects trades how often for how many. A rebuild reads {read}, {gbps2} spread over {win}. Three copies would store {raw3}; 6 + 3 needs {win63} repairs for the margin, and reading {read63} that fast is {gbps63}; a week’s repairs lose it. The design: a wide erasure code, repairs throttled but bounded, pieces in separate racks, and nines quoted only as the model’s, since correlated failures, bugs and deletes are not in them.',
      focus: ['headline', 'steps'],
      hide: [],
      slots: () => {
        const m = run(CHALLENGE_SOLUTION);
        const r3 = run({ ...CHALLENGE_SOLUTION, scheme: 1 });
        const e63 = run({ ...CHALLENGE_SOLUTION, scheme: 2, repair: 24 });
        return {
          afr: formatPct(E.challengeStart.afr),
          data: formatTB(DATA_TB),
          margin: formatCount(1 / CHALLENGE_BOUNDS.perBillion),
          marginX: formatRatio(1 / CHALLENGE_BOUNDS.perBillion),
          oh: formatX(1.5),
          gbps: formatGbps(CHALLENGE_BOUNDS.rebuildGbps),
          win: formatHours(CHALLENGE_SOLUTION.repair),
          nines: formatNines(m.nines),
          billion: formatBillion(m.perBillion),
          oh2: formatX(m.overhead),
          raw: formatTB(m.rawTB),
          disks: formatCount(m.disks),
          perLoss: bigCount(m.objectsPerLoss),
          eventYears: bigCount(1 / m.lossEventsYear),
          read: formatTB(m.rebuildTB),
          gbps2: formatGbps(m.rebuildGbps),
          raw3: formatTB(r3.rawTB),
          win63: formatHours(24),
          read63: formatTB(e63.rebuildTB),
          gbps63: formatGbps(e63.rebuildGbps),
        };
      },
    },
  ];

  function fillTemplate(t, slots) {
    return t.replace(/\{(\w+)\}/g, (_, k) => {
      if (!(k in slots)) throw new Error(`no slot ${k}`);
      return slots[k];
    });
  }
  function renderExperiment(spec) {
    const slots = spec.slots();
    const fill = (t) => fillTemplate(t, slots);
    const choices = (spec.choices ?? []).map((c) => fill(c.text));
    let answer = -1;
    if (spec.choices) {
      const truth = fill(`{${spec.truth}}`);
      const matches = spec.choices.flatMap((c, i) => (fill(`{${c.value}}`) === truth ? [i] : []));
      if (matches.length !== 1) throw new Error(`${spec.id}: ${matches.length} choices equal the model's ${truth}`);
      answer = matches[0];
    }
    return { id: spec.id, title: spec.title, ask: fill(spec.ask), choices, answer, reveal: fill(spec.reveal), slots, focus: spec.focus, hide: spec.hide, act: spec.act };
  }
  const metricsOf = (m) => ({ perBillion: m.perBillion, overhead: m.overhead, rebuildGbps: m.rebuildGbps });
  const boundMet = (b, v) => ('below' in b ? v < b.below : v >= b.atLeast);
  const goalKept = (goal, s) => Object.entries(goal.keep ?? {}).every(([k, v]) => s[k] === v);
  const goalMet = (goal, s) => goalKept(goal, s) && goal.all.every((b) => boundMet(b, metricsOf(run(s))[b.metric]));

  const api = {
    YEAR_H,
    DISK_TB,
    OBJECTS,
    OBJECT_MB,
    DATA_TB,
    RACK_EVENT,
    DISK_WRITE_GBPS,
    ALONE_HOURS,
    objectsPerLossOf,
    SCHEMES,
    AFRS,
    REPAIRS,
    BASE,
    ALL_SETTINGS,
    E,
    failedIndex,
    atLeast,
    choose,
    run,
    durabilityToday,
    pieces,
    sources,
    stagedFailures,
    stagedAt,
    playPlan,
    playState,
    twoInOneRack,
    bigCount,
    oneIn,
    formatNines,
    formatBillion,
    formatPct,
    formatRate,
    formatFew,
    formatAbout,
    formatX,
    formatTB,
    formatGbps,
    formatHours,
    formatCount,
    formatRatio,
    ordinal,
    plural,
    listOf,
    fillTemplate,
    renderExperiment,
    EXPERIMENTS,
    CHALLENGE_GOAL,
    CHALLENGE_BOUNDS,
    CHALLENGE_SOLUTION,
    metricsOf,
    boundMet,
    goalKept,
    goalMet,
    SC,
    pieceWord,
    failedName,
    storedWords,
    placeWords,
    billionWords,
    lossWords,
    summary,
    settingSentence,
    readoutText,
    SPREAD,
    raceSentence,
    factsSentence,
    exactWords,
    stepWords,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DurabilityModel = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
