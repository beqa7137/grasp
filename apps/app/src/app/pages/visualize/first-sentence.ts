const ABBREVIATIONS = /(?:^|\s)(?:e\.g|i\.e|vs)$/i;

/**
 * The first sentence of a tracer's note, for the caption beside a checkpoint until frames carry their own (R4). A sentence
 * ends at `.`, `!` or `?` outside a code span, after any closing brackets or quotes, before a space and a word that does
 * not start in lower case. Without one, the whole note is the sentence.
 */
export function firstSentence(note: string): string {
  let inCode = false;
  for (let i = 0; i < note.length; i++) {
    const c = note[i];
    if (c === '`') inCode = !inCode;
    if (inCode || !'.!?'.includes(c) || ABBREVIATIONS.test(note.slice(0, i))) continue;
    let end = i + 1;
    while (end < note.length && '.!?)]"\''.includes(note[end])) end++;
    const rest = note.slice(end);
    if (/^\s+[^\s\p{Ll}]/u.test(rest)) return note.slice(0, end);
    i = end - 1;
  }
  return note;
}
