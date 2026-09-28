import type { SdLesson } from './types.js';

export const CAPACITY_LESSON: SdLesson = {
  why: 'A system serves only as many requests as its most constrained resource allows: load balancers good for 10,000 requests a second and app servers good for 6,000 still serve only 4,000 if the database tops out there. Scaling is the loop of finding that resource, raising its limit, and finding the next one before users do. Interviewers probe it with one question: at 10 times the traffic, what breaks first, and what do you do about it?',
  widget: {
    kind: 'pipeline',
    tryThis: [
      'Start at the defaults: 8,000 requests a second meet a database that can serve 4,000, so 4,000 are served and 4,000 dropped. Add a second database instance: the app tier (6,000) becomes the bottleneck and 2,000 are still dropped. Raise the app servers to 6: all 8,000 are served, but the database now shows 100% busy with no headroom at all.',
      'Set the load to 20,000 and every tier to 10 instances: the load balancers are 40% busy and the database only 37.5%, since it sees just the 15,000 the app servers pass on: 10 app servers at 1,500 each is the ceiling, and 5,000 are dropped. When a tier runs out of instances, the next levers are a bigger machine or less work per request.',
      'Set 2 load balancers, 8 app servers and 3 database instances at 8,000: everything is served, with the load balancers at 80% and the other tiers at 67%. Push to 10,000: the load balancers reach 100%. At 12,000 they cap throughput at 10,000 and drop 2,000; a third load balancer serves all 12,000, but the app servers and database then sit at 100%. The busiest tier at normal load breaks first in a spike, and it is often the one nobody watches.',
    ],
  },
  concepts: [
    {
      title: 'The bottleneck caps throughput',
      body: 'When every request passes every tier, the system serves the smallest tier capacity and no more. Adding capacity anywhere else changes nothing; raising the bottleneck moves the limit to the next smallest tier. The widget simplifies: each request costs the same at every tier, and load past the bottleneck is dropped rather than queued, while real systems also share hidden limits such as connection pools, locks and network bandwidth.',
    },
    {
      title: 'Vertical versus horizontal',
      body: 'Vertical scaling buys a bigger machine: no code changes, but it has a ceiling, costs more per unit near the top, and remains one failure domain. Horizontal scaling adds machines and scales much further, but only for parts that can share work. A single primary that takes every write, a global lock, a hot key and a singleton job do not scale by adding copies. The widget treats database instances as interchangeable, which holds for read replicas or shards, not for a lone primary.',
    },
    {
      title: 'Stateless services and load balancing',
      body: 'A stateless server keeps sessions and data elsewhere (a database, Redis, a signed token), so any instance can serve any request and instances can come and go. Round robin suits uniform requests; least outstanding requests, or two random choices with the less busy one picked, handles uneven requests better; hashing a key sends it to the same instance when you want cache locality. Sticky sessions pin a user to one instance: they skew load, lose state when that instance dies and slow down draining, so prefer externalized state.',
    },
    {
      title: 'Autoscaling and its lag',
      body: 'An autoscaler adds instances when a signal crosses a target. CPU lags and saturates late; request rate, concurrency and queue depth lead. The lag is the metric window plus the decision plus boot plus warm-up (caches, connection pools, JIT), often several minutes, so keep a floor that absorbs sudden spikes, scale out fast and in slowly, and pre-scale for known events. Autoscaling app servers does nothing for the database behind them.',
    },
    {
      title: 'Peak plus headroom',
      body: 'Size for peak, not average: daily peaks are often two to three times the mean, and events go higher. At peak, aim for around 60 to 70% utilization on every tier so the tail stays flat, and check the loss of the largest failure domain: with three zones, the two left must carry 50% more each.',
    },
    {
      title: 'Load testing and the right signal',
      body: 'Find limits before users do: replay a production-like mix against production-sized data, ramp the rate, and note where p99 or errors break. Then read utilization and saturation (queue length, pool waits, lock waits) per resource. Averages hide the limit: a minute at 50% CPU can hold seconds at 100%, and a fleet average can hide one hot instance or shard.',
    },
    {
      title: 'Pools and in-flight work',
      body: "Little's law sizes every pool: requests in flight equal throughput times latency. At 2,000 requests a second and 50 ms each, 100 are in flight, so 100 worker threads or connections at least. When a database slows to 500 ms, the same traffic needs 1,000, which is how one slow dependency exhausts every app server in front of it.",
    },
  ],
  examples: [
    {
      title: 'Scale a service from 1,000 to 20,000 requests a second',
      problem:
        'Two app servers handle up to 1,500 requests a second each; one database handles 4,000 queries a second. Each request makes 2 queries, 90% of them reads. Traffic is 1,000 a second today and will reach 20,000. Plan the steps.',
      insight:
        'Compute each tier limit in requests a second, fix the smallest, and repeat until every tier clears the target with headroom.',
      steps: [
        'Today the app tier caps at 3,000 requests a second and the database at 4,000 / 2 = 2,000. The database is the bottleneck, and it saturates at twice current traffic.',
        'Cache reads with a 90% hit rate: each request sends 0.2 writes and 1.8 × 0.1 = 0.18 reads to the database, 0.38 queries. The database now caps at 4,000 / 0.38, about 10,500, so the app tier (3,000) is next.',
        'App servers are stateless, so scale out: at 70% each takes 1,050, and 20,000 / 1,050 rounds up to 20 servers. Run 21, so losing one leaves 20 at 1,000 each (67%).',
        'At 20,000, the database sees 20,000 × 0.38 = 7,600 queries a second: 4,000 writes and 3,600 reads. The writes alone fill the primary, and every replica replays them too, so replicas this size have no room for reads.',
        'Scale up first: at twice the capacity, 8,000, the primary is 50% busy, and each replica that size has 70% of 8,000 minus 4,000 of replay, 1,600 reads a second: 3 replicas, or 4 to survive losing one. Beyond that, batch writes or shard by key.',
        'Check the pieces people forget: 21 servers with 20 connections each is 420 connections to the primary, so add a pooler, and confirm the load balancer tier handles 20,000 at 70%.',
      ],
    },
    {
      title: 'A database that caps an otherwise horizontal system',
      problem:
        'At peak, 9,000 requests a second arrive but only 6,000 succeed. Ten app servers are 60% busy; the primary database runs 18,000 queries a second at 100% CPU, 3 per request (2 reads, 1 write). The team doubles the app servers. What happens, and what should they do?',
      insight: 'Adding capacity anywhere but the saturated tier cannot raise throughput, and it can make the saturated tier worse.',
      steps: [
        'Utilization names the bottleneck: the app tier has room (6,000 of 10,000), the database has none (18,000 / 3 = 6,000 requests a second).',
        'Twenty app servers can take 20,000, but throughput stays at the database limit of 6,000. More servers also mean more connections and more contention on the primary, so throughput can even drop.',
        'Move the reads to replicas, for pages that can tolerate a little lag: the primary now sees 1 query per request, so it caps at 18,000 requests a second and runs at 50% for 9,000.',
        'The 18,000 reads a second go to replicas of the same size, and each also replays the 9,000 writes: at 70% each has 12,600 minus 9,000, or 3,600 for reads, so 5 replicas, and 6 to survive losing one. Heavy writes make replicas expensive.',
        'Writes still all reach one primary. When they near its limit, the next levers are fewer writes per request, a bigger machine, or sharding.',
      ],
    },
    {
      title: 'Autoscaling that reacts too slowly to a flash sale',
      problem:
        'A shop normally takes 2,000 requests a second on 4 servers of 1,000 each, autoscaling at 60% CPU. A flash sale at noon takes traffic to 12,000 within a minute. Scaling out takes about 4 minutes. What happens, and how do you prepare?',
      insight: 'Autoscaling follows load with minutes of lag; a spike you know about must be met by capacity you add before it.',
      steps: [
        'For 4 minutes the fleet serves at most 4,000 a second, so 8,000 a second fail: 8,000 × 240 s is 1.92 million failed requests, before any retries add more.',
        'Retries and timeouts pile on, and new instances arrive with cold caches and pools, so they carry less than full load at first.',
        'Pre-scale on a schedule: 12,000 at 60% needs 12,000 / 600 = 20 servers, running and warm 15 minutes before noon.',
        'Scale on request rate or concurrency, which rise with the spike, rather than CPU; scale out in large steps and in slowly.',
        'Check what does not autoscale: the database, payment provider quotas and connection limits must take 12,000 too. Protect them with load shedding or a waiting room that admits users at a rate they can take.',
      ],
    },
  ],
  pitfalls: [
    'Adding app servers behind a saturated database: throughput stays flat and the extra connections make contention worse.',
    'Assuming horizontal scaling is linear: shared state, a single primary, locks and connection limits flatten the curve.',
    'Sizing to average traffic, or to peak with no room to lose a zone.',
    'Trusting autoscaling for a known spike or a sudden one: it reacts in minutes, starts instances cold, and does not scale the database.',
  ],
  followUps: [
    {
      question: 'How do you find the bottleneck in a live system?',
      answer:
        'Check utilization and saturation for every resource (CPU, memory, connection pools, locks, disk, network) and trace the slowest requests. The bottleneck is the resource near 100% with a growing queue; confirm by relieving it and watching throughput rise.',
    },
    {
      question: 'The primary database is at its write limit. What are your options?',
      answer:
        'Replicas do not help writes. Cut writes first (batch them, drop unused indexes, move non-critical ones behind a queue), then scale up the primary, then shard by a key that spreads writes evenly.',
    },
    {
      question: 'Why not rely on autoscaling for every tier?',
      answer:
        'It lags by minutes, stateful tiers such as databases cannot add capacity quickly, and cloud quotas cap it. Keep a floor sized for sudden spikes, pre-scale for known events, and shed load when demand still exceeds capacity.',
    },
  ],
};
