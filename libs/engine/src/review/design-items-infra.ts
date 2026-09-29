import { fmt } from '../sysdesign/scenario-catalog.js';
import { concept, item, type DesignItemDefinition } from './design-item-kit.js';
import { pick, shuffle, withChoices } from './random.js';
import type { DesignItemId } from './summaries.js';

const quorumOverlap = item('Is a quorum read guaranteed fresh?', (rand) => {
  const [n, w, r] = pick(rand, [
    [3, 2, 2],
    [3, 1, 3],
    [3, 1, 1],
    [3, 2, 1],
    [5, 3, 3],
    [5, 3, 2],
    [5, 4, 2],
    [5, 1, 5],
    [5, 2, 2],
  ] as const);
  const fresh = r + w > n;
  return {
    prompt: `A leaderless store keeps ${n} replicas of each key. A write waits for ${w} acknowledgment${w > 1 ? 's' : ''} and a read asks ${r} replica${r > 1 ? 's' : ''} and keeps the newest value. Is every read that starts after a write is acknowledged guaranteed to reach at least one replica holding that write?`,
    facts: [
      { label: 'Replicas N', value: `${n}` },
      { label: 'Write quorum W', value: `${w}` },
      { label: 'Read quorum R', value: `${r}` },
    ],
    ...withChoices(rand, fresh ? `Yes: R + W = ${r + w} > ${n}` : `No: R + W = ${r + w} ≤ ${n}`, [
      fresh ? `No: R + W = ${r + w} ≤ ${n}` : `Yes: R + W = ${r + w} > ${n}`,
      `Only if W > N / 2, whatever R is`,
      `Only if R > N / 2, whatever W is`,
    ]),
    explain: fresh
      ? `Any ${r} replica${r > 1 ? 's' : ''} and any ${w} replica${w > 1 ? 's' : ''} out of ${n} must share at least one (${r} + ${w} > ${n}), so every read reaches a replica holding the write. Sloppy quorums and concurrent writes can still surprise you, but the overlap holds.`
      : `${r} + ${w} ≤ ${n}, so a read can ask ${r} replica${r > 1 ? 's' : ''} that the write never reached and return the old value. Raise R or W until R + W > N.`,
  };
});

const quorumFailures = item('How many replicas can fail?', (rand) => {
  const n = pick(rand, [3, 5, 7]);
  const w = pick(rand, n === 3 ? [2, 3] : n === 5 ? [3, 4, 5] : [4, 5, 6]);
  const failures = (v: number) => `${v} replica${v === 1 ? '' : 's'}`;
  return {
    prompt: `A store keeps ${n} replicas of each key and a write waits for ${w} acknowledgments. How many replicas can be down while writes still succeed?`,
    ...withChoices(
      rand,
      failures(n - w),
      [...new Set([w - 1, Math.floor((n - 1) / 2), n - w + 1, 0, w, n].filter((v) => v !== n - w))].slice(0, 3).map(failures),
    ),
    explain: `A write needs ${w} of ${n} replicas up, so it survives ${n} − ${w} = ${n - w} down. Every replica added to W buys consistency at the cost of availability: W = N stops writes when any single replica fails.`,
  };
});

const partitionChoice = concept(
  'A network partition cuts your replicas in two. A client on the minority side asks to update its cart. What does a system that chooses consistency (CP) do?',
  'Reject or stall the write until the partition heals, so no two sides accept conflicting versions',
  [
    'Accept the write locally and merge the two sides when the partition heals',
    'Accept the write on every replica it can reach, even if that is only one',
    'Route the write to the majority side through the partitioned link',
  ],
  'During a partition a replica must either refuse (consistent, not available) or answer with what it has (available, possibly stale or conflicting). Carts often choose availability and merge; balances and bookings choose consistency. With no partition, the real trade is latency against consistency.',
);

const majoritySize = item('Failures a consensus cluster survives', (rand) => {
  const n = pick(rand, [3, 4, 5, 6, 7, 9]);
  const tolerates = n - (Math.floor(n / 2) + 1);
  const nodes = (v: number) => `${v} node${v === 1 ? '' : 's'}`;
  return {
    prompt: `A Raft cluster has ${n} nodes. How many can fail while it still elects a leader and commits writes?`,
    ...withChoices(
      rand,
      nodes(tolerates),
      [...new Set([Math.floor(n / 2), n - 1, tolerates + 1, tolerates - 1, n].filter((v) => v >= 0 && v !== tolerates))]
        .slice(0, 3)
        .map(nodes),
    ),
    explain: `Every decision needs a majority, ${Math.floor(n / 2) + 1} of ${n}, so ${n} − ${Math.floor(n / 2) + 1} = ${tolerates} can fail.${n % 2 === 0 ? ` An even cluster tolerates no more than a ${n - 1}-node cluster would, and it can split evenly with no majority on either side.` : ''}`,
  };
});

const evenCluster = concept(
  'Why do teams run consensus clusters of 3 or 5 nodes rather than 4?',
  'A 4-node cluster still needs 3 votes, so it tolerates 1 failure like 3 nodes, and a 2–2 split leaves no majority',
  [
    'Raft and Paxos cannot elect a leader when the node count is even',
    'An even cluster doubles the replication traffic for every committed write',
    'With 4 nodes every write must reach all four before it commits',
  ],
  'A majority of 4 is 3, the same failure budget as 3 nodes but one more machine to pay for and one more vote to wait on. 5 nodes tolerate 2 failures, which is why 3 and 5 are the common sizes.',
);

const fencingToken = concept(
  'A lock holder pauses for 30 s in garbage collection. Its lease expires, another node takes the lock and writes. Then the first node wakes and writes too. What stops the stale write?',
  'A fencing token: each grant carries a rising number, and storage rejects writes with a lower one than it has seen',
  [
    'A shorter lease, so the paused node loses the lock before it can pause',
    'A heartbeat, so the lock service knows the first node was only paused',
    'Checking that the lease is still valid just before the write',
  ],
  'A pause can strike between any check and the write, so no client-side check is safe. The resource itself must reject stale holders: the lock service hands out an increasing token (an etcd revision or a Raft log index, a ZooKeeper zxid), and storage refuses anything older than the newest token it has accepted.',
);

const idRange = item('How long does the timestamp last?', (rand) => {
  const bits = pick(rand, [39, 41, 42]);
  const tickMs = pick(rand, [1, 10]);
  const years = (2 ** bits * tickMs) / (365.25 * 24 * 3600 * 1000);
  const y = (v: number) => (v < 10 ? `about ${Math.round(v * 10) / 10} years` : `about ${Math.round(v)} years`);
  return {
    prompt: `A 64-bit id gives the timestamp ${bits} bits, counting ${tickMs === 1 ? 'milliseconds' : '10 ms ticks'} from a custom epoch. How long until the timestamp runs out?`,
    ...withChoices(rand, y(years), [y(years * 2), y(years / 2), y(years * (tickMs === 1 ? 10 : 0.1))]),
    explain: `2^${bits} ticks × ${tickMs} ms ≈ ${(2 ** bits * tickMs).toExponential(1).replace('e+', ' × 10^')} ms, and a year is about 3.16 × 10^10 ms, so ${y(years)}. Each extra bit doubles it; start the epoch at launch, not 1970, to use all of it.`,
  };
});

const shardCounters = concept(
  'Rows now live on 8 database shards, each with its own auto-increment counter. What goes wrong with the ids?',
  'Every shard counts 1, 2, 3…, so the same id appears on several shards',
  [
    'The counters drift apart in speed, so ids stop being sortable by shard',
    'Auto-increment stops working entirely once a table is sharded',
    'Every insert must lock all 8 counters, so writes serialize',
  ],
  'Independent counters collide. Fixes: give each shard an offset and step (shard k issues k, k + 8, k + 16…), hand out ranges from a central allocator, or generate ids without coordination: Snowflake-style (time, generator, sequence) or random 128-bit ids.',
);

const randomKeys = concept(
  'Why can random UUIDv4 primary keys slow inserts into a large B-tree table compared with time-ordered ids?',
  'Each insert lands on a random leaf page, so the working set is the whole index and pages split everywhere',
  [
    'UUIDs are strings, and B-trees cannot index string keys efficiently',
    'Random ids collide often enough that every insert must retry',
    'The database must lock the whole index to check a random id is unique',
  ],
  'Sequential keys append at the right edge of the index, so recent pages stay in memory. Random keys touch pages all over it, missing cache and splitting half-full pages. Time-ordered 128-bit ids (UUIDv7, ULID) keep uniqueness without coordination and restore locality.',
);

const idfRank = item('Which document ranks first?', (rand) => {
  const n = 1_000_000;
  const commonDf = pick(rand, [600_000, 800_000, 950_000]);
  const rareDf = pick(rand, [500, 2_000, 10_000]);
  const [commonA, rareA] = [pick(rand, [4, 6, 8]), 1];
  const [commonB, rareB] = [pick(rand, [2, 3, 4]), pick(rand, [2, 3])];
  const idf = (df: number) => Math.log(n / df);
  const a = commonA * idf(commonDf) + rareA * idf(rareDf);
  const b = commonB * idf(commonDf) + rareB * idf(rareDf);
  const first = a > b ? 'Document A' : 'Document B';
  const other = a > b ? 'Document B' : 'Document A';
  return {
    prompt: `An index holds 1,000,000 documents. The query is "the raft": "the" appears in ${fmt(commonDf)} of them and "raft" in ${fmt(rareDf)}. Document A has "the" ${commonA} times and "raft" once; document B has "the" ${commonB} times and "raft" ${rareB} times. Ranking by TF-IDF (count times ln(N / documents with the term)), which ranks first?`,
    ...withChoices(rand, first, [other, 'They tie, since both hold both terms', 'Neither: "the" is a stop word, so the query is empty']),
    explain: `IDF is ln(1,000,000 / ${fmt(commonDf)}) ≈ ${idf(commonDf).toFixed(2)} for "the" and ln(1,000,000 / ${fmt(rareDf)}) ≈ ${idf(rareDf).toFixed(2)} for "raft". A scores ${a.toFixed(1)}, B scores ${b.toFixed(1)}. A rare term outweighs many copies of a common one; real engines use BM25, which also caps how much repeating a term helps.`,
  };
});

const indexRefresh = concept(
  'A search engine indexes new documents in immutable segments. Why is a just-written document not searchable for about a second?',
  'New documents sit in an in-memory buffer until a refresh writes them into a new searchable segment',
  [
    'Each write must first be replicated to every shard before any shard can search it',
    'The inverted index is rebuilt from scratch for every new document',
    'Documents wait in the queue until the nightly compaction merges them in',
  ],
  'Engines like Lucene buffer writes and periodically refresh (by default about every second in Elasticsearch), turning the buffer into a new small segment; background merges later combine segments. Refreshing more often costs throughput, so freshness is a tunable trade.',
);

const indexSharding = concept(
  'You shard a search index by document (each shard indexes a subset of documents) rather than by term. What does every query cost?',
  'It fans out to every shard, and the results are merged by score',
  [
    'It reads one shard, the one owning the rarest query term',
    'It reads only the shard holding the document with the highest score',
    'It reads two shards, since each term lives on exactly one',
  ],
  'Document partitioning keeps writes local and shards independent, but every query scatters to all shards and gathers the top results, so tail latency is set by the slowest shard. Term partitioning makes a query touch only its terms but makes writes and multi-term queries costly, which is why document partitioning is the common choice.',
);

const windowAssign = item('Is the event counted?', (rand) => {
  const size = pick(rand, [10, 30, 60]);
  const t = pick(rand, [3, 7, 12, 25, 41, 58]) % (size * 2);
  const start = Math.floor(t / size) * size;
  const end = start + size;
  const watermark = pick(rand, [end - 2, end, end + 5, end - size + 1]);
  const counted = end > watermark;
  return {
    prompt: `A stream counts events in tumbling ${size}-second windows by event time. The watermark stands at ${watermark} s when an event with event time ${t} s arrives. Is it counted?`,
    ...withChoices(
      rand,
      counted ? `Yes: its window [${start}, ${end}) is still open` : `No: its window [${start}, ${end}) closed at the watermark`,
      [
        counted ? `No: its window [${start}, ${end}) closed at the watermark` : `Yes: its window [${start}, ${end}) is still open`,
        'Yes: every event is counted in the window of its arrival time',
        'No: events are only counted when they arrive in order',
      ],
    ),
    explain: `A window closes once the watermark passes its end. The window [${start}, ${end}) ${counted ? `is still open at ${watermark} s, so the event counts` : `closed when the watermark reached ${end} s, so the event is late: dropped, or sent to a side output for correction`}.`,
  };
});

const watermark = concept(
  'What does a stream processor trade by holding its watermark further behind the newest events it has seen?',
  'Fewer late events dropped, but each window result is emitted later and more state is kept',
  [
    'Higher throughput, since events can be processed in any order',
    'Exactly-once output, since late events are retried until they fit',
    'Less memory, since fewer windows are open at once',
  ],
  'The watermark is the promise that no older events are coming. Holding it back tolerates more delay (mobile clients, retries) at the cost of latency and state; pushing it forward is fast but drops more events. Many systems add allowed lateness to update a closed window with stragglers.',
);

const exactlyOnce = concept(
  'A stream job crashes and restarts from its last checkpoint, replaying events since then. How does it avoid double-counting in the output?',
  'Commit output with the checkpoint (transactional sink) or write idempotently, keyed so a replay overwrites',
  [
    'Deliver every event at most once, so replays never happen',
    'Checkpoint after every single event, so nothing is replayed',
    'Rely on the message broker, which removes duplicates by content',
  ],
  'Replay makes processing at least once. The effect becomes exactly once when state and output commit together (Flink two-phase commit sinks, Kafka transactions) or when writes are idempotent upserts by a key such as window and user.',
);

const pageWriteAmp = item('Write amplification of a B-tree update', (rand) => {
  const page = pick(rand, [4, 8, 16]);
  const record = pick(rand, [64, 100, 200, 500]);
  const wa = (page * 1024) / record;
  const times = (v: number) => `about ${Math.round(v)} times`;
  return {
    prompt: `A B-tree stores ${record}-byte records in ${page} KB pages. Each random update changes one record, and its page is written back alone. Roughly how many bytes reach disk per byte of data changed (ignoring the log)?`,
    ...withChoices(rand, times(wa), [times(wa / 4), times(wa * 4), 'about 1 time']),
    explain: `A ${page} KB page is ${fmt(page * 1024)} bytes, rewritten for a ${record}-byte change: ${fmt(page * 1024)} / ${record} ≈ ${Math.round(wa)}. Batching updates to the same page, or an LSM tree that writes sequentially, cuts this.`,
  };
});

const lsmVsBtree = concept(
  'A service ingests 200,000 small events a second and mostly reads recent ones by key. Which storage engine fits better, and why?',
  'An LSM tree: writes are sequential appends and compaction, so it absorbs high write rates cheaply',
  [
    'A B-tree: every write updates the page in place, which is fastest for heavy ingest',
    'A B-tree: LSM trees cannot serve point lookups by key',
    'An LSM tree: it never needs to rewrite data once written',
  ],
  'LSM trees (RocksDB, Cassandra) turn random writes into sequential ones and batch them, at the cost of compaction rewrites and reads that may check several levels (bloom filters help). B-trees (Postgres, InnoDB) give steady read latency and in-place updates but pay a page write per random update.',
);

const bloomFilter = concept(
  'Why does an LSM tree keep a bloom filter for each sorted file?',
  'To skip files that certainly lack the key, so a point lookup reads about one file instead of every level',
  [
    'To sort keys inside each file without comparing them',
    'To compress values so more of each file fits in memory',
    'To find the newest version of a key without reading the log',
  ],
  'A bloom filter answers "definitely not here" or "maybe here" with a small false positive rate (about 1% at 10 bits per key). Checking it in memory avoids a disk read for most levels. It does not help range scans, which must merge every level.',
);

const pullsPerMinute = item('Origin fetches for a hot object', (rand) => {
  const pops = pick(rand, [20, 50, 100]);
  const ttl = pick(rand, [10, 15, 30]);
  const perPop = 60 / ttl;
  const fetches = (n: number) => `about ${fmt(n)} a minute`;
  return {
    prompt: `A popular image gets 5,000 requests a second, spread over ${pops} CDN edge locations, and is cached for ${ttl} s. Each location fetches it from the origin when its copy expires. Without an origin shield, how often does the origin serve this image?`,
    ...withChoices(rand, fetches(pops * perPop), [fetches(perPop), fetches(pops), fetches(5000 * 60)]),
    explain: `Every location sees many requests per ${ttl} s, so each refetches once per expiry: ${pops} locations × ${perPop} a minute = ${fmt(pops * perPop)}. A shield tier in front of the origin collapses these into about ${perPop} a minute, and a longer TTL cuts both.`,
  };
});

const cdnShield = concept(
  'A site moves from 20 to 100 CDN edge locations and its origin load rises, even though traffic did not change. Why, and what fixes it?',
  'Each location caches on its own, so each sees less traffic and misses more; add an origin shield',
  [
    'More locations mean more DNS lookups, which the origin answers; raise the DNS TTL',
    'Edge locations share one cache, which fills faster; buy more cache memory',
    'Anycast routes some users to the origin directly; switch to DNS-based routing',
  ],
  'A cache only helps requests that reach it. Spreading the same traffic over five times as many locations means each sees a fifth of the requests, so fewer objects are requested again before they expire. A shield (tiered cache) is one mid tier that all edges ask before the origin, so the origin sees roughly one fetch per object per TTL again.',
);

const edgeTls = concept(
  'Why does routing an uncacheable API through a CDN often make it faster for distant users?',
  'Handshakes finish at a nearby edge, which reuses open connections to the origin',
  [
    'The CDN caches API responses by default, so most calls never reach the origin',
    'The CDN compresses JSON, which removes most of the transfer time',
    'Traffic between edge and origin skips TCP, so there is no round trip at all',
  ],
  'A new HTTPS connection costs one round trip for TCP and one for TLS 1.3 before the first request. With a user 200 ms from the origin, that is 400 ms of setup; with an edge 10 ms away, 20 ms, and the edge reuses warm connections to the origin, so the request pays the long round trip once.',
);

const quorumLatency = item('Write latency of a cross-region quorum', (rand) => {
  const peers = shuffle(rand, [15, 40, 75, 90, 140, 210])
    .slice(0, 4)
    .sort((a, b) => a - b);
  const answer = peers[1];
  const ms = (v: number) => `${v} ms`;
  return {
    prompt: `A consensus group has five replicas in five regions. The leader's round trips to the other four are ${peers.map(ms).join(', ')}. Ignoring processing time, how long does the leader wait before a write is committed?`,
    ...withChoices(rand, ms(answer), [ms(peers[0]), ms(peers[3]), ms(peers.reduce((a, b) => a + b, 0))]),
    explain: `A majority of five is three, and the leader counts itself, so it needs acknowledgements from the two nearest replicas: the slower of those, ${ms(answer)}. Moving the leader or the replicas closer together is what shortens every write.`,
  };
});

const asyncFailover = concept(
  'A database replicates asynchronously from its primary region to a standby region with about 1 second of lag. The primary region goes down and you promote the standby. What happens to recent writes?',
  'Writes acknowledged in the last second or so before the failure are lost: the RPO is the replication lag',
  [
    'Nothing is lost, because every acknowledged write was already on disk in the primary',
    'Nothing is lost, because the standby replays the primary write-ahead log after promotion',
    'All writes since the last nightly backup are lost',
  ],
  'Asynchronous replication acknowledges a write before the standby has it, so whatever was in flight is gone when the primary region is. Synchronous replication or a cross-region quorum brings the RPO to zero at the cost of a round trip on every write.',
);

const activeActiveConflict = concept(
  'Two regions both accept writes and replicate to each other asynchronously, resolving conflicts by last writer wins. A user edits the same profile in both regions within the same second. What happens?',
  'One edit silently overwrites the other, so an acknowledged write disappears',
  [
    'Both edits are merged field by field automatically',
    'The second write fails with a conflict error that the client can retry',
    'Replication stops until an operator picks a version',
  ],
  'Last writer wins keeps whichever write has the later timestamp and drops the other with no error. Avoid it by giving each user a home region that takes their writes, or by using data types that merge (CRDTs such as counters and sets) where the business allows.',
);

const burnRateDays = item('How long until the error budget is gone?', (rand) => {
  const [slo, errorRate] = pick(rand, [
    [0.999, 0.002],
    [0.999, 0.005],
    [0.999, 0.01],
    [0.995, 0.01],
    [0.99, 0.02],
    [0.9995, 0.001],
  ]);
  const burn = Math.round((errorRate / (1 - slo)) * 100) / 100;
  const days = (d: number) => `about ${Number(d.toFixed(1))} days`;
  const pct = (v: number) => `${Number((v * 100).toFixed(2))}%`;
  return {
    prompt: `A service has a ${pct(slo)} availability SLO over 30 days. Since an incident began, ${pct(errorRate)} of its requests fail. If that continues, how long until the whole month of error budget is spent?`,
    ...withChoices(rand, days(30 / burn), [days(30 * burn), days(30 / burn / 24), days(30 - burn)]),
    explain: `The budget is ${pct(1 - slo)} of requests. Failing ${pct(errorRate)} burns it ${burn} times faster than the SLO allows, so 30 days of budget lasts 30 / ${burn} = ${Number((30 / burn).toFixed(1))} days. Burn-rate alerts page on exactly this ratio.`,
  };
});

const averagePercentiles = concept(
  'Each of four servers reports its p99 latency every minute. How do you get the p99 of the whole service?',
  'Merge the four latency histograms, then read the 99th percentile of the result',
  [
    'Average the four p99 values, weighting each server equally',
    'Take the largest of the four p99 values, since it always equals the fleet p99',
    'Average the four p50 values and double the result to get the tail',
  ],
  'Percentiles do not add or average: a server with little traffic counts as much as a busy one in the average, and the tail of the combined traffic depends on the whole distributions. Record histograms with fixed buckets (Prometheus histograms, HDR histograms or t-digests) so they can be merged and queried for any percentile.',
);

const labelCardinality = concept(
  'A team adds a `user_id` label to its request latency metric to debug one customer. Why is that a bad idea?',
  'Each distinct user becomes a new time series, so the metrics store must hold millions of them',
  [
    'Labels are not indexed, so queries filtering by one user would be too slow',
    'Metrics cannot store string values, so the label is silently dropped on write',
    'It only matters for counters; histograms keep one series whatever the labels',
  ],
  'Cost grows with the number of label combinations, and a histogram multiplies that by its bucket count. Keep metric labels to small, bounded sets such as route and status code, and find individual users through logs or traces that carry the user id.',
);

export const INFRA_ITEMS = {
  'quorum-overlap': quorumOverlap,
  'quorum-failures': quorumFailures,
  'partition-choice': partitionChoice,
  'majority-size': majoritySize,
  'even-cluster': evenCluster,
  'fencing-token': fencingToken,
  'id-range': idRange,
  'shard-counters': shardCounters,
  'random-keys': randomKeys,
  'idf-rank': idfRank,
  'index-refresh': indexRefresh,
  'index-sharding': indexSharding,
  'window-assign': windowAssign,
  watermark,
  'exactly-once': exactlyOnce,
  'page-write-amp': pageWriteAmp,
  'lsm-vs-btree': lsmVsBtree,
  'bloom-filter': bloomFilter,
  'cdn-pulls': pullsPerMinute,
  'cdn-shield': cdnShield,
  'edge-tls': edgeTls,
  'quorum-latency': quorumLatency,
  'async-failover': asyncFailover,
  'active-active-conflict': activeActiveConflict,
  'burn-rate-days': burnRateDays,
  'average-percentiles': averagePercentiles,
  'label-cardinality': labelCardinality,
} satisfies Partial<Record<DesignItemId, DesignItemDefinition>>;
