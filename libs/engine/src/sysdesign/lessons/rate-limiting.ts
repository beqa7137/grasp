import type { SdLesson } from './types.js';

export const RATE_LIMITING_LESSON: SdLesson = {
  why: 'A rate limiter decides how much of your capacity each client may use, so one buggy script, scraper or noisy tenant cannot starve everyone else or run up your bill. The counter is the easy part; the choices around it decide whether it works: which algorithm lets through what burst, which key to count on, where the count lives when many servers share it, and what happens when that store fails. Interviewers ask "design a rate limiter" directly and expect one in front of every public API you draw.',
  widget: {
    kind: 'rate-limiter',
    tryThis: [
      'Pick "Steady": 8 requests a second against a limit of 10. All three limiters accept all 24 requests and the worst one-second span is 8 for each. Under the limit, the algorithm makes no difference; it only matters when traffic bunches up.',
      'Pick "Edge burst": 20 requests in 190 ms, straddling the one-second mark. The fixed window accepts all 20, since 10 fall in the window ending at 999 ms and 10 in the one starting at 1,000, so the service takes 20 in one second, twice the limit. The sliding log accepts 10 and the token bucket 11 (10 saved tokens plus one refilled during the burst).',
      'Pick "Bursty": three bursts of 15, one second apart. The fixed window and the sliding log each accept 30, 10 per burst, with a worst span of 10. The token bucket accepts 31 with a worst span of 11: the first burst spends the full bucket plus one refilled token. A bucket admits bursts on purpose, so size it for what the service behind it can absorb.',
    ],
  },
  concepts: [
    {
      title: 'Why limit',
      body: 'To protect capacity (no single client can push a shared service past its safe load), to keep tenants fair (a free user cannot slow a paying one), and to bound abuse and cost (credential stuffing, scraping, or an endpoint that sends a paid SMS or calls a paid model). Each goal suggests a different key and limit, so name which one you are solving.',
    },
    {
      title: 'Token bucket and leaky bucket',
      body: 'A token bucket holds up to B tokens, refilled at r a second, and each request spends one: it allows bursts of B after a quiet spell and r a second in the long run, so any one second can see up to B + r. It stores two numbers per key (tokens and last refill time). A leaky bucket queues requests and drains them at a fixed rate: the output is perfectly smooth, but queued requests wait. Used as a meter instead of a queue (GCRA), it behaves like a token bucket and stores one timestamp per key.',
    },
    {
      title: 'Windows: fixed, sliding log, sliding counter',
      body: 'A fixed window keeps one counter per key per calendar interval: cheapest, but a client can spend a full window at its end and another at the start of the next, twice the limit in a short span. A sliding log keeps every accepted timestamp and counts those in the last interval: exact, but memory grows with the limit. A sliding window counter keeps this and the previous window count and weights the previous one by how much of it still overlaps: two counters, a small error because it assumes the previous window was evenly spread.',
    },
    {
      title: 'Where to enforce and on what key',
      body: 'At the edge or gateway, rejection is cheapest and stops floods before they cost anything, but it knows little about the request. In the service, you know the user, the plan and the real cost, so you can charge an expensive search more tokens than a read. Add tight per-endpoint limits on login, signup and password reset. Count on API key or user when you have one. Keep per-IP limits loose: carrier NAT, offices and campuses put thousands of users behind one IPv4 address, while attackers rotate across many; for IPv6, count per /64, not per address.',
    },
    {
      title: 'Distributed counters',
      body: 'With many gateway nodes, a shared Redis gives one exact count per key. Make the check atomic: one Lua script that refills, compares and decrements, or an `INCR` whose returned value you compare, with its expiry set in the same script, never a read followed by a separate write. It costs a network round trip per request, under a millisecond in the same zone. Local approximations avoid that: each of N nodes allows limit / N, which rejects early when a client lands unevenly, or nodes count locally and sync every few hundred ms, which overshoots by whatever all nodes admit between syncs.',
    },
    {
      title: 'Responses and backing off',
      body: 'Reject with `429 Too Many Requests` and a `Retry-After` header, and show the remaining budget (the common `X-RateLimit-*` headers). A quota is a per-client contract, often per day or month and tied to billing; load shedding drops work when the service itself is overloaded, whoever is within quota, usually with 503 and lowest priority first. Clients should honor `Retry-After` and otherwise back off exponentially with jitter, or rejections turn into more load.',
    },
    {
      title: 'Redis Cluster details',
      body: 'On Redis Cluster, every key one script touches must live in one hash slot: wrap the shared part in a hash tag, such as `rl:{<id>}:sec`. One very busy key also puts all its load on one shard, so split a hot tenant into sub-buckets or check it locally first.',
    },
  ],
  examples: [
    {
      title: 'Set limits for free and paid plans',
      problem:
        'A public API serves 20,000 requests a second at most. It has 50,000 free keys and 2,000 paid keys; at peak about 1,000 free and 150 paid keys are active. What limits do you set?',
      insight:
        'Per-key limits stop one client from hogging the service; a separate global guard protects capacity, because the sum of all limits will never fit.',
      steps: [
        'Keep 30% headroom: plan to hand out at most 14,000 requests a second at peak.',
        'Free keys: a token bucket of 5 a second with a burst of 10, plus a daily quota of 10,000 requests to bound cost. Paid keys: 50 a second with a burst of 100, set per contract.',
        'Sustained worst case at peak, if every active key maxes out: 1,000 free keys times 5 is 5,000, and 150 paid keys times 50 is 7,500, so 12,500 in all, under 14,000. Saved bursts can add up to 25,000 more for a second, one more reason for a global guard.',
        'All 52,000 keys at their limits would be 50,000 times 5 plus 2,000 times 50, or 350,000 a second. That oversubscription is normal, so add a global load shedder that drops free traffic first once total load passes 14,000.',
        'Return 429 with `Retry-After` and the remaining budget, so well-behaved clients slow down instead of retrying blindly.',
      ],
    },
    {
      title: 'Close the fixed-window edge burst',
      problem:
        'An API allows 600 requests a minute per key using fixed windows. A client sends 600 in the last second of 12:00 and 600 in the first second of 12:01. What gets through, and what would you use instead for 1 million keys?',
      insight: 'Count over a window that moves with time; the sliding window counter does it with two numbers per key.',
      steps: [
        'Both batches fall in different windows, so all 1,200 pass in about 2 seconds, twice what any 60-second span should allow.',
        'A sliding log fixes it exactly by storing each accepted timestamp, but that is up to 600 per key: at 8 bytes each, 4.8 KB per key and 4.8 GB for 1 million keys before overhead.',
        'A sliding window counter estimates the last 60 s as the previous minute count times the fraction of it still inside the window, plus the current count.',
        'At 12:01:01, 59/60 of the previous minute still counts: 600 times 59/60 is 590, so only 10 more requests pass.',
        'It needs two counters per key, about 16 bytes, so 16 MB for 1 million keys. It assumes the previous minute was evenly spread: tiny error on real traffic, but this client can still get about 2x over the next 60 s, spread out rather than in one burst.',
        'If the backend also minds bursts inside the minute, add a shorter limit alongside, such as 20 a second.',
      ],
    },
    {
      title: 'The limiter store goes down',
      problem:
        'Twenty gateway nodes check a shared Redis on every request, 30,000 requests a second in all. The Redis primary fails and failover takes 30 seconds. Do you fail open or closed?',
      insight: 'Decide per limit by what it protects: failing closed everywhere turns a limiter outage into a full outage.',
      steps: [
        'Failing closed on every limit rejects all 30,000 requests a second for 30 seconds, 900,000 requests, because a helper component broke.',
        'For general API limits, fail open to a local token bucket on each node at the key limit divided by 20: a 100-a-second key gets 5 a second per node, 100 in total if its traffic spreads evenly.',
        'For abuse and cost limits, fail closed or to a strict local limit. An SMS endpoint at $0.05 a message, left open to an attacker sending 1,000 a second for 30 seconds, sends 30,000 messages and costs $1,500.',
        'Put a short timeout (a few ms) and a circuit breaker on the Redis call, so a slow Redis falls back quickly instead of adding latency to every request.',
        'Alert whenever a node runs in fallback mode, since limits are then only approximate.',
      ],
    },
  ],
  pitfalls: [
    'Setting tight per-IP limits, which block a whole office or mobile carrier behind one address while a botnet with many IPs sails through.',
    'Reading the counter, comparing, then writing it back in separate calls: concurrent requests all read the same value and all pass. Use an atomic `INCR` or one script.',
    'Treating per-client limits as capacity protection: their sum far exceeds what the service can take, so you still need global load shedding.',
    'Returning 429 without `Retry-After` to clients that retry at once, so every rejection comes straight back as more load.',
  ],
  followUps: [
    {
      question: 'How do you enforce a global limit across regions?',
      answer:
        'Give each region a share of the limit and rebalance the shares from periodic usage reports, or count locally and sync asynchronously, accepting some overshoot. An exact global count needs a cross-region round trip per request, which costs more than the limit is worth.',
    },
    {
      question: 'How do you limit expensive requests differently from cheap ones?',
      answer:
        'Charge by cost: a read spends 1 token, a search or export 10 or more, from the same bucket. For long-running work, cap concurrent requests per client too, since a rate says nothing about how long each request holds a worker.',
    },
    {
      question: 'How do you stop an attacker who rotates IP addresses?',
      answer:
        'Key on something costly to rotate: the account, API key or a device signal. Limit per target too, such as login attempts per username, add challenges like CAPTCHA when a pattern looks automated, and use IP reputation or per-network limits as signals rather than the only key.',
    },
  ],
};
