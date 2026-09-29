export type FeedModel = 'n-plus-one' | 'join' | 'denormalized';

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
}

/**
 * A feed page shows `pageSize` posts, each by a different author, with the author's name. Kept apart (normalized), the
 * names come from the authors table: one query per post's author (the N+1 pattern an ORM falls into) or one join. Copied
 * into each post (denormalized), a page is one read, but a rename rewrites every post the author wrote, a fan-out done in
 * the background, so pages show the old name until it finishes. Each query costs a round trip of `rttMs`.
 */
export function feedCost(
  model: FeedModel,
  options: { pageSize: number; postsPerAuthor: number; pagesPerSecond: number; renamesPerSecond: number; rttMs: number },
): FeedCost {
  const { pageSize, postsPerAuthor, pagesPerSecond, renamesPerSecond, rttMs } = options;
  const queriesPerPage = model === 'n-plus-one' ? 1 + pageSize : 1;
  const rowsReadPerPage = model === 'denormalized' ? pageSize : 2 * pageSize;
  const rowsPerRename = model === 'denormalized' ? 1 + postsPerAuthor : 1;
  return {
    queriesPerPage,
    waitMs: queriesPerPage * rttMs,
    rowsReadPerPage,
    rowsPerRename,
    rowsPerSecond: pagesPerSecond * rowsReadPerPage + renamesPerSecond * rowsPerRename,
    staleAfterRename: model === 'denormalized',
  };
}
