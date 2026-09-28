import type { SdLesson } from './types.js';

export const CACHING_LESSON: SdLesson = {
  why: 'A cache is the cheapest capacity you can buy: at a 99% hit rate the database sees one request in a hundred. But the origin must still survive the misses, and the misses set the tail. Most read-heavy designs in interviews come down to what to cache where, how stale it may be, and what happens the moment the cache is empty.',
  widget: {
    kind: 'cache',
    tryThis: [
      'Set the origin to 100 ms and the hit rate to 90%: the origin takes 1,000 requests a second, the mean is 11 ms and p99 is 101 ms. Move to 95%: origin load halves to 500 and the mean drops to 6 ms, but p99 stays at 101 ms. Only at 99.5% (50 origin requests, 1.5 ms mean) does p99 fall to 1 ms.',
      'At 99.5%, drag the origin from 10 to 200 ms: the mean moves only from about 1.1 to 2 ms and p99 stays at 1 ms. Drop to 95% and repeat: p99 follows the origin from 11 to 201 ms. With few misses, a slow origin hardly shows.',
      'Set 99.9% and 100 ms: the origin sees 10 requests a second and the mean is 1.1 ms. Press flush: every request misses, the origin sees 10,000 a second (1,000 times more) and origin load turns red at five times what it can serve: the latency shown assumes it keeps up, but in practice it queues and times out. That miss storm is what the database must survive.',
    ],
  },
  concepts: [
    {
      title: 'Hit rate and the last few percent',
      body: 'Origin load is traffic times the miss rate. At 10,000 requests a second, 90% hits leave 1,000 for the origin, 99% leave 100, 99.9% leave 10: each nine cuts origin load tenfold. And once more than 1% of requests miss, p99 is a miss, so it equals the origin time however good the mean looks.',
    },
    {
      title: 'What to cache where',
      body: 'Closest to the user is fastest and hardest to invalidate. The browser caches per user via `Cache-Control`; a CDN caches public responses and static files near users; an application cache such as Redis holds computed objects and query results shared by all servers; the database buffer pool keeps hot pages in memory. Cache public, rarely changing data far out, and private or fast-changing data close to the source.',
    },
    {
      title: 'Write strategies',
      body: 'Cache-aside: the app reads the cache, loads from the database on a miss, and deletes the key on write; simple, but a racing reader can still refill an old value, so the TTL (or a lease) bounds staleness. Write-through: every write also sets the cache, so reads are usually fresh, but the two writes are not atomic and racing writers can leave an old value. Write-back: writes land in the cache and reach the database later; fastest, but a cache crash loses acknowledged writes.',
    },
    {
      title: 'Invalidation and TTLs',
      body: 'A TTL bounds how stale a value can get even if an invalidation is lost, so every key gets one. On a write, delete the key rather than setting it: two racing writers that both set the cache can leave the older value there. For static files, put a content hash in the URL and cache it for a year, since a new version is a new key.',
    },
    {
      title: 'Stampedes',
      body: 'When a hot key expires, every request that misses before it is refilled goes to the origin at once. Stop it with request coalescing (one request loads, the rest wait for it), jittered TTLs so keys set together do not expire together, and `stale-while-revalidate`, which serves the old value while one request refreshes it.',
    },
    {
      title: 'Eviction and what never exists',
      body: 'A full cache evicts: LRU drops the least recently used key, LFU the least often used, which keeps a steady hot set through a one-off scan. Hit rate grows with size along a curve that flattens, so size for the hot set, not the whole data. Cache misses for keys that do not exist too (negative caching, with a short TTL), or a flood of bad ids goes straight to the database.',
    },
  ],
  examples: [
    {
      title: 'Size a cache for the hot set',
      problem:
        'A store has 100 million products at 2 KB each and serves 50,000 reads a second. 20% of products get 90% of reads. How much cache, and what reaches the database?',
      insight: 'Cache the hot set, not the whole catalog: its size sets memory and its share of reads sets the hit rate.',
      steps: [
        'The hot set is 20% of 100 million, 20 million products, times 2 KB: 40 GB.',
        'Add about 50% for keys, metadata and fragmentation: 60 GB.',
        'With 32 GB nodes, 60 / 32 rounds up to 2 nodes. Take 3, so losing one leaves 2 nodes of 30 GB each, which still fit.',
        'Caching the hot set gives about a 90% hit rate, so the database sees 50,000 times 10%, or 5,000 reads a second.',
        'Say the lever out loud: if 5,000 is too many, the next 20% of products buys far fewer hits per GB, so measure the curve before adding memory.',
      ],
    },
    {
      title: 'Pick a write strategy: catalog versus balances',
      problem:
        'A product catalog takes 20,000 reads and 50 writes a second. An account service takes 2,000 balance writes a second. Which cache write strategy fits each?',
      insight: 'Ask what a stale or lost value costs: a stale price is an annoyance, a lost balance update is money.',
      steps: [
        'The catalog is 400 reads per write, and a price a minute old is acceptable, so use cache-aside with a 60 s TTL.',
        'On a price change, update the database and delete the key, so most readers see the new price at once and the TTL caps staleness at 60 s if the delete is lost.',
        'For balances, write-back is out: flushing every 5 s at 2,000 writes a second means a cache crash loses up to 10,000 acknowledged writes.',
        'Use write-through, or cache-aside with delete on write, for display only. Any debit checks the balance in the database inside its transaction, never in the cache.',
      ],
    },
    {
      title: 'Handle a celebrity key',
      problem:
        'A celebrity post is read 200,000 times a second from one cache shard that handles 100,000 operations a second. The key has a TTL, and rebuilding it takes a 50 ms database query. What breaks, and how do you fix it?',
      insight: 'One key can overload one shard and, when it expires, the database: spread the reads and let only one request rebuild.',
      steps: [
        'The shard is asked for twice its capacity, so it saturates before any expiry.',
        'Add a local in-process cache with a 1 s TTL on each of 20 app servers: the shard now sees about 20 reads a second for this key.',
        'Without these fixes, when the key expires every request in the 50 ms rebuild misses: 200,000 times 0.05 is 10,000 queries for the same row.',
        'Coalesce misses so one request per app server rebuilds: 20 queries instead of 10,000. Serving the stale value while it refreshes cuts user-facing misses to zero.',
        'Give keys jittered TTLs too, so a deploy that fills many keys at once does not expire them all in the same second.',
      ],
    },
  ],
  pitfalls: [
    'Reporting one global hit rate: 95% overall can hide an endpoint at 50% that owns the tail.',
    'Sizing the database for the cached load: a flush, a cold start or a deploy that changes key names sends it the full traffic.',
    'Setting the cache on write instead of deleting the key, so two racing writers can leave the older value cached until the TTL.',
    'Caching personalized responses at a shared CDN without varying on the user, which serves one user the data of another.',
  ],
  followUps: [
    {
      question: 'What happens if the cache cluster goes down?',
      answer:
        'The database gets every request and falls over. Limit concurrent database queries, shed or degrade the rest, serve stale data from local caches, and bring the cache back gradually so it can warm up.',
    },
    {
      question: 'How does a CDN learn that content changed?',
      answer:
        'Best: versioned URLs with a content hash, cached for a long time. Otherwise a purge API call on change, or a short TTL with `stale-while-revalidate` when a few seconds of staleness is fine.',
    },
    {
      question: 'How do you choose a TTL?',
      answer:
        'From how stale the data may be, not how often it changes: long for static or versioned content, seconds to minutes for prices and counts, and none of it for data that decisions depend on. Add jitter so keys set together expire apart.',
    },
  ],
};
