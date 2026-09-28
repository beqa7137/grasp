import type { SdLesson } from './types.js';

export const LATENCY_LESSON: SdLesson = {
  why: 'Latency does not rise in a straight line with load. A server that answers in 10 ms when idle answers in 20 ms on average at half load and 100 ms at 90%, and p99 sits about 4.6 times higher still. Every capacity number you give in an interview rests on this curve, and most production slowdowns are a queue quietly forming in front of something that looked only 80% busy.',
  widget: {
    kind: 'queue-latency',
    tryThis: [
      'Start at 50% and note p99. Move to 70%: p99 grows by two thirds. Move to 90%: it triples. The same 20 points of load cost more each time.',
      'Put the slider at 95%, then 99%. Past 90% a few percent of extra traffic multiplies the tail, which is why a small spike can take down a service that looked fine.',
      'Compare p50 and p99 at any setting: p99 is always about 6.6 times p50 here. Averages hide the requests users actually complain about.',
    ],
  },
  concepts: [
    {
      title: 'Utilization',
      body: 'The fraction of time a server is busy: arrival rate times service time. At 1,000 requests a second and 0.7 ms each, one core is 70% busy. Above 100% the queue grows without bound.',
    },
    {
      title: 'Why waiting explodes',
      body: 'Requests arrive in bursts, not evenly. When the server is busy most of the time, a burst finds it occupied and waits, and the next burst finds that queue still there. For random arrivals the mean response time is service time divided by (1 minus utilization). That is the M/M/1 model: one server, random arrivals, random service times. A pool of workers sharing one queue waits far less at the same utilization, and steadier service times cut the wait, but every model bends sharply near 100%.',
    },
    {
      title: 'Percentiles, not averages',
      body: 'p99 is the time 99% of requests beat. A page that makes 50 backend calls hits at least one call p99 on about 40% of loads (1 - 0.99^50), so each service tail is a common page experience, not a rare one. Quote p50 and p99, and design against p99.',
    },
    {
      title: 'Headroom',
      body: 'Plan to run around 60 to 70% busy at peak. That keeps the tail flat, absorbs bursts and leaves room to lose a machine: with three servers at 60%, losing one puts the other two at 90%.',
    },
    {
      title: 'Measuring the tail honestly',
      body: 'Never average percentiles across hosts: merge their histograms and read p99 from the merged one. And measure from the client side at a fixed request rate, or a stalled server simply sends fewer samples and hides its own worst moments (coordinated omission).',
    },
    {
      title: "Little's law",
      body: 'Requests in the system equal arrival rate times time in the system. At 2,000 requests a second and 50 ms each, 100 are in flight at any moment, so you need at least 100 concurrent workers or connections.',
    },
  ],
  examples: [
    {
      title: 'Size a fleet for a latency target',
      problem:
        'A service takes 8 ms of CPU per request and must keep p99 under 100 ms at a peak of 12,000 requests a second. How many single-core servers?',
      insight: 'Find the utilization that keeps p99 under target, then divide the load by what one server can take at that utilization.',
      steps: [
        'p99 is about 4.6 times the mean for random arrivals, so the mean must stay under 100 / 4.6, about 22 ms.',
        'Mean = 8 / (1 - u) under 22 ms means 1 - u above 0.36, so u at most about 64%.',
        'One server does 1,000 / 8 = 125 requests a second at full load, so 80 at 64%.',
        '12,000 / 80 = 150 servers. Add one or two more so a single failure does not push the rest past 64%.',
        'Say the assumption out loud: real traffic is burstier than random, so measure p99 under load before trusting the model.',
      ],
    },
    {
      title: 'Find the real bottleneck',
      problem:
        'A checkout API has p99 of 900 ms. Its app servers are 40% busy, the database 85%, the payment provider answers in 300 ms. Where do you look first?',
      insight: 'The component closest to saturation owns the tail, not the slowest one.',
      steps: [
        'Pull traces of the slowest 1% of requests and see which span dominates before changing anything.',
        'The payment call is slow but fixed: 300 ms at any load, so it sets a floor, not the tail.',
        'The app tier at 40% adds little waiting: its response time is about 1.7 times its service time.',
        'The database at 85% multiplies its service time by about 6.7, and every request that touches it queues.',
        'Fix the database first: read replicas, a cache for hot reads, or fewer queries per request. Bringing it to 60% cuts its latency by more than half.',
      ],
    },
    {
      title: 'Why a retry storm finishes the job',
      problem: 'A service at 85% gets a 10% traffic spike. Clients time out after 1 second and retry immediately. What happens?',
      insight: 'Retries add load exactly when the server has none to spare, pushing utilization toward 100%.',
      steps: [
        'The spike pushes utilization to about 94%, and mean latency more than doubles.',
        'Slow requests hit the 1 second timeout, and each timeout sends a second copy of the request.',
        'The server still works on the abandoned copy, so it now does more work for the same useful traffic: utilization passes 100% and the queue grows without bound.',
        'Break the loop: retry with exponential backoff and jitter, cap retries with a retry budget, and shed load (return 503 fast) once queues pass a limit.',
      ],
    },
  ],
  pitfalls: [
    'Quoting average latency: the mean can look fine while p99 is ten times higher.',
    'Planning to run at 90% "to save money": the tail and any failure blow through the latency target.',
    'Adding servers behind a component that is already saturated: the queue just moves.',
    'Forgetting that fan-out multiplies tails: a request that waits on 20 backends waits on the slowest of them.',
  ],
  followUps: [
    {
      question: 'How would you cut tail latency without adding capacity?',
      answer:
        'Hedged requests (send a second copy after the p95 time and take the first answer), smaller and more even work units, isolating slow request types onto their own pool, and caching the expensive paths.',
    },
    {
      question: 'Why does one slow dependency hurt a page more than its own p99 suggests?',
      answer:
        'A page that calls 50 services gets at least one p99 response on 1 - 0.99^50, about 40%, of loads, so the dependency tails decide what a large share of page loads feel.',
    },
    {
      question: 'How do you pick a timeout?',
      answer:
        'A little above the dependency p99 under normal load, below the caller budget, and never longer than the time the caller would still use the answer; pair it with backoff and a retry budget.',
    },
  ],
};
