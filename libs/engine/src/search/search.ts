import { ROUND_NAMES, type PlanRound } from '../plan/options.js';
import { PRODUCT_NAMES } from './keywords.js';
import { searchIndex } from './rows.js';
import { phraseOf, prepare, queryWords, scoreOf, suggestionDistance, withoutFiller, wordsOf, type Prepared } from './score.js';
import {
  SEARCH_KINDS,
  type SearchGroup,
  type SearchIndex,
  type SearchKind,
  type SearchResult,
  type SearchRound,
  type SearchRow,
} from './types.js';

export const SEARCH_INDEX: SearchIndex = searchIndex();

/** Each kind's name, one and many: "Mock round", "See all 23 problems". */
export const SEARCH_KIND_NAMES: Record<SearchKind, readonly [one: string, many: string]> = {
  pattern: ['Pattern', 'Patterns'],
  visualizer: ['Visualizer', 'Visualizers'],
  problem: ['Problem', 'Problems'],
  topic: ['Topic', 'Topics'],
  mission: ['Mission', 'Missions'],
  case: ['Case', 'Cases'],
  mock: ['Mock round', 'Mock rounds'],
  competency: ['Competency', 'Competencies'],
  question: ['Question', 'Questions'],
  story: ['Story', 'Stories'],
  page: ['Page', 'Pages'],
};

/** The round of a kind's rows; a mock round's and a page's come from their one tag. */
const ROUND_OF: Record<Exclude<SearchKind, 'mock' | 'page'>, PlanRound> = {
  pattern: 'coding',
  visualizer: 'coding',
  problem: 'coding',
  topic: 'design',
  mission: 'design',
  case: 'design',
  competency: 'behavioral',
  question: 'behavioral',
  story: 'behavioral',
};

/** Which kind a row's tags name; other tags are read as written (a pattern's track). */
const TAG_KIND: Partial<Record<SearchKind, SearchKind>> = {
  problem: 'pattern',
  visualizer: 'pattern',
  mission: 'topic',
  case: 'topic',
  question: 'competency',
};

const DIFFICULTY_NAMES: Record<string, string> = { easy: 'Easy', medium: 'Medium', hard: 'Hard' };

/** Question prompts are long sentences: a typed word under this length matches only a whole word ("trie" is not "tried"). */
const PROMPT_MIN_PREFIX = 5;

interface Entry {
  kind: SearchKind;
  id: string;
  title: string;
  meta: string;
  round: SearchRound;
  aliases: readonly string[];
  prepared: Prepared;
}

function roundOf(kind: SearchKind, tags: readonly string[]): SearchRound {
  if (kind === 'mock') return tags[0] === 'coding' ? 'coding' : 'design';
  if (kind === 'page') return tags[0] as SearchRound;
  return ROUND_OF[kind];
}

function metaOf(kind: SearchKind, blurb: string, tagged: readonly string[]): string {
  if (kind === 'problem') return DIFFICULTY_NAMES[blurb] ?? blurb;
  if (kind === 'visualizer' || kind === 'question') return tagged.join(', ');
  if (kind === 'mock') return 'Scripted or AI · needs a connection';
  return blurb;
}

function entries(index: Partial<SearchIndex>): Entry[] {
  const names = (kind: SearchKind | undefined) => new Map((kind ? SEARCH_INDEX[kind] : []).map(([id, title]) => [id, title]));
  return SEARCH_KINDS.flatMap((kind) => {
    const tagNames = names(TAG_KIND[kind]);
    const kindWords = wordsOf(SEARCH_KIND_NAMES[kind].join(' '));
    return (index[kind] ?? []).map(([id, title, blurb, tags = [], aliases = []]: SearchRow): Entry => {
      const tagged = kind === 'mock' || kind === 'page' ? [] : tags.map((t) => tagNames.get(t) ?? t);
      return {
        kind,
        id,
        title,
        meta: metaOf(kind, blurb, tagged),
        round: roundOf(kind, tags),
        aliases,
        prepared: prepare({
          title,
          aliases,
          tagWords: tagged.flatMap(wordsOf),
          blurbWords: [...wordsOf(blurb), ...kindWords],
          minPrefix: kind === 'question' ? PROMPT_MIN_PREFIX : 1,
        }),
      };
    });
  });
}

const KIND_ORDER = new Map(SEARCH_KINDS.map((k, i) => [k, i]));
const byRank = (a: SearchResult, b: SearchResult) =>
  b.score - a.score ||
  KIND_ORDER.get(a.kind)! - KIND_ORDER.get(b.kind)! ||
  a.title.length - b.title.length ||
  a.title.localeCompare(b.title);

const PRODUCTS = new Set(Object.values(PRODUCT_NAMES).flat());

let shared: Entry[] | null = null;
const indexEntries = () => (shared ??= entries(SEARCH_INDEX));

/**
 * Everything the query finds, best first. A query is also read without its filler words ("design a URL shortener"), and an
 * item scores the better reading. `stories` are the learner's own, searched here and never indexed.
 */
export function searchAll(query: string, stories: readonly SearchRow[] = []): SearchResult[] {
  const words = queryWords(query);
  if (!words.length) return [];
  const plain = withoutFiller(words);
  const pool = stories.length ? [...indexEntries(), ...entries({ story: stories })] : indexEntries();
  return pool
    .flatMap(({ prepared, kind, id, title, meta, round }): SearchResult[] => {
      const score = Math.max(scoreOf(prepared, words), plain === words ? 0 : scoreOf(prepared, plain));
      return score ? [{ kind, id, title, meta, round, score }] : [];
    })
    .sort(byRank);
}

/**
 * A query that finds nothing may be a typo: the closest title, or the alias it was closest to (the title for a product
 * name), without a closing full stop
 * or question mark, so "Did you mean …?" reads right. Question prompts are sentences, not names, so they are not offered.
 */
export function didYouMean(query: string): string | null {
  const phrase = phraseOf(query);
  let best: { text: string; distance: number } | null = null;
  for (const e of indexEntries()) {
    if (e.kind === 'question') continue;
    const candidates = [[e.prepared.phrase, e.title], ...e.prepared.aliasPhrases.map((alias, i) => [alias, e.aliases[i]])];
    for (const [candidate, text] of candidates) {
      const distance = suggestionDistance(phrase, candidate);
      if (distance !== null && (!best || distance < best.distance)) best = { text: PRODUCTS.has(text) ? e.title : text, distance };
    }
  }
  return best?.text.replace(/[.?!]+$/, '') ?? null;
}

/**
 * Results grouped by round, then kind (2.9), each in the order of its best hit, since a Map keeps the order hits first
 * reach it; a kind shows at most `limit` hits.
 */
export function groupHits(hits: readonly SearchResult[], limit = Infinity): SearchGroup[] {
  const rounds = new Map<SearchRound, Map<SearchKind, SearchResult[]>>();
  for (const hit of [...hits].sort(byRank)) {
    const kinds = rounds.get(hit.round) ?? rounds.set(hit.round, new Map()).get(hit.round)!;
    (kinds.get(hit.kind) ?? kinds.set(hit.kind, []).get(hit.kind)!).push(hit);
  }
  return [...rounds].map(([round, kinds]) => ({
    round,
    kinds: [...kinds].map(([kind, all]) => ({ kind, hits: all.slice(0, limit), total: all.length })),
  }));
}

/** A group's heading: the round's name, as every screen names it, or "Around the app". */
export const roundName = (round: SearchRound) => (round === 'app' ? 'Around the app' : ROUND_NAMES[round]);

/** Where a hit opens. A mock round opens the Mock hub with its start sheet (`?round=`); a page's id is its path. */
export function searchHref(hit: Pick<SearchResult, 'kind' | 'id'>): string {
  if (hit.kind === 'page') return hit.id;
  const id = encodeURIComponent(hit.id);
  const paths: Record<Exclude<SearchKind, 'page'>, string> = {
    pattern: `/coding/patterns/${id}`,
    visualizer: `/coding/visualizers/${id}`,
    problem: `/coding/problems/${id}`,
    topic: `/design/topics/${id}`,
    mission: `/design/missions/${id}`,
    case: `/design/cases/${id}`,
    mock: `/mock?round=${id}`,
    competency: `/behavioral/${id}`,
    question: `/behavioral/question/${id}`,
    story: `/behavioral/stories/${id}`,
  };
  return paths[hit.kind];
}
