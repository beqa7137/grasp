import { TEXT, type Role } from './latency-draw';

/**
 * A parenthesized group, so a product in a sum stays whole; a number and its unit or count word (and "a year" after a
 * duration), "×" with the numbers beside it, and a copy's or a week's name with its number.
 */
export const RELIABILITY_KEEP: readonly RegExp[] = [
  /\([^()]*\)/g,
  /\d[\d.,]*%? (?:h|min|s|d|×|times|copies|copy|nines|weeks|outages|failovers)\b/g,
  /\b(?:h|min|s|d) a year\b/g,
  /\d × \d/g,
  / × \d/g,
  /\b(?:LB|App|DB|Recs|Week|week) \d+/g,
];

/**
 * The runs the widget's prose never breaks inside, provided to every `g-code-text` in it: a product in parentheses
 * ("(0.88 shared outages × 1 h)"), a number and its unit, a percentile with its value ("p99 69 ms"), a count times a
 * duration ("17 × 1 h") and a copy's or a week's name with its number ("DB 2", "Week 44").
 */
export const RELIABILITY_PROSE_KEEP =
  /\(\d[^()]* × [^()]*\)|(?:\bp\d{2,3} )?(?:\d[\d,.]* × )?\d[\d,.]* (?:ns|µs|ms|s|min|h|d|KB|MB|GB|TB)\b|\b(?:LB|App|DB|Recs|Week) \d+\b/g;

/** The stage's leading for its wrapped sentences. */
export const LINE = 18;

/** Breaks a stage text into lines no wider than `width`, keeping the pairs a reader takes as one whole. */
export const wrapStage = (text: string, role: Role, width: number) => TEXT.wrap(text, role, width, Infinity, RELIABILITY_KEEP);
