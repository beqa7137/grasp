import { describe, expect, it } from 'vitest';
import { FEED_BASELINE, FEED_FANOUT_ROWS_PER_S, feedAt, feedCost, feedRowsPerPost } from './data-modeling.js';

const feed = { pageSize: 20, postsPerAuthor: 500, pagesPerSecond: 1000, renamesPerSecond: 1, rttMs: 1 };

describe('feed cost', () => {
  it('sends a query per author on top of the page in the N+1 pattern, where a join sends one and a batch two', () => {
    expect(feedCost('n-plus-one', feed)).toMatchObject({ queriesPerPage: 21, waitMs: 21, rowsReadPerPage: 40, rowsPerRename: 1 });
    expect(feedCost('batched', feed)).toMatchObject({ queriesPerPage: 2, waitMs: 2, rowsReadPerPage: 40, rowsPerRename: 1 });
    expect(feedCost('join', feed)).toMatchObject({ queriesPerPage: 1, waitMs: 1, rowsReadPerPage: 40, rowsPerRename: 1 });
    expect(feedCost('batched', { ...feed, pageSize: 100 }).queriesPerPage).toBe(2);
    expect(feedCost('n-plus-one', { ...feed, rttMs: 30 }).waitMs).toBe(630);
  });

  it('halves the rows a page reads by copying names into posts, and pays for it on every rename', () => {
    expect(feedCost('denormalized', feed)).toMatchObject({
      queriesPerPage: 1,
      rowsReadPerPage: 20,
      rowsPerRename: 501,
      staleAfterRename: true,
    });
    expect(feedCost('join', feed).rowsPerSecond).toBe(40_001);
    expect(feedCost('denormalized', feed).rowsPerSecond).toBe(20_501);
  });

  it('costs more to denormalize than to join once renames outweigh reads', () => {
    const writeHeavy = { ...feed, pagesPerSecond: 10, renamesPerSecond: 5, postsPerAuthor: 10_000 };
    expect(feedCost('denormalized', writeHeavy).rowsPerSecond).toBeGreaterThan(feedCost('join', writeHeavy).rowsPerSecond);
  });

  it('splits the load into queries, reads and writes a second', () => {
    expect(['n-plus-one', 'batched', 'join', 'denormalized'].map((m) => feedCost(m as never, feed).queriesPerSecond)).toEqual([
      21_000, 2_000, 1_000, 1_000,
    ]);
    expect(feedCost('join', feed)).toMatchObject({ readRowsPerSecond: 40_000, writeRowsPerSecond: 1 });
    expect(feedCost('denormalized', feed)).toMatchObject({ readRowsPerSecond: 20_000, writeRowsPerSecond: 501 });
  });

  it('times the old name by the copy rewrite, and counts the pages served meanwhile', () => {
    expect(FEED_FANOUT_ROWS_PER_S).toBe(5_000);
    expect(feedCost('denormalized', feed)).toMatchObject({
      staleMs: 100,
      pagesWhileStale: 100,
      fanoutLoad: 0.1,
      fanoutBacklogRowsPerSecond: 0,
    });
    expect(feedCost('denormalized', { ...feed, postsPerAuthor: 100_000, renamesPerSecond: 0.01 })).toMatchObject({
      staleMs: 20_000,
      pagesWhileStale: 20_000,
      fanoutLoad: 0.2,
    });
    expect(feedCost('join', feed)).toMatchObject({
      rewriteMs: 0,
      staleMs: 0,
      pagesWhileStale: 0,
      fanoutLoad: 0,
      fanoutBacklogRowsPerSecond: 0,
    });
  });

  it('falls behind once the renames need more copy rows than the rewrite writes, before rows break even', () => {
    const frequent = feedCost('denormalized', { ...feed, postsPerAuthor: 5_000, renamesPerSecond: 10 });
    expect(frequent).toMatchObject({
      fanoutLoad: 10,
      fanoutBacklogRowsPerSecond: 45_000,
      rewriteMs: 1_000,
      staleMs: Infinity,
      pagesWhileStale: Infinity,
    });
    const atCapacity = feedCost('denormalized', { ...feed, postsPerAuthor: 5_000, renamesPerSecond: 1 });
    expect(atCapacity).toMatchObject({ fanoutLoad: 1, fanoutBacklogRowsPerSecond: 0, staleMs: 1_000, pagesWhileStale: 1_000 });
    expect(feedCost('denormalized', { ...feed, postsPerAuthor: 100_000 })).toMatchObject({ rewriteMs: 20_000, staleMs: Infinity });
    expect(feedCost('denormalized', feed)).toMatchObject({ breakEvenRenamesPerSecond: 40, fanoutLimitRenamesPerSecond: 10 });
    expect(feedCost('join', { ...feed, pagesPerSecond: 10_000 }).breakEvenRenamesPerSecond).toBe(400);
  });

  it('crosses the two schemas at 1 rename per posts-per-author posts shown', () => {
    for (const a of [10, 500, 100_000]) {
      expect(feedRowsPerPost(true, 1 / a, a)).toBeCloseTo(feedRowsPerPost(false, 1 / a, a), 9);
      expect(feedRowsPerPost(true, 0.5 / a, a)).toBeLessThan(feedRowsPerPost(false, 0.5 / a, a));
      expect(feedRowsPerPost(true, 2 / a, a)).toBeGreaterThan(feedRowsPerPost(false, 2 / a, a));
    }
    expect(feedRowsPerPost(false, 0, 500)).toBe(2);
    expect(feedRowsPerPost(true, 0, 500)).toBe(1);
  });

  it('agrees with the rows a second at the current traffic', () => {
    const postsShown = feed.pagesPerSecond * feed.pageSize;
    const r = feed.renamesPerSecond / postsShown;
    expect(feedRowsPerPost(true, r, 500) * postsShown).toBeCloseTo(feedCost('denormalized', feed).rowsPerSecond, 6);
    expect(feedRowsPerPost(false, r, 500) * postsShown).toBeCloseTo(feedCost('join', feed).rowsPerSecond, 6);
  });

  it('reads the widget settings by their indexes', () => {
    expect(feedAt(FEED_BASELINE)).toEqual(feedCost('n-plus-one', feed));
    expect(feedAt({ ...FEED_BASELINE, schema: 1, read: 2 }).rowsReadPerPage).toBe(20);
    expect(feedAt({ ...FEED_BASELINE, read: 1, place: 3 }).waitMs).toBe(60);
    expect(feedAt(FEED_BASELINE, 'join').waitMs).toBe(1);
  });
});
