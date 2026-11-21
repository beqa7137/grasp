/** Times and shares as the lessons say them: a downtime, an availability, hours as a bound and one in so many. */

const trim = (v: number, decimals: number) => String(Number(v.toFixed(decimals)));

/** A downtime, from hours: in the unit an interviewer would say it in, never without a unit and never as 0. */
export function formatDown(hours: number): string {
  const s = hours * 3600;
  if (s < 0.005) return 'under 0.01 s';
  if (s < 0.995) return `${trim(s, 2)} s`;
  if (s < 9.95) return `${trim(s, 1)} s`;
  if (s < 119.5) return `${Math.round(s)} s`;
  const min = s / 60;
  // A whole number of hours is said in hours ("1 h", never "60 min").
  if (hours >= 1 && hours < 72 && Math.abs(hours - Math.round(hours)) < 1 / 120) return `${Math.round(hours)} h`;
  if (min < 9.95) return `${trim(min, 1)} min`;
  if (min < 119.5) return `${Math.round(min)} min`;
  if (hours < 72) return `${trim(hours, 1)} h`;
  const d = hours / 24;
  return `${d < 10 ? trim(d, 2) : trim(d, 1)} d`;
}

/**
 * An availability from its unavailability, to the digit after its nines: 99.8%, 99.983%, 99.9999%. It is cut at that
 * digit, never rounded up, as an SLO report would: a design down 8.78 h a year is 99.89%, not three nines.
 */
export function formatAvailability(u: number): string {
  const d = Math.min(10, Math.max(1, Math.ceil(-Math.log10(u) - 1e-9) - 1));
  const f = 10 ** d;
  return `${trim(Math.floor(100 * (1 - u) * f + 1e-6) / f, d)}%`;
}

/** Hours as a bound is written: up to two decimals ("8.76 h"). */
export const formatHours = (h: number) => `${trim(h, 2)} h`;

/** A share as one in so many: 0.1 is "1 in 10". */
export const formatOneIn = (share: number) => `1 in ${Math.round(1 / share)}`;
