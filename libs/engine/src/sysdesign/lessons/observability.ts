import type { SdLesson } from './types.js';

export const OBSERVABILITY_LESSON: SdLesson = {
  why: 'A system you cannot see into fails in ways you learn about from angry users, and a system that alerts on everything trains its on-call engineers to ignore pages. Observability is the craft of choosing what to measure, keeping it affordable, and turning it into a few alerts that mean users are hurting. Interviewers probe whether you can define an SLO and its error budget with numbers, explain why averages and averaged percentiles lie, design burn-rate alerts that page fast for outages but not for blips, and follow one slow request across twenty services.',
  widget: {
    kind: 'error-budget',
    tryThis: [
      'Keep the defaults, a 99.9% SLO and a 0.1% error rate at 1,000 requests a second over 30 days: the budget is 43.2 minutes of full outage or 2,592,000 failed requests, the burn rate is exactly 1x, and the budget runs out in exactly 30 days. Only the 3-day ticket fires, since 1x is its threshold. Slide the error rate to 0.05%: 0.5x, 60 days, nothing fires. At 0.2% it is 2x and 15 days, still a ticket, not a page.',
      'Slide the error rate to 0.59%: 5.9x, the budget lasts about 5.1 days, and still only the ticket fires. At 0.6% the burn rate reaches 6x, the budget lasts 5 days and the 6-hour page fires. At 1.44% it is 14.4x, the budget is gone in about 2.1 days and the 1-hour page fires too; at 3% it is 30x and 1 day. The widget compares only the long-window average: a real alert also needs its short window (5 minutes, 30 minutes or 6 hours) above the same rate, so it stops firing soon after the errors stop.',
      'Set the SLO to 99.99% and the error rate back to 0.1%: the budget shrinks to 4.32 minutes and 259,200 failures, and the same error rate is now a 10x burn that spends it in 3 days and fires the 6-hour page. At 0.15% it is 15x and all three alerts fire. Now pick 99% and slide to the maximum, 3%: the budget is 432 minutes, the burn only 3x, 10 days, and nothing pages. Each extra nine cuts the budget tenfold and multiplies the burn of any given error rate by ten.',
    ],
  },
  concepts: [
    {
      title: 'Metrics, logs and traces',
      body: "Metrics are numbers aggregated over time, such as requests per second by status code: cheap to store and query at any scale, ideal for dashboards and alerts, but they say that something is wrong, not which request. Logs are records of individual events: rich detail for one request, but expensive at volume and slow to aggregate. Traces follow one request through every service it touches, as a tree of timed spans, and show where its time went. A typical investigation uses all three: a metric alert says checkout errors rose, a trace shows the payment call timing out, and that service's logs give the exception. Structured logs (JSON fields rather than free text) carrying the request id and trace id are what let you jump between them.",
    },
    {
      title: 'What to measure: golden signals, RED and USE',
      body: 'The four golden signals from the Google SRE book are latency, traffic, errors and saturation (how full the most constrained resource is), measured for every user-facing service. RED (rate, errors, duration) is the same idea for request-driven services, and USE (utilization, saturation, errors) is its counterpart for resources such as CPUs, disks, connection pools and queues. Measure latency of successful and failed requests separately: a failure that returns in 2 ms makes the latency graph look better while users suffer. Page on symptoms users feel (errors, latency) and keep causes (CPU at 85%, a full disk soon) for dashboards and tickets.',
    },
    {
      title: 'Percentiles, not averages',
      body: "A mean latency of 80 ms can hide 3% of requests taking 2 seconds, so latency is reported as percentiles: p50 for the typical user, p99 and p99.9 for the tail. The tail matters more than it looks: a page that makes 20 backend calls hits a p99 on at least one of them for 1 - 0.99^20, about 18%, of page loads. Percentiles cannot be averaged or summed: the p99 of a fleet is not the mean of each server's p99. To aggregate, each server exports a histogram (counts of requests per latency bucket); you add the bucket counts across servers and compute the percentile from the total. Client-side summaries that export a finished p99 per server cannot be combined at all.",
    },
    {
      title: 'SLIs, SLOs and error budgets',
      body: 'A service level indicator is a ratio of good events to valid events, such as the share of requests that return a non-5xx response within 300 ms, measured as close to the user as practical (the load balancer rather than the app, which never sees requests it failed to receive). A service level objective is the target for that ratio over a window, such as 99.9% over 30 days; an SLA is a contract with penalties and is set looser than the SLO. The error budget is what the SLO allows to fail: 0.1% of requests, or 43.2 minutes of full outage in 30 days. The budget turns reliability into a shared decision: while it lasts, ship; once it is spent, an agreed policy freezes risky releases until reliability work wins it back. 100% is the wrong target, since users cannot tell 99.999% from 100% behind their own networks, and every nine costs about ten times more.',
    },
    {
      title: 'Burn-rate alerting',
      body: 'The burn rate is how fast the budget is being spent relative to the pace that would use exactly all of it in the window: error rate divided by (1 - SLO), so 0.6% errors against a 99.9% SLO is 6x, and the budget lasts 30 / 6 = 5 days. The Google SRE workbook recommends multiwindow, multi-burn-rate alerts: page when the 1-hour burn rate is at least 14.4x (2% of a 30-day budget in an hour) and the 5-minute rate agrees; page at 6x over 6 hours (5% of the budget) with a 30-minute short window; open a ticket at 1x over 3 days (10%) with a 6-hour short window. The long window keeps a brief spike from paging, the short window, a twelfth of the long one, lets the alert clear minutes after recovery instead of an hour later. A fixed threshold such as "errors above 1% for 5 minutes" either pages for harmless blips or misses a slow leak that spends the budget in a week.',
    },
    {
      title: 'Cardinality: the cost of labels',
      body: "In Prometheus-style systems every unique combination of a metric's label values is a separate time series, with its own memory, storage and query cost. Labels multiply: 20 endpoints times 5 status codes times a 12-series histogram is 1,200 series per instance, and 50 instances make 60,000. Add a label with a user id, a request id, a raw URL path containing ids or an error message, and the count grows with traffic until the metrics backend runs out of memory or the bill explodes. Keep labels to small, bounded sets; put per-user and per-request detail in logs and traces, and link from a histogram bucket to an example trace with exemplars.",
    },
    {
      title: 'Distributed tracing and sampling',
      body: 'Each request gets a trace id at the edge, propagated to every downstream call in a header (W3C `traceparent`); each service records spans with a start time, duration and parent span, and a backend assembles them into a tree. Tracing every request is usually too expensive, so traces are sampled. Head sampling decides at the root, for example keep 1%, and passes the decision downstream: cheap and simple, but blind, since it cannot know which requests will fail or be slow. Tail sampling buffers all the spans of a trace in a collector and decides after it completes, so it can keep every error and every slow trace plus a small share of the rest; it costs memory for the buffer and needs every span of a trace routed to the same collector.',
    },
  ],
  examples: [
    {
      title: 'An SLO and alerts for a checkout API',
      problem:
        'A checkout API serves 1,000 requests a second. Product agrees on 99.9% of requests succeeding over a rolling 30 days. Compute the error budget, then explain when the standard burn-rate alerts fire for a bad deploy that makes 1.5% of requests fail, a 10-minute full outage, and a slow leak of 0.2% errors.',
      insight:
        'Each alert fires once a fixed share of the budget has been spent, so time to page shrinks as the incident grows, and the short window decides how fast the page clears.',
      steps: [
        'Budget: 30 days is 43,200 minutes, and 0.1% of that is 43.2 minutes of full outage. In requests: 1,000 a second for 2,592,000 seconds is 2.592 billion requests, 0.1% of which is 2,592,000 failures.',
        'Bad deploy at 1.5% errors: the burn rate is 1.5 / 0.1 = 15x, so the whole budget would be gone in 30 / 15 = 2 days. The 1-hour average passes 14.4x after 14.4 / 15 of an hour, 57.6 minutes (the 5-minute window agreed after 4.8 minutes), so the page comes about an hour in, when 57.6 minutes at 1.5% has spent 0.864 outage minutes, exactly 2% of the budget.',
        "Full outage: 100% errors is a 1,000x burn. The 1-hour average passes 14.4x after 14.4 / 1,000 of an hour, about 52 seconds, so the page is nearly immediate. Ten minutes of outage spend 10 of the 43.2 minutes, 23% of the month's budget.",
        'After that outage ends, the 1-hour window still holds 10 minutes at 1,000x, an average of about 167x, and stays above 14.4x for about 59 minutes. The 5-minute window drops below 14.4x within about 5 minutes, and since the alert needs both, it clears then instead of paging on a fixed incident for an hour.',
        'Slow leak at 0.2% errors: 2x, budget gone in 15 days. Neither page fires, which is right, since nobody should wake up for it. The 3-day average reaches 1x after 36 hours and the 6-hour window is already at 2x, so a ticket opens with about 13.5 days of budget left to find the cause.',
      ],
    },
    {
      title: 'The dashboard that averaged percentiles',
      problem:
        'Ten servers each handle 1,000 requests a second. Nine are healthy with a p99 of 50 ms; one has a failing disk, and 30% of its requests take 2 s, so its p99 is 2 s. A normal request takes 20 ms. The dashboard shows fleet p99 as the mean of the ten per-server p99s. What does it show, what is the truth, and how do you compute it correctly?',
      insight:
        'A percentile is a property of the whole distribution; you can only combine distributions, such as histogram bucket counts, never the percentiles computed from them.',
      steps: [
        'The dashboard shows (9 × 50 + 2,000) / 10 = 245 ms, a mild concern. The mean latency looks even calmer: (9,700 × 20 ms + 300 × 2,000 ms) / 10,000 is about 79 ms.',
        'The truth: the fleet serves 10,000 requests a second, 300 of which take 2 s. That is 3% of all requests, so everything from the p97 up is 2 s, and the fleet p99 is 2 s, about eight times what the dashboard shows. One in 33 checkouts is painfully slow.',
        'Fix: each server exports a latency histogram, say with bucket bounds at 100 ms, 250 ms, 500 ms, 1 s and 2.5 s. Sum each bucket across servers (in PromQL, `sum by (le)` before `histogram_quantile`). With every fast request under 100 ms, that gives 9,700 requests under 100 ms and 300 between 1 s and 2.5 s.',
        'The p99 is request number 9,900 of 10,000, so it falls in the 1 s to 2.5 s bucket, 200 of its 300 requests in. Interpolating linearly gives 1 s + (200 / 300) × 1.5 s = 2.0 s, the true answer.',
        'Bucket bounds set the precision: a percentile inside a wide bucket is only an estimate. Put a bound exactly at the SLO threshold, such as 300 ms, so the share of requests under it is counted exactly rather than interpolated.',
      ],
    },
    {
      title: 'Choosing a trace sampling strategy',
      problem:
        'A platform serves 20,000 requests a second; each request produces about 30 spans of 500 bytes. 0.1% of requests fail and about 0.5% take longer than 1 s. Engineers want to find traces for failed and slow requests. Compare keeping everything, head sampling at 1%, and tail sampling.',
      insight:
        'Head sampling cuts cost evenly and so throws away almost all the rare traces you need; tail sampling keeps them but pays to buffer every span until the trace ends.',
      steps: [
        'Keeping everything: a trace is 30 × 500 bytes = 15 KB, so 20,000 a second is 300 MB/s, about 26 TB a day of trace data. Too expensive to store and index for a view that is mostly routine successes.',
        'Head sampling at 1%: 3 MB/s, about 260 GB a day. But of 20 failing requests a second only 0.2 are kept, and any one failure a user reports has a 1% chance of having a trace. The kept data is mostly the successes you did not need.',
        'Tail sampling: keep all 20 failures a second, all 100 slow traces, and 1% of the remaining 19,880, about 199. That is about 320 traces a second, 4.8 MB/s or about 415 GB a day, and it holds every trace an engineer will go looking for.',
        'The cost moves to the collectors: all 300 MB/s of spans still leave the services, and each trace must be held until it finishes, say 10 s, which is about 3 GB of spans in memory across the fleet. Every span of a trace must reach the same collector, so a first tier routes spans by trace id.',
        'Tie it together with ids: every service writes its trace id and request id into its structured logs, so even a request whose trace was dropped can be found in the logs, and a kept trace links straight to them.',
      ],
    },
  ],
  pitfalls: [
    'Averaging percentiles across servers or time buckets, or watching mean latency: both hide the slow tail that users actually complain about. Aggregate histograms and read p99 from the total.',
    'Paging on causes such as CPU above 80% or one failed health check instead of on SLO burn: engineers get woken for events users never felt and learn to ignore pages, while real outages with normal CPU go unnoticed.',
    'Putting unbounded values such as user ids, request ids or raw URLs in metric labels: each value creates new time series until the metrics backend runs out of memory. That detail belongs in logs and traces.',
    'Measuring the SLI only inside the application: requests that die at the load balancer, in DNS or in a crashed process never reach its metrics, so the dashboard shows 100% during an outage.',
  ],
  followUps: [
    {
      question: 'How do burn-rate alerts behave for a service with very little traffic?',
      answer:
        'At 10 requests a minute, an hour holds only 600 requests, so 9 failures in an hour are a 1.5% error rate, a 15x burn against a 99.9% SLO, and a brief glitch pages someone. Options are to send synthetic probe traffic so there are enough events, group several small services under one SLO, use longer windows, or require a minimum count of failures before alerting. Each trades detection speed for fewer false pages.',
    },
    {
      question: 'If user ids cannot be metric labels, how do you answer "which customers were affected?"',
      answer:
        'From logs and traces, which are stored per event and can hold any field. Structured logs with a user id, request id and trace id can be filtered and counted after the fact, and a log store with columnar indexing answers group-by-user queries in seconds. Metrics answer "how many and how fast" for alerting; the per-user question goes to the event data.',
    },
    {
      question: 'Why pick 99.9% rather than 99.99% for a service?',
      answer:
        'Look at what users can perceive and what the dependencies allow. A service cannot beat the availability of the dependencies it calls in series, and 99.99% leaves 4.32 minutes a month, less than one rollback of a bad deploy takes to notice and undo, so it demands automated rollout, redundancy across zones and fast detection. Pick the lowest target users are happy with, measured from past performance and complaints, since a tighter target costs engineering time that could have gone to features.',
    },
  ],
};
