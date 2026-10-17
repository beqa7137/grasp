import type { CaseStudy } from './types.js';

export const NOTIFICATIONS: CaseStudy = {
  id: 'notifications',
  stages: [
    {
      kind: 'requirements',
      title: 'Clarify what matters',
      prompt:
        'Many product teams will call this service, for everything from a password reset to a marketing blast. Which questions shape the design?',
      decision: {
        question: 'Which question narrows this design the most?',
        options: [
          {
            label: 'Which messages are urgent, how fast must they arrive, and how big do campaigns get?',
            best: true,
            why: 'A password reset that must land in seconds and a campaign to 100 million users that can take hours cannot share one pipeline blindly. The answer sets priorities, queue layout and capacity.',
          },
          {
            label: 'Must every notification be delivered exactly once?',
            why: 'Worth raising, but the answer is predictable: nobody can promise exactly once through APNs or an SMS carrier. The real question is whether a rare duplicate or a rare loss is worse, and that differs by message type.',
          },
          {
            label: 'Which email and SMS vendors do we use?',
            why: 'A vendor choice, made later. The design should hide providers behind an adapter so they can be swapped or used side by side.',
          },
          {
            label: 'Can push notifications carry images?',
            why: 'A payload detail. Rich push changes the message body, not how messages are queued, throttled or retried.',
          },
        ],
      },
      points: [
        'Functional: product teams send a notification to a user on push, email or SMS from a template; teams schedule campaigns to audience segments; users set per-channel and per-category preferences and can opt out.',
        'Priorities: critical (password resets, one-time codes, security alerts) must arrive within seconds; transactional (order shipped) within a minute; marketing within hours.',
        "Rules applied on every send: opt-outs, quiet hours in the user's time zone (critical messages bypass them), and frequency caps on marketing (say at most 3 a day).",
        'Scale (from the interviewer): about 1 billion notifications a day, 80% push, 15% email and 5% SMS; the largest campaigns reach 100 million users.',
        "Non-functional: never lose a critical message, keep duplicates rare, and let no team or campaign delay another team's urgent traffic.",
      ],
    },
    {
      kind: 'estimation',
      title: 'Estimate the volume',
      prompt: 'One billion notifications a day. What rate does the pipeline sustain on average, and per channel?',
      estimate: {
        question: 'Average notifications per second',
        answer: 11_574,
        unit: 'notifications/s',
        working: [
          'Round a day to 100,000 seconds: 1 billion / 100,000 is about 10,000 per second.',
          'Exactly: 1,000,000,000 / 86,400 is 11,574 per second.',
          'By channel: about 9,300 push, 1,700 email and 580 SMS per second.',
          'Daily peaks run about twice the average, so about 23,000 per second before any campaign.',
        ],
      },
      points: [
        'About 11.6k sends per second on average and 23k at the daily peak.',
        'Each send is a small job: look up preferences and device tokens, render a template, call a provider, record the outcome.',
        'The delivery log grows by about 1 billion rows a day: at 500 bytes each that is 500 GB a day, or 45 TB for 90 days of history, about 135 TB with 3 replicas.',
        'SMS is 5% of the volume but most of the cost: about 50 million a day at a cent or more each is about $500,000 a day, so SMS goes only to users and categories that need it, and a duplicate or a looping bug costs real money.',
      ],
    },
    {
      kind: 'estimation',
      title: 'Estimate a campaign spike',
      prompt: 'Marketing wants a campaign to reach 100 million users within one hour. What send rate does that need?',
      estimate: {
        question: 'Send rate for 100 million notifications in one hour',
        answer: 27_778,
        unit: 'notifications/s',
        working: [
          'An hour is 3,600 seconds; round it to 4,000: 100 million / 4,000 is 25,000 per second.',
          'Exactly: 100,000,000 / 3,600 is 27,778 per second.',
          'On top of the 11.6k baseline that is about 39,000 per second, more than three times the average.',
          'Spread over four hours instead: 100 million / 14,400 is about 6,900 per second, which fits in normal headroom if scheduled away from the daily peak.',
        ],
      },
      points: [
        'A campaign can more than triple the load for an hour, so either provision for it or queue it and send at a controlled rate.',
        'Providers cap the rate anyway: FCM caps sends per project (600,000 a minute by default, about 10,000 a second, below the 22,000 push a second this campaign needs) and both throttle bursts to a single device, email providers such as Amazon SES set a per-account send rate, and SMS throughput depends on the sender type (US long codes, toll-free numbers and short codes all differ).',
        "Pushing 100 million users at once also sends a wave of app opens at the product's own servers; campaigns are throttled partly to protect them.",
      ],
    },
    {
      kind: 'api',
      title: 'Define the API',
      prompt: 'Sketch the calls a product team makes. What must a send request carry so that retries are safe?',
      decision: {
        question: 'How should a team send a campaign to 100 million users?',
        options: [
          {
            label: 'One request naming a segment and a template; a campaign service expands the audience in pages at a throttled rate',
            best: true,
            why: 'The team makes one call, the audience is read in batches of thousands, and jobs enter the low-priority queue at a rate the operator sets, so the campaign can be paused, resumed or cancelled midway.',
          },
          {
            label: 'The team calls the send endpoint once per recipient',
            why: "100 million API calls push the whole spike through the API tier, retries become the caller's problem, and nothing can pause or cancel the campaign centrally.",
          },
          {
            label: 'Expand the whole audience into the queue at once and let workers drain it',
            why: 'Defensible for smaller campaigns, since the queue absorbs the burst. At 100 million jobs, cancelling means purging millions of messages, and preferences read at expansion go stale for jobs sent hours later.',
          },
        ],
      },
      points: [
        '`POST /v1/notifications` takes the recipient user ID, a template ID with its parameters, a category, a priority and optional channels; it returns `202 Accepted` with a notification ID.',
        'Every send carries an `Idempotency-Key` header chosen by the caller (for example the password reset request ID); a retry with the same key returns the first result instead of sending again.',
        '`POST /v1/campaigns` takes a segment, a template, a schedule and a maximum send rate; campaigns can be paused and cancelled.',
        '`GET` on `/v1/notifications/:id` returns the status per channel: queued, sent, delivered, opened, failed or suppressed (with the reason, such as an opt-out).',
        "Teams authenticate with per-team API keys, and each team has a quota per priority, so a bug in one team's code cannot flood the platform.",
      ],
    },
    {
      kind: 'data',
      title: 'Model the data',
      prompt: 'What does a worker need to look up before it sends, and what does it record afterwards?',
      points: [
        'Preferences: per user, per category and channel, opted in or out, plus time zone and quiet hours. Read on every send, so cached; changes apply within seconds.',
        'Device tokens: per user, a list of push tokens with platform and last-seen time. A token that APNs or FCM rejects as unregistered is deleted.',
        'Templates: versioned per team, locale and channel, with the variables they expect. Rendering pins a version so a mid-campaign edit does not mix two versions.',
        "Delivery log: one row per notification and channel with its state changes and provider message ID, sharded by a hash of the user ID so a user's history and frequency counts sit on one shard. It is append-heavy with a TTL, so a wide-column store such as Cassandra fits.",
        'Idempotency keys: key to notification ID with a 24-hour TTL, written with a put-if-absent (Redis `SET NX` or a conditional insert).',
      ],
    },
    {
      kind: 'design',
      title: 'Put it together',
      prompt: "Trace a password reset and a campaign message from the API call to the user's phone. Where do they part ways?",
      lab: true,
      points: [
        "API: check the team's quota and the idempotency key, validate the template, write a queued row, enqueue a job and return `202`. Nothing slow happens in the request.",
        'Queues: one topic per channel and priority (critical, transactional, bulk), each with its own worker pool, so a campaign backlog never sits in front of a password reset.',
        'Workers: apply preferences, quiet hours and frequency caps at send time, render the template, call the provider through an adapter with a per-provider rate limiter, then record the outcome.',
        'Provider callbacks (email bounces and complaints, SMS delivery receipts) and app open events flow back through their own queue into the delivery log.',
        'Open the build in the Lab: it serves the average, 11.6k sends a second plus 2.9k status and preference reads. The single queue stands for all the channel and priority topics, and the worker count stands for the send rate providers allow; the simulator does not model the providers themselves. The simulator also routes every send through the API, while a real campaign enters the queue from the campaign service.',
        'Push the load to 40,000 requests a second, a campaign on top of the baseline: the API keeps accepting in a few milliseconds while the backlog grows by about 17k a second. That is the queue absorbing the spike; it drains once the campaign ends. Adding workers drains it faster only until the database, or in reality the provider limits, run out.',
      ],
    },
    {
      kind: 'deep-dive',
      title: 'Choose the delivery guarantee',
      prompt:
        'A worker calls the SMS provider, the provider accepts, and the worker crashes before recording it. What happens next, and what should?',
      decision: {
        question: 'Which delivery guarantee would you build the platform on?',
        options: [
          {
            label: 'At least once, with idempotency keys and a per-channel sent check',
            best: true,
            why: 'Jobs are acknowledged only after the outcome is recorded, so a crash means a retry, never a loss. The idempotency key stops duplicate requests, and the worker checks the delivery log before sending, so duplicates only happen in the narrow window between a provider call and its record.',
          },
          {
            label: 'At most once: acknowledge the job before sending',
            why: 'No duplicates, but a crash silently drops the message. Defensible for low-value promotional push, where a duplicate annoys more than a miss costs; unacceptable for a one-time code, so it cannot be the platform default.',
          },
          {
            label: 'Exactly once, using transactional messaging such as Kafka transactions',
            why: 'Kafka exactly-once covers reading and writing Kafka topics, not the side effect of calling APNs or a carrier. The provider call cannot join the transaction, so the last hop stays at least once whatever the queue promises.',
          },
          {
            label: 'At least once with no deduplication',
            why: 'Nothing is lost, but every redelivery and client retry can send again. Users get two reset codes, and duplicate SMS cost money.',
          },
        ],
      },
      points: [
        'Deduplicate in layers: the API rejects a repeated `Idempotency-Key`, the worker skips a notification and channel already marked sent, and where a provider accepts an idempotency token, pass the notification ID.',
        'Mark a row sending before the provider call and sent after it; a retry that finds sending for longer than the provider timeout decides by message type (resend a one-time code, skip a marketing message).',
        'For push, `apns-collapse-id` on APNs and the notification `tag` on Android make a duplicate replace the earlier one on the device instead of showing twice; the FCM `collapse_key` only merges messages waiting for an offline device.',
      ],
    },
    {
      kind: 'deep-dive',
      title: 'Priorities, provider limits and retries',
      prompt:
        'A campaign has 50 million jobs queued. A password reset arrives, and the SMS provider starts answering `429`. What keeps each case healthy?',
      decision: {
        question: 'How do you lay out the queues?',
        options: [
          {
            label: 'Separate topics per channel and priority, each with its own workers and rate budget',
            best: true,
            why: "Critical traffic never waits behind bulk traffic, a slow SMS provider only backs up SMS, and each pool scales on its own queue age. Reserve part of each provider's rate limit for critical messages.",
          },
          {
            label: 'One queue with a priority field on each message',
            why: "Defensible at small scale: RabbitMQ supports priority queues. But partitioned logs such as Kafka read strictly in order, so a campaign backlog blocks everything behind it, and one channel's outage stalls the others.",
          },
          {
            label: 'One queue per product team',
            why: "Gives fairness between teams, but it does not separate a team's own resets from its campaigns, and thousands of queues are hard to operate. Fair sharing across teams fits better inside each priority level.",
          },
        ],
      },
      points: [
        "Each worker pool sends through a token bucket sized to the provider's limit, shared across instances (for example in Redis), so the fleet as a whole stays under it.",
        'Retry `429` and `5xx` answers with exponential backoff and full jitter, honoring `Retry-After`; do not retry permanent errors such as an invalid address or an unregistered token.',
        'Delayed retries go to separate retry topics (for example 1 minute, 10 minutes, 1 hour) so a failing message never blocks the partition behind it.',
        'After the last attempt, or once the message has expired (a 10-minute code is useless after 10 minutes), the job goes to a dead-letter queue with its error; alert on its growth and let operators replay it after a fix.',
        'For critical messages, keep a second provider per channel behind a circuit breaker, and fall back to another channel (SMS when push fails) where the user allows it.',
      ],
    },
    {
      kind: 'deep-dive',
      title: 'Scheduling, quiet hours and tracking',
      prompt: 'A campaign should arrive at 9 am local time, and marketing wants delivery and open rates. How do you do both?',
      points: [
        'Scheduled jobs sit in a store keyed by send time in minute buckets; a scheduler polls due buckets and enqueues them, holding a lease per bucket so two schedulers never release the same one.',
        "Quiet hours reuse the scheduler: a non-critical message for a user in quiet hours is rescheduled to the window's end rather than dropped. A 9 am local campaign becomes one wave per UTC offset.",
        'Push: APNs and FCM confirm acceptance, not display, so opens are measured by the app reporting a tap with the notification ID; FCM also reports aggregate delivery data for Android, not per-message receipts.',
        'Email: bounces and spam complaints arrive by provider webhook; hard bounces and complaints suppress the address. Opens come from a tracking pixel, which Apple Mail Privacy Protection inflates by preloading images, so clicks through redirect links are the more reliable signal.',
        "SMS: carriers report delivery receipts through the provider's status callback; a STOP reply is an opt-out that must apply to every later send.",
      ],
    },
    {
      kind: 'wrap-up',
      title: 'Close the loop',
      prompt: 'You have five minutes left. What would you raise before the interviewer does?',
      points: [
        'Monitoring: queue age per topic (critical should stay near zero), send latency p99 for critical messages, provider error and throttle rates, and dead-letter volume.',
        'Compliance: every marketing email carries one-click unsubscribe (`List-Unsubscribe` plus `List-Unsubscribe-Post`, RFC 8058), which Gmail and Yahoo have required of bulk senders since 2024, honored within 2 days; SMS needs recorded consent; deleting a user removes their tokens, preferences and history.',
        'Deliverability: authenticate email with SPF, DKIM and DMARC, keep marketing and transactional mail on separate sending domains or IPs, and warm new IPs gradually.',
        'Multi-region: run the pipeline in two or more regions; idempotency keys and the sent check must be visible to a region that takes over, or failover creates duplicates.',
      ],
    },
  ],
  pitfalls: [
    'Putting every message on one shared queue, so a campaign backlog delays password resets by hours.',
    'Promising exactly-once delivery, or retrying without idempotency keys, so a worker crash sends every user two codes.',
    'Ignoring provider rate limits: retrying `429` immediately makes the throttling worse, and never deleting unregistered tokens wastes most of the push budget.',
    'Checking preferences only when a campaign is created, so a user who opted out an hour ago still gets the message.',
  ],
  followUps: [
    {
      question: 'How do you keep one team from using up all the capacity?',
      answer:
        "Give each team a quota per priority at the API, then share each priority's worker capacity fairly across teams (weighted round robin over per-team sub-queues), so a team that bursts waits behind its own backlog, not everyone's.",
    },
    {
      question: 'The primary SMS provider is down for 20 minutes. What happens?',
      answer:
        'A circuit breaker opens on its error rate and critical SMS moves to the secondary provider; bulk SMS waits in its queue until the primary recovers. A message the primary may have accepted just before failing can arrive twice, which is acceptable for a one-time code.',
    },
    {
      question: 'Product wants an in-app inbox as a fourth channel. What changes?',
      answer:
        'The inbox worker writes to a per-user store sorted by time (the same wide-column pattern as the delivery log), keeps an unread count, and pushes a live update to connected clients over a WebSocket. Preferences, priorities and deduplication stay the same.',
    },
  ],
};
