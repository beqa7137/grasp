import type { CaseStudy } from './types.js';

export const RATE_LIMITER: CaseStudy = {
  id: 'rate-limiter',
  stages: [
    {
      kind: 'requirements',
      title: 'Clarify what matters',
      prompt:
        'A rate limiter can be a few lines of middleware or a global service. Which questions tell you which one the interviewer wants?',
      decision: {
        question: 'Which answer changes this design the most?',
        options: [
          {
            label: 'Is the limit protection against overload and abuse, where a small overshoot is fine, or a hard quota tied to billing?',
            best: true,
            why: 'It sets how exact the count must be. Protection tolerates a few percent of overshoot, so you can use fast approximate counters, local fallbacks and per-region counts. A billing quota needs durable, exact metering, which is a different system.',
          },
          {
            label: 'How many API servers are there?',
            why: 'It sizes the fleet, but the shape is the same for 10 servers or 1,000: once there is more than one, the count has to be shared.',
          },
          {
            label: 'What does a throttled client receive?',
            why: '`429 Too Many Requests` with `Retry-After` is the standard answer, so there is little to decide. Say it, but do not spend your first question on it.',
          },
          {
            label: 'Should we buy an API gateway product or build our own?',
            why: 'A fair question later, once you know the requirements a product must meet. Asked first, it skips the problem.',
          },
        ],
      },
      points: [
        'Functional: limit requests per API key by plan (for example 100 requests per second with bursts of 200), per IP for unauthenticated traffic (kept loose, since carrier NAT puts thousands of users behind one address), and tighter per-account limits on sensitive endpoints such as login.',
        'On exceed: reject at once with `429` and a `Retry-After` header; never queue the request or silently drop it.',
        'Scale (from the interviewer): 10 billion requests a day across three regions, 10 million API keys, and a fleet of stateless API servers behind load balancers.',
        'Non-functional: the check adds at most a millisecond or two, limits hold across all servers, and a limiter failure must not take the API down with it.',
        'Accuracy (from the interviewer): this is protection, not billing, so a brief overshoot of a few percent is acceptable.',
      ],
    },
    {
      kind: 'estimation',
      title: 'Estimate the checks',
      prompt:
        '10 billion requests a day, and each request is checked against two limits (its API key and its IP). How many counter checks per second is that on average?',
      estimate: {
        question: 'Average counter checks per second',
        answer: 231_481,
        unit: 'checks/s',
        working: [
          'A day has 86,400 seconds; round it to 100,000: 10 billion / 100,000 is about 100,000 requests per second (115,741 exactly).',
          'Two limits per request: about 230,000 counter checks per second (231,481 exactly).',
          'Peaks run about twice the average: plan for roughly 460,000 checks per second.',
        ],
      },
      points: [
        'About 230k checks/s on average and 460k at peak, each a read-modify-write on a small counter.',
        'A single Redis primary runs tens of thousands to about 100,000 small scripts per second, so the counters must be spread over several shards (around 10 at peak, with headroom).',
        'Per region that is about 77k checks/s on average, since traffic splits over three regions.',
        'The limiter runs on every request, so its latency is paid everywhere: an in-region round trip to Redis is well under a millisecond, a cross-region one is tens of milliseconds.',
      ],
    },
    {
      kind: 'estimation',
      title: 'Estimate the memory',
      prompt:
        'In an hour, 10 million API keys and (from the interviewer) 20 million distinct IPs are active. Each needs its own counter state. How much memory is that?',
      estimate: {
        question: 'Memory for one bucket per active key and IP',
        answer: 3,
        unit: 'GB',
        working: [
          'Identities: 10 million keys plus 20 million IPs is 30 million buckets.',
          'Each bucket is a key name, a token count and a timestamp: about 100 bytes with Redis overhead.',
          '30 million times 100 bytes is 3 billion bytes, so 3 GB.',
          'A replica per shard doubles it to 6 GB: memory is not the constraint here, operations per second are.',
        ],
      },
      points: [
        'Give every bucket a TTL equal to its full refill time, so idle keys and one-off IPs expire and memory tracks active identities only.',
        'Contrast a sliding window log for an hourly limit: it stores every request, 116k/s times 3,600 s is about 417 million entries, over 20 GB at 50 bytes each.',
        "Worse, a log grows with each key's limit: a key allowed 100,000 requests an hour holds 100,000 timestamps. Counter-based algorithms hold two numbers whatever the limit.",
      ],
    },
    {
      kind: 'api',
      title: 'Define the contract',
      prompt: 'What does a client see when it is throttled, and what does the limiter itself expose to the gateway?',
      points: [
        'Throttled clients get `429 Too Many Requests` with `Retry-After` (seconds until a token is free) and headers for the limit, remaining quota and reset time. Many APIs use `X-RateLimit-Remaining`; an IETF draft replaces these with two fields, `RateLimit` and `RateLimit-Policy`.',
        'Use `503` with `Retry-After` for load shedding when the whole service is overloaded: `429` tells one client it is over its own quota.',
        'Internally, one call: `check(id, rule, cost)` returns allowed, remaining and retry-after. The cost lets an expensive endpoint, such as a bulk export, take more tokens than a cheap read.',
        'Rules are data, not code: per plan and per endpoint, kept in a config store and pushed to every limiter node, which holds them in memory, so changing a limit needs no deploy.',
        'Identities: the API key once verified, the client IP (for IPv6 the /64 prefix, since one host can hold a whole /64), and the account for login and password reset.',
      ],
    },
    {
      kind: 'deep-dive',
      title: 'Choose the algorithm',
      prompt:
        'Plans are sold as "100 requests per second, bursts up to 200". Which algorithm counts that best, and what does each one store per key?',
      decision: {
        question: 'Which algorithm would you defend for per-key API limits?',
        options: [
          {
            label: 'Token bucket',
            best: true,
            why: 'Maps directly onto the plan: capacity 200, refill 100 per second. It allows short bursts, then a steady rate, stores two numbers per key (tokens and last refill time) and does O(1) work per check. Stripe and AWS API Gateway both describe their throttling as token buckets.',
          },
          {
            label: 'Sliding window counter',
            why: 'Defensible too: two counters per key, and it matches limits stated as "N per minute". It weights the previous window by how much of it still overlaps, which assumes requests in that window were evenly spread, so it is an approximation, usually a close one.',
          },
          {
            label: 'Sliding window log',
            why: 'Exact, since it keeps a timestamp for every request in the window, but memory and work grow with the limit: an hourly limit of 100,000 means 100,000 entries per key.',
          },
          {
            label: 'Fixed window counter',
            why: 'The simplest (one counter per key per window), but a client can send the full limit at the end of one window and again at the start of the next: twice the limit within a second or two. Fine for long quotas such as per day.',
          },
        ],
      },
      points: [
        'Token bucket refills lazily: on each check, tokens become the smaller of capacity and tokens plus elapsed time times rate; then take the cost if enough tokens remain.',
        'GCRA (the generic cell rate algorithm) is an equivalent form that stores a single timestamp per key; libraries such as redis-cell implement it.',
        'A leaky bucket as a queue smooths output to a constant rate. That suits shaping your own calls to a fragile downstream, not a public API that must answer at once.',
        'Sliding window counter estimate: current count plus previous count times the fraction of the previous window still inside the last 60 seconds.',
      ],
    },
    {
      kind: 'data',
      title: 'Share the counters',
      prompt:
        'Many gateway servers check the same key at the same moment. Where do the counters live, and how do two concurrent checks avoid both spending the last token?',
      decision: {
        question: 'How do you update a token bucket in Redis safely?',
        options: [
          {
            label: 'A Lua script that reads, refills, takes tokens and writes back in one call',
            best: true,
            why: 'Redis runs a script to completion on its single thread, so the read-modify-write is atomic, and it costs one round trip. A token bucket updates two fields together, which a single command cannot do.',
          },
          {
            label: '`INCR` then `EXPIRE` on a fixed window key',
            why: 'Defensible for fixed windows: `INCR` is atomic, so concurrent requests cannot lose counts. But if the process dies between the two commands the key never expires; set the expiry in the same step (a script or a `MULTI` block).',
          },
          {
            label: '`GET` the count in the app, compare, then `SET` it',
            why: 'A classic check-then-act race: ten requests read 99 of 100 at once, all pass, and all write 100. The more concurrent the traffic, the more the limit leaks.',
          },
          {
            label: 'Take a distributed lock per key around the update',
            why: 'Correct, but it adds round trips and serialises every request for a key through the lock: the busiest keys, the ones that matter, suffer most.',
          },
        ],
      },
      points: [
        "Key per identity and rule, such as `rl:{<id>}:sec`. The braces are a Redis Cluster hash tag: all of one identity's limits land in one slot, so one script can check its per-second and per-day limits together.",
        'Take time from the store (`TIME` inside the script), not from each gateway, so a gateway with a skewed clock cannot mint extra tokens.',
        'Redis Cluster with about 4 primaries per region (around 10 across all three) at peak, each with a replica. Replication is asynchronous, so a failover forgets a second or so of counts: a brief overshoot the requirements allow.',
        'No database behind it: counters are soft state. Losing them resets limits for a moment, which is harmless for protection limits.',
      ],
    },
    {
      kind: 'design',
      title: 'Put it together',
      prompt: 'Where in the request path does the check run, and what does a rejected request cost you?',
      lab: true,
      decision: {
        question: 'Where would you enforce per-key and per-IP limits?',
        options: [
          {
            label: 'In the API gateway tier in front of the app servers, with counters in a shared Redis cluster',
            best: true,
            why: 'Every request passes one place that already terminates TLS and verifies keys, so every service is covered without changing its code, and rejected traffic never reaches the app servers or the database.',
          },
          {
            label: 'A library or middleware inside each service, calling the same Redis',
            why: 'Defensible for rules that need business context (5 password resets an hour per account). As the only layer it fails: every team must adopt it, and abusive traffic has already cost you an app server before it is rejected.',
          },
          {
            label: 'A sidecar proxy beside each service that calls a central rate limit service',
            why: 'Defensible in a service mesh: Envoy supports exactly this with an external rate limit service. It suits internal service-to-service limits; for a public API the edge gateway is the simpler single choke point.',
          },
          {
            label: "Counters in each server's own memory",
            why: 'Fast and simple, but not shared: with 50 servers the real limit is 50 times the intended one, and it shifts whenever the fleet scales or the load balancer spreads a client unevenly.',
          },
        ],
      },
      points: [
        'Path: clients, then the gateway tier (TLS, key check, rate limit), then load balancers and stateless app servers, then the cache and the sharded database.',
        'Layers: volumetric floods and coarse per-IP limits at the CDN or edge network; per-key quotas at the gateway; business rules in the service.',
        'Each gateway keeps a small in-memory deny list: once a key is over its limit, reject it locally until its `Retry-After`, so an abusive key stops costing Redis calls too.',
        'Open the build in the Lab: it serves one region, 40k requests per second from real clients plus 60k from clients far over quota. The limiter node stands for the gateway tier and its Redis cluster together; the simulator rejects 98% of the abusive traffic and assumes real clients stay under quota. Remove the limiter and watch the database overload; cut it to one instance and the limiter itself becomes the bottleneck, rejecting real users too.',
      ],
    },
    {
      kind: 'deep-dive',
      title: 'Go multi-region',
      prompt:
        'A customer sends traffic to all three regions. Does their limit apply per region or globally, and what do clocks have to do with it?',
      points: [
        'One global Redis puts a cross-region round trip (tens of milliseconds or more) on every request: too slow, and a single point of failure for the whole API.',
        "Count per region instead: each region has its own cluster and enforces a share of the global limit, either a third or a share weighted by where that key's traffic came from recently.",
        "Or enforce locally and exchange counts asynchronously every second or so, adding the other regions' last reported usage; the overshoot is bounded by what a key can send in one sync interval.",
        "Most keys are used from one place (a customer's servers usually sit in one cloud region), so a share weighted by recent traffic gives them nearly their whole limit where they actually use it.",
        "Clocks: a token bucket spends elapsed time, so a clock two seconds fast refills two seconds of tokens. Use one clock per bucket (the Redis primary's), and keep hosts on NTP so drift stays in milliseconds.",
      ],
    },
    {
      kind: 'deep-dive',
      title: 'Hot keys and failures',
      prompt: 'One large customer sends 50,000 requests a second on a single key, and one Redis shard stops answering. What happens?',
      decision: {
        question: 'The Redis shard holding a set of keys is unreachable for 30 seconds. What should the gateway do for those keys?',
        options: [
          {
            label: 'Fall back to a local in-memory bucket per gateway with the limit divided by the number of gateways',
            best: true,
            why: 'The API stays up and limits stay roughly right, since each gateway enforces its share; make the share generous (say twice the even split), since one client may reach only a few gateways. A tight timeout on the Redis call (a few milliseconds) and a circuit breaker keep a slow shard from adding latency to every request.',
          },
          {
            label: 'Fail open: allow every request until Redis is back',
            why: 'Defensible for pure protection limits and simple to build, but anyone who can overload Redis also switches your limits off, exactly when the backend may need them.',
          },
          {
            label: 'Fail closed: reject every request with `429` or `503`',
            why: 'Right for security-sensitive limits (login attempts, SMS codes), where an unlimited window is worse than an outage. For the whole API it turns a limiter blip into a full outage.',
          },
          {
            label: 'Hold requests until Redis answers',
            why: 'Adds latency to every request, ties up connections and threads, and releases a flood when Redis returns. Waiting is the one thing a limiter should not do.',
          },
        ],
      },
      points: [
        'A hot key lives in one Redis slot, so one customer at 50k checks/s can saturate a shard alone.',
        'Lease tokens in batches: a gateway takes, say, 20 tokens per round trip and spends them locally, cutting Redis calls for that key about 20 times; the error is bounded by the tokens leased out.',
        'Or split the key into several sub-buckets, each with a share of the limit, and pick one at random per request; a hot key spreads evenly over them, though a key near its limit may be rejected slightly early.',
        'The local deny list also protects Redis: a key far over its limit is rejected in memory, not with a Redis call per request.',
      ],
    },
    {
      kind: 'wrap-up',
      title: 'Close the loop',
      prompt: 'You have five minutes left. What would you raise before the interviewer does?',
      points: [
        'Metrics: checks per second, allowed and rejected per rule and plan, limiter latency p99, operations per Redis shard (to spot hot keys) and time spent in fallback mode.',
        'Log a sample of 429s with key and rule, and show customers their usage, so support can answer "why am I throttled?" without guessing.',
        'Roll out a new or tighter rule in shadow mode first: log what it would reject, check no good customer trips it, then enforce.',
        'Alert on a sudden jump in 429s for a large customer (a bug in their client, or in your rule) and on Redis timeouts.',
      ],
    },
  ],
  pitfalls: [
    "Keeping counters in each server's memory, so the real limit is the intended one times the number of servers and moves as the fleet scales.",
    'Reading the counter, comparing and writing it back from app code, so concurrent requests all pass the check.',
    'Picking a fixed window without noticing the double burst at the boundary, or a sliding log without doing the memory math.',
    'Never saying what happens when the counter store fails, or failing closed everywhere, so a Redis blip takes down the whole API.',
  ],
  followUps: [
    {
      question: 'How would you limit a GraphQL API, where one query can cost a thousand times more than another?',
      answer:
        "Limit by cost, not by request: compute a cost from the query's fields and page sizes before executing it, take that many tokens, and reject queries above a maximum cost outright. Correct the charge after execution if the real cost differs.",
    },
    {
      question: 'The product team wants a hard monthly quota of 1 million requests per key for billing. Same system?',
      answer:
        'No: that is metering, which must be durable and exact. Stream request logs to a queue, aggregate per key into a durable store, and enforce from the running total with a lag of a minute or so, warning customers as they approach the quota. The per-second limiter stays as it is.',
    },
    {
      question: 'A botnet spreads a credential-stuffing attack over 100,000 IPs, each under the per-IP limit. What now?',
      answer:
        'Per-IP limits cannot see it. Limit per target account (failed logins per username), per network (a /24 or an autonomous system), and use edge bot scores and challenges; alert on the global login failure rate.',
    },
  ],
};
