/** How the Backups & Recovery widget says its numbers, on the stage and in its experiments' slots. */

const GROUPED = new Intl.NumberFormat('en-US');
const group = (v: number) => GROUPED.format(Math.round(v));
const trim = (v: number, decimals: number) => String(Number(v.toFixed(decimals)));

/** A span of time from seconds: seconds under a minute, whole hours as hours, minutes under 100, then hours to a tenth. */
export function formatSpan(sec: number): string {
  if (sec < 60) return `${trim(sec, 0)} s`;
  if (sec % 3600 === 0) return `${group(sec / 3600)} h`;
  if (sec < 100 * 60) return `${group(sec / 60)} min`;
  return `${trim(sec / 3600, 1)} h`;
}
/** A recovery time, from minutes, said as a span. */
export const formatRecoveryTime = (min: number) => formatSpan(min * 60);
/** Minutes in a ledger: whole, grouped. */
export const formatMinutes = (min: number) => `${group(min)} min`;
/** A database's size, from GB: terabytes from 1,000 GB. */
export const formatDbSize = (gb: number) => (gb >= 1000 ? `${trim(gb / 1000, 1)} TB` : `${group(gb)} GB`);
export const formatRestoreSpeed = (gbPerMin: number) => `${group(gbPerMin)} GB/min`;
