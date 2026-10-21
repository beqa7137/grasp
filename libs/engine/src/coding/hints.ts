/** Words too common in statements and cues to point at a pattern. */
const COMMON = new Set([
  'about',
  'after',
  'array',
  'arrays',
  'before',
  'each',
  'element',
  'elements',
  'every',
  'from',
  'given',
  'have',
  'integer',
  'integers',
  'into',
  'number',
  'numbers',
  'only',
  'order',
  'other',
  'path',
  'return',
  'same',
  'some',
  'string',
  'strings',
  'such',
  'than',
  'that',
  'their',
  'then',
  'there',
  'this',
  'time',
  'until',
  'value',
  'values',
  'when',
  'where',
  'which',
  'with',
  'word',
  'your',
]);

/** Words of four letters or more, lower case, without the common ones. */
const words = (text: string) => (text.toLowerCase().match(/[a-z]{4,}/g) ?? []).filter((w) => !COMMON.has(w));

/** Two words share a stem when one starts with the other's first five letters ("pair" and "pairs", "finish" and "finished"). */
const sameStem = (a: string, b: string) => a.slice(0, 5).startsWith(b.slice(0, 5)) || b.slice(0, 5).startsWith(a.slice(0, 5));

export interface CueMatch {
  /** The pattern's cues that share a word with the statement, in the pattern's order. */
  cues: string[];
  /** The statement's words those cues share, as the statement first writes them, one form each. */
  words: string[];
}

/**
 * The hint ladder's second rung (REDESIGN.md 4.2): which of a pattern's cues the problem's own statement echoes, built from
 * existing content only. Empty when the statement shares no word with any cue.
 */
export function matchingCues(cues: readonly string[], statement: string): CueMatch {
  const said = [...new Set(words(statement))];
  // A cue counts when the statement says a word it leads with (the first of each alternative split by "/": "Rotated sorted
  // array" is about rotation, "capacity / speed / days" about any of the three), or all of its words; a later word alone
  // ("sorted") would pull in a cue the problem is not.
  const matched = cues.map((cue) => {
    const own = words(cue);
    const leads = cue.split('/').flatMap((part) => words(part).slice(0, 1));
    const echoed = own.filter((c) => said.some((w) => sameStem(w, c)));
    const counts = own.length > 0 && (leads.some((l) => echoed.includes(l)) || echoed.length === own.length);
    return { cue, hits: counts ? said.filter((w) => own.some((c) => sameStem(w, c))) : [] };
  });
  const hits = new Set(matched.flatMap((m) => m.hits));
  // One form of each word: "temperatures" and "temperature" read as one cue word.
  const shown = said.filter((w, i) => hits.has(w) && !said.slice(0, i).some((earlier) => hits.has(earlier) && sameStem(earlier, w)));
  return { cues: matched.filter((m) => m.hits.length).map((m) => m.cue), words: shown };
}
