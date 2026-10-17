import { describe, expect, it } from 'vitest';
import { EMPTY_SEARCH_QUERY, parseSearchQuery, searchQueryParams } from './query.js';
import { didYouMean, groupHits, searchAll, searchHref } from './search.js';

const top = (query: string) => {
  const [first] = searchAll(query);
  return first ? `${first.kind}:${first.id}` : null;
};

/** The ranking spec (REDESIGN.md 2.9): what a query's first result is. */
const RANKING: readonly (readonly [query: string, first: string])[] = [
  ['rate', 'topic:sd-rate-limiting'],
  ['binary search', 'pattern:binary-search'],
  ['two sum', 'problem:two-sum'],
  ['koko', 'problem:koko-bananas'],
  ['sorted', 'pattern:two-pointers'],
  ['prerequisites', 'pattern:topo-sort'],
  ['contiguous', 'problem:contiguous-array'],
  ['k-th', 'visualizer:kth-largest'],
  ['disagree', 'competency:conflict'],
  ['ship within d days', 'mock:shipping-capacity'],
  ['capacity to ship', 'problem:ship-within-days'],
  ['longest repeating run', 'mock:longest-k-replace'],
  ['design a url shortener', 'mock:url-shortener'],
  ['url', 'case:url-shortener'],
  ['news feed', 'case:news-feed'],
  ['chat', 'case:chat'],
  ['union find', 'pattern:union-find'],
  ['union-find', 'pattern:union-find'],
  ['trie', 'pattern:trie'],
  ['heap', 'pattern:heap'],
  ['top k', 'problem:top-k-frequent'],
  ['dijkstra', 'visualizer:dijkstra'],
  ['bfs', 'pattern:bfs'],
  ['mst', 'pattern:minimum-spanning-tree'],
  ['dp', 'pattern:dp-1d'],
  ['lcs', 'visualizer:lcs'],
  ['tree dfs', 'pattern:tree-dfs'],
  ['tree traversal', 'pattern:tree-dfs'],
  ['valid sudoku', 'problem:valid-sudoku'],
  ['house robber iii', 'problem:house-robber-tree'],
  ['01 matrix', 'problem:zero-one-matrix'],
  ['daily temperatures', 'problem:daily-temperatures'],
  ['caching', 'topic:sd-caching'],
  ['caching & cdns', 'topic:sd-caching'],
  ['cdn', 'topic:sd-cdn'],
  ['replication & databases', 'topic:sd-replication'],
  ['observability', 'topic:sd-observability'],
  ['bot', 'mission:bot-storm'],
  ['flash sale', 'mission:flash-sale'],
  ['leader', 'mission:leaderboard-budget'],
  ['stock', 'case:stock-exchange'],
  ['mistake', 'competency:failure'],
  ['describe a time you disagreed with your manager', 'question:conflict-2'],
  ['Dijkstra’s', 'visualizer:dijkstra'],
];

describe('search ranking', () => {
  it.each(RANKING)('ranks "%s" first as %s', (query, first) => {
    expect(top(query)).toBe(first);
  });

  it('finds the rate limiter in one list from four keystrokes: the topic, Bot Storm, the case and the mock round', () => {
    const groups = groupHits(searchAll('rate'), 8);
    expect(groups.map((g) => g.round)).toEqual(['design']);
    const found = groups[0].kinds.flatMap((k) => k.hits.map((h) => `${h.kind}:${h.id}`));
    expect(found).toEqual(expect.arrayContaining(['topic:sd-rate-limiting', 'mission:bot-storm', 'case:rate-limiter', 'mock:rate-limiter']));
    expect(groups[0].kinds.map((k) => k.kind)).toEqual(['topic', 'case', 'mock', 'mission']);
  });

  it('suggests the closest title within two edits when nothing matches', () => {
    expect(searchAll('rate limter')).toEqual([]);
    expect(didYouMean('rate limter')).toBe('Rate Limiter');
    expect(didYouMean('dijsktra')).toBe("Dijkstra's Shortest Paths");
    expect(didYouMean('zzzzzz')).toBeNull();
    expect(didYouMean('qx')).toBeNull();
  });

  it('caps each kind at the limit and keeps the full count for See all', () => {
    const problems = groupHits(searchAll('binary search'), 8)[0].kinds.find((k) => k.kind === 'problem')!;
    expect(problems.hits).toHaveLength(8);
    expect(problems.total).toBeGreaterThan(8);
  });

  it('never shows a problem its patterns, which would spoil the recognition step', () => {
    for (const hit of searchAll('binary search').filter((h) => h.kind === 'problem')) expect(['Easy', 'Medium', 'Hard']).toContain(hit.meta);
  });

  it('searches stories it is given, under Behavioral', () => {
    const [hit] = searchAll('migration', [['s1', 'The database migration', '']]);
    expect(hit).toMatchObject({ kind: 'story', id: 's1', round: 'behavioral' });
    expect(searchHref(hit)).toBe('/behavioral/stories/s1');
  });

  it('opens a mock round on the Mock hub with its start sheet', () => {
    expect(searchHref({ kind: 'mock', id: 'rate-limiter' })).toBe('/mock?round=rate-limiter');
    expect(searchHref({ kind: 'question', id: 'conflict-2' })).toBe('/behavioral/question/conflict-2');
  });
});

describe('the search page query', () => {
  it('reads and writes its URL, dropping unknown kinds and keeping index order', () => {
    const query = parseSearchQuery({ q: ' rate ', kind: 'mock,bogus,topic' });
    expect(query).toEqual({ q: 'rate', kind: ['topic', 'mock'] });
    expect(searchQueryParams(query)).toEqual({ q: 'rate', kind: 'topic,mock' });
    expect(searchQueryParams(EMPTY_SEARCH_QUERY)).toEqual({ q: null, kind: null });
  });
});
