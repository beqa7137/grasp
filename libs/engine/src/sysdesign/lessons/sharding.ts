import type { SdLesson } from './types.js';

export const SHARDING_LESSON: SdLesson = {
  why: 'Replicas scale reads, but every write still lands on one primary, and every replica stores all of the data. When writes or data outgrow one machine, you split the data into shards, and from then on the shard key decides everything: which queries stay cheap, which machine runs hot, and how painful it is to add the next one. Interviewers push on sharding because a bad key is easy to pick and very expensive to change.',
  widget: {
    kind: 'hash-ring',
    tryThis: [
      'Pick `hash mod N` and add node E: 166 of the 200 keys, more than 80%, change owner, although E only needs a fifth of them. Remove E to return to four, then remove D: 158 keys, almost 80%, move. Every one of those moves is data copied across the network.',
      'Switch to consistent hashing with 100 virtual nodes, add nodes back to four, then add E: only 46 keys move, close to the ideal fifth, and every one of them moves to E. Remove D: exactly its 57 keys move and the other nodes keep all of theirs.',
      'With consistent hashing, compare 1 and 100 virtual nodes per node. With 1, C owns 114 keys, more than half, while D owns 11. With 100, every node owns between 43 and 57, close to the fair 50.',
    ],
  },
  concepts: [
    {
      title: 'Why shard',
      body: 'Sharding splits writes and storage, not reads: read load is cheaper to fix with replicas and caches. Shard when one primary cannot take the peak write rate with headroom, or when the data no longer fits on one machine or takes too long to back up and restore. Every shard is its own primary, so four shards take about four times the writes.',
    },
    {
      title: 'Choosing a shard key',
      body: 'A good key has high cardinality (many distinct values), spreads access evenly, and keeps each common request on one shard. `user_id` usually works for a social app: a user reads and writes their own rows. `country` fails: a handful of values, and one of them is most of the traffic.',
    },
    {
      title: 'Hash, range or directory',
      body: 'Hash partitioning spreads keys evenly but turns a range scan into a query on every shard. Range partitioning keeps neighbors together, so scans are cheap, but a busy range or an ever-growing key makes one shard hot. A directory (lookup table from key to shard) lets you place any key anywhere, at the cost of a lookup service that must be fast, cached and always up.',
    },
    {
      title: 'Consistent hashing and virtual nodes',
      body: 'With `hash mod N`, going from 4 to 5 nodes keeps a key in place only when its hash gives the same remainder for 4 and 5, which is 4 of every 20 values: 80% of the data moves. Consistent hashing puts nodes and keys on a ring and gives each key to the next node clockwise, so a new node takes only about 1/N of the keys. Giving each machine many virtual nodes on the ring evens out the load and spreads a lost machine over all the others.',
    },
    {
      title: 'Hot keys and resharding',
      body: 'Even hashing cannot split one key that gets a huge share of traffic. Split it instead: add a salt (a suffix from 0 to 9) to spread its writes over 10 keys and read all 10 back, or give it dedicated shards. To reshard online, copy data to the new layout in the background, dual-write new changes to both, compare, switch reads, then stop writing the old copy.',
    },
    {
      title: 'Secondary indexes and copies',
      body: 'A query by anything other than the shard key needs an index. A local index lives on each shard, so writes stay on one shard but the query asks every shard; a global index is itself sharded by the indexed value, so the query asks one shard but each write updates two. For availability, each key is also copied to the next few nodes on the ring.',
    },
  ],
  examples: [
    {
      title: 'Size shards for a write load',
      problem:
        'A database takes 40,000 writes a second at peak and holds 12 TB, and both are expected to double in two years. One primary sustains 10,000 writes a second in a benchmark. How many shards?',
      insight: 'Size for the future peak at a safe utilization, check storage separately, and take the larger answer.',
      steps: [
        'Plan for the doubled load: 80,000 writes a second and 24 TB.',
        'Run each primary at about 60% of its benchmark so the tail stays flat: 6,000 writes a second per shard.',
        '80,000 / 6,000 = 13.3, so at least 14 shards for writes.',
        'Round up to 16: 24 TB / 16 = 1.5 TB per shard, small enough to back up, restore and rebuild in hours.',
        'Split the data into many more logical shards than machines, for example 256 on 16 primaries, so later growth moves whole logical shards instead of rehashing keys.',
        'Add two replicas per shard for reads and failover: 16 x 3 = 48 database machines.',
      ],
    },
    {
      title: 'Pick a key for a multi-tenant SaaS',
      problem:
        'A SaaS app has 10,000 tenants on 16 shards. One tenant produces 30% of all writes. Sharding by `tenant_id` keeps each request on one shard. What goes wrong, and what do you change?',
      insight: 'A key can have high cardinality and still be uneven: one value can outweigh whole shards.',
      steps: [
        'A fair share of the load is 100% / 16 = 6.25% per shard.',
        'The other tenants spread 70% over 16 shards, about 4.4% each.',
        "The giant tenant's shard carries 30% + 4.4%, about 34%: 5.5 times its fair share, while the rest sit near 4.4%.",
        'Keep `tenant_id` for small tenants, but split the giant one over 8 shards by adding a hash of its entity id to the key.',
        "Each of those 8 shards now carries 30% / 8 = 3.75% of the giant's writes plus 4.4% of the others, about 8.1%, 1.3 times the fair share.",
        "Record which tenants are split in a small directory, and accept that the giant's cross-entity reports fan out to its 8 shards.",
      ],
    },
    {
      title: 'A time-ordered key makes one shard hot',
      problem:
        'Orders are range-partitioned by order id over 8 shards, and ids increase with time. The system takes 20,000 new orders a second. Why is one shard at 100% while the rest are idle?',
      insight: 'With range partitioning, a key that always grows sends every new write to the last range.',
      steps: [
        'Each new order gets the largest id so far, so it lands in the last range, on one shard.',
        'That shard takes all 20,000 writes a second instead of its fair share of 20,000 / 8 = 2,500, eight times too many.',
        'Splitting the last range does not help: the next ids fall past the split, into the new last range.',
        'Lead the key with a bucket: (hash of `user_id` mod 8, `created_at`). Writes spread over 8 buckets, about 2,500 a second each.',
        "A user's orders in time order still come from one shard; an all-orders report for the last hour asks all 8 and merges the results.",
        'Embed the bucket in the order id, so a lookup by order id still goes to one shard.',
      ],
    },
  ],
  pitfalls: [
    'Sharding to fix read load: replicas and caches are cheaper and keep queries simple.',
    'Picking a key that splits common requests: if a page needs rows from every shard, each page load waits on the slowest shard.',
    'Using `hash mod N` with one shard per machine: adding a machine moves most of the data.',
    'Ignoring the one huge tenant, celebrity or time-ordered key: even hashing cannot split a single hot key.',
  ],
  followUps: [
    {
      question: 'How do you handle a query that needs data from every shard?',
      answer:
        'Scatter it to all shards in parallel and merge, with a timeout per shard; if it is common, keep a secondary index or a denormalized copy keyed for that query, updated asynchronously.',
    },
    {
      question: 'How do you enforce a unique email when users are sharded by `user_id`?',
      answer:
        'Keep a separate table sharded by email that maps email to `user_id`, and claim the email there first; the user row is written only after the claim succeeds.',
    },
    {
      question: 'What about a transaction that touches two shards?',
      answer:
        'Avoid it by choosing a key that keeps the rows together; when it cannot be avoided, use a saga with compensating steps, or two-phase commit and accept its latency and blocking on failure.',
    },
  ],
};
