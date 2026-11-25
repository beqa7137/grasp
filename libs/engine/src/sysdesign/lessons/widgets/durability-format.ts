/** How the Durability widget says its numbers, on the stage, in its words and in its experiments' slots. */

const GROUPED = new Intl.NumberFormat('en-US');
const trim = (v: number, decimals: number) => String(Number(v.toFixed(decimals)));
/** Two significant figures: every modeled count is an estimate. */
export const sig2 = (v: number) => {
  if (v === 0) return 0;
  const d = Math.floor(Math.log10(Math.abs(v))) - 1;
  return Math.round(v / 10 ** d) * 10 ** d;
};
const NAMES: readonly (readonly [number, string])[] = [
  [1e21, 'sextillion'],
  [1e18, 'quintillion'],
  [1e15, 'quadrillion'],
  [1e12, 'trillion'],
  [1e9, 'billion'],
  [1e6, 'million'],
];

/** A large count in words, two significant figures: 18,000; 5.6 billion; 600 billion. */
export function bigCount(v: number): string {
  const r = sig2(v);
  for (const [scale, name] of NAMES) if (r >= scale) return `${trim(r / scale, 1)} ${name}`;
  return r >= 1 ? GROUPED.format(Math.round(r)) : trim(r, 2);
}
/** A chance as "1 in N": 1 in 18,000; 1 in 5.6 billion. */
export const oneIn = (chance: number) => `1 in ${bigCount(1 / chance)}`;
/** A count of nines, one decimal, on the 0 to 25 scale: 9.7, 3.0. */
export const formatNinesCount = (n: number) => (n >= 0.05 ? (Math.round(n * 10) / 10).toFixed(1) : '0.0');
/** Objects lost a year among a billion: "180 a year", "1 every 600 years". */
export const formatBillion = (v: number) => (v >= 0.995 ? `${bigCount(v)} a year` : `1 every ${bigCount(1 / v)} years`);
export const formatAfr = (pct: number) => `${trim(pct, 2)}%`;
/** A small count with two significant figures: 1.5, 0.18, 70. */
export const formatFew = (r: number) => (r >= 1 ? trim(sig2(r), 1) : trim(r, 3));
export const formatPerYear = (r: number) => `${formatFew(r)} a year`;
export const formatWhole = (v: number) => GROUPED.format(Math.round(v));
export const formatRepairHours = (h: number) => `${GROUPED.format(h)} h`;
/** A duration in words: "about a day" near 24 h, else hours. */
export const formatAbout = (h: number) => (h >= 18 && h <= 30 ? 'about a day' : `about ${formatRepairHours(Math.round(h))}`);
/** Bytes stored per byte of data: 1.5×, 3×. */
export const formatOverhead = (x: number) => `${trim(Math.round(x * 100) / 100, 2)}×`;
export const formatTB = (tb: number) => (tb >= 995 ? `${trim(sig2(tb) / 1000, 1)} PB` : `${GROUPED.format(Math.round(sig2(tb)))} TB`);
export const formatGbps = (g: number) => `${trim(sig2(g), 1)} Gb/s`;
/** A ratio: 49×, 1,200×; past a million in words, 7.4 million times. */
export const formatRatio = (r: number) => (r >= 1e6 ? `${bigCount(r)} times` : `${bigCount(r)}×`);
export const ordinalWord = (i: number) => ['', 'first', 'second', 'third', 'fourth'][i] ?? `${i}th`;
export const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);
export const listOf = (items: readonly string[]) =>
  items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
