// The Unique IDs widget's model, for the mockup (browser) and enum.cjs (Node). The engine port is
// libs/engine/src/sysdesign/lessons/widgets/ids.ts (`idLayout`, `idMint`, `birthday`, replacing `idLayout` and
// `collisionChance` in widgets.ts, whose only caller is the old widget), ids-format.ts and ids-experiments.ts.
//
// A Snowflake-style 64-bit id: a sign bit kept 0, then `timeBits` of ticks since an epoch, `genBits` of generator
// number and `seqBits` of sequence within one tick. The layout's numbers are exact powers of two. The mint is a real
// generator (the Snowflake algorithm) run on a stated clock and a stated list of requests, so every drawn id is the
// id the layout makes: its bits, its order, its waits and its repeats. Random ids are weighed by the birthday bound,
// an approximation named as such.
(function (root) {
  'use strict';

  const ID_BITS = 64;
  const BITS_MAX = 16;
  const TICKS_MS = [1, 10];
  const YEAR_MS = 365.25 * 24 * 3600 * 1000;
  /** The stated clock: the mint starts at this instant (UTC), and the lifetime's "now" is it too. */
  const NOW_MS = Date.UTC(2026, 10, 24, 12, 0, 0);
  /** settings.epoch: 0 counts from 1 January 2026 (a custom epoch near launch), 1 from 1970 (Unix time). */
  const EPOCH_CUSTOM = 0;
  const EPOCH_UNIX = 1;
  const EPOCH_MS = [Date.UTC(2026, 0, 1), 0];
  /** settings.load: 0 a steady trickle (the stated requests below), 1 a burst of 5,000 requests to G0 at 0.05 ms. */
  const LOAD_STEADY = 0;
  const LOAD_BURST = 1;
  const BURST = 5000;
  const BURST_AT_US = 50;
  /** settings.fault: what goes wrong in the mint. */
  const FAULT = { none: 0, skew: 1, stepBack: 2, shared: 3 };
  /** G2's clock runs 2 ms ahead; G1's clock steps back 2 ms at 5.5 ms; G2 is handed G1's number, 1. */
  const SKEW_US = 2000;
  const STEP_AT_US = 5500;
  const STEP_US = 2000;
  /** The mint draws the clock's first 8 ms; an id made later is counted, never drawn. */
  const WINDOW_US = 8000;
  /**
   * The stated requests, in microseconds after the clock's start, for G0, G1 and G2. Chosen so that one tick holds
   * three ids from one generator (G0 at 1 ms: sequence 0, 1, 2), one id has a generator and a sequence above 0 (G2 at
   * 2.9 ms, the id the bits show at rest), every tick but one holds ids from more than one
   * generator, and in the tick at 7 ms the generator made last (G0) sorts first.
   */
  const ARRIVALS_US = [
    [300, 1100, 1500, 1900, 3500, 5100, 7800],
    [600, 2200, 3100, 4400, 5200, 6300, 7400],
    [100, 2500, 2900, 3700, 6600, 7100],
  ];
  const GENERATORS = 3;
  /** Random ids: the bit counts offered, and the counts of ids made (powers of ten). */
  const RANDOM_BITS = [64, 122];
  const COUNT_EXP = { min: 3, max: 15 };
  const BASE = { gen: 10, seq: 12, tick: 1, epoch: EPOCH_CUSTOM, load: LOAD_STEADY, fault: FAULT.none, guard: 1, bits: 122, count: 9 };

  // ---------------------------------------------------------------------------------------------------------------
  // The layout.

  /** What each field buys: the timestamp's lifetime, the generators at once, the ids a tick and a second. */
  function layout(s) {
    const timeBits = ID_BITS - 1 - s.gen - s.seq;
    const lifetimeMs = 2 ** timeBits * s.tick;
    const epochMs = EPOCH_MS[s.epoch];
    const endMs = epochMs + lifetimeMs;
    const elapsedMs = NOW_MS - epochMs;
    const nowTicks = elapsedMs / s.tick;
    const generators = 2 ** s.gen;
    const perTick = 2 ** s.seq;
    const ticksPerSecond = 1000 / s.tick;
    const perSecond = perTick * ticksPerSecond;
    return {
      timeBits,
      genBits: s.gen,
      seqBits: s.seq,
      tick: s.tick,
      lifetimeMs,
      years: lifetimeMs / YEAR_MS,
      epochMs,
      endMs,
      elapsedMs,
      nowTicks,
      /** The stated clock's timestamp fits the field: a generator may mint. */
      fits: nowTicks < 2 ** timeBits,
      usedFraction: elapsedMs / lifetimeMs,
      generators,
      perTick,
      ticksPerSecond,
      perSecond,
      totalPerSecond: generators * perSecond,
    };
  }

  /** The id's value: the timestamp in the high bits, then the generator, then the sequence (BigInt shifts). */
  function encode(L, ts, gen, seq) {
    const g = BigInt(L.genBits);
    const q = BigInt(L.seqBits);
    return (BigInt(ts) << (g + q)) | (BigInt(gen) << q) | BigInt(seq);
  }

  function decode(L, id) {
    const q = BigInt(L.seqBits);
    const g = BigInt(L.genBits);
    return {
      sign: Number(id >> 63n),
      ts: id >> (g + q),
      gen: Number((id >> q) & ((1n << g) - 1n)),
      seq: Number(id & ((1n << q) - 1n)),
    };
  }

  /** The id's 64 bits, high bit first, each with its field. */
  function bits(L, id) {
    const out = [];
    for (let i = 63; i >= 0; i--) {
      const field = i === 63 ? 'sign' : i >= L.genBits + L.seqBits ? 'time' : i >= L.seqBits ? 'gen' : 'seq';
      out.push({ index: i, bit: Number((id >> BigInt(i)) & 1n), field });
    }
    return out;
  }

  // ---------------------------------------------------------------------------------------------------------------
  // The mint: three generators run the Snowflake algorithm on their own clocks, with no coordination.

  /** A generator's clock as pieces of true time with a fixed offset: reading = t + off on [from, to). */
  function clockPieces(s, g) {
    if (s.fault === FAULT.skew && g === 2) return [{ from: 0, to: Infinity, off: SKEW_US }];
    if (s.fault === FAULT.stepBack && g === 1)
      return [
        { from: 0, to: STEP_AT_US, off: 0 },
        { from: STEP_AT_US, to: Infinity, off: -STEP_US },
      ];
    return [{ from: 0, to: Infinity, off: 0 }];
  }
  const reading = (pieces, t) => t + pieces.find((p) => t >= p.from && t < p.to).off;
  /** The first true time at or after `t` when the clock reads at least `x`. */
  function reach(pieces, x, t) {
    for (const p of pieces) {
      const at = Math.max(t, p.from, x - p.off);
      if (at < p.to) return at;
    }
    return Infinity;
  }

  /** The generator number each drawn generator is configured with. */
  const numberOf = (s, g) => (s.fault === FAULT.shared && g === 2 ? 1 : g);

  function arrivals(s, g) {
    if (s.load === LOAD_BURST && g === 0) return Array.from({ length: BURST }, () => BURST_AT_US);
    return ARRIVALS_US[g];
  }

  /**
   * One generator: requests in arrival order, each served when the one before it is. The timestamp is the clock's
   * tick; within one tick the sequence counts up, and once it has used all 2^seq values the generator waits for the
   * clock's next tick. With the guard on, a clock behind the last timestamp used waits until it catches up (it never
   * issues an older timestamp); with it off, the generator trusts its clock and starts the sequence again at 0.
   */
  function runGenerator(s, L, g) {
    const pieces = clockPieces(s, g);
    const tickUs = s.tick * 1000;
    const baseTicks = (NOW_MS - L.epochMs) / s.tick;
    const number = numberOf(s, g);
    const out = [];
    let last = -Infinity;
    let seq = 0;
    let free = 0;
    let n = 0;
    for (const a of arrivals(s, g)) {
      let t = Math.max(a, free);
      let ts;
      let why = a < free ? 'queue' : null;
      for (;;) {
        ts = Math.floor(reading(pieces, t) / tickUs);
        if (s.guard && ts < last) {
          t = reach(pieces, last * tickUs, t);
          why = 'clock';
          continue;
        }
        if (ts === last) {
          if (seq + 1 < L.perTick) {
            seq += 1;
            break;
          }
          t = reach(pieces, (last + 1) * tickUs, t);
          why = why === 'clock' ? 'clock' : 'full';
          continue;
        }
        seq = 0;
        break;
      }
      last = ts;
      free = t;
      out.push({
        key: `g${g}-${n++}`,
        lane: g,
        number,
        arrival: a,
        issued: t,
        clock: reading(pieces, t),
        tick: ts,
        ts: baseTicks + ts,
        seq,
        wait: t - a,
        /** Why it waited: its tick was full, the clock was behind the last timestamp, or the requests before it did. */
        why: t > a ? why : null,
        column: Math.floor(t / tickUs),
        id: encode(L, baseTicks + ts, number, seq),
      });
    }
    return out;
  }

  /**
   * The mint over the stated requests. A generator runs only if its number fits the generator field; none mints if
   * the stated clock is past the timestamp field's end. Sorted is every id in id order (the B-tree's key order).
   */
  function mint(s) {
    const L = layout(s);
    const lanes = [];
    for (let g = 0; g < GENERATORS; g++) {
      const number = numberOf(s, g);
      const runs = L.fits && number < L.generators;
      lanes.push({
        lane: g,
        number,
        runs,
        why: !L.fits ? 'overflow' : runs ? null : 'noNumber',
        ids: runs ? runGenerator(s, L, g) : [],
        requests: arrivals(s, g).length,
      });
    }
    const all = lanes.flatMap((l) => l.ids);
    const byMade = [...all].sort((a, b) => a.issued - b.issued || a.lane - b.lane);
    const sorted = [...all].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : a.lane - b.lane));
    const seen = new Map();
    for (const x of byMade) {
      const k = x.id.toString();
      if (seen.has(k)) x.repeatOf = seen.get(k).key;
      else seen.set(k, x);
    }
    const repeats = byMade.filter((x) => x.repeatOf);
    sorted.forEach((x, i) => (x.rank = i));
    byMade.forEach((x, i) => (x.made = i));
    // An id that sorts before one made earlier in a different tick is out of time order across ticks.
    let maxIssued = -Infinity;
    const lateByTick = [];
    for (const x of sorted) {
      if (x.issued < maxIssued - 1e-9 && Math.floor(x.issued / (s.tick * 1000)) < Math.floor(maxIssued / (s.tick * 1000)))
        lateByTick.push(x);
      maxIssued = Math.max(maxIssued, x.issued);
    }
    const windowUs = WINDOW_US;
    const drawn = all.filter((x) => x.issued < windowUs);
    const waited = all.filter((x) => x.wait > 0);
    // Which lanes the out-of-order ids come from, so a sentence names the right generator (enum.cjs checks it).
    const lateLanes = [...new Set(lateByTick.map((x) => x.lane))];
    const lastBurst = s.load === LOAD_BURST && lanes[0].ids.length ? lanes[0].ids[lanes[0].ids.length - 1] : null;
    return {
      layout: L,
      lanes,
      ids: all,
      byMade,
      sorted,
      repeats,
      lateByTick,
      lateLanes,
      drawn,
      after: all.length - drawn.length,
      waited,
      maxWait: waited.reduce((m, x) => Math.max(m, x.wait), 0),
      lastBurst,
      windowUs,
    };
  }

  /**
   * The mint's ids as the lanes and the sorted list draw them: one group per generator, tick and column, so a burst
   * is a gauge per tick and never 5,000 marks. A group of three or fewer keeps its ids as dots.
   */
  function groups(m) {
    const out = [];
    for (const lane of m.lanes) {
      let cur = null;
      for (const x of lane.ids) {
        if (cur && cur.tick === x.tick && cur.column === x.column && x.seq === cur.seqTo + 1) {
          cur.seqTo = x.seq;
          cur.count += 1;
          cur.last = x;
          cur.ids.length < 4 && cur.ids.push(x);
        } else {
          cur = { key: x.key, lane: lane.lane, tick: x.tick, column: x.column, seqFrom: x.seq, seqTo: x.seq, count: 1, first: x, last: x, ids: [x] };
          out.push(cur);
        }
      }
    }
    // A group stays dots only while its ids are made at different moments; a burst's tick is always a gauge.
    out.forEach((gr) => (gr.single = gr.count <= 3 && new Set(gr.ids.map((x) => x.issued)).size === gr.count));
    return out;
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Random ids: the birthday bound.

  /** The chance of at least one repeat among n ids drawn uniformly from 2^bits values: 1 - e^(-n^2 / 2^(bits+1)). */
  const birthday = (bitsN, n) => -Math.expm1(-(n * n) / 2 ** (bitsN + 1));
  /** The exact chance, as a product, for small spaces (enum.cjs checks the bound against it). */
  function birthdayExact(bitsN, n) {
    const N = 2 ** bitsN;
    let logNone = 0;
    for (let i = 1; i < n; i++) logNone += Math.log1p(-i / N);
    return -Math.expm1(logNone);
  }
  /** The count at which the chance reaches one half: sqrt(2 ln 2 * 2^bits). */
  const evenOdds = (bitsN) => Math.sqrt(2 * Math.LN2 * 2 ** bitsN);
  /** The expected number of colliding pairs, n(n - 1) / 2^(bits+1). */
  const expectedPairs = (bitsN, n) => (n * (n - 1)) / 2 ** (bitsN + 1);

  // ---------------------------------------------------------------------------------------------------------------
  // Formatting: every number a learner reads goes through these.

  const int = (n) => (typeof n === 'bigint' ? n.toLocaleString('en-US') : Math.round(n).toLocaleString('en-US'));
  const SUP = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
  const sup = (n) => String(n).replace(/./g, (c) => SUP[c]);
  const pow2 = (n) => `2${sup(n)}`;
  const pow10 = (n) => `10${sup(n)}`;
  function years(y) {
    if (y >= 1e9) return `${(y / 1e9).toFixed(1)} billion years`;
    if (y >= 1e6) return `${(y / 1e6).toFixed(1)} million years`;
    if (y >= 1000) return `${int(y)} years`;
    if (y >= 1) return `${y.toFixed(1)} years`;
    const d = y * 365.25;
    return `${d.toFixed(d >= 10 ? 0 : 1)} days`;
  }
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  function date(ms) {
    if (!Number.isFinite(ms) || ms > 8.64e15) return null;
    const d = new Date(ms);
    if (d.getUTCFullYear() > 9999) return null;
    return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  }
  /** The end of the timestamp: a date while one exists, else how far off it is. */
  const endWords = (L) => date(L.endMs) ?? `about ${years(L.years)} after the epoch`;
  const ms = (us) => {
    const v = us / 1000;
    if (v >= 100) return `${int(v)} ms`;
    return `${Number.isInteger(v) ? v : v.toFixed(v < 10 ? 2 : 1).replace(/0$/, '')} ms`;
  };
  /** A chance from the birthday bound, always with "about": it is an approximation. */
  function chance(p) {
    if (p >= 0.995) return 'near certain';
    if (p >= 0.1) return `about ${Math.round(p * 100)}%`;
    if (p >= 0.01) return `about ${(p * 100).toFixed(1)}%`;
    if (p >= 1e-6) return `about 1 in ${int(1 / p)}`;
    const e = Math.floor(Math.log10(p));
    let m = p / 10 ** e;
    let ee = e;
    if (+m.toFixed(1) >= 10) {
      m /= 10;
      ee += 1;
    }
    return `about ${m.toFixed(1)} × ${pow10(ee)}`;
  }
  function count(n) {
    const names = { 3: 'a thousand', 6: 'a million', 9: 'a billion', 12: 'a trillion', 15: 'a quadrillion' };
    const e = Math.round(Math.log10(n));
    return names[e] ?? `${pow10(e)}`;
  }
  const countFigure = (n) => {
    const e = Math.round(Math.log10(n));
    return e % 3 === 0 ? int(n) : pow10(e);
  };
  const plural = (n, one, many) => `${int(n)} ${n === 1 ? one : many}`;
  const genName = (lane) => `G${lane}`;
  const NUMBER_WORDS = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
  /** A count that opens a sentence, in words while it is small, so no sentence opens on a numeral. */
  const opening = (n, one, many) => (n < 10 ? `${NUMBER_WORDS[n]} ${n === 1 ? one : many}` : `In all, ${int(n)} ${many}`);

  // ---------------------------------------------------------------------------------------------------------------
  // The words: the summary, the ledger and the notices, each true for the setting it is printed for.

  function ledger(s) {
    const L = layout(s);
    return {
      time: {
        bits: L.timeBits,
        chain: [`${pow2(L.timeBits)} ticks`, `× ${s.tick} ms`, `= ${years(L.years)}`],
        end: L.fits ? `${date(L.epochMs)} to ${endWords(L)}` : `ran out on ${endWords(L)}`,
      },
      gen: { bits: L.genBits, chain: [pow2(L.genBits), `= ${plural(L.generators, 'generator', 'generators')} at once`] },
      seq: {
        bits: L.seqBits,
        chain: [`${pow2(L.seqBits)} = ${plural(L.perTick, 'id', 'ids')} a tick`, `× ${int(L.ticksPerSecond)} ticks a second`, `= ${int(L.perSecond)} ids a second each`],
        total: `${int(L.totalPerSecond)} ids a second from all ${int(L.generators)}`,
      },
    };
  }

  function layoutSentence(s) {
    const L = layout(s);
    const head = `The 64 bits are 1 sign bit, ${L.timeBits} timestamp bits, ${plural(L.genBits, 'generator bit', 'generator bits')} and ${plural(L.seqBits, 'sequence bit', 'sequence bits')}.`;
    const time = L.fits
      ? `The timestamp counts ${s.tick} ms ticks from ${date(L.epochMs)} and lasts ${years(L.years)}, to ${endWords(L)}.`
      : `The timestamp counts ${s.tick} ms ticks from ${date(L.epochMs)} and ran out on ${endWords(L)}, so today's clock no longer fits and every generator must refuse to mint.`;
    const room = `There is room for ${plural(L.generators, 'generator', 'generators')}, each making up to ${int(L.perSecond)} ids a second.`;
    return `${head} ${time} ${room}`;
  }

  function mintSentence(s) {
    const m = mint(s);
    const L = m.layout;
    if (!L.fits) return 'No generator mints: the clock is past the end of the timestamp field.';
    const running = m.lanes.filter((l) => l.runs);
    const idle = m.lanes.filter((l) => !l.runs);
    const parts = [];
    const who = running.length === 1 ? 'One generator' : `${NUMBER_WORDS[running.length]} generators`;
    parts.push(`${who} made ${plural(m.ids.length, 'id', 'ids')} without talking to each other.`);
    if (idle.length)
      parts.push(
        `${idle.map((l) => genName(l.lane)).join(' and ')} cannot run: ${plural(L.genBits, 'generator bit gives', 'generator bits give')} only ${plural(L.generators, 'number', 'numbers')}.`,
      );
    if (m.repeats.length)
      parts.push(
        s.fault === FAULT.shared
          ? `${opening(m.repeats.length, 'id repeats', 'ids repeat')}: G1 and G2 share the number 1, so in a tick where both make an id with the same sequence, the ids are equal.`
          : `${opening(m.repeats.length, 'id repeats', 'ids repeat')}: G1's clock stepped back ${ms(STEP_US)} and the generator trusted it, reissuing timestamps it had used.`,
      );
    else parts.push('No id repeats.');
    if (s.fault === FAULT.stepBack && s.guard) {
      const w = m.lanes[1].ids.filter((x) => x.wait > 0 && x.issued > STEP_AT_US);
      if (w.length) parts.push(`G1's clock stepped back ${ms(STEP_US)}; it kept its last timestamp and waited ${ms(w[0].wait)} for its clock to catch up.`);
    }
    if (s.load === LOAD_BURST && m.lastBurst) {
      const t = m.lastBurst;
      parts.push(
        t.wait > 0
          ? `G0's burst of ${int(BURST)} requests needs ${plural(Math.ceil(BURST / L.perTick), 'tick', 'ticks')} of ${plural(L.perTick, 'id', 'ids')}, so its last request waits ${ms(t.wait)}.`
          : `G0's burst of ${int(BURST)} requests fits in one tick of ${plural(L.perTick, 'id', 'ids')}, so none waits.`,
      );
    } else {
      const full = m.waited.filter((x) => x.why === 'full').length;
      if (full) parts.push(`${opening(full, 'request', 'requests')} waited for a later tick because a tick holds only ${plural(L.perTick, 'id', 'ids')} a generator.`);
    }
    const late = m.lateByTick.length;
    if (late && s.fault === FAULT.skew)
      parts.push(`${opening(late, 'id', 'ids')} from G2, whose clock runs ${ms(SKEW_US)} ahead, ${late === 1 ? 'sorts' : 'sort'} after ids made later.`);
    else if (late)
      parts.push(`G1's clock now runs ${ms(STEP_US)} behind, so ${plural(late, 'id', 'ids')} made earlier ${late === 1 ? 'sorts' : 'sort'} after ids G1 made later.`);
    else if (s.tick === 10) parts.push('With a 10 ms tick every id here shares one timestamp, so they sort by generator, then by sequence.');
    else parts.push('They sort by tick, then by generator, then by sequence, so time order holds only to the tick.');
    if (m.after) parts.push(`${opening(m.after, 'id was', 'ids were')} made after the ${ms(WINDOW_US)} drawn.`);
    return parts.join(' ');
  }

  function randomSentence(s) {
    const n = 10 ** s.count;
    const p = birthday(s.bits, n);
    const head = `Among ${count(n)} random ${s.bits}-bit ids, the chance of any repeat is ${chance(p)}, by the birthday bound.`;
    const e = evenOdds(s.bits);
    const odds = e <= 10 ** COUNT_EXP.max ? `It reaches even odds near ${countWords(e)} ids.` : `It reaches even odds only near ${sci(e)} ids, past the chart.`;
    return `${head} ${odds} A thousand times the ids makes the chance about a million times larger while it is small.`;
  }
  function sci(x) {
    const e = Math.floor(Math.log10(x));
    return `${(x / 10 ** e).toFixed(1)} × ${pow10(e)}`;
  }
  function countWords(x) {
    if (x >= 1e9 && x < 1e12) return `${(x / 1e9).toFixed(1)} billion`;
    if (x >= 1e6 && x < 1e9) return `${(x / 1e6).toFixed(1)} million`;
    return sci(x);
  }

  const summary = (s) => `${layoutSentence(s)} ${mintSentence(s)} ${randomSentence(s)}`;

  // ---------------------------------------------------------------------------------------------------------------
  // The experiments: slot values from the model, so the prose cannot drift.

  const setup = {
    lifetime: { ...BASE },
    burst: { ...BASE, seq: 10 },
    order: { ...BASE },
    clock: { ...BASE, guard: 0 },
    random: { ...BASE, bits: 122, count: 9 },
    challenge: { ...BASE },
  };

  /** Each experiment: the setup, the act (settings changed then a play), the choices with the value each stands for. */
  function experiments() {
    const lifeAfter = layout({ ...setup.lifetime, gen: 11 });
    const lifeBefore = layout(setup.lifetime);
    const burst = mint({ ...setup.burst, load: LOAD_BURST });
    const last = burst.lastBurst;
    const orderM = mint(setup.order);
    const tick7 = orderM.sorted.filter((x) => x.tick === 7);
    const clockM = mint({ ...setup.clock, fault: FAULT.stepBack });
    const guarded = mint({ ...setup.clock, fault: FAULT.stepBack, guard: 1 });
    const gWait = guarded.lanes[1].ids.find((x) => x.wait > 0 && x.issued > STEP_AT_US);
    const p64 = birthday(64, 1e9);
    return [
      {
        id: 'one-bit',
        title: 'One bit for the generators',
        setup: setup.lifetime,
        act: { set: { gen: 11 }, run: 'layout' },
        ask: `Snowflake's timestamp has ${lifeBefore.timeBits} bits of 1 ms ticks and lasts ${years(lifeBefore.years)}. Move one bit from it to the generators, for ${int(layout({ ...setup.lifetime, gen: 11 }).generators)} generators. How long does the timestamp last now?`,
        choices: [
          { text: `About ${years(lifeBefore.years * 2)}`, value: lifeBefore.years * 2 },
          { text: `About ${years(lifeBefore.years - 1)}: one year less`, value: lifeBefore.years - 1 },
          { text: `About ${years(lifeAfter.years)}`, value: lifeAfter.years },
        ],
        truth: lifeAfter.years,
        reveal: `The timestamp now holds ${pow2(lifeAfter.timeBits)} ticks, and ${pow2(lifeAfter.timeBits)} × 1 ms is ${years(lifeAfter.years)}, ending on ${endWords(lifeAfter)} instead of ${endWords(lifeBefore)}. A bit is a doubling, so every bit moved out of the timestamp halves its lifetime, and every bit moved in doubles it: the marker on the ruler steps one bit left.`,
        focus: ['ledgerTime'],
        hide: ['lifetime'],
      },
      {
        id: 'burst',
        title: 'A burst in one tick',
        setup: setup.burst,
        act: { set: { load: LOAD_BURST }, run: 'mint' },
        ask: `With ${setup.burst.seq} sequence bits a generator has ${int(2 ** setup.burst.seq)} sequence numbers a tick. G0 gets ${int(BURST)} requests at ${ms(BURST_AT_US)}. How long does the last of them wait for its id?`,
        choices: [
          { text: `About ${Math.round(last.wait / 1000)} ms, ${NUMBER_WORDS[Math.ceil(BURST / 2 ** setup.burst.seq) - 1].toLowerCase()} ticks later`, value: Math.round(last.wait / 1000) },
          { text: 'None: they all fit in that tick', value: 0 },
          { text: 'About 1 ms, until the next tick', value: 1 },
        ],
        truth: Math.round(last.wait / 1000),
        reveal: `Each tick gives G0 only ${int(burst.layout.perTick)} ids, so the ${int(BURST)} requests take ${plural(Math.ceil(BURST / burst.layout.perTick), 'tick', 'ticks')}: ${NUMBER_WORDS[Math.floor(BURST / burst.layout.perTick)].toLowerCase()} full gauges, then ${int(BURST % burst.layout.perTick)} ids in the last, and the last request waits ${ms(last.wait)}. The generator never repeats a sequence number; it waits for the clock. The other generators are not slowed at all.`,
        focus: ['laneG0'],
        hide: ['burstAfter'],
      },
      {
        id: 'order',
        title: 'Which id sorts first',
        setup: setup.order,
        act: { run: 'mint' },
        ask: `In the tick at 7 ms, G2 makes an id at ${ms(tick7.find((x) => x.lane === 2).issued)} and G0 makes one at ${ms(tick7.find((x) => x.lane === 0).issued)}. Which id is smaller, so it sorts first?`,
        choices: [
          { text: "G2's: it was made first", value: 2 },
          { text: "G0's: its generator number is lower", value: 0 },
          { text: 'Whichever has the lower sequence number', value: -1 },
        ],
        truth: tick7[0].lane,
        reveal: `Both ids carry the same timestamp, the tick at 7 ms. The next bits are the generator's number, and 0 is below 2, so G0's id sorts first although it was made ${ms(tick7.find((x) => x.lane === 0).issued - tick7.find((x) => x.lane === 2).issued)} later; the sequence bits come last and only break ties within one generator. Ids sort by time only to the tick.`,
        focus: ['sorted'],
        hide: ['order'],
      },
      {
        id: 'clock-back',
        title: 'The clock steps back',
        setup: setup.clock,
        act: { set: { fault: FAULT.stepBack }, run: 'mint' },
        ask: `G1 trusts its clock: it does not keep its last timestamp. At 5.5 ms its clock steps back ${ms(STEP_US)}. What happens to the ids it makes after that?`,
        choices: [
          { text: 'Some repeat ids it already made', value: 'repeat' },
          { text: 'They sort before its earlier ids, but none repeats', value: 'early' },
          { text: 'Nothing goes wrong: the sequence keeps them apart', value: 'none' },
        ],
        truth: clockM.repeats.length ? 'repeat' : 'early',
        reveal: `${opening(clockM.repeats.length, 'id is', 'ids are')} made twice: after the step G1's clock reads ticks it has used, and its sequence starts again at 0, so it makes the same timestamp, number and sequence as before. Turn on "Keep the last timestamp" and G1 waits ${ms(gWait.wait)} for its clock to pass the last timestamp it used, and none repeats.`,
        focus: ['laneG1', 'sorted'],
        hide: ['repeats'],
      },
      {
        id: 'birthday',
        title: 'A billion random ids',
        setup: setup.random,
        act: { set: { bits: 64 }, run: 'random' },
        ask: `A billion ids, each 64 random bits: ${pow2(64)} values, about 18 billion billion. What is the chance that any two are equal?`,
        choices: [
          { text: `About 1 in ${countWords(2 ** 64 / 1e9)}`, value: 1e9 / 2 ** 64 },
          { text: 'About 50%', value: 0.5 },
          { text: `${chance(p64).replace('about', 'About')}`, value: p64 },
        ],
        truth: p64,
        reveal: `By the birthday bound the chance is ${chance(p64)}: every pair of ids is a chance to collide, and a billion ids make about ${sci((1e9 * 1e9) / 2)} pairs. One new id against the rest is the 1 in ${countWords(2 ** 64 / 1e9)}. At 122 bits, a UUIDv4's, the same billion gives ${chance(birthday(122, 1e9))}.`,
        focus: ['chart'],
        hide: ['chance'],
      },
    ];
  }

  const CHALLENGE = {
    id: 'challenge',
    title: 'Size the layout',
    ask: 'Design the layout for up to 1,000 generators, each able to make 1,000,000 ids a second on its own, lasting at least 200 years.',
    bounds: [
      { metric: 'generators', atLeast: 1000, words: (L) => `${int(L.generators)} generators (need 1,000)` },
      { metric: 'perSecond', atLeast: 1e6, words: (L) => `${int(L.perSecond)} ids a second each (need 1,000,000)` },
      { metric: 'years', atLeast: 200, words: (L) => `lasts ${years(L.years)} (need 200)` },
    ],
  };
  function challengeStatus(s) {
    const L = layout(s);
    const items = CHALLENGE.bounds.map((b) => ({ met: L[b.metric] >= b.atLeast, text: b.words(L) }));
    return { items, met: items.every((i) => i.met) };
  }

  const api = {
    ID_BITS,
    BITS_MAX,
    TICKS_MS,
    YEAR_MS,
    NOW_MS,
    EPOCH_MS,
    EPOCH_CUSTOM,
    EPOCH_UNIX,
    LOAD_STEADY,
    LOAD_BURST,
    BURST,
    BURST_AT_US,
    FAULT,
    SKEW_US,
    STEP_AT_US,
    STEP_US,
    WINDOW_US,
    ARRIVALS_US,
    GENERATORS,
    RANDOM_BITS,
    COUNT_EXP,
    BASE,
    layout,
    encode,
    decode,
    bits,
    mint,
    groups,
    birthday,
    birthdayExact,
    evenOdds,
    expectedPairs,
    fmt: { int, sup, pow2, pow10, years, date, endWords, ms, chance, count, countFigure, plural, opening, sci, countWords },
    ledger,
    layoutSentence,
    mintSentence,
    randomSentence,
    summary,
    setup,
    experiments,
    CHALLENGE,
    challengeStatus,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.IdModel = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
