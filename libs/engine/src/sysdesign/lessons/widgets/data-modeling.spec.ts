import { describe, expect, it } from 'vitest';
import { feedCost } from './data-modeling.js';

const feed = { pageSize: 20, postsPerAuthor: 500, pagesPerSecond: 1000, renamesPerSecond: 1, rttMs: 1 };

describe('feed cost', () => {
  it('sends a query per author on top of the page in the N+1 pattern, where a join sends one', () => {
    expect(feedCost('n-plus-one', feed)).toMatchObject({ queriesPerPage: 21, waitMs: 21, rowsReadPerPage: 40, rowsPerRename: 1 });
    expect(feedCost('join', feed)).toMatchObject({ queriesPerPage: 1, waitMs: 1, rowsReadPerPage: 40, rowsPerRename: 1 });
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
});
