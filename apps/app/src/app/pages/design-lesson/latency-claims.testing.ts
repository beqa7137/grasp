/** A hidden value is never replaced by a wrong default, and nothing past 100% is "busy": every latency spec checks these. */
export const FALSE_CLAIMS = [
  /(^|[^\d.,])0 waiting/,
  /(^|[^\d.,])0% of requests/,
  /(^|[^\d.,])0 (more|requests a second)/,
  /(^|[^\d.,])0 ms waiting/,
  /(^|[^\d.])(1\d\d|[2-9]\d\d)(\.\d+)?% busy/,
  /NaN/,
  /undefined/,
  /Infinity/,
];

/** Words that only fit one count, said of another. */
export const BAD_GRAMMAR = [
  /\b1 (servers|requests|were)\b/,
  /\b([02-9]|\d\d+) (server|request|was) /,
  /\b1 up · each\b/,
  /One server[^.]*each \d/,
  /\bthe 1 servers\b/,
  /\ball 2 up\b/,
];

/** "each" said of the servers where one is left; "a queue each" names the configuration, not the servers. */
export const EACH_OF_ONE = /(?<!queue )\beach\b/;
