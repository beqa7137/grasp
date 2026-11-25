/**
 * Words no Unique IDs surface may print: a value the stage failed to fill, a count with the wrong plural, a doubled "?",
 * a dash or a non-breaking space. Every ids spec checks these.
 */
export const FALSE_CLAIMS = [
  /NaN|undefined|Infinity|null/,
  /\b1 (ids|generators|numbers|ticks|bits|requests|pages)\b/,
  /(^|[^\w,.])[02-9]\d* (id|generator|number|tick|bit|request|page)\b(?!s|-| bits?\b| numbers?\b| ticks? a\b)/,
  /\?\?/,
  /\u2014|\u00a0/,
];

/** A full sentence: none opens on a numeral, no doubled space or space before a stop. */
export const PROSE = [/(^|[.?!] )\d/, / {2}/, / ,| \./];
