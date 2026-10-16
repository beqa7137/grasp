/** How a case study is posed and what it covers: kept apart from the catalog, whose titles load at first paint. */
export interface CaseBrief {
  id: string;
  /** The question as an interviewer would pose it. */
  question: string;
  summary: string;
  /** A near-twin case, linked from this one so the two read as different questions (REDESIGN.md 2.10). */
  related?: string;
}

export const CASE_BRIEFS: readonly CaseBrief[] = [
  {
    id: 'url-shortener',
    question: 'Design a service like bit.ly that turns long links into short ones and redirects visitors.',
    summary: 'A read-heavy key lookup: key generation, redirect semantics, caching and sharding by key.',
  },
  {
    id: 'rate-limiter',
    question: 'Design a distributed rate limiter for a public API that enforces per API key and per IP limits across many servers.',
    summary: 'Token buckets in shared Redis, atomic Lua checks, where limits run, multi-region and failure modes.',
  },
  {
    id: 'typeahead',
    question: 'Design the suggestions that appear as someone types in a search box, for a large search engine.',
    summary: 'Top-k per prefix precomputed offline, served from memory and CDN caches, with trending and filtering.',
  },
  {
    id: 'news-feed',
    question: 'Design the home timeline of a social network: people follow others and see their recent posts.',
    summary: 'Fan-out on write versus read, the celebrity problem, timeline caches and cursor pagination.',
  },
  {
    id: 'chat',
    question: 'Design a messaging app like WhatsApp or Messenger with one-to-one and small group chats.',
    summary: 'Persistent connections, a session registry, per-conversation ordering, offline delivery and presence.',
  },
  {
    id: 'notifications',
    question: 'Design a service that sends push, email and SMS notifications for many product teams, including large marketing campaigns.',
    summary: 'Priority queues per channel, provider rate limits, retries and idempotent at-least-once delivery.',
  },
  {
    id: 'email-service',
    question:
      'Design a consumer email service like Gmail or Outlook.com: receive, store, search and send mail for 500 million daily active mailboxes, from the web, phone apps and IMAP clients.',
    summary:
      'Accepting mail only after a durable write, SPF, DKIM and DMARC, spam filtering, SMTP retries and bounces, metadata sharded by user beside deduplicated blobs, per-user search indexes, modification-sequence sync and MTA-STS.',
  },
  {
    id: 'web-crawler',
    question: 'Design a crawler that fetches a billion pages a month for a search engine.',
    summary: 'A polite URL frontier, DNS, a seen-URL set, SimHash dedup, recrawl scheduling and crawler traps.',
  },
  {
    id: 'video-streaming',
    question: 'Design a video platform like YouTube where creators upload videos and viewers watch them on any device.',
    summary:
      'Resumable uploads, a transcoding DAG, adaptive bitrate segments, CDN tiers with an origin shield and storage tiers for the long tail.',
  },
  {
    id: 'payments',
    question:
      'Design the payment backend of an online marketplace that charges buyers through external payment processors and pays out sellers.',
    summary:
      'Moving money in and out through external processors: idempotency keys, a payment state machine, a double-entry ledger, unknown outcomes, the outbox pattern and reconciliation.',
    related: 'payment-ledger',
  },
  {
    id: 'payment-ledger',
    question:
      'Design the double-entry ledger at the heart of a payments company: every capture, fee, refund, payout and transfer is recorded in it, and balances and statements are read from it.',
    summary:
      'The internal book of record every payment posts to: immutable entries that sum to zero, idempotent posting, row locks and hot accounts, sharding with in-transit accounts, snapshots, reconciliation and invariants.',
    related: 'payments',
  },
  {
    id: 'proximity-service',
    question:
      'Design the service behind "near me" in an app like Yelp: find the businesses within a radius of a point, with filters, for 100 million daily users.',
    summary:
      'Why latitude and longitude B-trees fail, geohash cells and their edges, quadtrees for uneven density, S2, H3 and R-trees, haversine filtering, replicated in-memory indexes and versioned snapshots.',
  },
  {
    id: 'ride-sharing',
    question:
      'Design the core of a ride-hailing app like Uber: riders request rides, nearby drivers are matched, and both see each other move on a map.',
    summary:
      'A firehose of driver locations in an in-memory cell index, one-at-a-time offers, a trip state machine and sharding by region.',
  },
  {
    id: 'distributed-cache',
    question: 'Design a distributed in-memory key-value cache like Memcached or Redis Cluster that many services share.',
    summary: 'Slab memory and approximate LRU, consistent hashing, proxy routing, failover, hot keys, stampedes and invalidation.',
  },
  {
    id: 'ticketing',
    question:
      "Design a ticketing site like Ticketmaster, where a popular concert's seats go on sale at a fixed time and sell out in minutes.",
    summary:
      'A single on-sale rush for numbered seats, each sold once: a virtual waiting room, seat holds with expiry, conditional updates against double booking, and payment failures.',
    related: 'hotel-booking',
  },
  {
    id: 'search-engine',
    question: 'Design the indexing and query serving of a web search engine over billions of pages, answering in under 200 ms.',
    summary:
      'A compressed inverted index sharded by document, fan-out with hedged requests, ranking in stages, a fresh index and result caching.',
  },
  {
    id: 'file-sync',
    question:
      'Design a file storage and sync service like Dropbox or Google Drive that keeps files in step across every device a user owns.',
    summary:
      'Content-defined chunking and dedup, metadata apart from blobs, a change journal with cursors, conflicted copies and shared namespaces.',
  },
  {
    id: 'leaderboard',
    question:
      'Design a real-time leaderboard for a mobile game with tens of millions of players: the top of the board, your own rank and the players around you.',
    summary:
      'Sorted sets, server-reported scores, ties packed into the score, sharding a global ranking, daily and weekly boards and cheaters.',
  },
  {
    id: 'ad-click-aggregator',
    question:
      'Design a system that records ad clicks, redirects users to the advertiser, and counts clicks per ad per minute for dashboards and billing.',
    summary:
      'A click log, event-time windows and watermarks, exactly-once counting, dedup and fraud, batch reconciliation and an OLAP store.',
  },
  {
    id: 'job-scheduler',
    question:
      'Design a distributed job scheduler that runs cron schedules and delayed jobs for many teams, like the scheduler behind Airflow or a delayed-job service.',
    summary:
      'A precomputed next fire time, bucketed scanning with leases, queues to workers, heartbeats, retries with backoff and time zones.',
  },
  {
    id: 'collaborative-editor',
    question:
      'Design a real-time collaborative document editor like Google Docs, where many people edit the same document at once and see each other type.',
    summary:
      'Operational transformation versus CRDTs, a fenced session server per document, presence over WebSockets, offline merges and snapshots.',
  },
  {
    id: 'metrics-monitoring',
    question:
      'Design a metrics monitoring and alerting system like Prometheus with Alertmanager or Datadog, collecting samples from 100,000 hosts for dashboards and pages.',
    summary:
      'Pull versus push, a sharded time series store with Gorilla compression and downsampling, cardinality limits, burn-rate alerts and notification routing.',
  },
  {
    id: 'hotel-booking',
    question:
      'Design a hotel reservation system like Booking.com: search hotels by city and dates, then book a room without selling more rooms than the hotel allows.',
    summary:
      'Steady sales of interchangeable rooms, counted per night over date ranges: holds with expiry, idempotent bookings, overbooking policies, a cached search path, sharding by hotel and channel manager sync.',
    related: 'ticketing',
  },
  {
    id: 'stock-exchange',
    question:
      'Design the core of a stock exchange: order entry, a matching engine with price-time priority, market data, and recovery without losing an acknowledged order.',
    summary:
      'A sequencer and event log, a single-threaded order book per symbol, multicast market data, deterministic replay, hot standbys and microsecond budgets.',
  },
  {
    id: 'message-queue',
    question:
      'Design a distributed message queue like Kafka that many services publish events to and consume them from, with ordering, replay and no lost messages.',
    summary:
      'Partitioned append-only logs, batching, consumer groups and offsets, in-sync replicas and acks, retention, compaction and exactly once.',
  },
  {
    id: 'feature-flags',
    question:
      'Design an in-house feature flag service like LaunchDarkly or Unleash: thousands of flags, hundreds of services and millions of evaluations a second, with gradual rollouts and kill switches.',
    summary:
      'Local evaluation from cached rulesets, consistent bucketing by hash, streaming versus polling with CDN snapshots, guarded rollouts, approvals, flag debt and failure modes.',
  },
  {
    id: 'code-deployment',
    question:
      'Design an internal system that builds code and safely rolls it out to 50,000 servers in 5 regions, for 2,000 services deploying several times a day, like Spinnaker or Argo Rollouts.',
    summary:
      'Hermetic, signed builds named by digest, regional caches and peer-to-peer distribution, canaries with automated analysis, waves and bake time, automatic rollback, desired state with idempotent agents, and expand-and-contract schema changes.',
  },
];

export function getCaseBrief(id: string): CaseBrief | undefined {
  return CASE_BRIEFS.find((b) => b.id === id);
}
