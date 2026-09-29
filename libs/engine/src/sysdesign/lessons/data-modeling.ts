import type { SdLesson } from './types.js';

export const DATA_MODELING_LESSON: SdLesson = {
  why: 'A schema is a bet on which queries you will run and how often. Model from nouns and you get a clean schema that answers the hot query with twenty round trips; copy data everywhere and every rename becomes a job that rewrites thousands of rows while pages show the old value. Interviewers ask you to list the access patterns first, then defend each join, copy and index with their rates.',
  widget: {
    kind: 'feed-model',
    tryThis: [
      'Pick N+1 queries with 20 posts per page: the page sends 21 queries and waits 21 ms on the database, even at 1 ms a round trip. Switch to one join: 1 query and 1 ms, reading the same 40 rows. Raise posts per page to 100: N+1 now waits 101 ms while the join still waits 1 ms, though both read the same 200 rows. The round trips are the cost.',
      "Pick denormalized with 20 posts per page, 500 posts per author, 1,000 pages a second and 1 rename a second: a page reads 20 rows instead of 40, a rename writes 501 rows, and the total falls from 40,001 rows a second with the join to 20,501. Notice that pages can now show an author's old name until the rewrite finishes.",
      'Keep denormalized and set 100 pages a second and 100,000 posts per author: each rename writes 100,001 rows and the total climbs to 102,001 rows a second, against 4,001 for the join. Copying pays only while pages times posts per page outweighs renames times posts per author.',
    ],
  },
  concepts: [
    {
      title: 'Start from access patterns',
      body: 'Before drawing tables, list every read and write with its rate, its shape and how fresh it must be: "show a feed page of 20 posts with author names, 1,000 a second", "create a post, 50 a second", "rename an author, a few a day". The hot reads decide the keys and indexes; the ratio of reads to writes decides whether to copy data; the freshness needs decide where a copy may lag. A schema that cannot name the query it serves is a guess.',
    },
    {
      title: 'Normalization, joins and relationships',
      body: 'Normalized, each fact lives in one row: a post stores `author_id`, and the name lives only in the authors table, so a rename is one write and nothing can disagree. Reads join. One-to-many puts the foreign key on the many side (posts.author_id) with an index on it. Many-to-many needs a junction table, such as follows(follower_id, followee_id) with that pair as the primary key and a second index on (followee_id, follower_id), so both directions are one index lookup. A join on indexed keys that returns a page of rows is cheap; joins get expensive when they touch many rows or cross shards, where the database can no longer do them for you.',
    },
    {
      title: 'The N+1 query pattern',
      body: 'Fetch 20 posts, then loop and fetch each author: 1 + 20 queries, each a full round trip, one after another. ORMs do it silently through lazy loading. Spot it by counting queries per request, or by a query log where one statement repeats with only the id changing. Fix it with a join, with a second query using `WHERE id IN (...)` (2 queries whatever the page size), or with ORM eager loading. In GraphQL resolvers, a DataLoader-style batcher collects the keys requested in the same tick, sends one batched query, and caches results for the rest of the request.',
    },
    {
      title: 'Denormalization and its costs',
      body: 'Copying a value into the rows that read it, such as the author name into each post, turns a join into a single read. The price is paid on write: a change must fan out to every copy. Done in one transaction it locks many rows; done in the background, readers see the old value until it finishes. Keep one source of truth, make the fan-out idempotent and resumable, and reconcile drift. Copy values that rarely change or where staleness is harmless, and prefer a cache or materialized view when the copy only exists to speed up reads.',
    },
    {
      title: 'Keys and indexes for the queries you run',
      body: "A composite index is sorted by its first column, then the second, and so on, so it serves any query on a leftmost prefix. Put equality columns first, then the column you sort or range over: for a query filtering on `author_id = ?` and sorting by `created_at DESC`, index (author_id, created_at). The reverse order makes the database walk every author's posts by time. A covering index also holds the columns the query returns (Postgres `INCLUDE`), so it can skip the table. Every index is an extra write on each insert and update, and extra storage, so index for real queries, not every column.",
    },
    {
      title: 'Documents: embed or reference',
      body: 'A document store lets you embed children in the parent: one read returns an order with its line items. Embed what is read together, owned by the parent and bounded in size. Reference what is shared (an author on many posts) or unbounded (every comment on a viral post): documents have size limits (16 MB in MongoDB) and a growing array makes each update rewrite and reindex a bigger document. Relational stores give you joins, constraints and flexible queries; documents give locality for the pattern you designed for and make other patterns harder.',
    },
    {
      title: 'Single-table design in key-value stores',
      body: 'Stores such as DynamoDB serve a query only by key: a partition key picks the partition, a sort key orders items within it, and there are no joins. So you model the queries, not the entities: put related items in one partition under keys like PK = `USER#42` with SK = `PROFILE` and SK = `POST#2026-09-29...`, and one query returns a user and their newest posts. Serve another pattern with a global secondary index, which is eventually consistent. Adding a pattern later means a new index or a backfill, which is why the access pattern list comes first.',
    },
  ],
  examples: [
    {
      title: 'A feed page at 1 ms a round trip',
      problem:
        'A feed page shows 20 posts, each by a different author, with the author name. The database is 1 ms away and serves 1,000 pages a second. Compare lazy loading, a join and a batched `IN` query.',
      insight: 'At small result sizes the cost is round trips, not rows: count queries per page before anything else.',
      steps: [
        'Lazy loading: 1 query for the posts, then 20 for the authors, run one after another. 21 queries at 1 ms is 21 ms of waiting per page.',
        'At 1,000 pages a second that is 21,000 queries a second, each paying parse, plan and a network hop, for a page whose data is 40 rows.',
        'A join returns posts and names in 1 query: 1 ms and 1,000 queries a second, the same 40 rows read.',
        'Batching: fetch the posts, then all authors with `WHERE id IN (...)` of 20 ids. 2 queries, 2 ms, 2,000 queries a second, and it still works when authors live in another service or shard where a join is impossible.',
        'The gap widens with distance: at 5 ms a round trip, lazy loading costs 105 ms per page against 5 ms for the join.',
      ],
    },
    {
      title: 'Renaming an author with 50,000 posts',
      problem:
        'The team copied author names into posts to drop the join. A popular author with 50,000 posts renames themselves. Pages run at 1,000 a second with 20 posts each. What does the rename cost, and when does the copy pay off?',
      insight: 'Denormalizing trades a small saving on every read for a fan-out on every write; compare the two rates.',
      steps: [
        'The rename writes 1 author row plus 50,000 post rows: 50,001 rows, against 1 row when normalized.',
        'Done as one transaction, it holds 50,000 row locks and a large log write. Done in batches of 1,000 rows, it is 50 transactions, and if the job is throttled to 5,000 rows a second it takes 10 s, during which some pages show the old name.',
        'The saving: each page reads 20 rows instead of 40, so 1,000 pages a second save 20,000 rows a second.',
        'Break even: 20,000 rows a second saved against 50,000 rows per rename, so the copy pays while renames of such authors stay below 0.4 a second. They are usually far rarer, so the copy is cheap on average, but each rename is still a spike and a staleness window.',
        'The alternative: keep only `author_id` in posts and batch-load names from a cache, 1 extra round trip per page with no fan-out and no stale names beyond the cache TTL.',
      ],
    },
    {
      title: 'Choosing an index for an author page',
      problem:
        'The query filters on `author_id = ?` and `status = ?`, sorts by `created_at DESC` with `LIMIT 20`, and returns id, title and created_at. The posts table holds 100 million rows. Which index, and in what column order?',
      insight: 'Equality columns first, then the sort column, so the index hands back rows already in order and the scan stops at 20.',
      steps: [
        "With an index on author_id alone, the database reads all of that author's posts, filters status and sorts. For an author with 100,000 posts, that is 100,000 rows to return 20.",
        'With (created_at, author_id), it walks every post newest first and skips other authors; for a quiet author that can be most of the 100 million entries.',
        'With (author_id, status, created_at), both equality columns pin one contiguous range already sorted by time. The database descends the B-tree (about 3 or 4 levels for 100 million keys at a few hundred keys a page), reads 20 entries backward and stops.',
        'Those 20 entries still point at 20 table rows, up to 20 random page reads. In Postgres, add the returned columns with `INCLUDE (id, title)` and it can run as an index-only scan, skipping the table for pages that vacuum has marked all-visible in the visibility map; InnoDB secondary indexes already carry the primary key, so only title needs adding there.',
        'Check the cost: this index is one more write on every insert and on each update to status, title or created_at. At 50 new posts a second that is negligible; on a write-heavy table, weigh each index against the query it serves.',
      ],
    },
  ],
  pitfalls: [
    'Designing tables from the nouns in the prompt before listing the queries and their rates, then finding the hottest page needs five joins.',
    'Lazy loading inside a loop: the ORM hides one query per item, and the page is fast in development with 3 rows and slow in production with 100.',
    'Denormalizing without a source of truth or a repair path: copies drift after a failed fan-out and nothing puts them right.',
    'Separate single-column indexes where the query needs one composite, or a composite with the range column before the equality columns, so the index cannot serve the sort.',
    'Embedding an unbounded array, such as every follower in a user document, until writes slow down and the document hits its size limit.',
  ],
  followUps: [
    {
      question: 'Why not cache the author names instead of copying them into posts?',
      answer:
        'Often that is the better choice. A cache of authors by id serves the batched lookup in about a millisecond, a rename is one write plus an invalidation, and staleness is bounded by the TTL. Copying into posts wins when the read must be a single request, for example a key-value store with no joins, or when the copied value is effectively immutable, such as the price on an order line.',
    },
    {
      question: 'How does a DataLoader fix N+1 without changing the resolvers?',
      answer:
        'Each resolver still asks for one author, but the loader only records the key and returns a promise. At the end of the tick it sends one batched query for all recorded keys, then resolves each promise from the result, and it remembers the answers for the rest of the request. The query count per page drops to one per entity type, whatever the page size.',
    },
    {
      question: 'Your single-table DynamoDB design needs a new query months later. What do you do?',
      answer:
        'Add a global secondary index keyed for the new pattern, writing the needed key attributes onto existing items with a backfill job if they do not already carry them. The index is eventually consistent and is another write on each item change. If the pattern needs ad hoc filtering or aggregation, stream the table into a store built for that, such as a search index or warehouse, rather than contorting the keys.',
    },
  ],
};
