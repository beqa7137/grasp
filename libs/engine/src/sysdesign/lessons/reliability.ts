import type { SdLesson } from './types.js';

export const RELIABILITY_LESSON: SdLesson = {
  why: 'Every request crosses a chain of parts, and the chain is only as available as the product of its links: four services at 99.9% each give 99.6%, about 35 hours down a year. Redundancy buys the nines back only while copies fail independently, and most real outages come from the shared causes that break that assumption. Interviewers probe exactly this: where the single points of failure are, what failover costs, and how the system degrades instead of collapsing.',
  widget: {
    kind: 'availability',
    tryThis: [
      'Start at the defaults: the whole request is 99.950% available, down 4.4 h a year, and the database is marked weakest. The two load balancers and three app servers together lose under a second a year: a chain is capped by its weakest link, and polishing the others buys nothing.',
      'Give the database a second copy: the readout shows 99.99997% and downtime falls to 8 s a year, about 1,900 times less. Treat that as a ceiling, not a forecast: the model assumes independent failures and instant failover, and one bad migration or a zone outage takes both copies at once.',
      'Put the database back to 1 copy and set the app servers to 99% with 1 copy: the request drops to 98.9505%, down 91.9 h a year, and the app servers turn weakest. Add a second copy: 99.940% and 5.3 h, and the database is weakest again. A third gives 99.9499% and 4.4 h: on paper, three cheap servers match three good ones, though each 99% copy still fails for 3.65 days a year.',
    ],
  },
  concepts: [
    {
      title: 'Nines and what they cost',
      body: 'Availability is the fraction of time (or of requests) that succeed. A year has 525,600 minutes: 99% allows 5,256 minutes (3.65 days) of downtime, 99.9% about 526 minutes (8.8 hours), 99.95% about 263, 99.99% about 53 and 99.999% about 5. Each nine cuts downtime tenfold and costs far more than the last: at 99.99% no human can respond in time, so detection and recovery must be automatic.',
    },
    {
      title: 'Series and parallel',
      body: 'Parts a request needs in turn are in series: multiply their availabilities, so the chain is always worse than its weakest part. Copies where any one can serve are in parallel: the chance all are down is (1 - a)^n, so three copies at 99% give 1 - 0.01^3, 99.9999%. Parallel math assumes each surviving copy can carry the full load: two servers at 70% are not redundant, since one alone would be at 140%.',
    },
    {
      title: 'Independence is the assumption that fails',
      body: 'The parallel formula assumes copies fail independently. In practice they share causes: a bad deploy or config push reaches every copy, a zone or region outage takes all the copies inside it, and a shared DNS, certificate, auth service or control plane sits in series with all of them. So limit blast radius: spread copies across zones, roll changes out in stages, and split users into cells, independent stacks that each serve a slice, so one failure reaches only a fraction of users.',
    },
    {
      title: 'Detection and failover',
      body: 'Redundancy only helps if traffic moves off a dead part. Health checks and timeouts detect failure; for a single primary, leader election through a lease in a consensus store (etcd, ZooKeeper) picks the new one, and fencing tokens stop the old primary writing after it loses the lease. Failover has its own risks: split brain, flapping on a noisy check, a standby too cold or small for full load, and with async replication the new primary can miss the last seconds of writes.',
    },
    {
      title: 'Failing gracefully',
      body: 'Every remote call needs a timeout. Retry only idempotent calls, with exponential backoff and jitter, and cap retries with a budget (say 10% of requests). A circuit breaker stops calling a dependency that keeps failing and fails fast until a probe succeeds. Bulkheads give each dependency its own pool of threads or connections, so one slow call cannot use them all. And degrade instead of failing: hide recommendations, serve cached data, shed low-priority work first.',
    },
    {
      title: 'SLOs, error budgets, MTBF and MTTR',
      body: 'An SLO is a target on a measured indicator, such as 99.9% of requests succeeding over 30 days. The error budget is the rest: 0.1% of 43,200 minutes is 43.2 minutes, and when it is spent, releases slow down until reliability recovers. Availability is MTBF / (MTBF + MTTR): mean time between failures over itself plus mean time to recover, so halving the time to recover is worth as much as halving how often you fail, and is usually cheaper: fast rollback, good alerts, automated failover.',
    },
    {
      title: 'Static stability and deadlines',
      body: 'Design failover so it needs nothing that may be broken at that moment: no calls to the control plane and no scaling up during the incident, so run with the spare capacity already in place. And pass a deadline down every call: each callee gets less time than its caller has left, so no one keeps working on a request its caller has given up on.',
    },
  ],
  examples: [
    {
      title: 'A request that touches four services',
      problem:
        'A checkout page calls auth, cart, pricing and recommendations in turn, each 99.9% available. What is the page availability, and how do you reach 99.9% for the page?',
      insight: 'Series parts multiply, so either make each part much better than the target or take parts off the critical path.',
      steps: [
        'In series, 0.999^4 is about 0.996006: 99.6%, or about 2,099 minutes (35 hours) of failed checkouts a year, four times the budget of any one service.',
        'For the page to reach 99.9%, each service must average 0.999^(1/4), about 99.975%, which is a much harder target than 99.9% for each team.',
        'Cheaper: recommendations are optional, so call them with a short timeout and render the page without them. Three services in series give 0.999^3, 99.7%, about 1,575 minutes.',
        'Say the limit: more copies of each service cover host failures, but the page is still exposed to a bad deploy in any of the three, so staged rollouts and fast rollback matter as much as replicas.',
      ],
    },
    {
      title: 'Add a second region',
      problem:
        'A service runs in one region at 99.95%. The team proposes a second, active-active, region. What availability does that buy?',
      insight: 'Two independent regions look nearly perfect on paper; the shared global pieces and the failover time set the real number.',
      steps: [
        'One region at 99.95% loses about 263 minutes a year.',
        'Two independent regions: 1 - 0.0005^2 is 99.999975%, about 8 seconds a year. That is the ceiling, not the forecast.',
        'Global DNS or traffic routing at 99.99% sits in series with both: 0.99999975 times 0.9999 is about 99.99%, 53 minutes a year. The shared part now dominates.',
        'Failover is not instant: if a region fails 4 times a year and detecting and shifting traffic takes 5 minutes, that adds 20 minutes. Together about 73 minutes, 99.986%: much better than 263, far from 8 seconds.',
        'Name the costs: each region must carry all traffic, so both run under 50% busy, and with async replication a failover loses the last seconds of writes unless writes wait for the other region.',
      ],
    },
    {
      title: 'A retry storm turns a partial outage into a full one',
      problem:
        'A database tier serves 6,000 queries a second with 10,000 of capacity. One replica of four fails, leaving 7,500. Clients make up to 3 attempts with no backoff, and the gateway above them also makes up to 3. What happens?',
      insight: 'Retries multiply load exactly when capacity drops, so a small failure can grow into a self-sustaining overload.',
      steps: [
        'The survivors run at 6,000 / 7,500, 80% busy, so queues grow and slow queries start passing the client timeout.',
        'If a quarter of requests time out and are retried, offered load is 6,000 times 1.25, 7,500: 100% busy, so more requests time out and more retries follow.',
        'At worst every user request becomes 3 times 3, 9 attempts: 54,000 a second, 7.2 times capacity. The servers still work on abandoned attempts, so almost nothing succeeds.',
        'The failure now sustains itself: even with the replica back at 10,000, 54,000 attempts keep every queue full. Recovery needs load removed, not just capacity restored.',
        'The fix: retry at one layer only, with exponential backoff and jitter; a 10% retry budget caps load at 6,600, 88% of 7,500; a circuit breaker fails fast; and servers shed requests whose deadline has already passed.',
      ],
    },
  ],
  pitfalls: [
    'Multiplying copies as if independent when they share a rack, a zone, a deploy or a config push.',
    'Counting a standby as redundancy when it cannot carry full load, or when failover has never been tested.',
    'Retrying at every layer: three layers of 3 attempts turn one failure into 27 calls on the struggling service.',
    'Deep health checks that test a shared dependency: when it blips, every instance fails its check and the load balancer removes the whole fleet.',
  ],
  followUps: [
    {
      question: 'How do you make a single-primary database highly available?',
      answer:
        'A replica in another zone kept current by synchronous or quorum replication, automated failover through a lease in a consensus store, and fencing tokens so a deposed primary cannot write. With async replication, state how many seconds of writes a failover may lose, and rehearse the failover regularly.',
    },
    {
      question: 'Should you aim for 100% availability?',
      answer:
        'No. Users reach you over networks and devices that fail more often than that, and each nine costs far more than the last. Set the SLO from what users notice, and spend the error budget on shipping.',
    },
    {
      question: 'What should a load balancer do when most backends fail their health checks?',
      answer:
        'Fail open: past a threshold (a panic mode, say over half unhealthy), send traffic to all of them, since a shared dependency blip is likelier than the whole fleet dying. Keep liveness checks shallow, and let circuit breakers handle dependencies.',
    },
  ],
};
