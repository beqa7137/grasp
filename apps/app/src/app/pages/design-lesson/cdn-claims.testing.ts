/**
 * Words no CDNs & Edge surface may print: a hidden value given a wrong default, a count with the wrong plural, a bare
 * "?" before its unit, a doubled one, a rank past the last object, the old claim that a rank hits half the time "from"
 * it down, a dash, a non-breaking space or a straight double quote (learner text quotes with curly ones). Every CDN
 * spec checks these.
 */
export const FALSE_CLAIMS = [
  /NaN|undefined|Infinity|null/,
  /(^|[^\d.,])0(\/s| ms| locations?\b)/,
  /(^|[^\d.,])1 (locations|times|minutes|seconds|hours|URLs)\b/,
  /(^|[^\d.,])([2-9]|\d{2,}) (location|minute|second|hour|URL)\b(?!s)/,
  /\?\?/,
  /\? of /,
  /beyond the 100,000th|the 100,00[1-9]/,
  /half the time at the edge from the/,
  /\u2014|\u00a0/,
  /"/,
];

/** A full sentence: none opens on a numeral, thousands carry separators, no doubled space or space before a stop. */
export const PROSE = [/(^|[.?!] )\d/, /\d{4,}/, / {2}/, / ,| \./];
