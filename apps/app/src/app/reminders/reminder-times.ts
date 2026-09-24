/** "HH:MM" in 24-hour form, the value of an `<input type="time">`. */
export type ClockTime = string;

export function parseClockTime(value: ClockTime): { hour: number; minute: number } | null {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  return match ? { hour: Number(match[1]), minute: Number(match[2]) } : null;
}

/**
 * The next `days` local occurrences of a clock time, skipping one that is less than a minute away.
 * Built with calendar arithmetic rather than adding 24 h, so the time stays put across DST changes.
 */
export function upcomingTimes(now: Date, time: ClockTime, days: number): Date[] {
  const clock = parseClockTime(time);
  if (!clock) return [];
  const out: Date[] = [];
  for (let offset = 0; out.length < days && offset <= days; offset++) {
    const at = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset, clock.hour, clock.minute);
    if (at.getTime() > now.getTime() + 60_000) out.push(at);
  }
  return out;
}
