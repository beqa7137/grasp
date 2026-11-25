import { describe, expect, it } from 'vitest';
import { formatChance, formatDate, formatIdMs, formatYears, leakLine, mintSentence, pairsChain, randomSentence } from './ids-format.js';
import {
  ID_ARRIVALS_US,
  ID_BASELINE as B,
  ID_BURST,
  ID_EPOCH_MS,
  ID_NOW_MS,
  ID_ROW_SLOTS,
  ID_STEP_AT_US,
  ID_STEP_US,
  YEAR_MS,
  birthdayChance,
  birthdayExact,
  decodeId,
  evenOdds,
  idBits,
  idClockAt,
  idGroups,
  idLayout,
  idMint,
  idRows,
  ownTicks,
  type IdSettings,
} from './ids.js';

const FIELDS = Array.from({ length: 17 }, (_, i) => i);
/** Every setting of the mint with the stated trickle. */
const TRICKLE: IdSettings[] = [];
for (const gen of FIELDS)
  for (const seq of FIELDS)
    for (const tick of [1, 10])
      for (const epoch of [0, 1])
        for (const fault of [0, 1, 2, 3]) for (const guard of [0, 1]) TRICKLE.push({ ...B, gen, seq, tick, epoch, load: 0, fault, guard });

/** A second implementation of the layout: the id as a string of 64 characters, field by field. */
function idByString(gen: number, seq: number, ts: number, number: number, sq: number): bigint | null {
  const t = 63 - gen - seq;
  const field = (v: number, w: number) => (w === 0 ? '' : BigInt(v).toString(2).padStart(w, '0'));
  const str = '0' + field(ts, t) + field(number, gen) + field(sq, seq);
  return str.length === 64 && field(ts, t).length === t ? BigInt('0b' + str) : null;
}

/** A second implementation of the generator: the clock stepped one microsecond at a time, serving what it can. */
function stepGenerator(s: IdSettings, g: number, perTick: number) {
  const tickUs = s.tick * 1000;
  const queue = [...ID_ARRIVALS_US[g]];
  const out: { issued: number; tick: number; seq: number }[] = [];
  let last = -Infinity;
  let seq = 0;
  for (let t = 0; queue.length && t < 200_000; t++) {
    while (queue.length && queue[0] <= t) {
      const ts = Math.floor(idClockAt(s, g, t) / tickUs);
      if (s.guard && ts < last) break;
      if (ts === last && seq + 1 >= perTick) break;
      seq = ts === last ? seq + 1 : 0;
      last = ts;
      out.push({ issued: t, tick: ts, seq });
      queue.shift();
    }
  }
  return out;
}

describe('the Unique IDs model', () => {
  it('gives the Snowflake layout its numbers, and every bit moved halves or doubles one', () => {
    const L = idLayout(B);
    expect([L.timeBits, L.generators, L.perTick, L.perSecond, L.totalPerSecond]).toEqual([41, 1024, 4096, 4_096_000, 4_194_304_000]);
    expect(formatYears(L.years)).toBe('69.7 years');
    expect(formatDate(L.endMs)).toBe('7 September 2095');
    expect(formatYears(idLayout({ ...B, gen: 11 }).years)).toBe('34.8 years');
    expect(formatDate(idLayout({ ...B, gen: 11 }).endMs)).toBe('3 November 2060');
    expect(formatYears(idLayout({ ...B, tick: 10 }).years)).toBe('696.8 years');
    expect(idLayout({ ...B, tick: 10 }).perSecond).toBe(409_600);
    expect(formatDate(idLayout({ ...B, epoch: 1 }).endMs)).toBe('7 September 2039');
    expect(idLayout({ ...B, gen: 16, epoch: 1 }).fits).toBe(false);
    expect(formatDate(idLayout({ ...B, gen: 16, epoch: 1 }).endMs)).toBe('2 February 1971');
    expect(formatYears(idLayout({ ...B, seq: 10 }).years)).toBe('278.7 years');
    for (const s of TRICKLE.filter((x) => x.fault === 0 && x.guard === 1)) {
      const a = idLayout(s);
      expect(a.timeBits + s.gen + s.seq + 1).toBe(64);
      expect(Math.abs(a.years * YEAR_MS - 2 ** a.timeBits * s.tick)).toBeLessThan(1e-3 * a.years * YEAR_MS);
      expect(a.fits).toBe(ID_NOW_MS < ID_EPOCH_MS[s.epoch] + a.lifetimeMs);
      if (s.gen < 16) expect(idLayout({ ...s, gen: s.gen + 1 }).years * 2).toBeCloseTo(a.years, 6);
    }
  });

  it('makes every id of every trickle setting as a 64-character bit string builds it, and decodes it back', () => {
    let n = 0;
    for (const s of TRICKLE) {
      const m = idMint(s);
      for (const x of m.ids) {
        n++;
        expect(idByString(s.gen, s.seq, x.ts, x.number, x.seq)).toBe(x.id);
        expect(decodeId(m.layout, x.id)).toEqual({ sign: 0, ts: x.ts, gen: x.number, seq: x.seq });
      }
    }
    expect(n).toBeGreaterThan(100_000);
    const bits = idBits(idLayout(B), idMint(B).ids.find((x) => x.lane === 2 && x.issued === 2900)!.id);
    expect(bits.map((b) => b.field).join('')).toBe('sign' + 'time'.repeat(41) + 'gen'.repeat(10) + 'seq'.repeat(12));
  });

  it('runs the Snowflake algorithm as a generator stepped microsecond by microsecond does', () => {
    for (const s of TRICKLE) {
      const m = idMint(s);
      for (const lane of m.lanes)
        if (lane.runs)
          expect(
            lane.ids.map((x) => ({ issued: x.issued, tick: x.tick, seq: x.seq })),
            JSON.stringify(s),
          ).toEqual(stepGenerator(s, lane.lane, m.layout.perTick));
    }
  });

  it('draws the default mint as the brief lists it: 20 ids, G2 at 2.9 ms sequence 1, no repeats', () => {
    const m = idMint(B);
    expect(m.sorted.map((x) => `${x.id} G${x.lane} ${x.issued / 1000} ${x.tick} ${x.seq}`).slice(0, 3)).toEqual([
      '118682025984000000 G0 0.3 0 0',
      '118682025984004096 G1 0.6 0 0',
      '118682025984008192 G2 0.1 0 0',
    ]);
    const g2 = m.ids.find((x) => x.lane === 2 && x.issued === 2900)!;
    expect([g2.id, g2.seq, g2.ts]).toEqual([118682025992396801n, 1, 28_296_000_002]);
    expect(leakLine(m.layout, g2)).toBe(
      'Anyone holding this id can read when it was made (12:00:00.002 UTC on 24 November 2026, to the tick) and which generator made it (number 2).',
    );
    expect([m.ids.length, m.repeats.length, m.lateByTick.length]).toEqual([20, 0, 0]);
    const tick7 = m.sorted.filter((x) => x.tick === 7).map((x) => x.lane);
    expect(tick7).toEqual([0, 1, 2]);
  });

  it('finds repeats and order by brute force, and sorts every repeat right below its twin', () => {
    for (const s of TRICKLE) {
      const m = idMint(s);
      const dupes = m.byMade.filter((x, i) => m.byMade.slice(0, i).some((y) => y.id === x.id));
      expect(m.repeats.map((x) => x.key)).toEqual(dupes.map((x) => x.key));
      for (const r of m.repeats) expect(m.sorted[r.rank - 1].id).toBe(r.id);
      for (let i = 1; i < m.sorted.length; i++) expect(m.sorted[i - 1].id <= m.sorted[i].id).toBe(true);
    }
    expect(idMint({ ...B, guard: 0, fault: 2 }).repeats).toHaveLength(2);
    expect(idMint({ ...B, guard: 1, fault: 2 }).repeats).toHaveLength(0);
    expect(idMint({ ...B, fault: 3 }).repeats.length).toBeGreaterThan(0);
  });

  it('marks as late exactly the ids that sort after an id made later, in a later tick', () => {
    for (const s of TRICKLE.filter((x) => x.fault === 1 || x.fault === 2)) {
      const m = idMint(s);
      const tick = (x: { issued: number }) => Math.floor(x.issued / (s.tick * 1000));
      const late = m.sorted.filter((x) => m.sorted.slice(0, x.rank).some((y) => y.issued > x.issued + 1e-9 && tick(y) > tick(x)));
      expect(m.lateByTick.map((x) => x.key)).toEqual(late.map((x) => x.key));
    }
    expect(idMint({ ...B, fault: 1 }).lateByTick.length).toBeGreaterThan(0);
  });

  it('says every wait and moment the model makes as a well-formed number of ms', () => {
    const values = new Set<number>();
    for (const gen of [0, 10, 12, 16])
      for (const seq of FIELDS)
        for (const tick of [1, 10])
          for (const load of [0, 1])
            for (const fault of [0, 2])
              for (const x of idMint({ ...B, gen, seq, tick, load, fault, guard: 1 }).ids) values.add(x.wait).add(x.issued).add(x.clock);
    for (const v of values) expect(formatIdMs(v), String(v)).toMatch(/^(0|[1-9][\d,]*)(\.\d*[1-9])? ms$/);
    expect([77960, 18950, 3950, 50, 100_000, 40_000].map(formatIdMs)).toEqual(['78 ms', '19 ms', '3.95 ms', '0.05 ms', '100 ms', '40 ms']);
  });

  it('keeps every id in the band of its own clock tick, and never needs more than the row slots', () => {
    for (const s of TRICKLE) {
      const m = idMint(s);
      for (const lane of m.lanes) {
        const bands = ownTicks(s, lane.lane);
        for (const x of lane.ids.filter((y) => y.issued < 8000))
          expect(bands.some((b) => b.tick === x.tick && x.issued >= b.from && x.issued < b.to)).toBe(true);
      }
      expect(idRows(m).length).toBeLessThanOrEqual(ID_ROW_SLOTS);
    }
    for (const gen of [0, 10, 12, 16])
      for (const seq of FIELDS)
        for (const tick of [1, 10]) expect(idRows(idMint({ ...B, gen, seq, tick, load: 1 })).length).toBeLessThanOrEqual(ID_ROW_SLOTS);
  });

  it('makes a burst wait as its formula says, and draws each of its ticks as one gauge', () => {
    for (const seq of FIELDS)
      for (const tick of [1, 10]) {
        const m = idMint({ ...B, gen: 12, seq, tick, load: 1 });
        const perTick = 2 ** seq;
        const ticks = Math.ceil(ID_BURST / perTick);
        const last = m.lastBurst!;
        expect(last.wait).toBe(ticks === 1 ? 0 : (ticks - 1) * tick * 1000 - 50);
        const g0 = idGroups(m).filter((g) => g.lane === 0);
        expect(g0).toHaveLength(ticks);
        expect(g0.every((g) => !g.single || g.count === 1)).toBe(true);
      }
    const e2 = idMint({ ...B, gen: 12, seq: 10, load: 1 });
    expect([e2.lastBurst!.wait, ID_BURST % 1024]).toEqual([3950, 904]);
  });

  it('steps G1 back 2 ms at 5.5 ms, and the guard waits for it to catch up', () => {
    const s = { ...B, fault: 2 };
    expect(idClockAt(s, 1, ID_STEP_AT_US - 1)).toBe(ID_STEP_AT_US - 1);
    expect(idClockAt(s, 1, ID_STEP_AT_US)).toBe(ID_STEP_AT_US - ID_STEP_US);
    const w = idMint(s).lanes[1].ids.find((x) => x.wait > 0 && x.issued > ID_STEP_AT_US)!;
    expect([w.wait, w.why]).toEqual([700, 'clock']);
    expect(ownTicks(s, 1).map((b) => b.tick)).toEqual([0, 1, 2, 3, 4, 5, 3, 4, 5]);
  });

  it('puts the birthday bound near the exact chance and near collisions counted in seeded trials', () => {
    for (const [bits, n] of [
      [16, 100],
      [16, 300],
      [20, 1200],
    ]) {
      expect(Math.abs(birthdayChance(bits, n) - birthdayExact(bits, n))).toBeLessThan(0.01);
      let seed = 12345;
      const rand = () => {
        seed = (seed + 0x6d2b79f5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
      let hits = 0;
      const trials = 2000;
      for (let t = 0; t < trials; t++) {
        const seen = new Set<number>();
        let hit = false;
        for (let i = 0; i < n && !hit; i++) {
          const v = Math.floor(rand() * 2 ** bits);
          hit = seen.has(v);
          seen.add(v);
        }
        if (hit) hits++;
      }
      expect(Math.abs(hits / trials - birthdayChance(bits, n))).toBeLessThan(0.04);
    }
    expect(formatChance(birthdayChance(64, 1e9))).toBe('about 2.7%');
    expect(formatChance(birthdayChance(122, 1e9))).toBe('about 9.4 × 10⁻²⁰');
    expect(formatChance(birthdayChance(122, 1e12))).toBe('about 9.4 × 10⁻¹⁴');
    expect(evenOdds(64) / 1e9).toBeCloseTo(5.06, 1);
    expect(pairsChain({ bits: 64, count: 9 })).toEqual([
      '10⁹ ids',
      '→ about 5.0 × 10¹⁷ pairs',
      '× 1 in 1.8 × 10¹⁹ each',
      '≈ 0.027 repeats expected',
      '→ chance about 2.7%',
    ]);
    expect(pairsChain({ bits: 64, count: 12 }).slice(3)).toEqual(['≈ 2.7 × 10⁴ repeats expected', '→ chance near certain']);
  });

  it('says each setting in sentences true for it, none opening on a numeral', () => {
    for (const s of TRICKLE.filter((x) => x.seq % 4 === 0 || x.gen % 5 === 0)) {
      const t = mintSentence(s);
      expect(t).not.toMatch(/NaN|undefined|Infinity|(^|[.?!] )\d|\b1 (ids|ticks|numbers)\b|\u2014/);
      const m = idMint(s);
      if (m.repeats.length) expect(t).toMatch(/repeats?:/);
      else if (m.layout.fits) expect(t).toContain('No id repeats.');
    }
    expect(mintSentence(B)).toBe(
      'Three generators made 20 ids without talking to each other. No id repeats. They sort by tick, then by generator, then by sequence, so time order holds only to the tick.',
    );
    expect(randomSentence({ bits: 64, count: 9 })).toBe(
      'Among a billion random 64-bit ids, the chance of any repeat is about 2.7%, by the birthday bound. It reaches even odds near 5.1 billion ids. A thousand times the ids makes the chance about a million times larger while it is small.',
    );
  });
});
