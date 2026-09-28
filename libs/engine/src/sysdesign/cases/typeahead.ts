import type { CaseStudy } from './types.js';

export const TYPEAHEAD: CaseStudy = {
  id: 'typeahead',
  stages: [
    {
      kind: 'requirements',
      title: 'Clarify what matters',
      prompt: 'Suggestions appear under the search box as someone types. Which questions decide how they are built, ranked and served?',
      decision: {
        question: 'Which answer changes this design the most?',
        options: [
          {
            label: 'Is everyone typing the same prefix shown the same suggestions, or are they personalized per user?',
            best: true,
            why: 'Shared suggestions can be cached at the CDN and in the browser, which is how a read path this hot stays cheap. Per-user lists defeat shared caches and need user data on every request.',
          },
          {
            label: 'How quickly must a newly trending query start appearing?',
            why: 'Defensible too: freshness decides whether a daily batch build is enough. But a streaming trending layer can be added on top of either answer, while personalization reshapes the whole serving path.',
          },
          {
            label: 'Should we show 5 suggestions or 10?',
            why: 'A product detail. It changes the size of each stored list slightly, not the architecture.',
          },
          {
            label: 'Should we store the data in a trie?',
            why: 'That is a solution, not a requirement. Choose the data structure once you know the scale and the query pattern.',
          },
        ],
      },
      points: [
        'Functional: as the user types, return the top 5 to 10 completions of the prefix, ranked by popularity, per language and region.',
        'Latency: suggestions must feel instant, under about 100 ms from keystroke to screen, so the server gets a budget of 10 to 20 ms after network time.',
        'Freshness: breaking news queries should appear within minutes; the long tail can be a day old.',
        "Safety: never suggest offensive completions or anyone's personal data, and a reported suggestion must disappear within minutes.",
        'Scope (from the interviewer): 5 billion searches a day, about 20 characters each, no personalization at first. Autocomplete may fail open: if it breaks, search still works.',
      ],
    },
    {
      kind: 'estimation',
      title: 'Estimate the requests',
      prompt:
        'Each of 5 billion daily searches is typed about 20 characters long. With debouncing, a local cache and people picking a suggestion before finishing, the client sends about one request per 4 characters. How many suggestion requests per second is that on average?',
      estimate: {
        question: 'Average suggestion requests per second with debouncing',
        answer: 289_352,
        unit: 'requests/s',
        working: [
          'Without debouncing: 5 billion searches times 20 keystrokes is 100 billion requests a day.',
          'One request per 4 characters cuts that to 25 billion a day.',
          'Per second: 25 billion / 100,000 is about 250,000 (289,000 exactly, dividing by 86,400).',
          'Peaks run about twice the average: plan for about 600,000 requests per second.',
        ],
      },
      points: [
        'About 290k requests/s on average and near 600k at peak, against only 58k searches/s: autocomplete is several times the load of search itself.',
        'Every request is a read. Writes happen offline, when suggestions are rebuilt from the query logs.',
        'The client (debouncing, its local cache, and users picking a suggestion early) removes three quarters of the traffic, so it is part of the capacity plan.',
        'Across three regions, each serves about 100k requests per second on average.',
      ],
    },
    {
      kind: 'estimation',
      title: 'Estimate the storage',
      prompt:
        'The build keeps the 100 million most popular queries (from the interviewer), and each stored prefix holds its top 10 completions. How much does the prefix index take?',
      estimate: {
        question: 'Size of the prefix index',
        answer: 100,
        unit: 'GB',
        working: [
          'Prefixes: queries share their early prefixes; assume each adds about 10 that no other query has, so about 1 billion prefixes.',
          'Per prefix: 10 completions as query IDs and scores at 8 bytes each is 80 bytes, plus about 20 bytes of key: about 100 bytes.',
          '1 billion times 100 bytes is 100 GB, plus 100 million query strings at about 25 bytes (2.5 GB).',
          'This is an upper bound: a prefix unique to one query has only that completion, so a radix trie that merges those chains is several times smaller.',
          'That fits in the memory of a handful of servers, so serve from RAM, sharded and replicated.',
        ],
      },
      points: [
        'About 100 GB for one language; the index is small enough to hold in memory, and the hard part is the request rate, not the data.',
        'Storing query IDs rather than strings in each list keeps the per-prefix cost fixed; the strings live once in a separate table.',
        'Cap stored prefixes at about 20 characters: beyond that, the list of the deepest stored prefix, filtered, is enough.',
      ],
    },
    {
      kind: 'api',
      title: 'Define the API and the client',
      prompt: 'Sketch the endpoint, then decide what the browser does while the user is still typing.',
      decision: {
        question: 'The user types "weather" quickly. What should the client do?',
        options: [
          {
            label:
              'Debounce about 100 ms, cancel the in-flight request when a new one starts, and render only the answer for the current text',
            best: true,
            why: 'Fast typists send a request per pause, not per key, and a slow answer for "wea" can never overwrite the one for "weath". Defensible too: throttling (at most one request per 100 ms while typing) keeps suggestions moving during fast typing, and many clients combine the two.',
          },
          {
            label: 'Send a request on every keystroke and render each response as it arrives',
            why: 'Several times the traffic, and responses arrive out of order, so the list flickers back to suggestions for an older prefix.',
          },
          {
            label: 'Debounce 500 ms',
            why: 'Cuts traffic further, but suggestions appear only after the user has typed on or stopped, which misses the point of autocomplete.',
          },
          {
            label: 'Download every suggestion to the browser at page load and match locally',
            why: 'Right for a small corpus, such as a few thousand product names on one site. For 100 GB of prefixes it is impossible, and the list would go stale.',
          },
        ],
      },
      points: [
        '`GET /suggest?q=wea&hl=en` returns `200` with up to 10 completions, about 500 bytes of JSON.',
        'Normalize the prefix on the client and the server (lowercase, trim, collapse spaces, Unicode NFKC), so "Wea" and "wea " share one cache entry.',
        'Responses carry `Cache-Control` with a `max-age` of a few minutes and are served from a cookieless domain, so the CDN and browser can cache them.',
        'Cancel with `AbortController` and tag each response with its prefix, dropping any that no longer match the input.',
        'Keep a small in-memory map of prefix to results: backspace is instant, and if "wea" returned fewer than 10 results, longer prefixes are filtered locally without a request.',
      ],
    },
    {
      kind: 'data',
      title: 'Choose the data structure',
      prompt: 'A request names a prefix and wants its 10 best completions in a few milliseconds. What structure answers that?',
      decision: {
        question: 'Which structure would you serve suggestions from?',
        options: [
          {
            label: 'A trie with the top 10 completions cached at every node, built offline and held in memory',
            best: true,
            why: 'A lookup walks as many nodes as the prefix has characters and returns a list that is already ranked: no scanning, however many queries start with "a". The cost moves to the build, which runs offline.',
          },
          {
            label: 'A table in a key-value store from each prefix to its precomputed top 10',
            why: 'Defensible too: it is the same trie flattened into rows, trivially sharded by a hash of the prefix and easy to serve from Redis or RocksDB. It repeats every prefix as a key, so it costs more memory, and many production systems accept that for simpler operations.',
          },
          {
            label: 'A search engine suggester, such as the Elasticsearch completion suggester',
            why: 'A good fit for site search or a catalog: it keeps an in-memory prefix structure per shard, ranked by weights you supply, with fuzzy matching built in. You still compute the weights offline, and at 600k requests per second a purpose-built index is cheaper to run and tune, so large engines build their own.',
          },
          {
            label: 'A plain trie that walks the subtree under the prefix at request time to find the top 10',
            why: 'A one-letter prefix has millions of descendants, so the hottest requests do the most work. Precomputing the top 10 per node is exactly the fix.',
          },
        ],
      },
      points: [
        "Rank by a decayed count: each day's count weighs less as it ages (for example a half-life of a week), so a query popular last year fades.",
        'Keep one index per language and region, since "fo" means different things in English and Norwegian.',
        'Shard the trie by prefix range, with split points chosen from traffic, not the alphabet: prefixes starting with "s" far outnumber those starting with "x". Shard the flattened table by a hash of the full prefix, which spreads load evenly.',
        'Each shard is an immutable snapshot, loaded whole and swapped atomically when a new build lands, with the previous version kept for rollback.',
      ],
    },
    {
      kind: 'deep-dive',
      title: 'Build suggestions from the logs',
      prompt: 'Popularity comes from what people search. How do billions of logged searches become the top 10 for every prefix?',
      decision: {
        question: 'How do suggestions get updated?',
        options: [
          {
            label: 'Rebuild the index offline from query logs every few hours, plus a streaming job for trending queries',
            best: true,
            why: 'The batch build can filter, rank and validate before anything goes live, and the serving path stays read-only. The streaming layer covers the minutes-long freshness the batch cannot.',
          },
          {
            label: 'Rebuild offline once a day, with no streaming layer',
            why: "Defensible too for site search or a store, where yesterday's popularity is fine. For a large search engine it misses breaking news for up to a day.",
          },
          {
            label: 'Update counts in the serving trie on every search',
            why: 'At 58k searches per second, each touching about 20 nodes and re-sorting their top 10, the nodes near the root become write hot spots. Worse, a spam burst goes live instantly, with no chance to filter it.',
          },
        ],
      },
      points: [
        'Search frontends append every completed search to a log (for example Kafka), with the query, locale and time; the logs land in object storage.',
        'A batch job (Spark or MapReduce) normalizes queries, counts them per day, combines the days with time decay and drops queries below a minimum count.',
        'For each surviving query it emits every prefix with the query and its score, groups by prefix and keeps the 10 best with a heap: about 2 billion prefix records, routine for a batch cluster.',
        'The output is written as immutable sorted files, one set per shard, validated (size close to the last build, known prefixes still answered) and then pushed to the serving fleet.',
      ],
    },
    {
      kind: 'design',
      title: 'Put it together',
      prompt: 'Trace a keystroke from the browser to the answer. Where are the 290k requests per second absorbed?',
      lab: true,
      points: [
        'The browser cache answers repeated prefixes and backspaces first; then a CDN with a TTL of a few minutes answers popular prefixes, keyed by normalized prefix and locale.',
        'Misses reach a load balancer pair and stateless suggest servers, which normalize the prefix, fetch its list from the owning shard, merge in trending entries and drop anything on the denylist.',
        'Index shards hold the trie in memory, replicated so each shard survives a failure and hot shards get more copies.',
        'Open the build in the Design Lab: one region at 100k requests per second. The CDN is assumed to answer half of them; the cache stands for the in-memory index shards, and the database for the SSD table holding the long tail of prefixes they do not keep. Its p99 of about 180 ms runs above the 100 ms target because the simulator charges a 40 ms internet round trip and has no browser cache; real deployments close that gap with edge locations near users.',
        'The small write share stands for batched search-log events; the queue and workers stand for the trending job that writes boosted lists into the store. The batch rebuild runs offline and is not shown.',
        'Push the load to the 200k peak: the app tier overloads first, and at 40 servers it cannot grow further. A better CDN hit rate, or more regions, is the fix.',
      ],
    },
    {
      kind: 'deep-dive',
      title: 'Trending and filtering',
      prompt:
        'A major event breaks, and millions start searching a name no one typed yesterday. How does it reach the suggestions quickly, and safely?',
      points: [
        'A streaming job (for example Flink on the search log) counts queries in 5-minute windows and flags a query as trending when its count is far above its usual rate for that hour, with a minimum volume.',
        'Trending queries and their prefixes go into a small overlay (thousands of entries) replicated to every suggest server, which merges it with the base list; the next batch build absorbs them.',
        'Freshness is bounded by the caches: a 5-minute CDN TTL means a new trend shows within about 10 minutes, so keep TTLs short on short prefixes.',
        "Filter at build time: a term blocklist, a classifier for hateful, sexual or violent completions, and a minimum number of distinct users (say 50), so private data like someone's address never becomes a suggestion.",
        'Trending entries skip the batch review, so run the classifier on them too and apply a stricter policy to queries about people.',
        'A serve-time denylist, checked on every response and updated in seconds, removes a reported suggestion at once; purge its prefixes from the CDN.',
      ],
    },
    {
      kind: 'wrap-up',
      title: 'Close the loop',
      prompt: 'What would you raise in the last five minutes?',
      points: [
        "Personalization: blend the user's own recent searches on the client, which already has them, so the shared response stays cacheable; anything personal from the server is sent with `Cache-Control: private`.",
        'Failure: autocomplete fails open. The client waits a short budget and shows nothing on timeout; a bad build is rolled back by reloading the previous snapshot.',
        'Languages: one index per locale, and for input methods that compose characters (Chinese, Japanese), suggest only once composition ends.',
        'Monitoring: p99 per region, CDN hit rate, the share of searches that start from a suggestion (the quality metric) and the time from a query trending to its first appearance.',
      ],
    },
  ],
  pitfalls: [
    'Walking the subtree at request time instead of precomputing the top 10 per prefix, so the hottest one-letter prefixes do the most work.',
    'Updating the serving structure on every search: write contention near the root, and nothing filtered before it goes live.',
    'Ignoring the client: a request per keystroke with no cancelling multiplies traffic and renders stale, out-of-order suggestions.',
    'Treating filtering as an afterthought: one offensive or private suggestion shown to millions is the real incident, so it needs build-time filters, a distinct-user threshold and a serve-time kill switch.',
  ],
  followUps: [
    {
      question: 'How would you handle typos such as "wether"?',
      answer:
        'Learn corrections from the logs (people who type "wether" and then retype "weather" within seconds) and add the corrected completions under the misspelled prefixes at build time. At serve time, try prefixes one edit away only when a prefix returns few results, under a strict time budget.',
    },
    {
      question: 'Should "york" suggest "new york times"?',
      answer:
        'Only if you index infixes: store each query under the prefixes of every word start, not just the first. That multiplies the entries by the average word count (about 3), and the ranking should favour matches at the start.',
    },
    {
      question: 'How do you roll out a new build safely?',
      answer:
        'Write it as a versioned, immutable snapshot, validate it against the previous build (size, top prefixes, denylist), load it on canary shards first, then the rest. Keep the previous version loaded for instant rollback; CDN entries age out within their TTL.',
    },
  ],
};
