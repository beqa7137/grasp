import { ROUND_NAMES, type PlanRound } from '../plan/options.js';
import { searchIndex } from './rows.js';
import { phraseOf, prepare, queryWords, scoreOf, suggestionDistance, wordsOf, type Prepared } from './score.js';
import { SEARCH_KINDS, type SearchGroup, type SearchResult, type SearchIndex, type SearchKind, type SearchRow } from './types.js';

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
};

const ROUND_OF: Record<Exclude<SearchKind, 'mock'>, PlanRound> = {
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

/** Which kind a row's tags name. */
const TAG_KIND: Partial<Record<SearchKind, SearchKind>> = {
  problem: 'pattern',
  visualizer: 'pattern',
  mission: 'topic',
  case: 'topic',
  question: 'competency',
};

const DIFFICULTY_NAMES: Record<string, string> = { easy: 'Easy', medium: 'Medium', hard: 'Hard' };

interface Entry {
  kind: SearchKind;
  id: string;
  title: string;
  meta: string;
  round: PlanRound;
  prepared: Prepared;
}

function entries(index: Partial<SearchIndex>): Entry[] {
  const names = (kind: SearchKind | undefined) => new Map((kind ? SEARCH_INDEX[kind] : []).map(([id, title]) => [id, title]));
  return SEARCH_KINDS.flatMap((kind) => {
    const tagNames = names(TAG_KIND[kind]);
    const kindWords = wordsOf(SEARCH_KIND_NAMES[kind].join(' '));
    return (index[kind] ?? []).map(([id, title, blurb, tags = [], aliases = []]: SearchRow): Entry => {
      const tagged = kind === 'mock' ? [] : tags.map((t) => tagNames.get(t) ?? t);
      const meta =
        kind === 'problem'
          ? (DIFFICULTY_NAMES[blurb] ?? blurb)
          : kind === 'visualizer' || kind === 'question'
            ? tagged.join(', ')
            : kind === 'mock'
              ? 'Scripted or AI · needs a connection'
              : blurb;
      return {
        kind,
        id,
        title,
        meta,
        round: kind === 'mock' ? (tags[0] === 'coding' ? 'coding' : 'design') : ROUND_OF[kind],
        prepared: prepare({
          title,
          aliases,
          tagWords: tagged.flatMap(wordsOf),
          blurbWords: [...wordsOf(blurb), ...kindWords],
        }),
      };
    });
  });
}

const KIND_ORDER = new Map(SEARCH_KINDS.map((k, i) => [k, i]));
const byRank = (a: SearchResult, b: SearchResult) =>
  b.score - a.score || KIND_ORDER.get(a.kind)! - KIND_ORDER.get(b.kind)! || a.title.length - b.title.length || a.title.localeCompare(b.title);

let shared: Entry[] | null = null;
const indexEntries = () => (shared ??= entries(SEARCH_INDEX));

/** Everything the query finds, best first. `stories` are the learner's own, searched here and never indexed. */
export function searchAll(query: string, stories: readonly SearchRow[] = []): SearchResult[] {
  const words = queryWords(query);
  if (!words.length) return [];
  const pool = stories.length ? [...indexEntries(), ...entries({ story: stories })] : indexEntries();
  return pool
    .flatMap(({ prepared, ...hit }) => {
      const score = scoreOf(prepared, words);
      return score ? [{ ...hit, score }] : [];
    })
    .sort(byRank);
}

/** A query that finds nothing may be a typo: the closest title or alias, or null. */
export function didYouMean(query: string): string | null {
  const phrase = phraseOf(query);
  let best: { title: string; distance: number } | null = null;
  for (const e of indexEntries()) {
    for (const candidate of [e.prepared.phrase, ...e.prepared.aliasPhrases]) {
      const distance = suggestionDistance(phrase, candidate);
      if (distance !== null && (!best || distance < best.distance)) best = { title: e.title, distance };
    }
  }
  return best?.title ?? null;
}

/**
 * Results grouped by round, then kind (2.9), each in the order of its best hit, since a Map keeps the order hits first
 * reach it; a kind shows at most `limit` hits.
 */
export function groupHits(hits: readonly SearchResult[], limit = Infinity): SearchGroup[] {
  const rounds = new Map<PlanRound, Map<SearchKind, SearchResult[]>>();
  for (const hit of [...hits].sort(byRank)) {
    const kinds = rounds.get(hit.round) ?? rounds.set(hit.round, new Map()).get(hit.round)!;
    (kinds.get(hit.kind) ?? kinds.set(hit.kind, []).get(hit.kind)!).push(hit);
  }
  return [...rounds].map(([round, kinds]) => ({
    round,
    kinds: [...kinds].map(([kind, all]) => ({ kind, hits: all.slice(0, limit), total: all.length })),
  }));
}

export const roundName = (round: PlanRound) => ROUND_NAMES[round];

/** Where a hit opens. A mock round opens the Mock hub with its start sheet (`?round=`). */
export function searchHref(hit: Pick<SearchResult, 'kind' | 'id'>): string {
  const id = encodeURIComponent(hit.id);
  const paths: Record<SearchKind, string> = {
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
