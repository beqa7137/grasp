import type { SdLesson } from './types.js';

export const TENANCY_LESSON: SdLesson = {
  why: "Almost every SaaS product runs many customers on shared machines, databases and queues, because that is what makes it cheap. The price is that one tenant with a runaway import, a bad query or a viral launch can use up the capacity everyone else shares, and without isolation their outage becomes everyone else's outage too. Interviewers probe where tenants share resources, what stops one of them from starving the rest, how data stays separated, and what you do when one tenant outgrows the pool.",
  widget: {
    kind: 'tenancy',
    tryThis: [
      'Pick first come first served with 10 tenants, quiet load 60% and burst 2x: every request is served and the pool is 73% busy. Raise the burst to 5x: still all served, at 93%. At 10x the pool is short and every tenant, quiet or noisy, gets 79% of what it asked for; at 20x, only 52%. Without isolation the quiet tenants pay for the noisy one in exact proportion.',
      'Keep 10 tenants, 60% and 20x, and pick a per-tenant quota of 20%: quiet tenants get 100%, the noisy one 15%, and utilization falls to 80%, so a fifth of the pool sits idle while requests are turned away. Raise the quota to 40%: the noisy tenant gets 30% and the pool is 100% busy. At 50% what the tenants may use under their caps adds up to 110% of the pool, and quiet tenants drop to 91%.',
      "Pick fair sharing with 10 tenants, 60% and 20x: quiet tenants get 100%, the noisy one 30%, and utilization is 100%, since the capacity quiet tenants leave unused goes to the one that wants more. Now set 5 tenants, 90% and 5x: each quiet tenant asks for 22.5% of the pool, above its equal 20% share, so every tenant gets exactly 20%: quiet tenants 89%, the noisy one 18%. Fair sharing guarantees an equal share, not a tenant's full demand.",
    ],
  },
  concepts: [
    {
      title: 'Silo, pool and bridge',
      body: 'Silo gives each tenant its own stack or database: strong isolation, simple per-tenant cost and data residency, but you pay for idle capacity per tenant and operate, upgrade and migrate hundreds of copies. Pool shares everything and tags data with a tenant id: cheapest, best utilization, one deployment, but noisy neighbors are real and one missing filter can leak data across tenants. Bridge mixes the two: a shared app tier over a schema or database per tenant, or the pool for most tenants and silos for the few large or regulated ones. Most products start pooled and silo selectively.',
    },
    {
      title: 'The noisy neighbor, resource by resource',
      body: "CPU: one tenant's expensive reports slow every request on the same hosts. Database connections: a tenant with slow queries holds connections longer (by Little's law, in-flight work is rate times latency), exhausts the pool, and others wait for a connection. IO: a large scan or export uses the disk IOPS and evicts other tenants' hot pages from the buffer cache. Queues: one tenant enqueues a million jobs into a shared FIFO, and every other tenant's jobs wait behind them for hours. Each shared resource needs its own guard; a request rate limit alone does not stop a tenant whose few requests are each very expensive.",
    },
    {
      title: 'Quotas and rate limits',
      body: 'A per-tenant rate limit or quota caps what one tenant may use: requests a second, concurrent requests, connections, jobs in flight, storage. It is simple, predictable and maps to plans and billing. But a static cap is not work conserving: when others are idle, capacity sits unused while the capped tenant is turned away. And the sum of all tenant caps is almost always far above the real capacity, so caps alone cannot guarantee isolation when many tenants are busy at once. Charge caps in cost units where requests differ, such as query time or rows scanned, not only in requests.',
    },
    {
      title: 'Fair queuing and max-min fairness',
      body: 'Max-min fairness gives each tenant an equal share of the capacity; a tenant that needs less keeps only what it needs, and the rest is split among the others the same way, until capacity or demand runs out. No tenant can then gain without taking from one that has the same or less. It protects light tenants fully and still uses the whole pool. Weighted fair queuing and deficit round robin implement it for request streams: a queue per tenant, served in turn in proportion to a weight. Per-tenant queues, or round robin across tenants over a shared queue, are the cheapest fix for the one-tenant backlog.',
    },
    {
      title: 'Bulkheads, cells and shuffle sharding',
      body: 'A bulkhead gives a tenant class or a dependency its own thread pool, connection pool or worker fleet, so exhausting one cannot drain the others. A cell is a complete, independent copy of the stack serving a fixed subset of tenants, behind a thin router that maps tenant to cell: a bad deploy, a poison request or an overload hurts only that cell, and cells are sized to a tested maximum and added rather than grown. Shuffle sharding assigns each tenant a small random set of workers: with 8 workers and 2 per tenant there are 28 distinct pairs, so a tenant that takes down its own pair fully takes out only tenants with the same pair.',
    },
    {
      title: 'Tenant-aware sharding',
      body: "Put the tenant id first in every partition key and index, so one tenant's data lives on one shard and its queries never fan out. Place tenants with a directory (a tenant to shard table, cached everywhere) rather than a pure hash, because tenants are wildly uneven and a directory lets you move one tenant, for example the largest onto a shard of its own, without reshuffling everyone. The move is copy, catch up from the change stream, pause that tenant's writes for seconds, flip the directory entry, then clean up.",
    },
    {
      title: 'Data isolation and security',
      body: "In a pooled database, every row carries a tenant id, and every query must filter on it. Enforce that below the application: Postgres row-level security with a policy comparing the row's tenant id to a per-transaction setting (`SET LOCAL` so a pooled connection never carries the last tenant), noting that superusers and roles with `BYPASSRLS` always skip policies, and the table owner skips them unless the table has `FORCE ROW LEVEL SECURITY`, so the app should connect as a separate role that owns nothing. Per-tenant encryption keys (envelope encryption with a data key per tenant, wrapped by a KMS key) limit what one leaked key exposes, allow customer-managed keys, and let you crypto-shred a departing tenant's data, backups included, by destroying its key. Take the tenant id from the authenticated token, never from a request parameter.",
    },
    {
      title: 'Per-tenant metrics, cost and tiers',
      body: 'Tag requests, logs, traces and usage events with the tenant id, so you can answer who is using the capacity right now, and meter cost units per tenant (CPU seconds, queries, storage, egress) to attribute cost and spot unprofitable plans. With tens of thousands of tenants, a tenant label on every metric explodes series cardinality: keep per-tenant detail in usage events or logs and track the top tenants in metrics. Tiers then become weights and capacity: paying tenants get a higher weight in fair queuing, higher quotas, a premium cell, or dedicated silo capacity.',
    },
  ],
  examples: [
    {
      title: 'One tenant bursts on a shared pool',
      problem:
        'Ten tenants share a pool. Nine quiet tenants together ask for 60% of its capacity, evenly; the tenth bursts to 20 times a quiet tenant. What does each tenant get under first come first served, a 20% per-tenant quota, and fair sharing?',
      insight:
        'First come first served spreads the shortage over everyone; a quota protects the quiet tenants but wastes capacity; fair sharing protects them and uses the whole pool.',
      steps: [
        'Each quiet tenant asks for 60 / 9, about 6.67% of the pool, and the noisy one 20 times that, about 133.3%. Total demand is about 193.3%.',
        'First come first served: the pool serves 100 / 193.3, about 51.7% of every request, quiet or noisy. The noisy tenant ends up with about 69% of the pool, the nine quiet ones share about 31%.',
        'A 20% quota: the quiet tenants are under it and get everything, the noisy tenant is capped at 20, or 20 / 133.3 = 15% of its demand. The pool serves 60 + 20 = 80%, and 20% sits idle.',
        'Fair sharing: each tenant is entitled to 10%. The quiet ones need only 6.67 each, leaving 9 × 3.33 = 30 unused, which goes to the noisy tenant: 10 + 30 = 40, or 30% of its demand, with the pool 100% busy.',
        'In an interview, say it this way: fair sharing is the runtime guard, and quotas stay for contracts and cost, where predictability matters more than utilization.',
      ],
    },
    {
      title: 'Size a static quota, then change the load',
      problem:
        'Same pool: 10 tenants, quiet load 60%, one tenant at 20 times. You must set one per-tenant quota for everyone. What is the largest quota that fully protects the quiet tenants, and what happens when quiet load rises to 90%?',
      insight:
        'A static quota is right for only one load: too low wastes capacity, too high lets the caps oversubscribe the pool, and neither adapts when the load changes.',
      steps: [
        "Quiet tenants are safe while the noisy tenant's cap fits in what they leave: 60 + q ≤ 100, so q ≤ 40%. At 40% the noisy tenant gets 40 / 133.3 = 30% and the pool is fully used.",
        'At 50% the capped demands add up to 60 + 50 = 110, so every tenant is scaled by 100 / 110: quiet tenants get about 91%, the noisy one 45.5 / 133.3, about 34%.',
        'Keep the 20% quota and let quiet load rise to 90%: each quiet tenant asks 10%, the noisy one is capped at 20, total 110. Quiet tenants again get about 91%, the noisy one about 9%.',
        'Fair sharing at 90%: each tenant is entitled to 10%, the quiet ones use exactly that, and the noisy tenant gets the last 10, or 5% of its demand. Quiet tenants keep 100% with no tuning.',
        'Real systems do both: a quota per plan as the hard ceiling, and fair queuing among tenants inside it for moments when the pool is short.',
      ],
    },
    {
      title: 'Move the largest tenant to its own shard',
      problem:
        'A SaaS app runs 2,000 tenants on 8 database shards, about 250 tenants each. A shard handles 10,000 queries a second and you plan for 60%. Each shard serves about 4,500 a second, but tenant Acme on shard 3 grows from 500 to 5,000. What happens, and what do you do?',
      insight: 'Tenant sizes follow a long tail; a directory that can move one tenant is worth more than any clever hash.',
      steps: [
        'Shard 3 served 4,500, of which Acme sent 500, so its other 249 tenants send 4,000. With Acme at 5,000 the shard runs 9,000 a second, 90%, and the latency of 249 unrelated tenants climbs.',
        'Rebalancing by hash range would move many tenants to relieve one. With a tenant to shard directory, move only Acme to a new shard 9: it runs at 50%, and shard 3 falls back to 40%.',
        "The move: copy Acme's rows, which is one indexed range because the tenant id leads every key; stream changes until the copy catches up; pause Acme's writes for a few seconds; flip its directory entry; verify, then delete the old rows.",
        'Acme now uses a whole shard, about one ninth of the database fleet for one tenant. Per-tenant metering shows that cost, which is the case for an enterprise tier with dedicated capacity.',
        'Set an alarm for any tenant above, say, 30% of a shard, so the next Acme moves before its neighbors notice.',
      ],
    },
  ],
  pitfalls: [
    'Rate limiting requests but not cost: a tenant sending ten expensive queries a second can use more of the database than one sending a thousand cheap ones.',
    "One shared FIFO queue for every tenant: a single bulk import delays every other tenant's jobs for hours. Queue per tenant, or round robin across tenants.",
    'Relying on the application to add the tenant filter to every query: one forgotten `WHERE` clause is a cross-tenant data leak. Enforce it with row-level security or a data layer that cannot skip it.',
    'Hashing tenants to shards with no way to move one: the largest tenant eventually saturates its shard, and every tenant that happens to share it suffers.',
  ],
  followUps: [
    {
      question: 'How do you give paying tenants more of a shared pool without starving free ones?',
      answer:
        'Use weighted fair sharing: capacity is split in proportion to weight among tenants still asking for more. With an enterprise tenant at weight 3 and two free tenants at weight 1, all busy, the split is 60, 20 and 20. If one free tenant needs only 10, its unused 10 is shared 3 to 1: 67.5 and 22.5. Free tenants keep a guaranteed floor, and the largest customers can also buy dedicated cells or silos.',
    },
    {
      question: 'When would you choose silo over pool?',
      answer:
        'When a tenant needs isolation the pool cannot prove: regulation or data residency, customer-managed keys on a dedicated database, a contract promising performance no neighbor can touch, or a tenant large enough to fill its own capacity anyway. Otherwise pool, since silos multiply cost and operational work per tenant. Many products run pool by default and silo as a paid tier.',
    },
    {
      question: 'What is the difference between cells and shards?',
      answer:
        'A shard splits one component, usually the database, and the rest of the stack stays shared. A cell is a whole copy of the stack (app servers, queues, caches, databases) serving its own tenants, so a bad deploy, a poison request or an overload stays inside one cell. Cells cap the blast radius; shards only spread data and load.',
    },
  ],
};
