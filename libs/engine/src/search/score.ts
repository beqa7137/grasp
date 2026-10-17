/** The scores of 2.9: the query is the whole title, starts it, starts an alias, or its words start the row's words. */
export const SCORES = { exact: 100, titlePrefix: 60, alias: 50, titleWord: 40, tag: 25, blurbWord: 10 } as const;

const fold = (text: string) =>
  text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ'’]/g, '');

/** A text's words: "K-th Largest" gives k, th, kth and largest, so both "k th" and "kth" find it. */
export function wordsOf(text: string): string[] {
  return fold(text)
    .split(/[^a-z0-9-]+/)
    .flatMap((chunk) => {
      const parts = chunk.split('-').filter(Boolean);
      return parts.length > 1 ? [...parts, parts.join('')] : parts;
    });
}

/** What is typed, as words: a hyphen joins ("k-th" is kth), anything else separates. */
export function queryWords(query: string): string[] {
  return fold(query)
    .split(/[^a-z0-9-]+/)
    .map((w) => w.replace(/-/g, ''))
    .filter(Boolean);
}

/** A title or alias as one comparable phrase, without spaces, so "union find" and "Union-Find" are the same title. */
export const phraseOf = (text: string) => queryWords(text).join('');

export interface Scorable {
  title: string;
  aliases: readonly string[];
  /** Words of the tags' names. */
  tagWords: readonly string[];
  /** Words of the blurb and the kind's own name ("mock", "case"). */
  blurbWords: readonly string[];
}

export interface Prepared {
  phrase: string;
  aliasPhrases: readonly string[];
  titleWords: readonly string[];
  tagWords: readonly string[];
  otherWords: readonly string[];
}

export function prepare(item: Scorable): Prepared {
  return {
    phrase: phraseOf(item.title),
    aliasPhrases: item.aliases.map(phraseOf),
    titleWords: [...wordsOf(item.title), ...item.aliases.flatMap(wordsOf)],
    tagWords: item.tagWords,
    otherWords: item.blurbWords,
  };
}

const covers = (query: readonly string[], ...fields: (readonly string[])[]) =>
  query.every((q) => fields.some((words) => words.some((w) => w.startsWith(q))));

/** The item's score for the query's words: the best rule it meets, 0 for none. */
export function scoreOf(item: Prepared, query: readonly string[]): number {
  if (!query.length) return 0;
  const phrase = query.join('');
  if (item.phrase === phrase) return SCORES.exact;
  if (item.phrase.startsWith(phrase)) return SCORES.titlePrefix;
  if (item.aliasPhrases.some((a) => a.startsWith(phrase))) return SCORES.alias;
  if (covers(query, item.titleWords)) return SCORES.titleWord;
  if (covers(query, item.titleWords, item.tagWords)) return SCORES.tag;
  if (covers(query, item.titleWords, item.tagWords, item.otherWords)) return SCORES.blurbWord;
  return 0;
}

/** Levenshtein distance, giving up past `limit`. */
export function editDistance(a: string, b: string, limit = Infinity): number {
  if (Math.abs(a.length - b.length) > limit) return limit + 1;
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      best = Math.min(best, current[j]);
    }
    if (best > limit) return limit + 1;
    previous = current;
  }
  return previous[b.length];
}

/** At most this many edits away, and fewer than half the query's letters, so a short query is not "corrected" into anything. */
const SUGGEST_EDITS = 2;

/**
 * How far a query is from a title or alias: the whole phrase, or its start as long as the query, so a typo in a partly typed
 * title ("rate limt") still finds it. Null when too far.
 */
export function suggestionDistance(query: string, phrase: string): number | null {
  const limit = Math.min(SUGGEST_EDITS, Math.ceil(query.length / 2) - 1);
  if (limit < 1) return null;
  const whole = editDistance(query, phrase, limit);
  const start = query.length >= 4 && phrase.length > query.length ? editDistance(query, phrase.slice(0, query.length), limit) : whole;
  const d = Math.min(whole, start);
  return d <= limit ? d : null;
}
