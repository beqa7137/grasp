/** How the Storage Engines widget says its numbers, on the stage and in its experiments' slots. */

const GB = 1024 ** 3;
const MB = 1024 ** 2;
const GROUPED = new Intl.NumberFormat('en-US');
const group = (v: number) => GROUPED.format(Math.round(v));
const trim = (v: number, decimals: number) => String(Number(v.toFixed(decimals)));
const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

/** Times the data: one decimal under 100 (29.5×, 5.1×), whole above (165×). */
export const formatAmp = (v: number) => `${v < 100 ? trim(v, 1) : group(v)}×`;
/** Space: two decimals (1.11×). */
export const formatSpace = (v: number) => `${trim(v, 2)}×`;
export const formatB = (v: number) => `${group(v)} B`;
export const formatBytes = (v: number) => `${group(v)} bytes`;
/** A size in bytes, in MB under a gigabyte, then GB with a tenth under 100 GB. */
export const formatSize = (bytes: number) =>
  bytes >= GB * 0.95 ? `${bytes >= 100 * GB ? group(bytes / GB) : trim(bytes / GB, 1)} GB` : `${group(bytes / MB)} MB`;
export const formatGb = (v: number) => `${group(v)} GB`;
export const formatKb = (v: number) => `${v} KB`;
export const formatRate = (v: number) => `${group(v)} MB/s`;
export const formatCount = (v: number) => (v >= 1e9 ? `${trim(v / 1e9, 2)} billion` : v >= 1e6 ? `${trim(v / 1e6, 1)} million` : group(v));
/** Three significant figures, for a rate read as "about" (104,858 a second reads 105,000). */
export const roundSignificant = (v: number) => {
  const p = 10 ** Math.max(0, Math.floor(Math.log10(Math.abs(v))) - 2);
  return Math.round(v / p) * p;
};
export const formatReads = (v: number) => `${v} disk ${plural(v, 'read', 'reads')}`;
export const formatLevels = (v: number) => `${v} ${plural(v, 'level', 'levels')}`;
export const formatPages = (v: number) => `${formatCount(v)} ${plural(v, 'page', 'pages')}`;
