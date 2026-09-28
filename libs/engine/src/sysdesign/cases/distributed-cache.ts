import type { CaseStudy } from './types.js';

export const DISTRIBUTED_CACHE: CaseStudy = {
  id: 'distributed-cache',
  stages: [
    {
      kind: 'requirements',
      title: 'Clarify what matters',
      prompt:
        'Many teams will share this cache. Before sizing anything, which questions decide how careful the design must be with the data it holds?',
      decision: {
        question: 'You have time for one question first. Which answer changes the design the most?',
        options: [
          {
            label: 'Can every value be rebuilt from a source of truth, or do some services keep data only in the cache?',
            best: true,
            why: 'A pure cache may lose any key at any time: eviction, failover and restarts are just misses. If some data lives only here, it becomes a database, and eviction, replication and persistence all have to change.',
          },
          {
            label: 'How stale may a cached value be?',
            why: 'Defensible too, and worth asking next: it sets TTLs and how hard invalidation must work. The usual answer is "a few seconds", which shapes the invalidation path but not the cluster itself.',
          },
          {
            label: 'Should we use Redis or Memcached?',
            why: 'That is a choice you make and defend once the requirements are known, not a question that narrows them.',
          },
          {
            label: 'What eviction policy do the teams want?',
            why: 'Callers rarely know or care. Eviction is an internal choice driven by memory and access patterns, which the scale questions reveal.',
          },
        ],
      },
      points: [
        'Functional: get a value by key, set a value with a TTL, delete a key. Nice to have: multi-get, add-if-absent, compare-and-set and atomic increment.',
        'Keys up to 250 bytes and values up to 1 MB (the fixed Memcached key limit and its default item size limit). Values are opaque bytes; the cache never interprets them.',
        'A pure cache (from the interviewer): every value can be rebuilt from a database or a service, so losing a key costs a miss, never data.',
        'Scale (from the interviewer): about 50 services share it, 1 billion live items averaging about 1 KB each including overhead, and 1 million operations a second at peak, 95% of them gets.',
        'Non-functional: about 1 ms at p99 inside the datacenter, a node failure must not take down callers, and values may be a few seconds stale.',
        'Out of scope unless asked: persistence to disk, cross-region replication, and rich data types beyond byte strings.',
      ],
    },
    {
      kind: 'estimation',
      title: 'Size the cluster',
      prompt:
        'The working set is 1 billion items of about 1 KB each. A cache server has 64 GB of RAM, of which you plan 50 GB for items. How many primary nodes do you need?',
      estimate: {
        question: 'Primary cache nodes to hold the working set',
        answer: 20,
        unit: 'nodes',
        working: [
          'Memory: 1 billion items times 1 KB is 1,000 GB, about 1 TB.',
          'Why 50 of 64 GB: leave room for allocator fragmentation, connection and replication buffers, copy-on-write during a snapshot or full resync, and the OS.',
          'Nodes: 1,000 GB / 50 GB is 20 primaries.',
          'With one replica each, 40 servers in total.',
        ],
      },
      points: [
        'Throughput: 1 million ops/s over 20 primaries is 50,000 ops/s each on average, well within one Redis process or Memcached server. Memory, not CPU, sets the node count.',
        'Bandwidth: 50,000 ops/s times 1 KB is 50 MB/s, about 400 Mbit/s per node, a fraction of a 10 Gbit/s NIC. Large values and hot keys change that.',
        'The database behind it: 950,000 gets/s at a 95% hit rate leaves 47,500 misses a second. At 90% it would be 95,000, so each point of hit rate is real database load.',
        'Connections: 10,000 client processes each holding a connection to each of 20 nodes is 200,000 connections, 10,000 per node. This is one reason proxies exist.',
      ],
    },
    {
      kind: 'api',
      title: 'Define the API',
      prompt: 'Sketch the operations and their semantics. What does a TTL mean, and what does a caller do on a miss?',
      points: [
        '`get(key)` returns the value or a miss; `mget(keys)` fetches many keys in one round trip, which matters when one page needs a hundred of them.',
        '`set(key, value, ttl)` overwrites unconditionally; `add` sets only if absent and `cas` only if the version is unchanged since the caller read it. Every set should carry a TTL.',
        '`delete(key)` is idempotent: deleting a missing key succeeds, so callers can retry it freely.',
        'A binary or compact text protocol over long-lived TCP connections (Memcached meta commands, Redis RESP), not HTTP: request overhead matters inside a 1 ms budget.',
        'TTL semantics: an expired key reads as a miss. Both systems expire lazily when a key is read; Redis also samples keys with a TTL in the background, and Memcached has an LRU crawler that reclaims expired items.',
        'Memcached treats an expiry over 30 days as an absolute Unix time, so a relative TTL of 31 days is a date in 1970 and the item expires immediately.',
      ],
    },
    {
      kind: 'data',
      title: 'Lay out the memory',
      prompt:
        'Each node holds 50 million items in 50 GB, and they come and go constantly. How is memory allocated, and what gets evicted when it is full?',
      decision: {
        question: 'Which eviction approach fits a node with 50 million items and 50,000 ops a second?',
        options: [
          {
            label: 'Approximate LRU: sample a few keys and evict the least recently used of them',
            best: true,
            why: 'A get only records an access time, so reads never contend on a shared list, and with a handful of samples plus a small pool of candidates the result is close to true LRU. Redis does exactly this.',
          },
          {
            label: 'Exact LRU: move every item to the head of one linked list on each hit',
            why: 'Correct but costly: every get becomes a write to a shared structure under a lock, and the list pointers cost 16 bytes per item. Memcached keeps lists but bumps an item at most once a minute to avoid this.',
          },
          {
            label: 'Random eviction',
            why: 'Defensible too: no bookkeeping at all, and in a large cache with a skewed workload the hit rate is often only a little worse. It will sometimes evict a very hot key, which then costs a burst of misses.',
          },
          {
            label: 'Evict only expired keys and reject writes when memory is full',
            why: 'Right for a store that must not lose data (Redis calls it `noeviction`), wrong for a cache: once full, every new set fails and callers see errors instead of misses.',
          },
        ],
      },
      points: [
        'Memcached slab allocation: memory is split into 1 MB pages, each page belongs to one slab class, and a class cuts its pages into chunks of one size. Chunk sizes grow by a factor of 1.25 by default.',
        'An item goes into the smallest chunk that fits, so there is no external fragmentation, but the unused tail of each chunk is wasted. Each class has its own LRU, so eviction happens in the class that needs room.',
        'Slab calcification: if values grow over time, pages stay assigned to the old small classes. Modern Memcached moves pages between classes automatically.',
        'Redis allocates each object with jemalloc, whose size classes behave much like slabs. Watch the fragmentation ratio (resident memory over used memory) and use active defragmentation when it climbs.',
        'Redis keeps a coarse access clock on each object; with `allkeys-lfu` it keeps a decaying frequency counter instead, which resists one-off scans that would flush a pure LRU.',
      ],
    },
    {
      kind: 'deep-dive',
      title: 'Partition the keys',
      prompt: 'Twenty nodes today, more next year. How does every caller agree which node owns a key, and what moves when a node is added?',
      decision: {
        question: 'How do you map keys to nodes?',
        options: [
          {
            label: 'Consistent hashing: nodes own many points on a hash ring, and a key belongs to the next point clockwise',
            best: true,
            why: 'Adding a 21st node moves only the keys it takes over, about 1/21 of them, and a removed node hands its keys to many neighbours instead of one. Redis Cluster gets the same property from 16,384 fixed hash slots assigned to nodes.',
          },
          {
            label: '`hash(key) mod N`',
            why: 'Even and simple, but going from 20 to 21 nodes keeps only the keys whose remainder is the same for both, about 1 in 21. Some 95% of keys move, the hit rate collapses, and the database takes the full load.',
          },
          {
            label: 'A directory service that records the owner of every key',
            why: 'Total flexibility, but a lookup per request and a billion-entry directory that is itself a distributed system to build. Consistent hashing computes the answer instead.',
          },
          {
            label: 'Range partitioning by key',
            why: 'A cache never needs ordered scans, and key prefixes cluster (every key of one service shares one), so ranges turn into hot nodes.',
          },
        ],
      },
      points: [
        'Virtual nodes: with one point per server, the gaps between points differ wildly and so do the loads. Many points per server evens the shares out; Ketama, the classic Memcached client scheme, uses 160.',
        'Weights: a bigger server gets proportionally more points, so a mixed fleet shares load by capacity.',
        'Redis Cluster: slot is `CRC16(key) mod 16384`. A hash tag such as `{user:42}:cart` hashes only the part in braces, so related keys land on one node and multi-key operations work.',
        'Every caller must see the same membership. A config service (ZooKeeper, etcd) or the cluster itself publishes it, and a change rolls out to every client or proxy.',
      ],
    },
    {
      kind: 'design',
      title: 'Put it together',
      prompt:
        'A service instance calls `get("user:42")`. Trace the request from the caller to the node that owns the key, and back to the database on a miss.',
      lab: true,
      points: [
        'Client-side routing: a library in each service hashes the key and talks straight to the owner. No extra hop and no proxy to run, but every language needs the library, membership changes reach thousands of processes, and each one holds connections to every node.',
        'Proxy routing: callers send everything to a local sidecar or a proxy tier (mcrouter, twemproxy, Envoy) that hashes and forwards. It adds a hop of well under a millisecond, but pools connections, keeps routing in one place and can add replication, failover and warm-up rules without touching 50 services. For a shared cache this is the usual choice.',
        'Redis Cluster sits between the two: smart clients cache the slot map, and a node answers `MOVED` with the new owner when the map is stale, so the client fixes its map and retries.',
        'Cache-aside on the read path: get the key; on a miss read the database, then set the value with a TTL. Writes go to the database, then delete the key.',
        'Open the build in the Design Lab: 40,000 requests a second, 95% reads, one large caller among the 50. The app tier stands for that service with its client library or sidecar, the cache node for the cache cluster, and the database with replicas for the source of truth behind it. Writes go to the database directly, as cache-aside does. Lower the cache hit rate from 95% to 70% and watch the database run hot. The simulator models callers as internet clients, so its latency includes a round trip the real in-datacenter path does not have, and its CDN tip does not apply here.',
      ],
    },
    {
      kind: 'deep-dive',
      title: 'When a node dies',
      prompt:
        'One of the 20 primaries loses power and has no replica. Its keys now miss. How much extra load reaches the database, and how do replication and failover change that?',
      estimate: {
        question: 'Database reads per second right after one of 20 nodes dies, with no replicas',
        answer: 92_625,
        unit: 'reads/s',
        working: [
          'Gets: 95% of 1 million is 950,000 a second; each node owns 1/20 of them, 47,500 a second.',
          'Before: 5% of 950,000 miss, so the database serves 47,500 reads a second.',
          "After: the dead node's 47,500 gets all miss, and the other 19 nodes still miss 5% of 902,500, which is 45,125.",
          'Total: 47,500 plus 45,125 is 92,625 reads a second, nearly double, until the keys are cached again.',
        ],
      },
      points: [
        'Replicas: each primary streams its writes to a replica in another zone. Replication is asynchronous, so a failover can lose the last few writes; for a cache that means a few extra misses.',
        "Redis Cluster failover: when a primary is unreachable for longer than the node timeout, a majority of primaries marks it failed and its replica is elected and promoted. Clients see connection errors, refresh the slot map and follow `MOVED` from then on. A primary with no replica leaves its slots uncovered, and by default (the cluster-require-full-coverage setting) the whole cluster then refuses queries; a cache should turn that setting off, so only that node's keys miss.",
        'Memcached has no replication of its own. Facebook sends requests for a failed server to a small gutter pool (about 1% of servers) whose items expire quickly, instead of rehashing onto the other nodes and overloading them.',
        'Detect death carefully: mark a node down after several failed checks, not one timeout, or a brief GC pause or network blip triggers failovers and misses.',
        'A node that returns after being skipped may hold values that were updated and invalidated while it was away. Flush it, or let it rejoin empty.',
      ],
    },
    {
      kind: 'deep-dive',
      title: 'Hot keys and stampedes',
      prompt:
        "A celebrity's profile key is read 50,000 times a second, and its TTL just expired. What happens to the node that owns it, and to the database?",
      decision: {
        question: 'What stops 50,000 callers from all rebuilding the same expired key?',
        options: [
          {
            label: 'Leases: the first caller to miss gets a token and rebuilds; the others wait briefly and retry, or take a stale value',
            best: true,
            why: 'One database query per expiry, whatever the traffic. Facebook hands out at most one lease per key every 10 seconds, and a delete invalidates the token so a stale rebuild cannot be written. Coalescing misses inside each caller (singleflight) is the same idea on one host.',
          },
          {
            label: 'Add random jitter to every TTL',
            why: 'Defensible too, and worth doing anyway: it stops thousands of keys set together from expiring together. It does nothing for one hot key, whose single expiry still sends every concurrent reader to the database.',
          },
          {
            label: 'Never expire hot keys; a background job refreshes them',
            why: 'Works for keys you know ahead of time, such as a home page. Hot keys are often a surprise (a post going viral), and the job must also handle invalidation.',
          },
          {
            label: 'Take a lock in the database around the rebuild',
            why: 'All 50,000 requests still reach the database to contend for the lock, which is the load you were trying to avoid.',
          },
        ],
      },
      points: [
        'A hot key lives on one node, so it can exceed that node however large the cluster is. Detect it where the traffic passes: proxies can sample keys and report the top ones.',
        'A small in-process cache in each caller, with a TTL of a second or two, turns 50,000 gets a second into one per caller process per TTL.',
        'Or spread the key: store copies as `key#1` to `key#8` on different nodes and read a random one. Updates must then delete every copy.',
        'Probabilistic early expiration: each reader refreshes a little before the TTL, with a probability that rises as expiry nears, so one of them rebuilds while the old value still serves the rest.',
        'Stale-while-revalidate: keep the value past its soft TTL and serve it while one caller refreshes, which fits the few seconds of staleness the requirements allow.',
      ],
    },
    {
      kind: 'deep-dive',
      title: 'Keep the cache honest',
      prompt:
        'A user renames themselves. The database now says one thing and the cache another. What does the writing service do, and what can still go wrong?',
      decision: {
        question: 'Which write path would you defend for a shared cache in front of a database?',
        options: [
          {
            label: 'Update the database, then delete the key; the next read refills it',
            best: true,
            why: 'Deletes are idempotent and safe to retry, and the next reader loads the committed value. Two concurrent writers cannot leave the older value behind, which setting the value can.',
          },
          {
            label: 'Update the database, then set the new value in the cache',
            why: 'Saves one miss, but two writers can commit in one order and set in the other, leaving the older value cached until its TTL. It also fills the cache with values nobody may read.',
          },
          {
            label: 'Delete the key, then update the database',
            why: 'A reader that misses between the delete and the commit reloads the old value and caches it, so the stale value outlives the write.',
          },
          {
            label: 'Write-through: services write to the cache, which writes the database synchronously',
            why: 'Defensible when one service owns the data and all its writes go through the cache. In a cache shared by 50 services it couples every write to cache availability and misses writes that reach the database any other way.',
          },
        ],
      },
      points: [
        "The remaining race: a reader misses and reads the old row, a writer commits and deletes, then the reader sets the old value. Leases close it (the delete voids the reader's token), or have the delete leave a short-lived tombstone holding the new version and refuse any set older than it; a plain version check cannot help, since after the delete nothing is cached to compare against. The TTL bounds whatever slips through.",
        'A delete can fail after the commit. Tail the database change log (binlog or CDC) and issue deletes from there with retries, so every committed write invalidates its keys even if the service crashed. Facebook does this with mcsqueal.',
        'Write-behind (the cache acknowledges and flushes to the database later) is fast but loses writes when a node dies, so it only fits data you can afford to lose.',
        'Cache misses too: store a short-lived "not found" marker so repeated lookups of a missing key do not all reach the database.',
      ],
    },
    {
      kind: 'wrap-up',
      title: 'Close the loop',
      prompt: 'You have five minutes left. What would you raise before the interviewer does?',
      points: [
        "Multi-tenancy: prefix keys by service, set memory quotas per tenant, and give a service with a scan-heavy or bulky workload its own pool so it cannot evict everyone else's hot keys.",
        'Growth: add nodes one at a time. Redis Cluster migrates slots live; with Memcached, a warm-up route fills the new node from the old owner on a miss instead of from the database.',
        'Multi-region: each region runs its own cluster, and invalidations follow the database replication stream, so a region deletes a key only after its own replica has the new row.',
        'Monitoring: hit rate per service, evictions per second, memory and fragmentation per node, p99 latency, connection counts and the top keys.',
      ],
    },
  ],
  pitfalls: [
    'Treating the cache as durable storage without asking whether every value can be rebuilt.',
    'Partitioning with `hash(key) mod N`, so adding one node remaps almost every key and floods the database.',
    'Setting the new value on every write instead of deleting it, or storing keys with no TTL, so a lost invalidation stays wrong forever.',
    'Sizing for average load and ignoring hot keys and stampedes, where one key or one expiry overloads one node or the database.',
    'Assuming replication makes the cache consistent: it is asynchronous, so a failover can lose writes and a replica can serve stale reads.',
  ],
  followUps: [
    {
      question: 'Could a team keep user sessions in this cache with no other copy?',
      answer:
        'Only in a separate pool run as a store: no eviction, a replica in another zone, persistence to disk (Redis AOF), memory alerts well before it fills, and TTLs that match session lifetimes. Mixing it into the shared cache means an eviction or a failover logs users out.',
    },
    {
      question: 'Why not read from replicas to double read capacity?',
      answer:
        'Replicas lag, so a caller can read a value it just invalidated. It is a good fit for hot keys where a few seconds of staleness is fine, but not for the general read path; adding primaries spreads load without that cost.',
    },
    {
      question: 'How do you add 5 nodes to the 20 without a wave of misses?',
      answer:
        'With consistent hashing about 5/25, a fifth of the keys, move to the new nodes, which start empty. Add them one at a time, and let the new owner fill a miss from the old owner rather than from the database (a warm-up route), or migrate slots live in Redis Cluster before switching ownership.',
    },
  ],
};
