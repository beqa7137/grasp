/** Words no Backups & Recovery surface may print: a hidden value given a default, a bare zero, a doubled "?", a dash. */
export const FALSE_CLAIMS = [
  /NaN|undefined|Infinity|null/,
  /(^|[^\d.,])0 (s|min|h|GB|TB)\b/,
  /\b1 (minutes|hours|seconds|plans|backups)\b/,
  /\?\?/,
  /\u2014|\u00a0/,
  /back in never|loses cannot|loses the table/,
];
