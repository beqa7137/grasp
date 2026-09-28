import type { SdLesson } from './types.js';

export const SEARCH_LESSON: SdLesson = {
  why: 'A database answers "give me row 42" quickly, but "which of 200 million products mention waterproof hiking boots, best first" would mean scanning every row. Search engines answer it with an inverted index, a ranking function and a pipeline that keeps both close to the source of truth. Interviewers probe whether you know how the index is built and queried, why a result ranks where it does, how shards spread the work, and why an edit takes a second, or forever, to show up.',
  widget: {
    kind: 'inverted-index',
    tryThis: [
      'Keep the defaults, "fast database" with All words (AND): fast is in documents 2, 3 and 4, database in 1, 2 and 5, and intersecting the two lists leaves only document 2, scoring 1.02. Switch to Any word (OR): all five documents match, document 2 still leads with 1.02 and the other four tie at 0.51. Each term sits in 3 of 5 documents, so each is worth ln(5 / 3), about 0.51.',
      'Type "distributed database" with Any word (OR): distributed is in only 2 documents, so it is worth ln(5 / 2), about 0.92, against 0.51 for database. Document 5 holds both and scores 1.43, document 3 scores 0.92 and beats documents 1 and 2 at 0.51. Now type "fast search": search is in one document, worth ln 5, about 1.61, so document 4 scores 2.12. Rare terms carry the ranking.',
      'Type "is": four documents hold it and each scores only 0.22; a word in all five would score 0, which is why common words barely matter to ranking. Now type "build": no documents, although document 4 says builds and document 5 says built. With no stemming the index only matches exact tokens: a stemmer would reduce builds to build, while built needs a lemmatizer or a synonym list. Type "databases" for the same miss.',
    ],
  },
  concepts: [
    {
      title: 'The inverted index',
      body: 'An inverted index maps each term to its posting list: the sorted ids of the documents that contain it, often with the count of occurrences and their positions. The terms themselves live in a sorted term dictionary, and Lucene keeps a compact prefix index of it (an FST) in memory, so finding a term costs a few steps whatever the corpus size. Posting lists are stored as gaps between ids, bit-packed in blocks, so a common term takes a few bits per document. A query then reads only the lists of its terms, instead of scanning every document the way `LIKE %boots%` must, since a B-tree cannot use a leading wildcard.',
    },
    {
      title: 'Analysis decides what can match',
      body: 'Before indexing, an analyzer turns text into terms: a tokenizer splits it, then filters lowercase it, drop stop words, stem (boots to boot), add synonyms or split words into n-grams for autocomplete. The same analysis must run on the query, or the terms never meet. Each step trades precision for recall: stemming finds "running" for "run" but also merges words with different meanings, and dropping stop words shrinks the index but makes "The Who" or "to be or not to be" unsearchable. Modern engines often keep stop words and let ranking give them little weight. Changing an analyzer means reindexing every document.',
    },
    {
      title: 'Boolean retrieval over posting lists',
      body: 'AND intersects posting lists and OR unions them. Because lists are sorted, two lists merge in one pass, and the cost falls further by starting from the rarest term and, for each of its ids, jumping ahead in the longer list with skip data instead of reading it entry by entry. A query for a term in 1,000 documents and one in 10 million costs about a thousand jumps, not ten million reads. For ranked OR queries, algorithms such as WAND and block-max WAND (used by Lucene) skip documents whose best possible score cannot enter the current top k.',
    },
    {
      title: 'Ranking: TF-IDF and BM25',
      body: 'TF-IDF scores a document by how often each query term appears in it (term frequency) times how rare the term is across the corpus (inverse document frequency, ln(N / df)). BM25, the default in Lucene, Elasticsearch and OpenSearch, fixes two flaws. Term frequency saturates: the tenth occurrence adds far less than the first, controlled by k1 (default 1.2), so repeating a keyword stops paying. And scores are normalized by document length, controlled by b (default 0.75), so a long page does not win just by containing more words. Production search then reranks the top few hundred hits with other signals: popularity, recency, personalization or a learned model.',
    },
    {
      title: 'Segments, refresh and merges',
      body: 'Lucene-style engines never edit an index in place. New documents collect in a memory buffer; a refresh (every 1 s by default in Elasticsearch) writes them out as a new immutable segment and makes them searchable, which is why search is near real time, not immediate. An update is a delete plus a new document: the old copy is only marked deleted in a per-segment bitmap and still takes space. Background merges combine small segments into larger ones and drop deleted documents. Durability comes from a separate transaction log, not from refresh. Refreshing too often creates many tiny segments and spends indexing capacity on merges.',
    },
    {
      title: 'Scaling: shards, replicas and the tail',
      body: 'Document partitioning gives each shard a subset of documents with its own complete index; a query is scattered to one copy of every shard, each returns its local top k, and a coordinator merges them. Term partitioning gives each shard a subset of terms, so a query touches only the shards of its terms, but multi-term queries must ship whole posting lists between machines and hot terms overload one shard, so almost every engine partitions by document. Replicas add query throughput and survive node loss. Because a query waits for its slowest shard, fan-out amplifies the tail: if each shard is slow 1% of the time, a query over 20 shards is slow 1 - 0.99^20, about 18%, of the time. Hedged requests and routing to the least loaded replica help.',
    },
    {
      title: 'Keeping the index in sync',
      body: 'The database is the source of truth and the index is a derived copy. Writing to both from application code (dual writes) diverges on the first crash between the two writes. Instead, capture changes from the database log (change data capture, such as Debezium reading the Postgres WAL into Kafka) or a transactional outbox, and have indexers apply them idempotently: key events by document id so each document is applied in order, and index with the source row version as an external version so a late, older event is rejected. To change mappings or analyzers, build a new index in the background, backfill it while replaying the change stream, then switch an alias from the old index to the new one atomically.',
    },
  ],
  examples: [
    {
      title: 'Search for an e-commerce catalog',
      problem:
        'A store has 20 million products, 1,500 search queries a second at peak and 400 product changes a second (mostly price and stock). Users search free text, filter by category, brand and price, and expect a price change to show within a few seconds. Sketch the design.',
      insight:
        'Split each query into filters that only include or exclude and text that is scored, and feed the index from the database change log rather than from the application.',
      steps: [
        'Index one denormalized document per product: title and description as analyzed text (lowercase, stemming, synonyms such as tee to t-shirt), brand and category as exact keywords, price and stock as numbers, plus a popularity score from recent sales.',
        'A query such as "waterproof boots" under Men, in stock, below 150 becomes BM25 scoring on title and description plus three filters. Filters do not affect the score and their results can be cached per segment, so they are cheap; the text part ranks what survives.',
        'Rerank the top 200 hits by BM25 combined with popularity and margin, then return 24 per page. Ranking all matches by the full formula would waste work on results nobody scrolls to.',
        'Freshness: the Postgres WAL feeds Debezium into Kafka, keyed by product id; indexers turn each change into an update with the row version as external version. At 400 changes a second, each rewriting one product document, indexing is light, and the default 1 s refresh plus a second or two of pipeline lag meets "a few seconds".',
        'Stock that must be exact (the last pair of boots) is checked against the database at add to cart; the index is allowed to be a few seconds stale, the checkout is not.',
      ],
    },
    {
      title: 'Size an index and its shards',
      problem:
        'An index must hold 200 million documents averaging 2 KB of source, grow 50% over two years, and serve 3,000 queries a second. Assume the index plus stored source takes 1.2 times the raw size, shards should stay between 10 and 50 GB, and a shard search costs 5 ms of CPU. How many shards and nodes?',
      insight:
        'Shard count is set by data size and growth, since primaries are hard to change later; replica count and node count are set by query load.',
      steps: [
        'Raw data: 200 million times 2 KB is 400 GB, so one copy of the index is 1.2 times that, 480 GB. In two years it is 720 GB.',
        'At about 30 GB per shard today, 480 / 30 gives 16 primaries; in two years they hold 45 GB each, still under 50 GB. Starting with 4 primaries would reach 180 GB per shard, too large to move or recover quickly.',
        'Every query fans out to one copy of each of the 16 shards: 3,000 times 16 is 48,000 shard searches a second. At 5 ms each that is 240 CPU seconds per second, 240 cores busy.',
        'Keep CPU near 50% to absorb spikes and a lost node: 480 cores, so 15 nodes of 32 cores. With 1 replica there are 32 shards and 960 GB, about 64 GB per node, which fits in memory for the file cache on nodes with 128 GB.',
        'More shards would not cut total CPU, since each query still touches every shard; more replicas on more nodes add cores to spread those shard searches over, without reducing the total. If query load doubles, add replicas and nodes, not primaries.',
      ],
    },
    {
      title: 'The title that never updates',
      problem:
        'A seller renames a product from "Blue jacket" (row version 41) to "Navy jacket" (version 42) 200 ms later. Search keeps showing "Blue jacket" until the next edit, days later. The pipeline reads change events from Kafka, published round robin across 12 partitions, and indexes each event as a full document. Why, and what fixes it?',
      insight:
        'The index applied the two changes in the wrong order, and nothing told it the older one was older; fix the ordering and make the index reject stale versions.',
      steps: [
        'Round robin puts versions 41 and 42 on different partitions, read by different consumers. The consumer for version 42 is current and indexes "Navy jacket" at t = 0.5 s; the consumer for version 41 lags 3 s and indexes "Blue jacket" at t = 3.2 s, overwriting it.',
        'Each event is a full document with no version check, so the last write wins, and the last write is the older one. The mismatch stays until another change to that product comes through.',
        'Fix the ordering: key events by product id, so every change to one product lands on one partition and is applied in commit order.',
        'Fix staleness for good: index with version 42 as an external version (`version_type=external` in Elasticsearch). A late write of version 41 is then rejected with a conflict, which the consumer treats as success. This also covers replays after a consumer restart or a backfill racing the live stream.',
        'The seller may still not see the rename for up to about a second after it indexes, because of refresh. Show their own edit from the database, or write that one update with `refresh=wait_for`, instead of refreshing the index after every write.',
      ],
    },
  ],
  pitfalls: [
    'Searching with `LIKE %term%` on a relational table: no index can serve it, so every query scans every row, and it still has no ranking, stemming or typo handling.',
    'Analyzing text differently at index and query time, such as stemming one and not the other: queries silently miss documents that plainly contain the word.',
    'Dual-writing to the database and the index from application code: a crash or failed request between the two leaves the index wrong until someone reindexes.',
    'Creating thousands of small shards "to scale": each shard has fixed memory and file overhead, and a query fans out to all of them, so size shards by data (tens of GB) and scale queries with replicas.',
  ],
  followUps: [
    {
      question: 'How does a phrase query such as "fast search" work on an inverted index?',
      answer:
        'The index stores the positions of each term in each document. The engine first intersects the posting lists, exactly like AND, then keeps only documents where search appears at the position right after fast. Positions make the index larger, so fields that never need phrase queries can be indexed without them.',
    },
    {
      question: 'Why can the same document get a different score on different shards?',
      answer:
        "By default each shard computes document frequencies from its own documents, so a term that is rare on one shard and common on another gets a different IDF. With many documents spread randomly the difference is negligible; on small or unevenly routed indexes it shows. Elasticsearch's `dfs_query_then_fetch` first gathers global term statistics at the cost of an extra round trip.",
    },
    {
      question: 'Why does an index that receives many updates grow and slow down even though the document count stays flat?',
      answer:
        'Each update marks the old copy deleted and writes a new one, and deleted copies stay in their segments, still read and still counted in term statistics, until a merge removes them. Merges keep up in normal use; under heavy updates, lengthening the refresh interval makes fewer, larger segments, and batching updates to the same document before indexing cuts the churn.',
    },
  ],
};
