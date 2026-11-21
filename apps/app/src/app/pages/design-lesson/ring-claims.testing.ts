/** What no Sharding surface may say: a hidden value's default, a count in the wrong grammar, a number without its separator. */
export const FALSE_CLAIMS = [
  /NaN|undefined|Infinity|null/,
  /(?<!\+ )\b1 (keys|nodes|shards|points)\b/,
  /\b0 keys? moved to\b|\bAll 0\b|\bAll 1 moved\b/,
  /\b0 of \d+ keys moved(?! so far)/,
  /\d{4,}(?![\d,]*\s*mod)(?!,)/,
  /\s\./,
  /,\s*,|\.\./,
];
