/** A question a case widget asks about its own settings, answered before the widget shows the result. */
export interface WidgetCheckpoint {
  prompt: string;
  choices: string[];
  answer: number;
  explain: string;
}

export const num = (v: number) => Math.round(v).toLocaleString('en-US');

/**
 * The correct value and the candidates far enough from it and from each other (a quarter apart, and at least `gap`) that
 * exactly one choice fits, ascending, as three or four labels: when too few candidates are apart, multiples of the
 * correct value (or of the gap, when it is zero) fill in.
 */
export function spacedChoices(
  correct: number,
  candidates: readonly number[],
  label: (v: number) => string,
  gap = 2,
): Pick<WidgetCheckpoint, 'choices' | 'answer'> {
  const kept = [correct];
  const apart = (a: number, b: number) => Math.abs(a - b) >= Math.max(gap, 0.25 * Math.max(Math.abs(a), Math.abs(b)));
  const base = correct || gap;
  const fallbacks = [base * 4, base / 4, base * 16, base / 16];
  for (const v of [...candidates, ...fallbacks]) {
    if (kept.length === 4 || (kept.length >= 3 && fallbacks.includes(v))) break;
    if (Number.isFinite(v) && v >= 0 && kept.every((k) => apart(k, v))) kept.push(v);
  }
  const values = kept.sort((a, b) => a - b);
  return { choices: values.map(label), answer: values.indexOf(correct) };
}
