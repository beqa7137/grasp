import type { CaseStudy } from './types.js';

export const METRICS_MONITORING: CaseStudy = {
  id: 'metrics-monitoring',
  stages: [
    {
      kind: 'requirements',
      title: 'Clarify what matters',
      prompt:
        'Engineers want graphs of every host and service, and a page when something breaks. Before sizing anything, find out what drives the cost of a metrics system, because it is not the number of machines.',
      decision: {
        question: 'You have time for one question first. Which answer changes the design the most?',
        options: [
          {
            label: 'How many distinct time series are active at once, and how fast do new ones appear?',
            best: true,
            why: 'Every unique combination of metric name and label values is its own series, with its own index entry and open chunk in memory. Active series size the memory, the index and the ingest tier; churn (pods that come and go with new labels) decides how fast the index grows.',
          },
          {
            label: 'How many hosts do we monitor?',
            why: 'You need it, but it is only a multiplier. One host can export 50 series or 50,000 depending on its labels, so hosts alone cannot size the system.',
          },
          {
            label: 'How long do we keep the data, and at what resolution?',
            why: 'Useful: it sizes long-term storage and decides whether you downsample. It changes the storage tiers, not the ingest path or the index, which is where these systems fall over.',
          },
          {
            label: 'Should we use Prometheus or Datadog?',
            why: 'A build or buy choice to make after the requirements, not a requirement. It spends the first question on an answer the interviewer expects you to reason your way to.',
          },
        ],
      },
      points: [
        'Functional: collect numeric samples (counters, gauges, histograms) tagged with labels from every host and service; query them over any time range for dashboards; evaluate alert rules continuously; route, group and silence notifications to the right team.',
        'Scale (from the interviewer): 100,000 hosts, about 1,000 active series each once host and application metrics are counted, collected every 15 seconds, across three regions.',
        'Non-functional: an alert fires within a minute or two of a problem starting; dashboards over the last hour load in about a second; recent data survives the loss of any one machine; the system stays up when the things it watches are down.',
        'Retention: full resolution for about two weeks, coarser data for a year or more for capacity planning. Losing a few samples during a failure is acceptable; losing the ability to alert is not.',
        'Out of scope unless asked: logs and traces (separate pipelines, linked by labels and trace IDs), the dashboard UI itself, and on-call scheduling.',
      ],
    },
    {
      kind: 'estimation',
      title: 'Estimate the ingest rate',
      prompt:
        '100,000 hosts, 1,000 active series each, one sample per series every 15 seconds. How many samples per second must the system ingest?',
      estimate: {
        question: 'Samples ingested per second',
        answer: 6_666_667,
        unit: 'samples/s',
        working: [
          'Active series: 100,000 hosts x 1,000 series is 100 million series.',
          'Each series produces one sample every 15 seconds: 100,000,000 / 15 is about 6,666,667 samples per second.',
          'Per day: 6,666,667 x 86,400 is about 576 billion samples.',
        ],
      },
      points: [
        'Raw, a sample is an 8-byte timestamp and an 8-byte float: 576 billion x 16 bytes is about 9.2 TB a day. A general-purpose database adds row overhead and indexes on top of that.',
        'Compressed the way the Gorilla paper describes (about 1.37 bytes per sample on real data), the same day is about 790 GB, so two weeks of full resolution is about 11 TB before replication.',
        'Memory scales with active series, not with samples: the index and the chunk being filled for each of the 100 million series must stay in RAM, spread across many ingest nodes.',
        'Queries are few next to writes, perhaps thousands a second from dashboards and rule evaluation, but one query can touch millions of series. Writes are steady; reads are bursty and uneven.',
      ],
    },
    {
      kind: 'api',
      title: 'Collect the samples',
      prompt:
        'Services run in Kubernetes and come and go every few minutes; batch jobs live for seconds. How do samples get from 100,000 hosts into the system, and how do you tell a quiet host from a dead one?',
      decision: {
        question: 'How are samples collected?',
        options: [
          {
            label:
              'An agent per host or cluster discovers targets, scrapes their `/metrics` endpoints (pull), and forwards batches to the central ingest tier (push)',
            best: true,
            why: 'Scraping keeps collection simple for services, and a failed scrape is itself a signal (the `up` series drops to 0), so a dead target is never mistaken for a quiet one. Forwarding in compressed batches from a nearby agent crosses regions and firewalls cleanly, and the agent buffers through short outages.',
          },
          {
            label: 'A central server in each region scrapes every target directly',
            why: 'The classic single Prometheus setup, and fine for thousands of targets. At 100,000 hosts and 100 million series no single server holds the index, and scraping across networks and firewalls from one place gets fragile.',
          },
          {
            label: 'Every application pushes its own samples to the ingest endpoint',
            why: 'Defensible, and how many hosted products and the OpenTelemetry protocol work; it suits short jobs and hosts behind NAT. But a service that stops sending looks the same as one with nothing to say unless you track who should be sending, and a buggy client can flood the ingest tier.',
          },
          {
            label: 'Write every measurement to the log pipeline and derive metrics from the logs',
            why: 'Works for a few business metrics, but parsing text to count requests costs far more than incrementing a counter, and the logs lag behind the events they describe.',
          },
        ],
      },
      points: [
        'Exposition: each target serves lines like `req_total{code="500"} 42`. Counters only go up (and reset on restart), gauges go up and down, and histograms export one counter per latency bucket.',
        'Service discovery (the Kubernetes API, a cloud inventory or Consul) tells the agent what to scrape, so new pods are picked up in seconds with their labels attached.',
        'Short batch jobs finish before any scrape, so they push a final value to a push gateway or send it straight to the ingest tier. It is the exception, not the rule.',
        'Remote write: the agent batches samples into Snappy-compressed protobuf and sends them with retries, keeping a local write-ahead log so a short outage delays data instead of losing it.',
        'Reads: `/api/v1/query_range` takes a PromQL expression, a start, an end and a step, and returns one series of points per matching label set. Alert rules use the same query engine.',
      ],
    },
    {
      kind: 'data',
      title: 'Store the time series',
      prompt:
        'About 6.7 million samples arrive every second, almost all appended at the current time, and queries select series by labels and scan a time range. How do you store them?',
      decision: {
        question: 'Where do the samples live?',
        options: [
          {
            label:
              'A time series store: an inverted index from label pairs to series IDs, and per series, samples appended to compressed chunks in time-ordered blocks',
            best: true,
            why: 'It matches the workload exactly: appends only at the head, label selection through the index, and range scans over one series read one compressed chunk after another. Compression cuts storage by roughly ten times, and whole blocks are dropped when they age out.',
          },
          {
            label: 'A relational table with one row per sample: metric, labels, timestamp, value',
            why: 'Easy to start with, but 576 billion rows a day with a B-tree index cannot keep up, each row costs many times the 16 bytes of data, and deleting old rows row by row is its own load.',
          },
          {
            label: 'A wide-column store (Cassandra or HBase) keyed by series and time bucket',
            why: 'Defensible, and early systems such as OpenTSDB on HBase did this. It handles the write rate, but it has no label index, so "every series where code is 500" needs a separate index, and its generic block compression gets nowhere near delta-of-delta and XOR encoding.',
          },
          {
            label: 'Write raw samples to object storage and query them with a batch engine',
            why: 'Cheap for archives, but alert rules evaluate every minute over fresh data, and a batch scan per dashboard panel is far too slow.',
          },
        ],
      },
      points: [
        'A series is identified by its full label set, for example `cpu{host="a", dc="eu"}`, where the metric name is itself one more label. The index maps each label pair to a sorted list of series IDs; a query intersects those lists, like a search engine.',
        'Gorilla compression: timestamps are stored as the difference between successive deltas, which is 0 (a single bit) for a regular 15-second scrape; values are XORed with the previous one, and a slowly changing gauge shares most bits with its neighbor.',
        'Recent data sits in an in-memory head block protected by a write-ahead log; every two hours it is cut into an immutable block on disk, and older blocks are compacted into larger ones. Prometheus works this way.',
        'Retention drops whole blocks, never single samples. Downsampled blocks (5-minute and 1-hour resolution) keep min, max, sum and count per window, so a year-long graph reads few points and still shows the spikes.',
        'Long-term storage: ship finished blocks to object storage (as Thanos, Cortex and Grafana Mimir do) and read them through a gateway, so local disks hold only recent data.',
      ],
    },
    {
      kind: 'design',
      title: 'Put it together',
      prompt:
        'Trace a sample from a service endpoint to a dashboard panel and an alert rule. One server cannot hold 100 million series, so where does each series live, and what happens when that node dies?',
      lab: true,
      decision: {
        question: 'How do you scale past one server?',
        options: [
          {
            label:
              'Shard series across ingesters by a hash of their labels, write each series to three ingesters, flush blocks to object storage, and fan queries out',
            best: true,
            why: 'Hashing the full label set spreads even the busiest metric across many nodes, three replicas survive the loss of one without a gap, and object storage makes old data cheap and independent of the ingesters. Cortex and Grafana Mimir are built this way.',
          },
          {
            label: 'Federation: many independent servers each scrape a slice, and a global server scrapes their aggregates',
            why: 'Defensible and simple, and plenty for a few million series. But global queries see only the aggregates chosen in advance, each server is a single point of failure unless run in pairs, and rebalancing slices is manual.',
          },
          {
            label: 'Shard by metric name, so each metric lives on one node',
            why: 'Queries for one metric hit one node, but `http_requests_total` from every service can be a large share of all series and melts its node while others idle.',
          },
          {
            label: 'Buy one very large machine and keep everything on it',
            why: 'Simplest to run, but 100 million active series and their index do not fit comfortably in one machine, and that one machine is the single point of failure for every alert.',
          },
        ],
      },
      points: [
        'Agents send batches to stateless distributors behind load balancers. A distributor checks the tenant limits, hashes each series onto a ring of ingesters and writes it to three of them, succeeding when two acknowledge.',
        'Ingesters keep the head block and write-ahead log for their series, cut blocks every two hours and upload them to object storage; a compactor merges blocks, removes the duplicate replicas and builds downsampled copies.',
        'Queriers fan out to the ingesters for recent data and to store gateways for older blocks. A query frontend splits long ranges into day-sized pieces, runs them in parallel and caches the results, since the past does not change.',
        'A ruler evaluates recording and alert rules on a schedule through the same query path and sends firing alerts to an Alertmanager cluster, which groups, deduplicates and routes them.',
        'Open the build in the Lab: one of three regions at peak, 7,000 write batches a second (about 2.2 million samples in batches of about 320) plus 3,000 queries a second from dashboards and rules. The queue is the durable ingest log, the workers are the ingesters, the cache holds query results, and the database is the sharded time series store. The simulator writes every batch to the store; real ingesters compress samples in memory and write far less.',
      ],
    },
    {
      kind: 'deep-dive',
      title: 'Cardinality',
      prompt:
        'A team adds a `user_id` label to its request counter on Friday afternoon. Within minutes the ingesters run out of memory and every dashboard in the company goes blank. How do you stop one change from taking down monitoring?',
      decision: {
        question: 'How do you protect the system from a label explosion?',
        options: [
          {
            label:
              'Enforce limits at ingestion (active series per tenant and per metric, labels per series), reject the excess with a clear error, and show each team its own series count',
            best: true,
            why: 'The damage stays with the team that caused it: their new series are refused while everyone else keeps working. The error and the usage dashboard tell them exactly what to fix, and relabeling rules at the agent can drop the bad label before it ever leaves the host.',
          },
          {
            label: 'Autoscale the ingesters when memory climbs',
            why: 'Buys minutes at best: one unbounded label can create millions of series faster than nodes start, and the bill grows with it. Scaling is for organic growth, not for mistakes.',
          },
          {
            label: 'Drop random samples when the ingesters are overloaded',
            why: 'Hurts every team equally, including the ones that did nothing wrong, and punches holes in the series that alerts depend on. It also does nothing about the index, which is what grew.',
          },
          {
            label: 'Review every new metric by hand before it ships',
            why: 'Catches some mistakes and builds good habits, but it slows every team down and still misses a label whose values only explode in production.',
          },
        ],
      },
      points: [
        'Series multiply: a counter with 5 endpoints, 10 status codes and 200 pods is 10,000 series. Add `user_id` with a million users and it can reach 10 billion, which no index holds.',
        'Churn is the quieter version: every deploy gives pods new names, so each rollout creates a fresh set of series while the old ones linger in the head block until it is cut.',
        'Good labels have bounded values (status code, region, endpoint template); IDs, email addresses, full URLs and error messages belong in logs and traces. Exemplars attach a trace ID to a sample without making it a label.',
        'Tools that help: per-tenant and per-metric series counts, a top-N list of the metrics with the most series, and an alert on each team approaching its limit.',
      ],
    },
    {
      kind: 'deep-dive',
      title: 'Alerts that page the right person',
      prompt:
        'The checkout service promises 99.9% of requests succeed over 30 days. A static rule "errors above 1% for five minutes" pages at 3 a.m. for a blip, yet stayed silent last month while 0.5% of requests failed for two days. What should the rule be?',
      decision: {
        question: 'How do you alert on the service level objective?',
        options: [
          {
            label:
              'Alert on error budget burn rate over two windows: page when both the last hour and the last 5 minutes burn faster than 14.4 times the sustainable rate, and open a ticket for slower burns',
            best: true,
            why: 'Burn rate ties the alert to what users are promised: 14.4 times for an hour spends 2% of a 30-day budget, worth waking someone for. The long window ignores blips, the short one lets the alert stop soon after recovery, and slower rules (a 6-hour window that also pages, a 3-day window that opens a ticket) catch the two-day leak.',
          },
          {
            label: 'A static threshold on the error rate, held for a few minutes',
            why: 'Simple and easy to explain, and fine as a first alert. It pages for short spikes that barely touch the budget and misses slow leaks below the threshold that spend it all.',
          },
          {
            label: 'Burn rate over a single one-hour window',
            why: 'Better than a static threshold, but after the problem is fixed the hour still contains the bad minutes, so the alert keeps firing long after recovery, and it still misses slow burns.',
          },
          {
            label: 'Anomaly detection that learns normal behavior and pages on deviations',
            why: 'Useful on dashboards for spotting odd shapes, but hard to explain at 3 a.m., noisy around launches and holidays, and not tied to anything users were promised.',
          },
        ],
      },
      points: [
        'Rules run on a schedule (say every 30 seconds) as queries; a `for` clause keeps an alert pending until the condition has held long enough. Recording rules precompute expensive expressions, such as the error ratio per service, so alert rules stay cheap.',
        'While an alert fires, the ruler resends it every evaluation to every Alertmanager replica. The replicas gossip which notifications were already sent, so one page goes out even if a replica dies.',
        'Alertmanager groups alerts by labels (all of one cluster at once), waits a short time to collect the group, then sends one notification and repeats it only after a longer interval. Routes pick the team and channel from labels.',
        'Inhibition mutes the symptoms of a known cause: when a whole region is down, per-host alerts in that region are held back. Silences mute alerts during planned work, with an expiry so they are never forgotten.',
        'Every page carries a runbook link and a dashboard link. Page on symptoms users feel (errors, latency); send causes (a full disk, a failing node) to tickets unless they will hurt users soon.',
      ],
    },
    {
      kind: 'wrap-up',
      title: 'Close the loop',
      prompt: 'You have five minutes left. What would you raise before the interviewer does?',
      points: [
        'Monitor the monitor: a watchdog alert that always fires is sent to an external service, which pages when it stops arriving. A second small system in another region or provider watches the main one.',
        'Failure domains: the monitoring for a region should not depend on that region being healthy, so alert evaluation for critical services runs in more than one place, and paging goes through a provider outside your own infrastructure.',
        'Percentiles: a p99 cannot be averaged across pods. Sum the histogram buckets across pods, then compute the quantile from the combined histogram.',
        'Cost: series count, not hosts, drives the bill. Charge teams for their series, keep full resolution short, and let recording rules produce the few aggregates that need long retention.',
      ],
    },
  ],
  pitfalls: [
    'Sizing by hosts or by samples and never asking how many active series there are, so the index and memory are the surprise.',
    'Allowing unbounded label values such as user IDs or full URLs, so one change multiplies the series and takes monitoring down for everyone.',
    'Averaging percentiles across hosts or during downsampling, which hides exactly the spikes the graphs exist to show.',
    'Static thresholds on causes instead of burn rate on symptoms, so people are paged for blips and miss slow leaks.',
    'Running the only monitoring inside the failure domain it watches, so the outage that matters most is the one nobody is paged for.',
  ],
  followUps: [
    {
      question: 'A dashboard showing a year of request rates takes a minute to load. How do you fix it?',
      answer:
        'Read the downsampled blocks for long ranges: a year at 1-hour resolution is 8,760 points per series instead of about 2.1 million at 15 seconds. The query frontend splits the range by day, runs the days in parallel and caches finished days, and a recording rule can precompute the aggregate the panel shows, so it reads one series instead of thousands.',
    },
    {
      question: 'A counter drops to zero when its pod restarts. Does the graph of requests per second dip?',
      answer:
        'No, if you graph `rate()` rather than the raw counter: the rate function treats any decrease as a counter reset and adds the value from before the reset, so the per-second rate stays correct. It is one reason to export counters and let the query compute rates, rather than exporting a precomputed rate from the service.',
    },
    {
      question: 'Two replicas of the agent scrape the same targets for redundancy. How do you avoid storing everything twice?',
      answer:
        'Tag each replica with a replica label and let the distributors accept samples from one replica per cluster at a time, switching to the other only when the leader stops sending for a while (Cortex and Mimir call this the HA tracker). Alternatively store both and deduplicate at query time or during compaction, which costs twice the ingest.',
    },
  ],
};
