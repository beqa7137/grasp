import type { SdLesson } from './types.js';

export const STREAMS_LESSON: SdLesson = {
  why: 'Dashboards, fraud checks, billing counters and alerting all want answers seconds after events happen, not after a nightly batch job. Once the input never ends, "count the views for 12:00 to 12:01" hides hard questions: which clock defines 12:01, how long to wait for the phone that was offline, what happens to the count when the job crashes halfway, and how to split the work across machines without breaking order. Interviewers probe whether you can answer each with a concrete mechanism and name what it costs in latency, correctness or state.',
  widget: {
    kind: 'stream-windows',
    tryThis: [
      'Keep the defaults, tumbling windows of 10 s with a 2 s watermark delay: four windows count 3, 3, 3 and 2 events, and event 4 is dropped. It happened at 8 s but arrived at 15 s, after event 6 had arrived at 14 s and moved the watermark to 12, past the end of its window at 10. Event 9 was just as delayed (23 s, arriving at 31) yet counts, because the watermark was only at 25 when it arrived and its window ends at 30. Raise the delay to 4: event 4 is still dropped, since the watermark reaches exactly 10. At 6 it counts and the first window shows 4, but every window now closes 6 s after its end instead of 2.',
      'Set tumbling windows of 5 s with a delay of 2: eight windows, and events 4 and 9 are both dropped, since event 9 now falls in the window from 20 to 25 that the watermark has already passed. Smaller windows close sooner, so the same delay drops more events. Now switch to sliding windows of 10 s: they start every 5 s, so each event lands in two of the nine windows, and nothing is dropped. Event 4 missed the window from 0 to 10, which still shows 3, but counts in the one from 5 to 15, which shows 4: a late event can be counted in some windows and not in others that overlap them.',
      'Set session windows with a gap of 5 s and a delay of 0: three sessions, holding events 1 to 3, 5 to 10, and 11 and 12, and event 4 is dropped. Raise the delay to 2: event 4 now counts, and at 8 s it sits between event 3 at 6 s and event 5 at 12 s, so it bridges the gap and the first two sessions merge into one of 10 events. A late event can merge sessions, so a session result already emitted may need to be replaced. Set the gap to 10: every event joins one session, since no two consecutive events are 10 s apart.',
    ],
  },
  concepts: [
    {
      title: 'Streams versus batch',
      body: 'A batch job reads a bounded input, computes and finishes; a stream job reads an unbounded input and keeps results up to date as events arrive. Streaming buys latency (seconds instead of hours) and pays with harder questions: when is a result complete, where does intermediate state live, and how does it survive a crash. A batch is just a bounded stream, so one engine and one codebase can do both: replaying a retained Kafka topic through the same job reprocesses history, which is why many teams run one streaming pipeline (the Kappa architecture) instead of a batch path plus a streaming path. Periodic micro-batches (Spark Structured Streaming) are a middle ground when a few seconds of extra latency are acceptable.',
    },
    {
      title: 'Event time versus processing time',
      body: 'Event time is when something happened, stamped by the device or service that produced it; processing time is when the stream job sees it. They differ by network delay, retries, consumer lag and, for phones, hours offline. Windowing by processing time is simple and never waits, but results depend on when the job ran: an outage followed by a catch-up piles an hour of events into one window, and reprocessing gives different answers. Windowing by event time gives the same answer however events arrive, at the cost of deciding how long to wait for stragglers. Device clocks can be wrong, so clamp timestamps that lie in the future relative to the server.',
    },
    {
      title: 'Window kinds and what each suits',
      body: "Tumbling windows are fixed, back to back and do not overlap, so each event lands in exactly one: per-minute counts, hourly billing. Sliding windows have a fixed size and advance by a smaller step, so each event lands in size divided by step windows: a 10 minute average updated every minute costs 10 window updates per event (Kafka Streams calls these hopping windows). Session windows have no fixed size: a key's session ends after a gap with no events, which suits user visits or bursts of card activity, and a late event can merge two sessions into one. Global windows with custom triggers cover the rest, such as firing every 100 events.",
    },
    {
      title: 'Watermarks, allowed lateness and side outputs',
      body: "A watermark is the job's claim that no more events older than time t will arrive, so windows ending at or before t can be finalized. The usual heuristic is the largest event time seen minus a fixed bound; with parallel inputs, an operator takes the minimum watermark across its input partitions, so one idle partition stalls every window (Flink marks such sources idle with `withIdleness`). The bound trades latency for completeness: a longer delay holds every result longer and drops fewer events. Allowed lateness is a second knob: emit a result when the watermark passes, keep the window state a while longer, and emit a corrected result for each straggler. Events later than that go to a side output (in Flink, `sideOutputLateData`) for a batch correction instead of vanishing.",
    },
    {
      title: 'State, checkpoints and exactly-once',
      body: 'Windows, joins and deduplication keep state per key, often gigabytes, held in memory or an embedded RocksDB. Flink snapshots it with checkpoints: sources inject barriers into the stream, each operator saves its state when a barrier passes (a variant of the Chandy-Lamport snapshot), and the checkpoint also records the Kafka offsets read so far. After a crash the job restores the last checkpoint and rewinds to those offsets, so every event affects the state exactly once. Output is another matter: results written since the checkpoint are written again on replay. End-to-end exactly-once needs an idempotent sink (upsert the full result keyed by window, not an increment) or a transactional one (Kafka transactions committed when the checkpoint completes, read with `read_committed`), which delays visible output by up to a checkpoint interval.',
    },
    {
      title: 'Partitions, keys, ordering and backpressure',
      body: "Kafka orders messages only within a partition, and the default partitioner hashes the key, so producing with the key you aggregate or join on (user id, card id) keeps each key's events in order and on one consumer. A consumer group gives each partition to at most one consumer, so the partition count caps parallelism, and adding partitions later moves keys to new partitions, which breaks per-key order at that moment. A hot key (one page with a fifth of the traffic) overloads one task however many there are; split it with a salt and sum the parts. When a task falls behind, Flink's credit-based flow control slows its upstream tasks and finally the source (backpressure), so consumer lag grows instead of memory: alert on lag and scale up to the partition count.",
    },
    {
      title: 'Joins over streams',
      body: "A stream-table join enriches each event with the current value for its key, such as a click with the user's country, from a table kept up to date by a changelog stream (a KTable in Kafka Streams); it keeps one row per key and no history. A stream-stream join matches events from two streams within a time bound, such as a click within 30 minutes of its ad impression, so each side must be buffered for that interval, and the watermark decides when unmatched events can be dropped or emitted as no-match. Without a time bound the state grows forever.",
    },
  ],
  examples: [
    {
      title: 'Page views per minute with late mobile events',
      problem:
        'Count views per page per minute for a live dashboard: 500,000 views a second across 200,000 pages, 20% of them for the home page. Measured delay from view to arrival: 97% within 5 s, 99.5% within 30 s, 99.9% within 10 minutes, the rest up to a day (phones offline). A load test shows one task handles about 50,000 keyed updates a second. Design the windows, watermark and lateness.',
      insight:
        'Pick the watermark delay for the bulk of events, allowed lateness for the long tail, and a side output for the rest; then check state size and hot keys.',
      steps: [
        'Use event time from the client, clamped to the server receive time if it lies in the future, and tumbling one-minute windows keyed by page. By processing time, a phone reconnecting after 10 minutes offline would dump its backlog into the current minute.',
        'Watermark delay 5 s: each minute is first published 5 s after it ends but misses 3% of events, 15,000 views a second. A delay of 30 s publishes at 30 s and misses 0.5%, 2,500 a second. Take 30 s for a dashboard; alerting on the same stream could take 5 s and tolerate the gap.',
        'Allowed lateness of 10 minutes: each late view updates its window and the job re-emits the count as an upsert keyed by page and minute, so the dashboard converges and 99.9% of views are counted within 10 minutes. The last 0.1%, about 500 a second, go to a side output that a daily batch job adds in.',
        'State: a window stays open for its minute, the 30 s delay and 10 minutes of lateness, so each page holds up to 12 windows. At 64 bytes each that is 200,000 times 12 times 64, about 154 MB, comfortable in RocksDB across a few tasks.',
        'Hot key: the home page alone is 100,000 updates a second on one task that handles 50,000, so backpressure builds and lag grows. Key by page plus a salt from 0 to 7 instead: 12,500 a second per sub-key, and a second stage sums 8 partial counts per page per minute.',
      ],
    },
    {
      title: 'Fraud checks with session windows',
      problem:
        'Flag a card that makes more than 5 purchases in one burst, where a burst ends after 10 minutes without a purchase. Payments arrive at 2,000 a second and authorization must answer within 100 ms. One card buys at 12:00:00, 12:01:30, 12:03:00, 12:04:10, 12:05:00 and 12:06:20. A teammate proposes session windows with a 10 minute gap. When is the card flagged?',
      insight:
        'A session window can only report once its gap has passed; a decision needed on the current event needs keyed state updated on every event.',
      steps: [
        'Keyed by card, the six purchases form one session, since no gap reaches 10 minutes. It closes when the watermark passes 12:16:20; with a 30 s watermark delay the flag appears around 12:16:50, 10.5 minutes after the sixth purchase was approved.',
        'Instead keep per-card state holding the burst count and the time of the last purchase. On each purchase: if 10 minutes or more have passed since the last one, reset the count to 0; add one; flag if the count exceeds 5. The purchase at 12:06:20 makes the count 6 and is flagged within the same call, in milliseconds.',
        "Register a timer 10 minutes after each purchase that clears the card's state, so idle cards cost nothing. At most every card seen in the last 10 minutes has state: 2,000 times 600 is 1.2 million cards, about 60 MB at 50 bytes each.",
        "Produce payments to Kafka keyed by card id, so one card's purchases sit in one partition and reach its state in order. An offline purchase uploaded hours later cannot be blocked; send it to a side output for review.",
        'Session windows still earn their place after the fact: session length, spend per session and merchants per session make good features for a fraud model trained offline.',
      ],
    },
    {
      title: 'A crash double-bills advertisers',
      problem:
        'A Flink job counts ad clicks per advertiser per minute and writes the counts to Postgres for billing. It takes 20,000 clicks a second and checkpoints every 60 s. It crashes 45 s after its last checkpoint, and after the restart some advertisers are overbilled. Why, and what fixes it?',
      insight: 'Checkpoints make the state exactly-once, not the side effects; the sink must tolerate replay.',
      steps: [
        'On restart Flink restores the counts from the last checkpoint and rewinds the Kafka offsets to the ones stored in it, so 45 times 20,000, or 900,000 clicks, are processed a second time. The restored counts do not include them, so the state counts each click once.',
        'But during those 45 s the sink already wrote results. It wrote increments, `SET n = n + ?`, so every increment from those 45 s is applied twice, and those advertisers pay twice for those clicks.',
        'Idempotent fix: write the whole count for a window as an upsert keyed by advertiser and minute, with `ON CONFLICT` setting the value. The replay rewrites the same rows instead of adding to them, with no extra latency.',
        'Transactional alternative, for sinks that cannot upsert such as a Kafka topic: write inside a transaction committed when the checkpoint completes. Consumers reading with `read_committed` never see the replayed output, but see results up to 60 s later than before.',
        'Duplicates can also enter upstream: a client that retries a click request writes it twice to Kafka, and no checkpoint undoes that. Deduplicate by click id with keyed state that expires after an hour: 20,000 times 3,600 is 72 million ids, about 1.2 GB at 16 bytes each before overhead.',
      ],
    },
  ],
  pitfalls: [
    'Windowing by processing time for results that must be correct: a consumer outage and catch-up piles the backlog into one window, and replaying the same input gives different answers.',
    'Setting the watermark delay for the worst straggler: waiting a day for the last offline phone holds every result for a day. Wait for the bulk, correct with allowed lateness, and send the rest to a side output.',
    'Claiming exactly-once end to end because the engine checkpoints: appends, increments, emails and HTTP calls made since the last checkpoint happen again on replay unless the sink is idempotent or transactional.',
    'Adding consumers beyond the partition count, or ignoring a hot key: extra consumers in a group sit idle, and one key with a fifth of the traffic saturates its task however many tasks there are.',
  ],
  followUps: [
    {
      question: 'All windows stopped emitting, but the job is healthy and consuming. What would you check?',
      answer:
        "The watermark. An operator's watermark is the minimum across its input partitions, so one partition that receives no events (a quiet topic partition, or more partitions than producers use) holds it back and no window closes. Mark idle sources so they stop holding the watermark, as Flink does with `withIdleness`, or send periodic heartbeat events into every partition.",
    },
    {
      question: 'How would you join ad impressions with the clicks they led to?',
      answer:
        "Key both streams by impression id and use an interval join: a click matches an impression if it happened within, say, 30 minutes after it. Each side is buffered for 30 minutes plus the watermark delay, so state is about the impression rate times 30 minutes. When the watermark passes an impression's time plus 30 minutes it is emitted as not clicked and its state is dropped.",
    },
    {
      question: 'Why not run a batch job every minute instead of a stream processor?',
      answer:
        'For simple aggregates at minute latency that can work, and Spark Structured Streaming does essentially that. It gets harder when results need state across batches (sessions that span minutes, joins, deduplication), when latency must be well under the batch interval, or when late data must correct earlier results. A stream processor keeps that state per key between events and checkpoints it, instead of each batch reloading it.',
    },
  ],
};
