/** A hidden value is never replaced by a wrong default, and no downtime is 0 or availability 100%: every reliability spec checks these. */
export const FALSE_CLAIMS = [
  /(^|[^\d.,])0 times/,
  /(^|[^\d.,])0 (h|s|min|d)\b/,
  /(^|[^\d.,])100%/,
  /(^|[^\d.,])1 times/,
  /(^|[^\d.,])1 copies/,
  /failed 1 time\b/,
  /NaN/,
  /undefined/,
  /Infinity/,
];

/** Words that only fit one count, said of another. */
export const BAD_GRAMMAR = [
  /\b1 (copies|failures|parts|outages)\b/,
  /\b([02-9]|\d\d+) (copy|failure|part|outage)\b/,
  /\ball 2\b/,
  /\ball 1\b/,
  // A sum of causes read as one compound duration ("1 h and 26 s").
  /\d (s|min|h|d) and \d/,
  // A product beside a sum with nothing to group it ("0.88 × 1 h + 26 s" read as 0.88 × (1 h + 26 s)).
  /× [\d.]+ (s|min|h|d),? (\+|plus)/,
  /(\+|\bplus) [\d.]+ [^()+.]*×/,
];

/**
 * Whether the stage's axis labels single out a question's answer: its value is printed there, no other choice's is,
 * and the question does not state it. Returns the value, or null.
 */
export function singledOut(axis: readonly string[], e: { ask: string; choices: readonly string[]; answer: number }): string | null {
  const lead = (c: string) => c.split(':')[0];
  const truth = lead(e.choices[e.answer]);
  if (!axis.includes(truth) || e.ask.includes(truth)) return null;
  return e.choices.some((c, i) => i !== e.answer && axis.includes(lead(c))) ? null : truth;
}
