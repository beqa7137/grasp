import type { CaseStudy } from './types.js';

export const JOB_SCHEDULER: CaseStudy = {
  id: 'job-scheduler',
  stages: [
    {
      kind: 'requirements',
      title: 'Clarify what matters',
      prompt:
        'Many product teams want to say "run this every weekday at 9:00 in Berlin" or "send this reminder in 3 days", and trust that it happens. Which questions shape the design, and what do you park?',
      decision: {
        question: 'You have time for one question first. Which answer changes the design the most?',
        options: [
          {
            label: 'What must happen when a machine dies mid-run: may a job run twice, and how late may it start?',
            best: true,
            why: 'It sets the guarantee everything else serves. At-least-once with idempotent jobs allows leases, retries and redelivery; "never twice" pushes the burden into every job or demands coordination on each run; a start within seconds rules out designs that scan once a minute.',
          },
          {
            label: 'How many schedules and runs a day?',
            why: 'You will ask it next, since it sizes the stores and the scanners. But the pieces (a schedule store, due-job scanning, a dispatch queue, workers with leases) stay the same from thousands to billions of runs.',
          },
          {
            label: 'Which languages are the jobs written in?',
            why: 'Workers pull a job type and a payload and call the handler registered for it, so languages change the worker libraries, not the scheduler.',
          },
          {
            label: 'Should the dashboard draw a calendar of upcoming runs?',
            why: 'Nice to have, and it reads the same schedule table. It spends the first question on the least risky part of the system.',
          },
        ],
      },
      points: [
        'Functional: create, pause, update and delete recurring schedules (a cron expression plus an IANA time zone) and one-off delayed jobs; each run calls a job type with a payload; see run history, retry a failed run and cancel a queued one.',
        'Guarantee (from the interviewer): every due run starts at least once, usually within a few seconds of its time; job handlers must tolerate running twice, and the scheduler makes that rare.',
        'Scale (from the interviewer): 50 million active schedules and delayed jobs, about 100 million runs a day, many of them bunched at the top of the hour.',
        'Per job: a retry policy (attempts, backoff), a timeout, and a concurrency policy for overlaps (allow, skip, or replace the running one), as Kubernetes CronJobs offer.',
        'Out of scope unless asked: workflow DAGs with dependencies between tasks (Airflow territory), the job code itself, and billing.',
      ],
    },
    {
      kind: 'estimation',
      title: 'Estimate the peak',
      prompt:
        'People write "0 * * * *" far more often than "17 * * * *". If 100 million runs happen a day and one in five falls on minute 0 of some hour, how many runs must start per second in that minute?',
      estimate: {
        question: 'Runs started per second at the top of the hour',
        answer: 13_889,
        unit: 'runs/s',
        working: [
          'Average: 100 million / 86,400 seconds is about 1,157 runs per second.',
          'Due at minute 0: one fifth of 100 million is 20 million a day, and 20 million / 24 hours is about 833,000 each hour.',
          'Started within that minute: 833,000 / 60 seconds is about 13,900 runs per second, 12 times the average.',
        ],
      },
      points: [
        'The average is small; the spike is the design constraint. Size the scanners, the queue and the store for about 14,000 dispatches a second, or flatten the spike.',
        'Flatten it where the product allows: Jenkins lets a job write `H` in a cron field so each job gets a stable, hashed minute, and a delayed job can accept a small random delay. A job that must run at exactly 9:00 keeps its time.',
        'Storage is modest: 50 million schedules at about 1 KB is 50 GB; 100 million runs a day at about 500 bytes is 50 GB a day, so 30 days of hot history is 1.5 TB, with older runs moved to cheap storage.',
      ],
    },
    {
      kind: 'api',
      title: 'Hand runs to workers',
      prompt:
        'A run is due. The scheduler knows it; the code lives in a fleet of workers owned by other teams. How does the scheduler get the work done without running it itself?',
      decision: {
        question: 'How does the scheduler invoke a due run?',
        options: [
          {
            label: 'Write a run record, then publish it to a queue per job type that workers pull from, with the run ID in the message',
            best: true,
            why: 'The queue absorbs the top-of-the-hour spike, workers pull at their own pace, and a slow or crashed worker only delays its own messages. The run record is the truth; the message is a nudge that can be redelivered safely.',
          },
          {
            label: 'Call each job owner over HTTP (a webhook) directly from the scheduler',
            why: 'Defensible for a hosted product with outside customers, and some services work this way. In-process, 14,000 calls a second to endpoints of varying health tie the scheduler to the slowest one, so it needs a queue and a dispatch tier behind it anyway.',
          },
          {
            label: 'Run the job code inside the scheduler process',
            why: 'Fine for one service with a few jobs. Here, a job that leaks memory or runs for an hour takes the scheduler down with it, and every team deploys into one binary.',
          },
          {
            label: 'Let workers poll the schedule table for due jobs themselves',
            why: 'Thousands of workers scanning one table multiply the load on the store and fight over the same rows; it is the scanning problem again, done by the least trusted clients.',
          },
        ],
      },
      points: [
        '`PUT /schedules/{id}` with a cron expression, a time zone, a job type, a payload, a retry policy and a concurrency policy; the client picks the ID, so a retried create is harmless. `POST /jobs` with a `run_at` time creates a one-off delayed job the same way.',
        '`GET /schedules/{id}/runs` lists runs with state, attempt and timings; `POST /runs/{id}/retry` and `DELETE /runs/{id}` act on one run.',
        'The worker side: pull a message, `POST /runs/{id}/claim` to take the lease, heartbeat while working, then report `succeeded` or `failed` with the fencing token it was given.',
        'The payload holds identifiers, not data: "send the report for account 42", not the report. Large inputs go to object storage and the payload carries the key.',
      ],
    },
    {
      kind: 'data',
      title: 'Find the due jobs',
      prompt:
        'There are 50 million schedules, and every second a few thousand of them come due. How do you find those without looking at the other 49.99 million?',
      decision: {
        question: 'How does the scheduler find due jobs?',
        options: [
          {
            label:
              'Store each schedule with a precomputed `next_fire_at` in UTC, indexed by bucket and time, and range-scan each bucket for rows due now',
            best: true,
            why: 'The index turns "what is due" into a short range read per bucket, whatever the total count. Cron is evaluated once per run, when the next fire time is computed, not once per scan.',
          },
          {
            label: 'Every minute, load every schedule and evaluate its cron expression against the clock',
            why: 'Correct and simple for a few thousand schedules. At 50 million it reads the whole table every minute to find a tiny fraction, and minute granularity cannot serve "in 90 seconds".',
          },
          {
            label: 'Keep all due times only in a Redis sorted set, scored by time, and pop what is due',
            why: 'Fast, and a good hot index in front of a durable store for the next few minutes of work. As the only copy, a failover or eviction silently loses schedules.',
          },
          {
            label: 'One in-memory timer per job in a single scheduler process',
            why: 'Fine for a single service. It holds 50 million timers in one heap, loses them all on restart, and cannot scale past one machine.',
          },
        ],
      },
      points: [
        'Schedules: `schedule_id`, tenant, cron expression, time zone, job type, payload, policies, paused flag, version, `next_fire_at` and a bucket number (a hash of the ID into, say, 1,024 buckets).',
        'Runs: `run_id`, schedule ID, the scheduled fire time, state, attempt, lease owner, lease expiry and fencing token. A unique key on `schedule_id, fire_time` makes creating the same run twice impossible, whoever tries.',
        'Firing is one transaction: insert the run for this fire time and advance `next_fire_at` to the following one. A crash before commit fires it again later; a crash after leaves a run record to dispatch, never a lost or doubled run.',
        'Time zones: keep the IANA name (for example `Europe/Berlin`), not an offset, and compute the next fire time in local time, then convert to UTC. Offsets change with daylight saving time and with governments.',
        'Daylight saving time needs a rule: when clocks spring forward, 2:30 does not exist that day, and when they fall back, 1:30 happens twice. A common choice is to run a skipped time once at the jump and a repeated time only once; document it.',
        'Shard both tables by a hash of the schedule ID, so a schedule and its runs live together and buckets map cleanly onto shards.',
      ],
    },
    {
      kind: 'design',
      title: 'Put it together',
      prompt: 'Trace a schedule from "every weekday at 9:00 Berlin time" being saved, to a worker finishing the 9:00 run on Monday.',
      lab: true,
      points: [
        'The API validates the cron expression and time zone, computes `next_fire_at` (Monday 9:00 in Berlin, stored as 07:00 or 08:00 UTC depending on the season) and writes the schedule to its shard.',
        'Scheduler nodes each own a set of buckets. Every second or so, an owner reads rows in its buckets with `next_fire_at` up to now plus a small look-ahead, and in one transaction inserts a run and advances the schedule.',
        'A dispatcher publishes new runs to the queue for their job type (a Kafka topic or an SQS queue, for example) and marks them `QUEUED`; it also picks up runs left `PENDING` by a crash, so the message is never lost.',
        'A worker pulls the message, claims the run (state `RUNNING`, a lease of 30 seconds, a new fencing token), heartbeats every 10 seconds, and reports the outcome. Failures are rescheduled with backoff; successes are final.',
        'Open the build in the Lab: about 35,000 requests a second at the top of the hour, 40% of them writes that stand for runs being dispatched and recorded. The app tier is the API and the schedulers, the cache holds schedule and run status for dashboards, the queue feeds the workers, and the database is sharded by schedule ID with replicas for history queries.',
      ],
    },
    {
      kind: 'deep-dive',
      title: 'Share the scanning',
      prompt:
        'One scheduler node could scan everything, until it dies at 8:59 or cannot keep up with the spike. How do several nodes split the work without firing the same run twice?',
      decision: {
        question: 'How do scheduler nodes divide the due-job scan?',
        options: [
          {
            label:
              'Partition schedules into buckets and give each bucket to one node through leases in a coordination service such as etcd or ZooKeeper; the unique run key is the backstop',
            best: true,
            why: 'Scanning scales with the number of nodes, a dead node loses its leases within seconds and its buckets move to others, and a brief overlap during a handover cannot double a run because the second insert hits the unique key.',
          },
          {
            label: 'Elect one leader that scans everything, with standbys waiting to take over',
            why: 'Defensible and simple, and many schedulers start here. The leader caps throughput at one machine, and every failover stalls all scheduling until a new leader is elected and warmed up.',
          },
          {
            label: 'Every node scans everything and claims rows with `FOR UPDATE SKIP LOCKED`',
            why: 'Defensible: Airflow 2 runs several active schedulers this way on one database. It is simple and needs no coordinator, but all nodes hit the same index and one primary, which limits it at 14,000 runs a second.',
          },
          {
            label: 'No coordination: every node scans everything and workers drop duplicates',
            why: 'Each run is created and dispatched once per node, multiplying load and pushing the whole deduplication burden onto workers and the jobs they run.',
          },
        ],
      },
      points: [
        'Use many more buckets than nodes (1,024 buckets over 20 nodes), so a node joining or leaving moves a few buckets, not a large share of the table.',
        'A lease is a key in etcd (or an ephemeral node in ZooKeeper) that expires unless renewed. The owner renews every few seconds and stops scanning a bucket the moment it cannot renew, before the lease can expire.',
        'Clocks disagree: a paused process may still believe it owns a lease. Each lease carries an increasing token, and the run insert and schedule update check it, so a stale owner cannot advance a schedule it lost.',
        'Scan a little ahead (say, the next 5 seconds) and hold due runs in an in-memory timing wheel, so dispatch lands on the second instead of whenever the next scan happens. Kafka uses hierarchical timing wheels for its own delayed operations.',
        'After an outage, many schedules are overdue at once. A misfire policy per schedule decides: fire once now and move on (the usual default), fire every missed time, or skip to the next. Airflow calls the second one catchup.',
      ],
    },
    {
      kind: 'deep-dive',
      title: 'Leases, retries and idempotency',
      prompt:
        'A worker claimed a run 5 minutes ago and has not been heard from since. Is it dead, slow or cut off from the network? What does the system do, and what stops two workers finishing the same run?',
      decision: {
        question: 'How do you recover runs from workers that disappear?',
        options: [
          {
            label:
              'Each claim is a short lease renewed by heartbeats; when it expires the run is requeued with a higher attempt and a new fencing token, and results with an old token are rejected',
            best: true,
            why: 'A dead worker is detected in about one lease period, not after the job timeout. A worker that was only slow may still finish, but its report carries the old token and is refused, and the job used the run ID as its idempotency key, so its side effects happened once.',
          },
          {
            label: 'Wait for the worker to report failure',
            why: 'A worker that crashed or lost power never reports anything, so the run stays `RUNNING` forever.',
          },
          {
            label: 'Give each job a maximum duration and requeue it after that, with no heartbeats',
            why: 'Defensible for short, uniform jobs, and simple queues do this with a visibility timeout. For jobs from seconds to hours, the timeout must cover the slowest, so every crash waits that long.',
          },
          {
            label: 'Requeue after a missed heartbeat as a brand new run',
            why: 'The new run has a new ID, so the idempotency key changes and a job that was only slow does its side effects twice; history also loses the link between attempts.',
          },
        ],
      },
      points: [
        'Lease length is a trade: 30 seconds with 10 second heartbeats tolerates two lost heartbeats and detects a dead worker in under a minute. Long garbage collection pauses need longer leases, not faster heartbeats.',
        'At-least-once is the honest guarantee: a worker can finish the work and die before reporting. Jobs make their effects idempotent by keying them on the run ID (an upsert, an idempotency key on a payment, a processed-runs table).',
        'Retries back off exponentially with jitter (for example 30 seconds, 1, 2, 4 minutes, randomized), up to the policy limit. Then the run is `FAILED`, goes to a dead-letter view and alerts its owner.',
        'Retry only what can succeed later: timeouts and dependency errors. A handler that reports a permanent error (bad payload, deleted account) fails at once instead of burning attempts.',
        'Concurrency policies act at claim time: with "skip", a new run whose schedule already has one `RUNNING` is marked `SKIPPED`; with "replace", the old run is canceled first.',
      ],
    },
    {
      kind: 'wrap-up',
      title: 'Close the loop',
      prompt: 'You have five minutes left. What would you raise before the interviewer does?',
      points: [
        'Fairness: one tenant scheduling a million jobs at 9:00 should not delay everyone else. Give each tenant a quota and separate queues or weighted consumption for the largest ones.',
        'Monitoring: dispatch lag (actual start minus scheduled time) at p50 and p99, runs overdue per bucket, queue depth per job type, lease expiries, retry and dead-letter rates, and bucket leases without an owner.',
        'Multi-region: keep each schedule homed in one region, with its buckets and runs there, and fail a region over deliberately. Two regions both scanning one schedule would fire it twice.',
        'Changes race with firing: editing or pausing a schedule bumps its version, and the scanner advances a schedule only if the version it read is still current.',
      ],
    },
  ],
  pitfalls: [
    'Promising exactly-once execution. The system can make duplicates rare and effects idempotent, but a worker can always finish the work and crash before saying so.',
    'Storing a fixed UTC offset instead of an IANA time zone, so jobs drift by an hour at every daylight saving change, or ignoring the times that are skipped or repeated.',
    'Scanning the whole schedule table every minute instead of indexing a precomputed next fire time.',
    'A single scheduler with no failover, or several with no partitioning or unique run key, so runs are either missed or doubled.',
    'Retrying immediately and forever, so a broken dependency is hammered by its own jobs at the top of every hour.',
  ],
  followUps: [
    {
      question: 'How would you support a one-off job due in 200 milliseconds, or 2 years?',
      answer:
        'Both are rows with a `run_at` time. Near ones are picked up by the next scan and held in the timing wheel, so they fire on time within a second or so. Far ones sit in the index untouched until they come due. Delay features in queues are not enough on their own: SQS delays messages by at most 15 minutes, for example.',
    },
    {
      question: 'The top-of-the-hour spike needs more scheduler nodes. How do you add them without a pause?',
      answer:
        'Add nodes: they join the membership, the assignment moves some buckets to them, and each old owner stops scanning a bucket before its lease is released. Because there are far more buckets than nodes, each move is small, and the unique run key covers any overlap.',
    },
    {
      question: 'Workflows need job B to start only after job A succeeds. What changes?',
      answer:
        'A run gains dependencies: a workflow run record lists its tasks and edges, and finishing a task triggers a check that enqueues the tasks whose parents all succeeded. That is what Airflow does with DAGs; durable workflow engines such as Temporal keep each workflow as an event history instead.',
    },
  ],
};
