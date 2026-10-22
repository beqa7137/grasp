import type { SdLesson } from './types.js';

export const OVERLOAD_LESSON: SdLesson = {
  why: 'Every service eventually receives more traffic than it can serve: a launch, a retry wave, a slow dependency, a lost zone. What happens then is a design choice. A service that queues everything keeps its throughput high while its users time out, and client retries can keep it down long after the trigger has passed. Interviewers probe whether you bound the work you accept, reject early and cheaply, stop work nobody is waiting for, and keep retries from turning a blip into an outage.',
  widget: {
    kind: 'overload',
    tryThis: [
      'Start at the defaults: Queue everything, a 1,200/s burst on top of 800/s, a 2 s timeout, no retries. For 10 s, 2,000 requests a second meet 1,000 of capacity, so the queue grows by 1,000 a second to 10,000, and the longest wait is 10 s. Only 25% of users are served in time, 45,000 answers arrive after their client gave up, and the queue drains so slowly (200 a second) that it recovers 50 s after the burst. Raise the timeout to 10 s: 100% are served in time, but the longest wait and the recovery do not change.',
      'Back at a 2 s timeout, set retries to 1. Requests sent jump from 60,000 to 112,600, users served in time fall to 8.3%, and the service does not recover within a minute: after the burst, every fresh request still times out and is sent twice, 1,600 a second against 1,000 of capacity. The trigger is gone and the overload remains.',
      'Pick Bounded queue with the bound at 1,000 and no retries: 85% are served in time, 9,000 are turned away, nothing is answered late, the longest wait is 1 s and it recovers 5 s after the burst. Set the bound to 2,000 (capacity times the timeout): 86.7%. Set it to 5,000: 58.3%, with 20,000 answered too late; add 1 retry and it collapses to 8.3%. A bound larger than clients will wait for is an unbounded queue with a cap.',
      'Pick Drop expired with the defaults: 86.7% are served in time, 8,000 are dropped unanswered, nothing is answered late and it recovers 10 s after the burst. With 1 retry it serves 87.7%: retries help once the service stops working on requests nobody waits for. Set retries back to 0 and push the burst to 3,000/s: Queue everything serves 4.1%, while Drop expired and a bound of 2,000 both serve 66.7%, spending every second of capacity on answers someone receives.',
    ],
  },
  concepts: [
    {
      title: "Little's law and the unbounded queue",
      body: "Little's law says requests in the system equal arrival rate times time in the system. Rearranged for a queue, the wait is the queue length divided by the rate it drains: 10,000 queued at 1,000 a second is a 10 s wait for everyone behind it. Arrivals above capacity add to the queue every second, and it only shrinks at the spare capacity after the spike, often a small fraction. So an unbounded queue turns a short burst into minutes of latency for every user, including those who arrive after the burst.",
    },
    {
      title: 'Goodput, not throughput',
      body: 'Throughput counts answers; goodput counts answers someone received in time. A request answered after its client timed out is wasted work: it used a worker, a database query and bandwidth, and it also delayed the requests behind it. An overloaded FIFO queue can run at 100% throughput and near 0% goodput. Watch goodput, latency percentiles and queue wait, not CPU or request rate alone.',
    },
    {
      title: 'Bounded queues and rejecting fast',
      body: 'Size a queue from time, not memory: bound is roughly capacity times the acceptable wait, and never more than capacity times the client timeout. At 1,000 a second and a 2 s timeout, anything past 2,000 queued will be answered too late. When the queue is full, reject at once and cheaply, before authentication, database reads or other expensive work: `429 Too Many Requests` when a client exceeds its quota, `503 Service Unavailable` when the service itself is overloaded, both with a `Retry-After` header. A fast rejection costs microseconds and lets the client back off, fall back or try another replica.',
    },
    {
      title: 'Deadlines: propagate them, drop expired work',
      body: 'Give every request a deadline at the edge and pass the remaining time downstream, for example as gRPC does with its `grpc-timeout` header. Each service checks it when a request leaves the queue, and before each downstream call: if the time left cannot cover the work, drop it or fail fast. Cancel downstream calls when the caller disconnects. A server timeout longer than the client timeout guarantees wasted work, so each layer should use a shorter budget than its caller.',
    },
    {
      title: 'Retry storms and metastable failure',
      body: 'Retries multiply load exactly when the service can least afford it. If requests wait past the timeout, every request is sent again while the first copy often stays queued, so demand doubles and the queue grows faster, pushing more requests past the timeout. The load can stay above capacity after the trigger ends: a metastable failure, where the system is stuck in a bad state by its own feedback loop and recovers only when load is cut. Retries also compound across layers: three layers that each try 3 times send up to 27 attempts to the bottom.',
    },
    {
      title: 'Retries that do not amplify',
      body: 'Retry at one layer only, usually the one closest to the user. Cap attempts (2 or 3) and keep a retry budget: a client retries only while retries stay under about 10% of its requests, so an outage raises load by at most 10%. Space attempts with exponential backoff and jitter, for example a sleep drawn at random between 0 and min(cap, base × 2^attempt), so thousands of clients do not retry in lockstep. Retry only idempotent operations or ones carrying an idempotency key, and honor `Retry-After`. A circuit breaker stops calls to a dependency that keeps failing, and probes it before resuming.',
    },
    {
      title: 'Backpressure in pipelines',
      body: 'Backpressure lets a slow consumer slow its producers down instead of buffering without limit. A bounded channel blocks the sender when full; a pull-based consumer (a Kafka consumer, a Reactive Streams subscriber that requests n items) only takes what it can process; TCP flow control stops the sender once it has as many unacknowledged bytes in flight as the receiver advertised room for. Every buffer between stages must be bounded, and at the edge, where users cannot be slowed down, backpressure turns into rejection.',
    },
    {
      title: 'Admission control and load shedding',
      body: "Admit only the work you can finish. A concurrency limit caps requests in flight; by Little's law, 1,000 a second at 50 ms needs 50 in flight, and more only adds queueing. Adaptive limits (Netflix's concurrency-limits library, Envoy's adaptive concurrency filter) lower the limit when latency rises above its baseline and raise it when latency is healthy, much like TCP congestion control. Shed by priority: keep checkout and logins, drop prefetch, analytics and batch traffic first. Under overload, serving newest first (LIFO) helps: the newest requests are the ones whose clients are still waiting, and Facebook switches its queues to LIFO when they back up for this reason.",
    },
  ],
  examples: [
    {
      title: 'A 30-second spike that hurts for a minute',
      problem:
        'An API serves 5,000 requests a second and normally receives 4,000. A spike brings 7,000 a second for 30 s. Clients time out after 3 s. The request queue is unbounded. What do users see, and what should the queue look like?',
      insight:
        "Little's law turns the excess into waiting time for everyone; a bound sized from the timeout turns it into fast rejections for a few.",
      steps: [
        "The excess is 7,000 − 5,000 = 2,000 a second, so after 30 s the queue holds 60,000. By Little's law the wait is 60,000 / 5,000 = 12 s, four times the timeout.",
        'The queue holds 3 s of work (15,000 requests) after 15,000 / 2,000 = 7.5 s. From then on, every request is answered after its client gave up, while the service reports a steady 5,000 a second.',
        'After the spike the queue drains at only 5,000 − 4,000 = 1,000 a second: 60 s to empty, and 45 s until waits drop under 3 s. That is 22.5 s of the spike plus 45 s after it, 67.5 s in which nobody is served in time, before counting retries.',
        'Bound the queue at capacity times an acceptable wait of 1 s: 5,000 requests. It fills in 5,000 / 2,000 = 2.5 s; after that, 2,000 a second are turned away with a 503 and `Retry-After`, 2,000 × 27.5 = 55,000 in all.',
        'Of the 210,000 spike requests, 155,000 are now answered within about 1 s, against only the 52,500 sent in the first 7.5 s with the unbounded queue. The queue empties 5 s after the spike, and the rejected clients can retry into the spare capacity with backoff.',
      ],
    },
    {
      title: 'Retries that keep a service down',
      problem:
        'A service answers 1,000 requests a second and receives 800. A 10 s burst adds 1,200 a second. Clients time out after 2 s and retry once, at once; the service queues everything and never cancels abandoned requests. Explain what happens over the next minute and how to fix it.',
      insight:
        'When waits exceed the timeout, every retry is extra load on top of a copy still in the queue, and load can stay above capacity after the trigger is gone.',
      steps: [
        "Without retries, the queue grows by 2,000 − 1,000 = 1,000 a second to 10,000, a 10 s wait by Little's law, and drains at 200 a second afterwards. Only 25% of users are served in time.",
        'With one retry, each request that has waited past 2 s is sent again while its first copy stays queued. After the burst every fresh request still waits past 2 s, so demand is 800 + 800 = 1,600 a second against 1,000: the queue grows by 600 a second with the burst over.',
        'Over the minute, 60,000 users send 112,600 requests. The service is busy every second and answers 60,000, but 55,000 of them arrive too late: 5,000 / 60,000 = 8.3% of users are served in time.',
        'Stop the wasted work first: drop requests whose deadline has passed when they leave the queue, and cancel them when the client disconnects. With expired work dropped, the same retry serves 87.7% and the service recovers 13 s after the burst.',
        'Then shape the retries: a 10% budget caps demand at about 800 × 1.1 = 880 a second, under capacity, so the queue drains at 120 a second even while every request fails; exponential backoff with jitter spreads the retries that remain.',
      ],
    },
    {
      title: 'Admission control for checkout during a flash sale',
      problem:
        'A shop service has 200 workers and each request takes 40 ms. During a sale, 8,000 requests a second arrive: 1,500 checkout and 6,500 product browsing. Clients time out after 1 s. Design the admission policy.',
      insight: "Derive capacity and the queue bound from Little's law, then decide who gets the capacity before the sale, not during it.",
      steps: [
        'Capacity is workers divided by service time: 200 / 0.04 s = 5,000 requests a second. The concurrency limit is 200 in flight; more would only queue inside the workers.',
        'Allow at most 200 ms of queueing, well inside the 1 s timeout: the bound is 5,000 × 0.2 = 1,000 queued requests. Past that, reject with a 503 and `Retry-After` before doing any work.',
        'Admit by priority: all 1,500 checkouts, then 3,500 of the 6,500 browsing requests. The other 3,000 a second get a cached or simplified page from the edge, or a fast rejection.',
        'Watch the bound when the database slows: at 80 ms per request, capacity halves to 2,500 a second and the same 1,000 queued requests wait 400 ms. Bound the queue by time (drop what has waited 200 ms) or use an adaptive limit, so the policy follows the real capacity.',
        'Propagate the deadline: a checkout that has waited 150 ms of a 1 s budget passes about 850 ms, minus a margin, to the payment call, and aborts early rather than charging a card for a client that is gone.',
      ],
    },
  ],
  pitfalls: [
    "Unbounded queues hidden in defaults: Java's `newFixedThreadPool` uses an unbounded queue, and so do many client libraries, message buffers and proxies. Each one turns overload into latency.",
    'Retrying at every layer, immediately and without a budget: a short blip becomes a retry storm that keeps the service down after the cause is gone.',
    'Watching throughput and CPU during an incident: a service answering only late requests looks fully busy and healthy.',
    'Server timeouts longer than the client timeout, or no cancellation: the service finishes work for callers who left long ago.',
    'Rejecting late in the request path: if a rejection costs a database lookup, shedding load barely reduces load.',
  ],
  followUps: [
    {
      question: 'When should a server return 429 and when 503?',
      answer:
        '`429` means this client has exceeded its quota, so the fix is on the client side and other clients are unaffected. `503` means the service itself is overloaded or unavailable for everyone. Both should carry `Retry-After`, and well-behaved clients back off on both, with jitter, within their retry budget.',
    },
    {
      question: 'Why would serving the newest request first help under overload?',
      answer:
        'In a backed-up FIFO queue, the oldest requests are the ones whose clients have most likely given up, so serving them first wastes capacity and makes every newer request late as well. Serving newest first answers the requests that can still succeed, and the oldest ones time out. Used only under overload (adaptive LIFO), it keeps normal traffic fair and ordered.',
    },
    {
      question: 'A stream job cannot keep up with its input. What happens with and without backpressure?',
      answer:
        'Without it, buffers between stages grow until a process runs out of memory, and the data in them is lost or replayed. With it, a slow stage stops granting credit (Flink) or pulling (a Kafka consumer), so upstream slows down and the backlog sits in the durable log as consumer lag. Then scale the slow stage out, up to the number of partitions, or shed low-priority data.',
    },
  ],
};
