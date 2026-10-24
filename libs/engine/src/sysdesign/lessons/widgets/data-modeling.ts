export type FeedModel = 'n-plus-one' | 'batched' | 'join' | 'denormalized';

/** The rate the background copy rewrite (the lesson's "fan out to every copy") writes rows at: the lesson's worked example. */
export const FEED_FANOUT_ROWS_PER_S = 5_000;
export const FEED_PAGE_SIZES = [10, 20, 50, 100] as const;
export const FEED_POSTS_PER_AUTHOR = [10, 100, 500, 5_000, 100_000] as const;
export const FEED_PAGES_PER_S = [10, 100, 1_000, 10_000, 100_000] as const;
export const FEED_RENAMES_PER_S = [0.01, 0.1, 1, 10, 100] as const;
/** Where the database is: a round trip from the app server. */
export const FEED_PLACES = [
  { id: 'host', name: 'same host', at: 'on the same host', rttMs: 0.1 },
  { id: 'zone', name: 'same zone', at: 'in the same zone', rttMs: 1 },
  { id: 'cross-zone', name: 'cross-zone', at: 'in another zone', rttMs: 2 },
  { id: 'region', name: 'another region', at: 'in another region', rttMs: 30 },
] as const;
/** The three ways to read the normalized schema, by the index the widget's `read` setting uses. */
export const FEED_READS = ['n-plus-one', 'batched', 'join'] as const satisfies readonly FeedModel[];

export interface FeedCost {
  /** Queries a feed page sends to the database, one after another. */
  queriesPerPage: number;
  /** Time spent waiting on the database per page, at `rttMs` a query. */
  waitMs: number;
  /** Rows the database reads per page. */
  rowsReadPerPage: number;
  /** Rows written when one author changes their name. */
  rowsPerRename: number;
  /** Rows the database reads and writes a second for pages and renames together. */
  rowsPerSecond: number;
  /** Whether a page can show an author's old name after a rename. */
  staleAfterRename: boolean;
  queriesPerSecond: number;
  readRowsPerSecond: number;
  writeRowsPerSecond: number;
  /** How long one rename's copy rewrite runs, at the rewrite's rate. */
  rewriteMs: number;
  /** How long a rename leaves the old name on some copies: one rewrite's run, or forever once the rewrite falls behind. */
  staleMs: number;
  /** Pages served while a rename's copies disagree (not pages that show the author); unbounded once the rewrite falls behind. */
  pagesWhileStale: number;
  /** The copy rows the renames need a second over what the rewrite writes; above 1 it falls behind for good. */
  fanoutLoad: number;
  /** How fast the rewrite's backlog grows once it falls behind. */
  fanoutBacklogRowsPerSecond: number;
  /** Renames a second up to which copying the name saves rows: the rows it saves on reads over the rows a rename adds. */
  breakEvenRenamesPerSecond: number;
  /** Renames a second above which the copy rewrite falls behind. */
  fanoutLimitRenamesPerSecond: number;
}

export interface FeedOptions {
  pageSize: number;
  postsPerAuthor: number;
  pagesPerSecond: number;
  renamesPerSecond: number;
  rttMs: number;
}

/**
 * A feed page shows `pageSize` posts, each by a different author, with the author's name. Kept apart (normalized), the
 * names come from the authors table: one query per post's author (the N+1 pattern an ORM falls into), one batched
 * `WHERE id IN (...)` query, or one join; all three read the same rows. Copied into each post (denormalized), a page is
 * one read of half the rows, but a rename rewrites every post the author wrote, a copy rewrite done in the background at
 * `FEED_FANOUT_ROWS_PER_S`, so pages show the old name until it finishes. Each query costs a round trip of `rttMs`.
 */
export function feedCost(model: FeedModel, options: FeedOptions): FeedCost {
  const { pageSize, postsPerAuthor, pagesPerSecond, renamesPerSecond, rttMs } = options;
  const denormalized = model === 'denormalized';
  const queriesPerPage = model === 'n-plus-one' ? 1 + pageSize : model === 'batched' ? 2 : 1;
  const rowsReadPerPage = denormalized ? pageSize : 2 * pageSize;
  const rowsPerRename = denormalized ? 1 + postsPerAuthor : 1;
  const readRowsPerSecond = pagesPerSecond * rowsReadPerPage;
  const writeRowsPerSecond = renamesPerSecond * rowsPerRename;
  const rewriteS = postsPerAuthor / FEED_FANOUT_ROWS_PER_S;
  const fanoutLoad = denormalized ? renamesPerSecond * rewriteS : 0;
  // Exactly at capacity the rewrite still keeps up, with no slack; past it, some copies are never fresh again.
  const behind = fanoutLoad > 1;
  return {
    queriesPerPage,
    waitMs: queriesPerPage * rttMs,
    rowsReadPerPage,
    rowsPerRename,
    rowsPerSecond: readRowsPerSecond + writeRowsPerSecond,
    staleAfterRename: denormalized,
    queriesPerSecond: pagesPerSecond * queriesPerPage,
    readRowsPerSecond,
    writeRowsPerSecond,
    rewriteMs: denormalized ? rewriteS * 1_000 : 0,
    staleMs: denormalized ? (behind ? Infinity : rewriteS * 1_000) : 0,
    pagesWhileStale: denormalized ? (behind ? Infinity : pagesPerSecond * rewriteS) : 0,
    fanoutLoad,
    fanoutBacklogRowsPerSecond: denormalized ? Math.max(0, renamesPerSecond * postsPerAuthor - FEED_FANOUT_ROWS_PER_S) : 0,
    breakEvenRenamesPerSecond: (pagesPerSecond * pageSize) / postsPerAuthor,
    fanoutLimitRenamesPerSecond: FEED_FANOUT_ROWS_PER_S / postsPerAuthor,
  };
}

/**
 * Rows per post shown at `renamesPerPost` (renames a second over posts shown a second): a post's reads, plus each
 * rename's writes shared out over the posts shown. The two schemas cross at 1 rename per `postsPerAuthor` posts shown.
 */
export function feedRowsPerPost(denormalized: boolean, renamesPerPost: number, postsPerAuthor: number): number {
  return denormalized ? 1 + (1 + postsPerAuthor) * renamesPerPost : 2 + renamesPerPost;
}

/**
 * The widget's settings by the names its experiments use: the schema (0 normalized, 1 denormalized), the read by its
 * index in `FEED_READS` and the database's place by its index in `FEED_PLACES`.
 */
export interface FeedSettings {
  schema: number;
  read: number;
  pageSize: number;
  postsPerAuthor: number;
  pagesPerSecond: number;
  renamesPerSecond: number;
  place: number;
}

export const FEED_BASELINE: Readonly<FeedSettings> = {
  schema: 0,
  read: 0,
  pageSize: 20,
  postsPerAuthor: 500,
  pagesPerSecond: 1_000,
  renamesPerSecond: 1,
  place: 1,
};

export const feedModelOf = (s: Pick<FeedSettings, 'schema' | 'read'>): FeedModel => (s.schema === 1 ? 'denormalized' : FEED_READS[s.read]);

/** The cost at the widget's settings, read as `model` (by default the settings' own). */
export function feedAt(s: FeedSettings, model: FeedModel = feedModelOf(s)): FeedCost {
  return feedCost(model, {
    pageSize: s.pageSize,
    postsPerAuthor: s.postsPerAuthor,
    pagesPerSecond: s.pagesPerSecond,
    renamesPerSecond: s.renamesPerSecond,
    rttMs: FEED_PLACES[s.place].rttMs,
  });
}
