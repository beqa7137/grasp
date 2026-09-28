import type { CaseStudy } from './types.js';

export const AD_CLICK_AGGREGATOR: CaseStudy = {
  id: 'ad-click-aggregator',
  stages: [
    {
      kind: 'requirements',
      title: 'Clarify what matters',
      prompt:
        'Users click ads on websites and apps, land on the advertiser page, and advertisers watch their click counts and pay per click. Before drawing boxes, find out what the counts are used for, because that decides how exact they must be.',
      decision: {
        question: 'You have time for one question first. Which answer changes the design the most?',
        options: [
          {
            label: 'Are the counts used for billing, or only for dashboards?',
            best: true,
            why: 'Billing turns a counting problem into a money problem: every click counted once, invalid clicks removed, and numbers that can be recomputed and audited. Dashboards alone could live with approximate, best-effort counts and a much simpler pipeline.',
          },
          {
            label: 'How many clicks a day?',
            why: 'You will ask it next, since it sizes Kafka, the stream workers and storage. But the shape (a click log, a stream aggregator, an analytics store) is the same at a million or a billion clicks a day.',
          },
          {
            label: 'What time granularity do advertisers query?',
            why: 'Useful: minute buckets, rollups and retention depend on it. It changes table layouts, not whether you need exactly-once counting and reconciliation.',
          },
          {
            label: 'Which analytics database should we use?',
            why: 'A product choice to make after the requirements, not a requirement. It spends the first question on an answer the interviewer expects you to reason your way to.',
          },
        ],
      },
      points: [
        'Functional: a click on an ad is recorded and the user is redirected to the landing page; advertisers query clicks per ad per minute over any time range, filtered by campaign, country and device; the same counts feed billing.',
        'Billing is cost per click (from the interviewer): advertisers pay only for valid clicks, so duplicates and fraudulent clicks must be removed before an invoice is cut.',
        'Scale (from the interviewer): 10 million active ads and 1 billion clicks a day, with peaks at three times the average rate.',
        'Non-functional: the redirect is fast (tens of milliseconds, users are waiting); an acknowledged click is never lost; dashboards are at most about a minute behind; billed counts are exact once the day is reconciled.',
        'Out of scope unless asked: choosing which ad to show (the auction), impression counting (the same pipeline at higher volume), budget pacing and the invoicing system itself.',
      ],
    },
    {
      kind: 'estimation',
      title: 'Estimate the traffic',
      prompt: '1 billion clicks a day, and peaks run at three times the average. How many clicks per second must ingestion handle at peak?',
      estimate: {
        question: 'Peak clicks per second',
        answer: 34_722,
        unit: 'clicks/s',
        working: [
          'Average: 1 billion / 86,400 seconds is about 11,574 clicks per second.',
          'Peak: three times that is about 34,722 clicks per second; call it 35,000.',
          'At about 500 bytes per click event (IDs, timestamp, IP, user agent, placement), the peak is 35,000 times 500 bytes, about 17.5 MB a second.',
        ],
      },
      points: [
        '35,000 events a second and 17.5 MB a second are modest for Kafka: a few brokers carry it. The hard part is correctness (each click counted once, in the right minute), not raw throughput.',
        'Raw events: 1 billion times 500 bytes is 500 GB a day, about 180 TB a year before replication. Keep them in cheap object storage, since they are the evidence for every invoice.',
        'Aggregates are smaller but not tiny: an average ad gets 100 clicks a day, so most of its minutes hold zero or one click. Per-minute rows compress hot ads well and the long tail hardly at all, so roll minutes up into hours after a few days.',
        'Queries are light next to ingestion: advertisers refreshing dashboards make perhaps a few thousand queries a second, but each may scan millions of rows.',
      ],
    },
    {
      kind: 'api',
      title: 'Record the click',
      prompt:
        'A user taps an ad. We must record the click reliably and get them to the advertiser page without a noticeable delay. What does the link point at, and what happens when it is followed?',
      decision: {
        question: 'How is a click recorded?',
        options: [
          {
            label:
              'The ad link points at our click endpoint, which appends the click to a durable log and answers with a `302` redirect to the landing page',
            best: true,
            why: 'Every billable click passes through a server we control, so none are missed by ad blockers or closed tabs, and the click is validated before the user leaves. Appending to Kafka takes a few milliseconds, so the extra hop is barely noticeable.',
          },
          {
            label: 'Link straight to the advertiser, and fire a tracking request from the browser in parallel (a beacon)',
            why: 'Defensible for dashboards and used for third-party tracking, since the user skips a hop. For billing it undercounts: blockers, closed tabs and failed requests silently drop clicks, and we cannot validate a click before the user leaves.',
          },
          {
            label: 'Write the click to the database in the request, then redirect',
            why: 'Correct but slow and fragile: the redirect now waits on a database write, and a database hiccup either loses clicks or blocks users. A log absorbs spikes and lets the aggregation run separately.',
          },
          {
            label: 'Let advertisers report clicks from their landing page analytics',
            why: 'The party being billed would be counting its own bill, and landing pages that fail to load would never report. Their numbers are useful only as a cross-check.',
          },
        ],
      },
      points: [
        '`GET /click/{impId}` carries a signed impression token: the ad ID, placement, impression time and landing URL, signed with an HMAC so a forged or edited link is rejected without a database lookup.',
        'The click server stamps the receive time and a click ID, appends the event to Kafka with `acks=all`, and returns `302` with the landing URL. Never `301`: browsers cache a permanent redirect and later clicks would skip us.',
        'If Kafka is briefly unreachable, the server spools events to local disk and still redirects, replaying them later. The click then arrives late, which the aggregation must handle.',
        '`GET /ads/{id}/clicks` with `from`, `to`, a granularity (minute, hour or day) and optional filters returns the time series; campaign and account level queries sum across ads.',
      ],
    },
    {
      kind: 'data',
      title: 'Store the counts',
      prompt:
        'Advertisers ask "clicks per minute for my campaign, last 24 hours, by country" and finance asks "valid clicks per ad for September". Where do the counts live so both are fast?',
      decision: {
        question: 'Where do the aggregated counts live?',
        options: [
          {
            label:
              'A columnar analytics store (for example Apache Druid, Apache Pinot or ClickHouse) holding rows per ad, minute and dimensions, partitioned by time',
            best: true,
            why: 'Built for this: columnar scans, time partitioning and rollups make "sum by country over a day" fast across millions of rows, and ingestion straight from Kafka keeps it a minute or less behind.',
          },
          {
            label: 'A relational database sharded by ad ID',
            why: 'Defensible at small scale, and fine for one ad at a time. Campaign and account queries fan out across shards and scan row stores, which gets slow as history grows.',
          },
          {
            label: 'A wide-column key-value store (Cassandra) keyed by ad and minute',
            why: 'Fast writes and fast lookups of one known key, but every new filter or group-by needs another table precomputed for it, and ad hoc slicing is not possible.',
          },
          {
            label: 'Query the raw click events in object storage when an advertiser asks',
            why: 'Right for audits and the batch job, but scanning 500 GB a day of raw events per dashboard refresh takes far too long and costs too much.',
          },
        ],
      },
      points: [
        'Aggregate row: `(ad_id, minute)` plus campaign, country and device, with valid and invalid click counts. Keep the dimensions few and low-cardinality: every extra dimension multiplies the rows.',
        'Raw events are the source of truth: land them from Kafka into object storage as Parquet files partitioned by hour. Aggregates can always be rebuilt from them; the reverse is impossible.',
        'Roll minutes up into hours after a few days and hours into days after a few months; billing only needs daily totals per ad, and dashboards rarely need minute detail for last year.',
        'Analytics stores keep data in immutable time segments. A correction does not update rows in place: a batch job rewrites the segment for that hour or day, and the store swaps it in atomically.',
      ],
    },
    {
      kind: 'design',
      title: 'Put it together',
      prompt:
        'Trace a click from the tap to a number on the advertiser dashboard, and then to the invoice at the end of the month. Which numbers are fast, and which are final?',
      lab: true,
      decision: {
        question: 'How do you make the billed numbers trustworthy?',
        options: [
          {
            label:
              'Stream processing for fresh counts, plus a daily batch job over the raw events that recomputes the totals and replaces them',
            best: true,
            why: 'The stream gives advertisers numbers within a minute; the batch job, running over complete data with no late events, produces the final counts that billing uses and catches any stream bug or outage.',
          },
          {
            label: 'Stream processing only, trusting its exactly-once guarantees',
            why: 'Defensible (the kappa architecture), and replaying the log fixes bugs. But nothing independent checks the stream, Kafka retention limits how far back you can replay, and a billing dispute needs a recount from the raw events anyway.',
          },
          {
            label: 'Batch only: count clicks once an hour from the raw events',
            why: 'Simple and exact, but dashboards are an hour or more behind, which advertisers watching a campaign launch will not accept.',
          },
        ],
      },
      points: [
        'Click servers behind load balancers validate the token, append to a Kafka topic partitioned by ad ID and redirect. A connector copies the topic to object storage as the raw log.',
        'A stream processor (for example Apache Flink) reads the topic, drops duplicates, tags invalid clicks, counts per ad per minute in event-time windows and writes each finished window to the analytics store.',
        'Once a day, after late data has settled, a batch job (for example Spark) recounts the day from the raw log, with the same deduplication and fraud rules plus slower checks, and replaces that day in the store. Billing reads only reconciled days.',
        'Reconciliation compares the two per ad: small differences from late clicks are expected, large ones page someone. Apache Pinot supports this pattern directly with hybrid tables, which answer from batch segments where they exist and real-time ones after.',
        'Open the build in the Design Lab: one of three regions at peak, 12,000 clicks a second plus 500 dashboard queries. The queue is Kafka, the workers are the stream processor, the cache holds recent dashboard results, and the database is the analytics store, sharded by a hash of the ad ID. The simulator writes every click to the store; the real aggregator writes one row per ad per minute, far fewer.',
      ],
    },
    {
      kind: 'deep-dive',
      title: 'Windows and watermarks',
      prompt:
        'A click stamped 10:00:58 arrives at the aggregator at 10:02:30, because its click server spooled it during a Kafka blip. The 10:00 minute has already been shown on dashboards. What happens to that click?',
      decision: {
        question: 'When is a minute of counts final?',
        options: [
          {
            label:
              'Count in event-time windows, emit each minute when a watermark passes its end, update it for clicks up to an allowed lateness, and leave anything later to the batch recount',
            best: true,
            why: 'Clicks land in the minute they happened, whatever the delay. The watermark bounds how long a window waits, allowed lateness corrects most stragglers with an updated row, and the daily batch catches the rest, so state stays bounded.',
          },
          {
            label: 'Count in processing-time windows: whatever arrives during a minute counts for that minute',
            why: 'Simple, but any lag moves clicks into the wrong minute: a consumer that falls behind for five minutes, then catches up, shows a dip followed by a false spike, and a replay puts old clicks in the current minute.',
          },
          {
            label: 'Keep every window open forever and update it whenever a click arrives',
            why: 'Always correct eventually, but the state grows without limit, and nothing ever tells billing that a minute is done.',
          },
          {
            label: 'Wait an hour before counting any minute, so nothing is late',
            why: 'Nearly exact, but dashboards are an hour stale, and a click delayed longer than an hour is still late.',
          },
        ],
      },
      points: [
        'Event time is the receive time the click server stamps, not the device clock, which can be wrong or forged. Lateness then comes only from our own pipeline: spooling, backlogs and cross-region copies.',
        'A watermark is the processor saying "no events older than T should still arrive". A bounded-out-of-orderness watermark trails the newest timestamp seen by a fixed delay, say 30 seconds, trading freshness for fewer late events.',
        'The watermark advances with the slowest input partition, so an idle partition stalls every window. Mark partitions idle after a timeout (Flink supports this) so the rest keep flowing.',
        'Emit results as upserts keyed by ad and minute: an early row at the watermark, replaced when a late click updates the window. Clicks past the allowed lateness go to a side output and are counted by the batch job.',
      ],
    },
    {
      kind: 'deep-dive',
      title: 'Count every click once',
      prompt:
        'A stream worker crashes after writing some minute counts but before recording how far it has read in Kafka. It restarts and reads those clicks again. Meanwhile a bot clicks the same ad 500 times. How do the counts stay right?',
      decision: {
        question: 'How do you avoid counting clicks twice after a crash?',
        options: [
          {
            label:
              'Checkpoint the operator state and the Kafka offsets together, and write each window to the store as an overwrite keyed by ad and minute',
            best: true,
            why: 'After a crash the job restores the last checkpoint and replays from its offsets, recomputing exactly the same counts. Because the sink overwrites rather than adds, writing a window twice leaves the same value: exactly-once effect from at-least-once delivery.',
          },
          {
            label: 'Consume at least once and increment a counter in the store per click',
            why: 'Every replay adds the replayed clicks again, so counts drift upward after each crash or rebalance, and nobody can tell by how much.',
          },
          {
            label: 'Commit the Kafka offset before processing each batch',
            why: 'That is at most once: a crash after the commit loses the batch. Undercounting is no better for billing than overcounting.',
          },
          {
            label: 'Use a two-phase commit across Kafka, the processor and the analytics store',
            why: 'Flink can do this with transactional sinks such as Kafka, but most analytics stores cannot join the transaction, and it adds latency. Idempotent overwrites get the same result more simply.',
          },
        ],
      },
      points: [
        'Flink checkpoints use barriers that flow through the stream (asynchronous barrier snapshotting, based on the Chandy-Lamport algorithm), so state and input offsets are captured consistently without stopping the job.',
        'Duplicate clicks are a separate problem from replays: a double tap or a retried request produces two events for one impression. Keep seen impression IDs in keyed state with a TTL and count the first click per impression only.',
        'Sizing that state: an hour of peak traffic is 35,000 times 3,600, about 126 million IDs; at 16 bytes each that is about 2 GB, spread across workers in RocksDB state.',
        'Fraud (invalid traffic) is tagged rather than dropped: click rates per IP and device, known bot user agents and data centre IP ranges, clicks too soon after the ad rendered. Tagged clicks are stored as invalid, so rules can change and the batch job can re-score history.',
        'Slower fraud models run in the daily batch job; clicks judged invalid after billing are credited back to advertisers, as large ad networks do.',
      ],
    },
    {
      kind: 'wrap-up',
      title: 'Close the loop',
      prompt: 'You have five minutes left. What would you raise before the interviewer does?',
      points: [
        'Hot ads: a Super Bowl ad can take a large share of all clicks, overloading its Kafka partition and worker. Salt the key (ad ID plus a small random suffix), count per sub-key and sum the partial counts in a second step.',
        'Multi-region: click servers and Kafka run in every region so redirects stay local; either aggregate per region and sum in the store, or mirror the topics to one aggregation region. The batch job reads all regions.',
        'Monitoring: consumer lag, watermark delay, late and dropped event rates, the invalid click rate per publisher, and the stream versus batch difference per day, which should be small and stable.',
        'Privacy: raw events hold IP addresses and device IDs. Truncate or drop them once fraud checks and the dispute window have passed, and keep only the aggregates longer.',
      ],
    },
  ],
  pitfalls: [
    'Incrementing counters in a database from an at-least-once consumer, so every crash or rebalance quietly overcounts.',
    'Counting by processing time, so a backlog or replay moves clicks into the wrong minute.',
    'Writing to a database on the redirect path, or using a `301` redirect that browsers cache and replay without us.',
    'Keeping only aggregates: with no raw log there is no way to recount after a bug or answer a billing dispute.',
    'Partitioning by ad ID without a plan for one ad that gets a large share of all clicks.',
  ],
  followUps: [
    {
      question: 'A bug overcounted clicks for three hours yesterday. How do you fix the numbers?',
      answer:
        'Fix the code, then recompute the affected hours from the raw log in object storage with the batch job (or replay the Kafka topic if it is still within retention, seven days by default) and replace those segments in the analytics store. Billing has not used yesterday yet if it reads only reconciled days; if an invoice already went out, issue credits for the difference.',
    },
    {
      question: 'Advertisers want the top 100 ads by clicks in the last minute. How?',
      answer:
        'Each worker already holds per-ad counts for its partitions, so it emits its local top 100 when the window closes, and one merge step combines them into the global top 100. That is exact because each ad lives in one partition (a salted hot ad has its parts summed first). For approximate top-k over longer windows, a Count-Min sketch with a small heap keeps memory fixed.',
    },
    {
      question: 'How would the same system count impressions, at about 100 times the volume?',
      answer:
        'The same pipeline with more Kafka partitions and workers: about 3.5 million events a second at peak. Pre-aggregate on the ad servers (counts per ad per few seconds) before sending, which cuts events sharply while keeping the counts exact, and keep the raw impression log in object storage for recounts, as for clicks.',
    },
  ],
};
