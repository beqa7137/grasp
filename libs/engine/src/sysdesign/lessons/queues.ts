import type { SdLesson } from './types.js';

export const QUEUES_LESSON: SdLesson = {
  why: 'A queue lets a system accept work faster than it can finish it, for a while. That is how a flash sale survives a burst five times normal traffic, and how one slow dependency stops taking the whole request path down with it. Interviewers then ask the follow-ups that decide real outages: how many consumers, how long until the backlog drains, and what happens when a message is delivered twice.',
  widget: {
    kind: 'queue-backlog',
    tryThis: [
      'Keep the default spike of 3,000 and set 1 consumer. The queue grows 2,000 a second to a peak of 60,000, then shrinks by only 200 a second, so it would need 300 seconds and never empties in the window. Set 2 consumers: the peak halves to 30,000 and it drains in 25 seconds.',
      'Raise the spike to 6,000. With 2 consumers the peak is 120,000 and 24,000 are still queued at the end. With 3 the peak is 90,000 and it drains in 41 seconds; with 4, 60,000 and 19 seconds. Each consumer cuts the peak by 30,000 and also speeds the drain.',
      'Set the spike to 2,000 and 1 consumer. The peak is only 30,000, yet 14,000 are still queued at the end: 1,000 a second is barely above the 800 baseline, so there is no spare capacity to recover with. Recovery depends on headroom over the normal rate, not on the spike.',
    ],
  },
  concepts: [
    {
      title: 'Why a queue',
      body: 'Producers write and move on; consumers read at their own pace. That decouples the two sides (either can deploy, scale or fail alone), absorbs spikes as backlog instead of errors, and lets a failed message be retried later without the user waiting.',
    },
    {
      title: 'Sizing consumers',
      body: "Capacity must sit above the average rate, or the backlog grows forever. A spike leaves (arrival rate minus capacity) times its duration behind, and that drains at the spare capacity: drain time = backlog / (capacity minus arrival rate). By Little's law, 3,000 messages a second at 20 ms each keeps 60 in flight, so you need at least 60 concurrent handlers.",
    },
    {
      title: 'Delivery guarantees',
      body: 'At-most-once acks before processing, so a crash loses the message. At-least-once acks after processing, so a crash redelivers it and consumers must be idempotent. Exactly-once is not a broker setting: it is at-least-once delivery plus an effect that happens once, such as a dedupe key stored in the same transaction as the write.',
    },
    {
      title: 'Ordering and partitioning',
      body: 'Most systems need order per key, not globally. Hash the key (an order id, a user id) to a partition, and one consumer reads each partition in order, so events for one key stay in sequence while partitions run in parallel. Global order means one partition and one consumer, which caps throughput at what that one consumer can do.',
    },
    {
      title: 'Backpressure, poison messages and alerting',
      body: 'A bounded queue pushes back when full: producers slow down, shed load or return 503 instead of filling memory. A message that always fails is poison: retry it a few times with backoff, then move it to a dead-letter queue so it stops blocking its partition. Alert on the age of the oldest message, not queue length: 10,000 messages is 2 seconds of work at 5,000 a second and a crisis at 10 a second.',
    },
    {
      title: 'Publishing reliably: the outbox',
      body: 'Writing to the database and then publishing to the queue can lose the message if the process dies in between. Write the message to an outbox table in the same transaction as the change, and let a relay publish from the outbox; consumers dedupe, since the relay can publish twice.',
    },
    {
      title: 'A log or a work queue',
      body: 'A log (Kafka) keeps messages for days, lets several consumer groups each read everything, and can replay from any offset, with order per partition. A work queue (SQS, RabbitMQ) hands each message to one of many competing consumers and deletes it on acknowledgment. Pick the log when many systems need the same events or replay matters; the queue for independent jobs.',
    },
  ],
  examples: [
    {
      title: 'Size workers for a daytime spike and a nightly batch',
      problem:
        'A job queue averages 2,000 jobs a second by day, jumps to 5,000 a second for a 10-minute lunch spike, and must run a nightly batch of 36 million jobs between 01:00 and 03:00 while 500 a second of other traffic continues. Each worker does 250 jobs a second. How many workers, and when?',
      insight: 'Size the steady state for headroom above the average, then size for the spike by how fast its backlog must drain.',
      steps: [
        'Daytime: 2,000 / 250 = 8 workers at 100%. Plan for about 70%: 12 workers give 3,000 a second, and 2,000 / 3,000 is 67%.',
        'Lunch with 12 workers: the queue grows 5,000 - 3,000 = 2,000 a second for 600 seconds, 1,200,000 jobs. Spare capacity afterwards is 1,000 a second, so it takes 1,200 seconds, 20 minutes, to drain.',
        'If the backlog must be gone within 5 minutes, scale to 16 workers before lunch: 4,000 a second, a backlog of 1,000 x 600 = 600,000, and 2,000 spare drains it in 300 seconds.',
        'Night: 36,000,000 / 7,200 seconds = 5,000 a second, plus 500 of other traffic, is 5,500, or 22 workers at full speed with no slack.',
        'A batch cares about its finish time, not per-job latency, so running hot is fine, but keep a margin: 24 workers give 6,000 a second, 5,500 for the batch, which finishes in 36,000,000 / 5,500, about 109 minutes, 11 minutes early.',
      ],
    },
    {
      title: 'An email pipeline that must not send twice',
      problem:
        'A queue carries 2,000,000 emails a day to workers that call an email provider, with a 30-second visibility timeout. About 0.1% of messages are delivered twice. How do you stop duplicate emails?',
      insight: 'The queue is at-least-once, so make the send idempotent: one stable key per email, checked where the effect happens.',
      steps: [
        'Find the duplicates: a worker sends, then crashes before acking, or a send takes longer than 30 seconds and the message becomes visible to a second worker.',
        '0.1% of 2,000,000 is 2,000 duplicate emails a day, enough for real complaints.',
        'Assign an `emailId` when the email is enqueued, not when it is consumed, so every redelivery carries the same key.',
        'Before sending, insert `emailId` into a table with a unique constraint; a worker whose insert fails skips it. Pass the same key to the provider as its idempotency key, so a crash between sending and recording still sends once.',
        'Keep keys longer than any redelivery can arrive: 7 days is 14,000,000 rows, about 700 MB at 50 bytes each.',
        'Raise the visibility timeout above the send p99, say 2 minutes, and extend it for slow sends. Fewer redeliveries, and the key catches the rest.',
      ],
    },
    {
      title: 'Catch up a consumer group that fell behind',
      problem:
        'An order-events topic has 12 partitions and 12 consumers, each handling 600 events a second, with 6,000 arriving a second. A bad deploy slows each consumer to 400 a second for 20 minutes. How far behind does it fall, and how do you catch up?',
      insight:
        'Lag grows at the deficit and shrinks only at the spare capacity, and a consumer group cannot use more consumers than partitions.',
      steps: [
        'Normal capacity is 12 x 600 = 7,200 a second, so the group is 6,000 / 7,200, about 83%, busy.',
        'During the incident capacity is 12 x 400 = 4,800, so lag grows 1,200 a second for 1,200 seconds: 1,440,000 events. The oldest unread event is then 1,440,000 / 6,000 = 240 seconds old.',
        'After the rollback the spare is 7,200 - 6,000 = 1,200 a second, so catching up takes another 1,200 seconds, 20 minutes, and a new event first waits 1,440,000 / 7,200 = 200 seconds.',
        'A 13th consumer would sit idle: each partition goes to one consumer in the group. Make each consumer faster instead, for example by batching database writes to reach 1,200 a second each: 14,400 capacity, 8,400 spare, caught up in 1,440,000 / 8,400, about 171 seconds.',
        'Catch it sooner next time: lag grows 1,200 events a second, which at 6,000 arriving a second ages the oldest event by 0.2 seconds each second, so a 60-second age alert fires 300 seconds into the incident.',
      ],
    },
  ],
  pitfalls: [
    'Sizing consumers just above the average rate: the backlog drains only at the spare capacity, so a thin margin turns a 30-second spike into minutes of lag.',
    'Trusting the broker for exactly-once: redelivery will happen, and a consumer that is not idempotent charges or emails twice.',
    'Alerting on queue length: the same depth is harmless at a high consume rate and hours of delay at a low one. Alert on the age of the oldest message.',
    'Retrying a poison message forever: it blocks every message behind it in its partition. Cap the attempts, then dead-letter it.',
  ],
  followUps: [
    {
      question: 'The backlog keeps growing. Why not just add consumers?',
      answer:
        'More consumers help only if consumers are the bottleneck. If the database they write to is saturated, more consumers push it harder, and past the partition count extra consumers sit idle. Find the saturated component first, then batch, add partitions or scale that component.',
    },
    {
      question: 'How do you get exactly-once processing?',
      answer:
        "Accept at-least-once delivery and make the effect happen once: store a dedupe key in the same transaction as the write, use an upsert keyed by message id, or use the broker's transactions when both input and output live in the same log.",
    },
    {
      question: 'When is a queue the wrong choice?',
      answer:
        'When the caller needs the result now, such as a login check or a price quote. A queue adds latency and moving parts, and it only delays failure if consumers can never keep up with the average rate.',
    },
  ],
};
