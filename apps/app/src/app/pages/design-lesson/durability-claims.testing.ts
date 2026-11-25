/**
 * Words no Durability surface may print: a hidden value given a wrong default, a count with the wrong plural, exponent
 * notation, a doubled "?", a dash or a non-breaking space. Every durability spec checks these.
 */
export const FALSE_CLAIMS = [
  /NaN|undefined|Infinity|null/,
  /\d(?:\.\d+)?e[+-]?\d/,
  /(^|[^\d.])0 (pieces|copies|disks|years|nines)\b/,
  /\b1 (pieces|copies|disks|years|ways|others)\b/,
  /\b(?:[2-9]|\d{2,}) (piece|copy|disk|way|other)\b(?!s)/,
  /\?\?/,
  /\u2014|\u00a0/,
];

/** A full sentence: none opens on a numeral, thousands carry separators, no doubled space or space before a stop. */
export const PROSE = [/(^|[.?!] )\d/, /\d{4,}/, / {2}/, / ,| \./];
