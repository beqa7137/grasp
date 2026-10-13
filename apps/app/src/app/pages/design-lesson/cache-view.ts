import type { CacheLayout, MeterLayout } from './cache-layout';

/** The nines scale of the cache bar: one step per nine of hit rate, with room past 99.9% so its misses still show. */
const NINES = 3.2;

/** Where a hit rate (%) sits on the cache bar. */
export function barAt(bar: CacheLayout['bar'], hitRate: number): number {
  const nines = -Math.log10(Math.max(1e-6, 1 - hitRate / 100)) / NINES;
  return bar.x0 + Math.min(1, nines) * (bar.x1 - bar.x0);
}

/** Where a load sits along the origin meter, on its log scale from 10 to 10,000 requests a second. */
export function meterAt(m: MeterLayout, qps: number): number {
  const share = Math.min(1, Math.max(0, (Math.log10(Math.max(qps, 10)) - 1) / 3));
  return m.start + (m.axis === 'y' ? -1 : 1) * share * m.length;
}

const short = (qps: number) => (qps >= 1_000 ? `${qps / 1_000}k` : String(qps));

export function meterTicks(m: MeterLayout) {
  return [10, 100, 1_000, 10_000].map((v) => {
    const at = meterAt(m, v);
    const edge = m.axis === 'y' ? m.x + m.width : m.y + m.height;
    return m.axis === 'y'
      ? { label: short(v), x: edge + 6, y: at + 4, anchor: 'start', mark: [edge, at, edge + 4, at] }
      : { label: short(v), x: at, y: edge + m.tickOffset, anchor: 'middle', mark: [at, edge, at, edge + 4] };
  });
}

/** The meter's fill for a load, the capacity line across it, and where the overload × sits at the fill's end. */
export function meterMarks(m: MeterLayout, load: number, capacity: number) {
  const at = meterAt(m, load);
  const cap = meterAt(m, capacity);
  return m.axis === 'y'
    ? {
        fill: { x: m.x, y: at, width: m.width, height: m.start - at },
        capacity: [m.x - 6, cap, m.x + m.width + 6, cap],
        // At the fill's low end: the high end can sit under the capacity handle when the load is just over it.
        cross: `translate(${m.cross} ${m.start - 9})`,
      }
    : {
        fill: { x: m.x, y: m.y, width: at - m.start, height: m.height },
        capacity: [cap, m.y - 6, cap, m.y + m.height + 6],
        cross: `translate(${m.start + 9} ${m.cross})`,
      };
}

/** 100 requests in whole cells: hits, misses the origin answered, and misses that timed out. */
export interface WaffleCounts {
  hits: number;
  answered: number;
  lost: number;
  /** Set when fewer than 1 in 100 miss, which no whole cell can show: "1 in 200 miss". */
  oneIn: number | null;
}

export function waffleCounts(missShare: number, lostShare: number): WaffleCounts {
  const misses = missShare * 100;
  if (misses > 0 && misses < 1) return { hits: 100, answered: 0, lost: 0, oneIn: Math.round(1 / missShare) };
  const all = Math.round(misses);
  const lost = Math.min(all, Math.round(lostShare * 100));
  return { hits: 100 - all, answered: all - lost, lost, oneIn: null };
}

/** The cells in reading order, slowest last, so the 99th of 100 is p99. */
export function waffleCells(w: CacheLayout['waffle'], counts: WaffleCounts) {
  return Array.from({ length: 100 }, (_, i) => ({
    x: w.x + (i % 10) * (w.cell + w.gap),
    y: w.y + Math.floor(i / 10) * (w.cell + w.gap),
    kind: i >= 100 - counts.lost ? 'lost' : i >= counts.hits ? 'miss' : 'hit',
  }));
}

const plural = (n: number, one: string, many: string) => `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;

export function waffleLegend(c: WaffleCounts) {
  return {
    hits: plural(c.hits, 'hit', 'hits'),
    misses: c.oneIn ? `1 in ${c.oneIn.toLocaleString('en-US')} misses` : plural(c.answered, 'miss answered', 'misses answered'),
    lost: `${c.lost} timing out now`,
  };
}
