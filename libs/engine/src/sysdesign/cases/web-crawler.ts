import type { CaseStudy } from './types.js';

export const WEB_CRAWLER: CaseStudy = {
  id: 'web-crawler',
  stages: [
    {
      kind: 'requirements',
      title: 'Clarify what matters',
      prompt:
        "A crawler for a search engine has a fixed fetch budget and millions of other people's servers on the other end. Which questions shape the design?",
      decision: {
        question: 'You have time for one question first. Which answer changes the design the most?',
        options: [
          {
            label: 'How many pages, over what period, and how fresh must they stay?',
            best: true,
            why: 'Volume and freshness set the fetch rate, the split between discovering new pages and recrawling known ones, and how big the frontier and the seen-URL set become.',
          },
          {
            label: 'Do we need to render JavaScript?',
            why: 'Worth asking next: rendering in a headless browser costs an order of magnitude more per page than a plain fetch. But it adds a stage and scales one fleet; it does not reshape the frontier, politeness or dedup.',
          },
          {
            label: 'Should the crawler obey robots.txt?',
            why: 'Yes, always, so there is nothing to decide. A search engine crawler that ignores it gets blocked and complained about.',
          },
          {
            label: 'Which HTTP client library should the fetchers use?',
            why: 'An implementation detail. It changes nothing about capacity, politeness or storage.',
          },
        ],
      },
      points: [
        'Functional: start from seed URLs, fetch pages, extract links, add new URLs to the queue, hand page content to the indexer, and recrawl known pages to keep them fresh.',
        'Scale (from the interviewer): 1 billion fetches a month, HTML only for now. Images, video and JavaScript rendering are out of scope for the first version; PDFs may come later.',
        'Politeness: obey robots.txt (RFC 9309, cached for at most 24 hours), keep one connection per host with a delay between requests, back off on `429` and `503`, and send a `User-Agent` that links to a contact page.',
        'Freshness: important pages such as news front pages are recrawled within hours, the long tail within weeks.',
        'Deduplication: never fetch the same URL twice in one cycle, and do not index the same content found under many URLs (mirrors, tracking parameters, printer versions).',
        'Robustness: survive crawler traps, malformed HTML, slow servers and machine failures without losing the frontier.',
      ],
    },
    {
      kind: 'estimation',
      title: 'Estimate the fetch rate',
      prompt: '1 billion pages a month. How many fetches per second is that, and how many connections are open at once?',
      estimate: {
        question: 'Average fetches per second',
        answer: 386,
        unit: 'pages/s',
        working: [
          'A 30-day month has about 2.6 million seconds (30 times 86,400 is 2,592,000).',
          '1 billion / 2.6 million is about 400 pages per second (386 exactly).',
          'The crawler sets its own pace, so there is no user peak, but provision about twice that for retries, failed nodes and catching up after an outage: roughly 800 pages per second.',
        ],
      },
      points: [
        'About 390 fetches a second on average, 800 provisioned.',
        "A fetch takes about a second end to end (DNS, TCP and TLS handshakes, a slow server). By Little's law that is about 400 requests in flight, around 1,000 with headroom: event-driven I/O on a handful of machines handles it.",
        'Politeness sets a floor on parallelism: at one request per host every 2 seconds, 386 fetches a second needs at least 772 different hosts in progress at any moment.',
        'At about 50 links per page (assumption), parsing emits about 19,000 extracted links a second, each to be normalized and checked against the seen-URL set.',
        'DNS: up to 386 lookups a second before caching; hosts repeat heavily, so a local cache with a TTL floor cuts that to a few dozen.',
      ],
    },
    {
      kind: 'estimation',
      title: 'Estimate bandwidth and storage',
      prompt:
        'The interviewer says an average HTML page is 100 KB. What download bandwidth does the crawl need, and how much does it store?',
      estimate: {
        question: 'Average download bandwidth',
        answer: 309,
        unit: 'Mbit/s',
        working: [
          'Per second: about 390 pages times 100 KB is about 39 MB/s.',
          'In bits: 39 MB/s times 8 is about 310 Mbit/s (308.6 exactly).',
          'Per month: 1 billion pages times 100 KB is 100 TB downloaded.',
        ],
      },
      points: [
        'About 310 Mbit/s on average and about 620 Mbit/s provisioned: a single 10 Gbit/s link has room to spare. Bandwidth is not the bottleneck; DNS, politeness and slow servers are.',
        'Servers usually compress on the wire (gzip or Brotli), so real transfer is lower still; ask for it with `Accept-Encoding`.',
        'Stored compressed, HTML shrinks about 4 to 1: 25 TB a month, 300 TB a year if every fetch is kept. Keeping only the latest copy of each page sizes storage by distinct pages instead of by fetches.',
        'Metadata: if the crawler knows about 10 billion URLs (assumption) at about 200 bytes each (URL, fingerprint, last fetch time, next due time, checksums), that is about 2 TB, spread across machines.',
      ],
    },
    {
      kind: 'data',
      title: 'Model the data',
      prompt:
        '19,000 extracted links a second must each be checked: has the crawler seen this URL before? Where does that answer live, and what else is stored?',
      decision: {
        question: 'How would you store the seen-URL set for 10 billion URLs?',
        options: [
          {
            label: '64-bit URL fingerprints in a key-value store sharded by host, with an in-memory cache',
            best: true,
            why: 'Effectively exact: only a few new pages in 10 billion are lost to collisions. 10 billion fingerprints at 8 bytes are 80 GB, split across crawler nodes by host hash so each check is local. Links repeat heavily (navigation bars, footers), so a cache of popular URLs answers most checks; misses are batched. A 64-bit hash gives only a handful of collisions among 10 billion URLs.',
          },
          {
            label: 'A Bloom filter',
            why: 'Defensible too, and fast: at a 1% false positive rate it needs about 9.6 bits per URL, 12 GB for 10 billion, all in memory. But a false positive calls a new URL seen, so about 1 in 100 new pages is silently never crawled; it cannot delete entries and must be sized in advance. It works well in front of the exact store, where a "no" is always right.',
          },
          {
            label: 'A unique index on the URL column of a relational table',
            why: 'Simple and exact, and insert-if-absent does the check. But an index over 10 billion URL strings is about a terabyte, far bigger than memory, so most of the 19,000 checks a second become random disk reads. Sharded and keyed by fingerprint, it turns into the first option.',
          },
          {
            label: 'An in-memory hash set of full URLs on one machine',
            why: 'At about 100 bytes per URL it needs a terabyte of RAM, and that one machine is a single point of failure for the whole crawl.',
          },
        ],
      },
      points: [
        'URL store, one record per known URL: fingerprint (the key), URL, host, priority, last fetch time and status, next due time, `ETag` and `Last-Modified`, content checksum and SimHash.',
        'Host table: robots.txt rules and when they were fetched, crawl delay, last access time, resolved IP address and a page budget.',
        'Page content goes to object storage in large append-only files (the WARC format is the standard for web archives), not one object per page; the URL store keeps a pointer to it.',
        'Mercator kept its seen-URL set on disk with a small in-memory cache, and found that cache absorbs most lookups because link popularity is so skewed; later work by Broder, Najork and Wiener found a cache of about 50,000 URLs hits close to 80%.',
      ],
    },
    {
      kind: 'deep-dive',
      title: 'Design the URL frontier',
      prompt:
        'Links on a page mostly point to the same site. If fetchers take URLs in the order they were found, what happens to that site? How do you fetch important pages first and still stay polite?',
      decision: {
        question: 'How would you enforce per-host politeness?',
        options: [
          {
            label: "Priority front queues feeding per-host back queues, with a heap of each host's next allowed time",
            best: true,
            why: 'The Mercator design. Priority and politeness are solved separately: front queues order by importance, each back queue holds one host, and a fetcher only ever takes a host that is ready, so no thread waits on a busy host.',
          },
          {
            label: 'A shared per-host rate limiter (a token bucket in Redis) checked before every fetch',
            why: 'Defensible for a smaller crawler: it does enforce the limit. But a fetcher that draws a URL whose host is not ready must put it back or wait, so at scale most draws are wasted on a few big hosts, and every fetch pays an extra network round trip.',
          },
          {
            label: 'One shared FIFO queue, with each fetcher sleeping a second between requests',
            why: 'Sleeping limits each fetcher, not each host. Consecutive URLs come from the same page and so the same host, and a hundred fetchers hit it at once.',
          },
          {
            label: 'One priority queue ordered by page importance',
            why: 'The most important URLs cluster on a few large sites, so the crawler either hammers them or stalls waiting on them.',
          },
        ],
      },
      points: [
        'Front queues: a prioritizer scores each URL (link-based importance, how often it changes, new versus recrawl) and puts it in one of a few priority queues; a biased selector drains high priority more often.',
        'Back queues: each holds URLs of exactly one host, with a table mapping host to queue. When a back queue empties, it is refilled from the front queues. A rule of thumb from the Mercator design: about three times as many back queues as fetcher threads.',
        "A min-heap keyed by each host's next allowed fetch time: a fetcher pops the top, waits until that time, fetches one URL, then pushes the host back with a delay (Mercator used 10 times the last fetch's duration), never shorter than a robots.txt `Crawl-delay`.",
        'Politeness applies per IP address too: shared hosting puts thousands of hostnames on one server.',
        'The frontier holds billions of URLs, so it lives on disk with only the queue heads in memory, and it is checkpointed so a crash loses minutes of work, not the crawl.',
      ],
    },
    {
      kind: 'design',
      title: 'Put it together',
      prompt: 'Trace one URL from the frontier to stored content and new links. Then split the work across machines.',
      lab: true,
      points: [
        'Fetch: frontier, then a DNS lookup from a local caching resolver (standard blocking resolvers are a classic crawler bottleneck, so resolve ahead when a host reaches a back queue), then robots.txt from the host cache, then an async HTTP fetch with timeouts, a size cap and a redirect limit.',
        'Process: check the content type, store the body, compute the checksum and SimHash, then parse the HTML: resolve links against the page (and any `<base>` tag), honor `nofollow` and `noindex` directives, and read `rel="canonical"`.',
        'Filter: normalize each link (lowercase scheme and host, drop default port and fragment, resolve dot segments, strip session IDs and tracking parameters), check robots rules and the seen-URL set, and add new URLs to the frontier.',
        'Distribute by host hash: each crawler node owns a slice of hosts (consistent hashing, so adding a node moves only its share) and keeps their frontier, politeness timers, robots rules, DNS cache and seen-URL shard locally. Links for other hosts are batched and sent to their owner, so politeness never needs cross-node coordination.',
        'Open the build in the Lab: it serves the average 19,300 extracted links a second. The simulator is request-shaped: the Users node stands for the parsers, and each request is one extracted link. Reads are the 90% already seen, answered by the fingerprint cache (cache) or the URL store sharded by host hash (database). The 10% that are new are writes: the queue stands for the frontier and the workers for the frontier writers that record each URL. That is about 5 new URLs per page fetched, far more than the budget can fetch, which is why the frontier must prioritize. DNS, robots.txt, politeness timers, the fetchers and the object store are not shown.',
      ],
    },
    {
      kind: 'deep-dive',
      title: 'Deduplicate content',
      prompt:
        'The same article appears under dozens of URLs, and many pages differ only by a date, an ad or a session token. How do you avoid indexing them all?',
      decision: {
        question: 'How would you detect near-duplicate pages at a billion fetches a month?',
        options: [
          {
            label: 'SimHash: a 64-bit fingerprint where similar pages differ in only a few bits',
            best: true,
            why: "One 64-bit value per page, and near duplicates are pages within a small Hamming distance (Google's 2007 paper by Manku, Jain and Das Sarma used 3 bits over 8 billion pages). Splitting the fingerprint into blocks and indexing each makes the lookup fast.",
          },
          {
            label: 'MinHash over shingles, with locality-sensitive hashing',
            why: "Defensible too: it estimates Jaccard similarity of word shingles directly and is easy to tune, which is why AltaVista used it in the 1990s. It costs more: a signature of around a hundred hashes per page against SimHash's one.",
          },
          {
            label: 'An exact checksum of the page only',
            why: 'Cheap and still worth doing first: it catches mirrors and byte-identical copies. But a changed timestamp or ad gives a different checksum, so near duplicates slip through.',
          },
          {
            label: 'Compare each new page with every stored page',
            why: 'Billions of comparisons per page. It cannot run at this scale.',
          },
        ],
      },
      points: [
        'Exact duplicates first: a 64-bit hash of the extracted text (not the raw HTML, whose markup changes more often), looked up in a checksum set.',
        'SimHash: hash each weighted feature (words or shingles) to 64 bits, add the weight to a per-bit counter for each 1 bit and subtract it for each 0 bit, then keep the sign of each counter.',
        'Finding neighbors: cut the 64 bits into 4 blocks of 16. Two fingerprints within 3 bits must match exactly in at least one block (3 changes cannot touch all 4), so index by each block and compare only the candidates.',
        'A duplicate is still fetched, but not indexed and its links not re-extracted; a host producing mostly near duplicates gets a lower priority.',
      ],
    },
    {
      kind: 'deep-dive',
      title: 'Stay fresh and avoid traps',
      prompt:
        'The budget is fixed at 1 billion fetches a month. How do you decide when to refetch a page, and how do you stop an endless site from eating the budget?',
      points: [
        'Recrawl adaptively: each page has a revisit interval that shrinks when it changed since the last fetch and grows when it did not, bounded (say 1 hour to 30 days) and weighted by importance.',
        'Refetch with conditional requests (`If-Modified-Since`, `If-None-Match`): an unchanged page returns `304 Not Modified` with no body. Sitemaps with `<lastmod>` hint which pages changed.',
        'A subtle result from freshness research (Cho and Garcia-Molina): revisiting every page in proportion to its change rate can do worse than uniform, because pages that change too fast cannot be kept fresh anyway. Spend the budget on pages you can keep fresh and that matter.',
        'Traps: infinite calendars (every page links to next month), session IDs that make each visit a new URL, faceted search that multiplies filter combinations, and links that nest paths forever.',
        'Defences: cap URL length (about 2,000 characters) and path depth, flag repeated path segments, strip known session parameters, give each host a page budget tied to its importance, and lower the priority of a host whose pages turn out near duplicates.',
      ],
    },
    {
      kind: 'wrap-up',
      title: 'Close the loop',
      prompt: 'What would you raise in the last five minutes?',
      points: [
        "Failure: fetches are idempotent, so a lost node's hosts move to their next owner on the hash ring, which restores the frontier from its last checkpoint and refetches whatever was in flight.",
        'Budget split: reserve part of the billion for discovery and the rest for recrawl, and watch that new-page discovery does not starve freshness or the reverse.',
        "Being a good citizen: an opt-out contact page, fast response to complaints, and automatic backoff when a host's latency or error rate rises.",
        'Monitoring: pages per second, frontier size by priority, error rates by status code, DNS failures, duplicate rate, and the share of hosts backing off.',
      ],
    },
  ],
  pitfalls: [
    'Treating the crawl as a breadth-first search over one FIFO queue: most links on a page point to the same host, so the crawler hammers it.',
    'Ignoring DNS: blocking lookups leave fetchers idle while bandwidth sits unused.',
    'Choosing a Bloom filter for the seen-URL set without saying that false positives silently drop new pages forever.',
    'Designing only discovery, with no recrawl scheduling and no defence against traps, so the budget goes to stale pages and infinite calendars.',
  ],
  followUps: [
    {
      question: 'How would you crawl pages that need JavaScript to show their content?',
      answer:
        'Fetch the HTML first as usual. If the page looks script-dependent (an almost empty body, a framework shell), put it on a separate render queue served by a pool of headless browsers, which costs far more per page. Cache scripts and styles across pages, and extract links from the rendered DOM.',
    },
    {
      question: 'A site owner says your crawler is overloading their server. What do you change?',
      answer:
        "Lengthen that host's delay at once, and make it adaptive for all hosts: back off when response time grows or on `429` and `503`, honoring `Retry-After`. Limit per IP address too, in case many of their hostnames share one server.",
    },
    {
      question: 'With a fixed budget, how do you choose which new URLs to fetch first?',
      answer:
        "Score them: link-based importance (a PageRank-like score from the previous crawl, or the importance of the linking pages), the host's quality and budget, and the URL's depth from the site's front page. The frontier's front queues order by that score; low-scoring URLs may never be fetched, and that is fine.",
    },
  ],
};
