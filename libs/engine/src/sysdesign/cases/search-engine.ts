import type { CaseStudy } from './types.js';

export const SEARCH_ENGINE: CaseStudy = {
  id: 'search-engine',
  stages: [
    {
      kind: 'requirements',
      title: 'Clarify what matters',
      prompt:
        'The crawler already delivers fetched pages. You own everything after that: turning billions of pages into an index, and answering queries from it. Which questions shape the design, and what do you park?',
      decision: {
        question: 'You have time for one question first. Which answer changes the design the most?',
        options: [
          {
            label: 'How fresh must results be: minutes for breaking news, or is a rebuild every few days fine?',
            best: true,
            why: 'A few days allows one big batch build that is swapped in whole. Minutes means a second, incremental path that makes new pages searchable at once and merges them into the main index later, plus result caches that expire fast. It adds a whole subsystem.',
          },
          {
            label: 'How many pages, and how many queries a day?',
            why: 'You will ask it next, since it sizes the shards and the replicas. But at web scale the shape is the same either way (a sharded, replicated inverted index behind a fan-out tier); the numbers change how many machines, not which pieces exist.',
          },
          {
            label: 'Are results personalized for each user?',
            why: 'Worth raising: heavy personalization lowers the result cache hit rate. Most engines personalize lightly (language, location, safe search), which only adds a few fields to the cache key, so it does not reshape the index.',
          },
          {
            label: 'Which languages do we support?',
            why: 'Languages change tokenizers, stemmers and spelling models inside the indexing pipeline, not the architecture around it.',
          },
        ],
      },
      points: [
        'Functional: a user types a query and gets the ten most relevant pages, each with a title, a URL and a snippet showing the query words in context, plus the next pages of results and spelling suggestions.',
        'Scale (from the interviewer): an index of 10 billion pages and 5 billion queries a day, most of them in a few large languages.',
        'Freshness (from the interviewer): news and fast-changing pages searchable within minutes of being crawled, the rest of the web within a few days.',
        'Non-functional: results within 200 ms at the 99th percentile, measured at the server. Serving stays up when machines fail, even if a few results are missing for a moment.',
        'Out of scope unless asked: the crawler (its own case), ads, images and video, autocomplete (its own case) and knowledge panels.',
      ],
    },
    {
      kind: 'estimation',
      title: 'Estimate the query load',
      prompt:
        '5 billion queries arrive a day, and the evening peak runs about twice the average. How many queries a second must serving handle?',
      estimate: {
        question: 'Average queries per second',
        answer: 58_000,
        unit: 'queries/s',
        working: [
          'A day has 86,400 seconds.',
          '5 billion / 86,400 is about 57,900, call it 58,000 queries a second.',
          'Peak is about twice that: roughly 116,000 queries a second.',
        ],
      },
      points: [
        'About 58k queries a second on average and 116k at peak, spread over several regions, each with room to absorb the load of a failed neighbour.',
        'Every query is a read. Writes come from indexing, which runs in the background and never on the query path.',
        'Query popularity is skewed: a small head of queries repeats constantly, and a large share of queries are seen only once. That split decides what caching can and cannot do.',
      ],
    },
    {
      kind: 'api',
      title: 'Serve a results page',
      prompt: 'A results page shows ten links with snippets that highlight the query words. Where does each snippet come from?',
      decision: {
        question: 'How do you produce the snippets?',
        options: [
          {
            label: 'Keep a compressed copy of each page in a document store and cut query-dependent snippets for the final ten only',
            best: true,
            why: 'The snippet shows the words the user asked for, so it has to be chosen per query. Doing it only for the ten results on the page keeps the cost to ten lookups, and the document store also serves titles and URLs.',
          },
          {
            label: 'Store one fixed snippet per page, such as the meta description',
            why: 'Cheap and cacheable, and fine as a fallback. But a fixed snippet often misses the part of the page the query is about, so users cannot tell whether a result answers them.',
          },
          {
            label: 'Fetch the live page at query time and cut the snippet from it',
            why: 'Adds a request to a remote site for every result, often hundreds of milliseconds each, and breaks when the site is slow or down. The copy the crawler fetched is already there.',
          },
        ],
      },
      points: [
        '`GET /search?q=` with the query, plus `start` for the page, language and location. It returns ten results (URL, title, snippet), a total count estimate and an optional spelling suggestion.',
        'Deep paging is capped (for example a few hundred results): nobody reads page 50, and each page deeper makes every shard return more candidates.',
        'The internal API is the fan-out: a root server sends the parsed query to every index shard, each returns its top candidates with scores and doc IDs, and the root merges them.',
        'Only after ranking does the root ask the document store for the ten winners: snippets are the last and smallest step, not part of scoring.',
      ],
    },
    {
      kind: 'data',
      title: 'Build the inverted index',
      prompt:
        'For each term, the index keeps a posting list: the IDs of the pages containing it, with how often and where. How large is it for 10 billion pages, and how do you lay it out?',
      estimate: {
        question: 'Size of the compressed inverted index',
        answer: 40,
        unit: 'TB',
        working: [
          'Assume about 500 distinct terms per page after tokenizing: 10 billion pages times 500 is 5 trillion postings.',
          'Each posting (a doc ID gap, a term frequency and a few positions) compresses to about 8 bytes.',
          '5 trillion times 8 bytes is 40 TB, before replication.',
        ],
      },
      points: [
        'About 40 TB. At 128 GB of index per server, that is 40 TB / 128 GB, about 313 machines for one copy; call it 320 shards of about 31 million pages each.',
        'Posting lists are sorted by doc ID and stored as gaps between IDs, compressed with variable-byte or block schemes such as PForDelta. Skip pointers every block let an intersection jump over runs of IDs that cannot match.',
        'Assign doc IDs in order of static quality (a PageRank-like score): the best pages get the lowest IDs, so scanning a list from the front meets strong candidates first and can stop early.',
        'Beside the index: a lexicon from term to its list offset, a forward store of per-page features for ranking, and the document store holding compressed page text for snippets, about 50 TB at 5 KB a page, on SSD.',
        'The index is built in batch: map tasks tokenize pages and emit term and doc ID pairs, the shuffle groups them by term, and reducers write sorted, compressed lists. The build writes new immutable files and never edits the serving copy.',
      ],
    },
    {
      kind: 'design',
      title: 'Put it together',
      prompt:
        'Trace a query from the search box to the ten results, and a freshly crawled page into the index. Which parts are on the query path, and which run in the background?',
      lab: true,
      points: [
        'Query path: load balancer, then a stateless frontend that parses and normalizes the query (spelling, synonyms) and checks the result cache. On a miss, a root server fans the query out to one replica of every index shard.',
        'Each shard scores its own 31 million pages and returns its best few dozen; the root merges them, reranks the top few hundred with a heavier model and fetches snippets for the final ten.',
        'Indexing path: crawled pages land in a log; a batch pipeline rebuilds the main index every few days, while a small fresh index is updated within minutes. Serving machines load new index files and swap them in.',
        'Budget for 200 ms: about 10 ms in the frontend and cache, about 60 ms for the slowest shard, 40 ms to rerank, 20 ms for snippets, with the rest kept for the network and the tail.',
        'Open the build in the Design Lab: one of three regions at peak, 40,000 requests a second. The app tier stands for the frontends and root servers, the cache for the result cache, and the sharded database with replicas for the index shards and their copies. The 2% of requests that are writes are fresh documents: the queue is the crawl log and the workers the incremental indexers. The simulator sends each query to one shard, not to all 320, so it shows load, not fan-out. Its p99 of about 190 ms includes the 40 ms internet round trip the simulator charges.',
      ],
    },
    {
      kind: 'deep-dive',
      title: 'Shard and replicate the index',
      prompt:
        'The index does not fit on one machine, and one copy cannot take 116k queries a second. How do you split it, and how many machines does that take?',
      decision: {
        question: 'How do you partition the index across machines?',
        options: [
          {
            label: 'By document: each shard holds the full index for its own slice of pages, and every query goes to all shards',
            best: true,
            why: 'Every shard does the same amount of work per query, so load stays even. Intersections of terms happen locally, and a lost shard only removes a small slice of candidates. This is how large web engines and Elasticsearch shard.',
          },
          {
            label: 'By term: each shard owns whole posting lists for a range of terms',
            why: 'A query touches only the shards of its terms, which sounds cheaper. But multi-term queries must ship huge posting lists between machines to intersect them, and shards holding common terms become hot spots.',
          },
          {
            label: 'By site: all pages of a domain on one shard',
            why: 'Handy for per-site operations, but sites differ in size by many orders of magnitude, so shards end up badly uneven, and every query still has to visit every shard.',
          },
        ],
      },
      estimate: {
        question: 'Index servers needed at peak',
        answer: 18_560,
        unit: 'servers',
        working: [
          'Peak: about 116,000 queries a second; the result cache answers about half, so 58,000 reach the index.',
          'Each query visits all 320 shards. Assume one server answers about 1,000 queries a second on its shard: 58,000 / 1,000 is 58 replicas per shard.',
          '320 shards times 58 replicas is 18,560 servers, before headroom for a failed region.',
        ],
      },
      points: [
        'Fan-out makes the tail the problem: a query is as slow as the slowest of its 320 shards. If each server is slow on 1% of requests, a query meets at least one slow shard about 96% of the time (1 minus 0.99 to the 320th).',
        'Hedged requests: if a shard has not answered by about its 95th-percentile latency, send the same request to another replica and take the first reply. It costs a few percent more load and cuts the tail sharply.',
        'Answer with partial results: when a shard misses the deadline, the root returns without it. Losing one slice of 320 rarely changes the top ten.',
        'Use a tree for fan-out: the root talks to a few dozen intermediate servers, each covering a group of shards, so no machine merges 320 replies at once.',
        'Tier the index: a small tier of the highest-quality pages is queried first, and the large tail tier only when the first returns too few good results. Most queries never touch the tail.',
      ],
    },
    {
      kind: 'deep-dive',
      title: 'Rank in stages',
      prompt:
        'A common query matches hundreds of millions of pages. A good relevance model costs milliseconds per page. How do you rank within 200 ms?',
      decision: {
        question: 'How do you apply the expensive ranking model?',
        options: [
          {
            label: 'A cascade: a cheap score on every shard picks candidates, and a heavier model reranks only the few hundred survivors',
            best: true,
            why: 'Each stage cuts the candidates by orders of magnitude, so the expensive model runs on hundreds of pages, not hundreds of millions. Cheap stages are tuned for recall and later ones for precision.',
          },
          {
            label: 'Run the full learned model on every matching page',
            why: 'The most accurate in principle, but at milliseconds per page across hundreds of millions of matches it is hours of work per query.',
          },
          {
            label: 'Rank by link popularity alone, precomputed',
            why: 'Free at query time, and a useful signal, but it ignores the query: the most linked page containing the words is often not the one that answers the question.',
          },
        ],
      },
      points: [
        'Stage one, on each shard: a text score such as BM25 plus static quality, with dynamic pruning (WAND or block-max WAND) that skips postings which cannot reach the current top k.',
        'Stage two, at the root: a learned model (gradient-boosted trees or a small neural network) over hundreds of features: text match in the title and anchors, freshness, click history for the query, page quality and spam scores.',
        'Stage three, optional: a large neural reranker on the top few dozen, when the latency budget allows.',
        'Train offline on human relevance ratings and click logs, and change the model only through experiments that compare it against the current one on live traffic.',
      ],
    },
    {
      kind: 'deep-dive',
      title: 'Stay fresh and cache results',
      prompt:
        'A story breaks and pages about it appear within minutes, but the main index was built two days ago. How do new pages become searchable, and what does that do to the result cache?',
      decision: {
        question: 'How do freshly crawled pages reach the index?',
        options: [
          {
            label: 'A small fresh index updated continuously, queried beside the main one and folded into it at the next rebuild',
            best: true,
            why: 'The fresh index holds only millions of pages, so it can be rebuilt or appended to in minutes. The main index stays immutable and compact. This mirrors the segments that Lucene writes and merges in the background.',
          },
          {
            label: 'Rebuild the whole index every hour',
            why: 'Simple and consistent, but the batch job over 10 billion pages takes hours of a large cluster, so an hourly cadence never finishes and costs a fortune.',
          },
          {
            label: 'Insert each new page into the main posting lists in place',
            why: 'Posting lists are sorted and compressed, so an insert rewrites blocks across hundreds of lists per page, on machines that are serving queries at the same time.',
          },
        ],
      },
      points: [
        'Deletions and updates: a deleted or changed page is marked in a per-shard bitmap of dead doc IDs, filtered at query time, and dropped for good at the next merge.',
        'Google moved from batch rebuilds to incremental indexing with Caffeine in 2010, built on Percolator: a sign that freshness at web scale is a first-class design goal, not an afterthought.',
        'Result cache: key it by the normalized query plus language, location and page, and keep the head of popular queries there. Published studies of engine query logs report hit rates of roughly 40 to 50%, since so many queries are seen only once.',
        'Freshness caps the cache: give entries a short TTL (minutes) for queries whose results change fast, such as news, and hours for stable ones. Tag each entry with the index generation it came from and drop old entries when a new index is swapped in.',
        'Cache below the results too: posting lists of frequent terms stay in memory on every shard, and the document store keeps hot pages in a cache for snippets.',
      ],
    },
    {
      kind: 'wrap-up',
      title: 'Close the loop',
      prompt: 'You have five minutes left. What would you raise before the interviewer does?',
      points: [
        'Failure: a lost index server only removes one replica; a lost shard means partial results until another replica takes over; a lost region shifts traffic to the others, which is why each keeps headroom.',
        'Rollouts: a new index or ranking model goes to a small share of replicas first, and its quality and latency are compared before it replaces the old one. Keep the previous index on disk for a quick rollback.',
        'Spam and abuse: link farms and keyword stuffing are fought with quality scores computed at indexing time, so a demoted page costs nothing at query time.',
        'Monitoring: p99 latency per stage, the share of queries answered with partial results, cache hit rate, index age per tier and quality metrics from live experiments.',
      ],
    },
  ],
  pitfalls: [
    'Designing the index as a database table queried with LIKE, instead of an inverted index with sorted, compressed posting lists.',
    'Partitioning by term, so common terms create hot shards and multi-term queries ship huge lists across the network.',
    'Ignoring tail latency: with a fan-out to hundreds of shards, one slow machine makes most queries slow unless requests are hedged and deadlines enforced.',
    'Running the expensive ranking model on every match instead of a cascade that narrows candidates first.',
    'Caching results forever, so the result cache keeps serving yesterday for news queries after the fresh index has the story.',
  ],
  followUps: [
    {
      question: 'How do you support exact phrase queries such as "to be or not to be"?',
      answer:
        'Store word positions in the postings, as the estimate assumed. Intersect the lists by doc ID, then check that the positions are consecutive. Phrases made of very common words are slow, so engines also index frequent word pairs as terms of their own.',
    },
    {
      question: 'A whole shard is lost, every replica of it. What do users see, and how do you recover?',
      answer:
        'Queries return without that slice of pages, about one 320th of the web, which rarely changes the top ten. Recovery copies the shard files from the last index build in durable storage onto fresh machines; the fresh index covers recent changes to those pages until the copy is done.',
    },
    {
      question: 'How would you add semantic search, so a query matches pages that use different words?',
      answer:
        'Embed pages and queries with the same model and keep an approximate nearest neighbour index (such as HNSW) per shard beside the inverted index. Retrieve candidates from both, merge them and let the reranker decide. The vector index is far larger per page, so it often covers only the higher tiers.',
    },
  ],
};
