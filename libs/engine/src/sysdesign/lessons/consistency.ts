import type { SdLesson } from './types.js';

export const CONSISTENCY_LESSON: SdLesson = {
  why: 'Once data lives on more than one machine, "read the latest value" stops being free: every read either coordinates with other replicas or risks being stale. Whether a user sees their own edit, whether two buyers get the last seat, and whether an outage returns errors or old data are all consistency choices. Interviewers probe whether you can name the guarantee each operation needs, what it costs in latency and availability, and what a quorum really promises.',
  widget: {
    kind: 'quorum',
    tryThis: [
      'Keep the defaults, N = 3, W = 2 and R = 2: the write reaches two replicas and the worst-case read asks the one it missed plus one it reached, so the read is fresh and R + W = 4 > 3. Take any one replica down: both still succeed and the read is still fresh. Take a second one down: the write and the read both fail, since only one replica is up.',
      'Bring every replica back up, then set W = 1 and R = 1: the write reaches one replica and the worst-case read asks another, so it is stale and R + W = 2 is not above 3. Raise R to 3: now the read must include the written replica and is fresh. Take one replica down: writes still succeed, but reads fail. Cheap writes were paid for with fragile reads.',
      'Set N = 5, W = 3 and R = 3: take any two replicas down and the read is still fresh; take a third down and both fail. Now bring all five up and set W = 2 and R = 2: the read is stale. Take three replicas down: the read turns fresh only because the write and the read were both forced onto the same two surviving replicas; once the other three come back, a read can miss the write. That is not a guarantee, and the widget still reports R + W as not above N.',
    ],
  },
  concepts: [
    {
      title: 'Consistency models, strongest to weakest',
      body: 'Linearizable: the system behaves like a single copy, and once any read returns a value, every later read returns it or something newer. It needs coordination on every operation (a single leader per key or a consensus round), so it costs latency, and a replica cut off from the majority must refuse requests. Causal: effects never appear before their causes, so a reply is never visible without the comment it answers; it needs dependency tracking but no global coordination. Session guarantees are cheaper still: read-your-writes (you see your own edits) and monotonic reads (you never see time go backwards). Eventual: if writes stop, replicas converge, with no bound on when and no promise about what a read sees meanwhile.',
    },
    {
      title: 'Quorums: R + W > N',
      body: 'In a leaderless store (the Amazon Dynamo design, not DynamoDB; Cassandra, Riak) each key has N replicas. A write is sent to all N and succeeds once W acknowledge; a read asks R and returns the newest version among the answers. If R + W > N, every read set shares at least one replica with every successful write set, so the read sees the write. The split decides the trade: writes survive N - W replicas down, reads survive N - R. N = 3, W = 2, R = 2 tolerates one down replica for both; W = 3, R = 1 makes reads cheap and writes fragile. This lesson covers leaderless stores; the Replication lesson covers leader-based ones, where freshness depends on which replica you read, not on overlap.',
    },
    {
      title: 'What a quorum does not guarantee',
      body: "Overlap is necessary, not sufficient. A sloppy quorum lets a write land on stand-in nodes outside the key's N when its home replicas are unreachable (hinted handoff later delivers it), so a read of the home replicas can miss it. A write that reached fewer than W replicas is reported as failed but is not rolled back, so later reads may or may not see it. Two concurrent writes resolved by last-write-wins keep one and silently drop the other, and with clock skew the survivor may be the older one. Even a strict quorum is not linearizable on its own: a read racing a write can see the new value while the next read sees the old one, without extra steps such as reads that repair stale replicas before returning.",
    },
    {
      title: 'CAP, stated precisely, and PACELC',
      body: 'CAP is not "pick two of three". It says that during a network partition, a replica that cannot reach the others must either refuse the request (consistent, not available) or answer with possibly stale data and accept writes that may conflict (available, not consistent). Here consistent means linearizable, and available means every working node answers. Without a partition CAP says nothing. PACELC fills that gap: if Partitioned, choose Availability or Consistency; Else, choose Latency or Consistency. Cassandra at its usual settings is PA/EL; Spanner is PC/EC and pays a cross-replica round trip on every write.',
    },
    {
      title: 'Resolving conflicts',
      body: 'Last-write-wins keeps the version with the highest timestamp: simple, but it discards concurrent writes, so use it only where one value replacing another is correct, such as a profile photo. Version vectors keep a counter per replica, which tells "this version supersedes that one" apart from "these two are concurrent", so the store can keep both as siblings for someone to merge. CRDTs are data types whose merge is built in and order-independent: counters, sets, maps. For everything else the application merges with domain rules, such as taking the union of two carts or asking the user.',
    },
    {
      title: 'Read repair and anti-entropy',
      body: 'Replicas drift: a node was down, a write failed partway, a hint expired. Read repair fixes drift on the read path: when replicas answer a read with different versions, the coordinator writes the newest back to the stale ones, which only helps keys that are read. Anti-entropy fixes the rest in the background by comparing Merkle trees of key ranges and copying only the ranges that differ. Deletes need care: a delete is kept as a tombstone, and if tombstones are purged before repair reaches a replica that missed the delete, repair copies the old value back. In Cassandra, run repair more often than `gc_grace_seconds`, 10 days by default.',
    },
    {
      title: 'Choose per operation',
      body: 'Most stores let you pick consistency per request: Cassandra per query (ONE, QUORUM, LOCAL_QUORUM, ALL), DynamoDB per read (a strongly consistent read costs twice the read capacity of an eventually consistent one). Decide by what a stale or lost value costs. Deducting from a balance or claiming a username needs a linearizable conditional write. A like count, a view counter or a recommendation list can be eventual, ideally as a CRDT counter so no increments are lost. A user editing their own profile needs read-your-writes, not global linearizability.',
    },
  ],
  examples: [
    {
      title: 'Choose N, W and R for two workloads',
      problem:
        'Two leaderless stores, each with N = 3. A product catalog serves 60,000 reads and 300 writes a second, with writes from a pipeline that retries. An event log takes 100,000 writes and 1,000 reads a second. Pick W and R for each, keeping R + W > N.',
      insight:
        'R + W > N fixes freshness; how you split it decides which operation is cheap, which one waits on slow replicas, and which one survives failures.',
      steps: [
        'Writes go to all three replicas whatever W is; W only sets how many acknowledgments to wait for. So the catalog costs 3 times 300, or 900, replica writes a second under any setting.',
        'Reads cost R replica requests each. At R = 2 the catalog makes 120,000 replica reads a second, 40,000 per node; at R = 1 it makes 60,000, 20,000 per node. R = 1 needs W = 3.',
        'W = 3 means a write waits for the slowest replica and fails while any replica is down. The retrying pipeline absorbs that, and reads keep working with two replicas down. Catalog: W = 3, R = 1.',
        'For the event log, W = 1 and R = 3 acknowledges each write at the fastest replica and keeps writes up with two replicas down; the rare reads need all three replicas and fail if one is down.',
        'But W = 1 acknowledges a write held by one node: if its disk dies before the others receive the write, the write is gone. If events must not be lost, W = 2, R = 2 keeps both paths up with one replica down, which is why it is the common default.',
      ],
    },
    {
      title: 'A shopping cart during a partition',
      problem:
        "A cart store has N = 3, W = 2, R = 2. A network partition leaves a user's web servers able to reach only one of the three replicas for about 90 seconds, and the user adds a book. What happens, and what should happen?",
      insight:
        'A failed add-to-cart loses a sale while a slightly wrong cart costs almost nothing, so a cart chooses availability and merges; checkout does not.',
      steps: [
        'With a strict quorum the write needs 2 acknowledgments and only 1 replica is reachable, so the add fails: the consistent choice, and 90 seconds of lost sales.',
        'With a sloppy quorum the write goes to the reachable replica plus a stand-in node that stores a hint and hands the write to the missing home replica when the partition heals. The add succeeds.',
        "Meanwhile the user's phone, on the other side of the partition, removes a pair of shoes. Now two cart versions exist, and neither contains the other's change. Version vectors show they are concurrent rather than one newer, so neither is dropped.",
        'Merging by taking the union keeps the book but brings back the removed shoes: the anomaly the Dynamo paper reported. An observed-remove set (a CRDT) records which adds each remove has seen, so the merged cart holds the book and not the shoes.',
        'Checkout is different: charging a card and reserving stock must not act on a stale cart. Show the merged cart for confirmation, then reserve stock with a conditional write on a strongly consistent store.',
      ],
    },
    {
      title: 'The rename that does not stick',
      problem:
        'A Cassandra table with N = 3 is written and read at consistency ONE. A user renames a project and the page reloads 50 ms later; sometimes the old name shows. One replica is often up to 2 seconds behind during compaction. Why, and what fixes it?',
      insight: 'With R + W = 2 against N = 3, nothing forces the read to meet the write; fix the overlap, then look at concurrent writes.',
      steps: [
        'The write is acknowledged by one replica. The reload at ONE goes to one replica, which may be one of the other two. If they have not applied the write, and the lagging one may not for 2 seconds, the read is stale.',
        'Write and read at LOCAL_QUORUM: 2 + 2 > 3, so every read set includes a replica that has the write, the coordinator returns the newest version, and read repair updates the stale replica. Cost: each request waits for the second fastest replica, and each still tolerates one replica down.',
        'A second bug remains. Two admins rename the project within the same 30 ms from app servers whose clocks differ by 80 ms. Last-write-wins keeps the higher timestamp, which can belong to the write made first, so a rename acknowledged to one admin silently disappears.',
        'For renames, use a conditional write, a lightweight transaction such as `UPDATE ... IF name = ?`. It runs Paxos, about four round trips, and rejects the stale rename instead of dropping it. Keep plain quorum writes for data where last-write-wins is harmless.',
      ],
    },
  ],
  pitfalls: [
    'Treating R + W > N as linearizability: sloppy quorums, partially failed writes and last-write-wins under clock skew all return stale or lost data.',
    'Setting W = N "for consistency": one slow or dead replica then stalls or fails every write, and R = 1 was the only thing it bought.',
    'Using last-write-wins for data where both writes matter, such as counters, carts or balances: concurrent updates vanish without an error. Use CRDTs, atomic increments or conditional writes.',
    'Quoting CAP as "pick two of three": partitions are not optional, the choice applies only while one lasts, and the everyday trade is latency against consistency.',
  ],
  followUps: [
    {
      question: 'Does a consistent (CP) system go down entirely during a partition?',
      answer:
        'No. The side holding a majority of replicas keeps serving reads and writes; only clients stuck on the minority side get errors or timeouts. That is why replicas go in three zones: losing or isolating one zone leaves a majority.',
    },
    {
      question: 'How would you give users read-your-writes on an eventually consistent store without quorum reads everywhere?',
      answer:
        "Return a version or write timestamp with each write and keep it in the session. Write at QUORUM, read at ONE, and if the answer is older than the session's version, retry at QUORUM, which is sure to overlap the write. Most reads stay cheap, and only the user who just wrote pays extra, only when a replica lags.",
    },
    {
      question: 'Why do deleted rows sometimes come back in Cassandra?',
      answer:
        'A replica missed the delete, and the tombstone recording it was purged on the other replicas before repair reached that replica. Repair then sees the old value with no tombstone against it and copies it back. Run repair on every node more often than `gc_grace_seconds` and do not keep a node down longer than that.',
    },
  ],
};
