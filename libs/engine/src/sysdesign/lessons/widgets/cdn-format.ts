/** How the CDNs & Edge widget says its numbers, on the stage, in its words and in its experiments' slots. */

const GROUPED = new Intl.NumberFormat('en-US');
export const cdnGroup = (v: number) => GROUPED.format(Math.round(v));

/** Three significant figures, thousands separated: 3,077 reads 3,080; 886; 26; 4.5. */
export function cdnSig3(v: number): string {
  if (v >= 1000) {
    const p = 10 ** (Math.floor(Math.log10(v)) - 2);
    return cdnGroup(Math.round(v / p) * p);
  }
  if (v >= 100) return cdnGroup(v);
  if (v >= 10) return String(Math.round(v));
  return v.toFixed(1).replace(/\.0$/, '');
}
/** A number rounded to `digits` significant figures, as a number. */
export const cdnRound = (v: number, digits: number) => {
  const p = 10 ** Math.max(0, Math.floor(Math.log10(v)) - (digits - 1));
  return Math.round(v / p) * p;
};
/** A share of requests with one decimal: 69.2%, 19.0%, and never 100% or 0% for a share that is not. */
export function formatShare(x: number): string {
  const v = x * 100;
  if (v >= 99.95 && v < 100) return 'over 99.9%';
  if (v > 0 && v < 0.05) return 'under 0.1%';
  return `${v.toFixed(1)}%`;
}
/** A path's latency: one decimal where it has one (4.5 ms, 10 ms). */
export const formatPathMs = (v: number) => `${v.toFixed(1).replace(/\.0$/, '')} ms`;
/** A mean response, three significant figures: 26.0 ms, 46.9 ms, 130 ms. */
export const formatMeanMs = (v: number) => `${v.toPrecision(3)} ms`;
/** A rate of requests, three significant figures: 913/s, 3,080/s. */
export const formatReqRate = (v: number) => `${cdnSig3(v)}/s`;
/** A popularity rank: the 2,481st. */
export function formatRank(v: number): string {
  const r = Math.round(v);
  const t = r % 100;
  const suffix = t >= 11 && t <= 13 ? 'th' : (['th', 'st', 'nd', 'rd'][r % 10] ?? 'th');
  return `${cdnGroup(r)}${suffix}`;
}
export const ttlWords = (t: number) => ({ 5: '5 seconds', 60: '1 minute', 300: '5 minutes', 3600: '1 hour' })[t] ?? `${t} seconds`;
export const ttlAdj = (t: number) => ({ 5: '5-second', 60: '1-minute', 300: '5-minute', 3600: '1-hour' })[t] ?? `${t}-second`;
export const ttlShort = (t: number) => ({ 5: '5 s', 60: '1 min', 300: '5 min', 3600: '1 h' })[t] ?? `${t} s`;
/** A time on the timeline's axis. */
export function formatTimelineClock(sec: number): string {
  if (Math.round(sec) < 60) return `${Math.round(sec)} s`;
  if (sec < 3600) return `${+(sec / 60).toFixed(1)} min`;
  return `${+(sec / 3600).toFixed(1)} h`;
}
/** A count of minutes or hours "once every" so often: one decimal under 10, so the rate agrees with the hit share beside it. */
const every = (v: number) => (v < 10 ? +v.toFixed(1) : Math.round(v));
/** How often one key is asked for at one location: "41 times a second", "about once a minute", "once every 10 minutes". */
export function formatOften(perSec: number): string {
  if (perSec >= 1.5) return `${cdnSig3(perSec)} times a second`;
  if (perSec >= 1) return 'about once a second';
  if (perSec * 60 >= 1.5) return `${cdnSig3(perSec * 60)} times a minute`;
  if (perSec * 60 >= 1) return 'about once a minute';
  if (perSec * 3600 >= 1) {
    const m = 1 / (perSec * 60);
    return m < 1.5 ? 'about once a minute' : `once every ${every(m)} minutes`;
  }
  const h = 1 / (perSec * 3600);
  return h < 1.5 ? 'about once an hour' : `once every ${every(h)} hours`;
}
