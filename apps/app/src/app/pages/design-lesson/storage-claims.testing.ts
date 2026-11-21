/**
 * Words no Storage Engines surface may print: a hidden value given a wrong default, a count with the wrong plural, a
 * bare "?", a doubled one, a dash or a non-breaking space. Every storage spec checks these.
 */
export const FALSE_CLAIMS = [
  /NaN|undefined|Infinity|null/,
  /(^|[^\d.,])0(×| B\b| MB| GB| disk| levels| pages| runs)/,
  /\b1 (levels|pages|disk reads|runs|records|merges|reads)\b/,
  /[^\d,.][2-9]\d* (level|page|disk read|run|record)\b(?!s)/,
  /= ([2-9]|\d{2,}) read\b/,
  /\?\?/,
  /\u2014|\u00a0/,
];

/** A full sentence: none opens on a numeral, thousands carry separators, no doubled space or space before a stop. */
export const PROSE = [/(^|[.?!] )\d/, /\d{4,}/, / {2}/, / ,| \./];
