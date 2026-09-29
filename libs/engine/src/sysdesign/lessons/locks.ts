import type { SdLesson } from './types.js';

export const LOCKS_LESSON: SdLesson = {
  why: 'A distributed lock looks like a mutex, but it cannot behave like one: the lock service cannot tell a dead holder from a slow one, so every lock has to expire, and a holder that stalls past the expiry keeps running while someone else holds the lock. Two writers then overwrite each other, often silently and only under load. Interviewers use locks to test whether you know what a lease really guarantees, where the fencing check belongs, and when you can avoid the lock altogether.',
  widget: {
    kind: 'lease',
    tryThis: [
      'Set a TTL of 10 s, renew every 3 s and a pause of 5 s at 20 s, fencing off: the last renewal was at 18 s, so the lease runs to 28 s and the client wakes at 25 s still holding it. Raise the pause to 15 s: the lease expires at 28 s, the waiting client takes the lock, and at 35 s the paused one wakes and writes anyway. The store accepts that stale write. Turn fencing on: the store rejects it.',
      'Keep TTL 10 s and renew 3 s and choose a crash: the lock sits unheld for 8 s, until the lease runs out, at 20 renewals a minute. Now set TTL 30 s and renew 10 s: renewals drop to 6 a minute and the 15 s pause no longer loses the lock (the lease runs to 50 s), but a crash now leaves the lock unheld for 30 s. A longer TTL trades failover time for tolerance of pauses.',
      'Push the other way with TTL 2 s and renew 1 s: a crash costs only 2 s, but renewals rise to 60 a minute and a 3 s pause loses the lock (it expires at 22 s, the client wakes at 23 s). Then go back to TTL 30 s, renew 10 s, and pause 40 s: the lease still runs out, at 50 s, before the wake at 60 s. No TTL covers every pause; only fencing makes the late write harmless.',
    ],
  },
  concepts: [
    {
      title: 'Why a lock needs a lease',
      body: 'If a lock lasted until its holder released it, a crashed holder, or one cut off by a partition, would hold it forever. So the lock service grants a lease: the lock is yours for a TTL, you renew it while you work, and if renewals stop it expires and the next client gets it. The cost is that the lease expires on the service clock, not in the holder: the holder only believes it still holds the lock, and nothing stops it acting on that belief after the lease is gone.',
    },
    {
      title: 'Choosing the TTL',
      body: 'A short TTL means fast failover: after a crash, others wait at most one TTL. It also means false expiry: any stall longer than what is left of the lease loses the lock, and renewals must be frequent. A long TTL tolerates pauses and cuts renew traffic but leaves work stalled for the full TTL after a crash. Renew at about a third of the TTL (the etcd client sends keepalives at that rate), so one missed renewal is survivable; right after a renewal the lease has almost the full TTL left, and just before the next one it has the TTL minus the renew interval.',
    },
    {
      title: 'Pauses and clocks',
      body: 'A process can stop for seconds without knowing it: a stop-the-world garbage collection, a VM paused by its hypervisor or live-migrated, a page fault that waits on swap or a slow disk, a `SIGSTOP`. A request can also sit in a network queue and arrive after the lease is gone. Clocks add more: the holder measures its lease locally, so if its clock runs slow or a wall clock is stepped back by NTP, it thinks it has time it does not. Measure lease time with a monotonic clock and treat the lease as ending a margin before the TTL, but a pause between checking the lease and writing defeats any such check.',
    },
    {
      title: 'Fencing tokens',
      body: 'The fix does not live in the holder; it lives in the resource. Each time the lock service grants the lock it returns a token that strictly increases: 33, then 34 for the next holder. The client sends its token with every write, and the storage layer remembers the largest token it has seen and rejects any write with a smaller one. A holder that wakes late with 33 after 34 has written is refused, however long it slept. This needs a store that can do the check atomically, such as a conditional write on a token column. Google Chubby calls these sequencers; HDFS uses epoch numbers the same way to fence an old NameNode.',
    },
    {
      title: 'Consensus-backed lock services versus a single Redis',
      body: "ZooKeeper and etcd replicate every change through a majority, so a granted lock survives the loss of a minority of nodes. In ZooKeeper each contender creates an ephemeral sequential node under the lock path; the lowest sequence number holds the lock, each other contender watches only the node just before it, and the node is deleted when its client's session ends or expires. The node's creation `zxid` rises with every change, so it serves as a fencing token. In etcd a lock key is attached to a lease with a TTL and deleted when the lease expires, and every write gets a cluster-wide revision number that works as a token. A single Redis instance with `SET ... NX PX 30000` is simple and fast, but it is one point of failure, its replication is asynchronous (a failover can drop a granted lock, letting a second client take it), and it hands out no monotonic token.",
    },
    {
      title: 'The Redlock debate',
      body: 'Redlock takes the lock on a majority of independent Redis primaries (say 3 of 5) and counts it valid for the TTL minus the time acquiring took and an allowance for clock drift. Martin Kleppmann argued that its safety rests on timing assumptions: bounded network delay, bounded pauses and clocks that do not jump, so a pause or a clock step on one node can let two clients hold it, and it provides no fencing token. Salvatore Sanfilippo, the author of Redis, replied that Redlock needs clocks that advance at about the same rate, not synchronized ones, which careful operation (no clock steps) provides, and that a long pause or a delayed request threatens every lock service, not only Redlock. The fair summary: Redlock is fine where an occasional double holder is tolerable; where it is not, you need fencing at the resource whichever lock service you use, and then a consensus store that issues tokens is the natural choice.',
    },
    {
      title: 'Efficiency locks, correctness locks, and no locks',
      body: 'An efficiency lock stops duplicate work, such as two instances sending the same daily report; a rare double run wastes effort, so a single Redis lock is fine. A correctness lock stops corruption, such as two writers of one file; it needs a consensus store and fencing. Better still, avoid the lock: make the write idempotent (a request id with a unique constraint), use a conditional write or compare-and-set (`WHERE version = 7`, a DynamoDB condition expression), or give each partition a single writer. Leader election is a lock too: the leader holds a lease, and must fence its writes with its term or epoch, as Kafka brokers do when they reject requests from a stale controller by its epoch.',
    },
  ],
  examples: [
    {
      title: 'Pick a TTL for 500 shard owners',
      problem:
        'Each of 500 workers owns one shard through an etcd lease. Measured garbage collection pauses reach 9 s in the worst full collection. The team wants a crashed shard picked up within 30 s. Compare TTL 6 s renewed every 2 s against TTL 30 s renewed every 10 s.',
      insight:
        'Size the TTL against the longest pause you must survive, measured from the worst moment (just before a renewal), and check the crash gap and renew load it implies.',
      steps: [
        'TTL 6 s, renew 2 s: just before a renewal, 6 - 2 = 4 s of lease is left, so the 9 s pause loses the shard. A crash is picked up within 6 s. Renewals: 500 / 2 = 250 a second.',
        'TTL 30 s, renew 10 s: in the worst case 30 - 10 = 20 s is left, which covers the 9 s pause with 11 s to spare. A crash leaves the shard idle for up to 30 s, which just meets the target. Renewals: 500 / 10 = 50 a second.',
        'Both renew loads are modest for etcd, so the deciding factors are the pause and the crash gap: pick TTL 30 s, renew 10 s.',
        'A pause longer than 20 s still loses the lease while the worker keeps running, so writes to the shard carry the lease revision as a fencing token and the store rejects older ones.',
        'Tune the collector as well (smaller heaps or a low-pause collector): a shorter worst pause lets you shorten the TTL and the crash gap with it.',
      ],
    },
    {
      title: 'The stale write, with and without a fencing token',
      problem:
        'Client A holds a lock with TTL 10 s and renews every 3 s; it last renewed at 18 s and then pauses in a garbage collection from 20 s to 35 s. Client B is waiting. Both write the same record in a store. Walk through the timeline.',
      insight: 'The lease protects the lock service, not the data: only a check at the store stops the writer that lost the lock.',
      steps: [
        "The last renewal at 18 s makes A's lease run to 18 + 10 = 28 s. A is frozen, so no renewal goes out at 21 s.",
        'At 28 s the lease expires and B takes the lock. With fencing, A was given token 33 when it took the lock, and B now gets 34. B writes at 29 s.',
        'At 35 s A wakes 7 s after losing the lock. From inside A nothing happened, so it finishes its write, which may be computed from data it read before the pause.',
        "Without fencing the store accepts A's write and B's update is lost, though both clients followed the protocol.",
        'With fencing the store has seen 34, so the write with 33 is rejected; A learns it lost the lock and must reacquire and redo its read-modify-write.',
      ],
    },
    {
      title: 'Leader election for a controller',
      problem:
        'Three replicas of a controller elect a leader through a Kubernetes Lease, with the common defaults: lease duration 15 s, renew deadline 10 s, retry period 2 s. How long can the controller go without a leader after the leader crashes, and how can two leaders act at once?',
      insight: 'Election is a lease on a lock: the same crash gap, and the same need to fence a leader that has not yet noticed it lost.',
      steps: [
        'The leader renews every 2 s. A standby treats the lease as expired 15 s after it last saw the record change, and it retries every 2 s plus some jitter, so after a crash the controller is leaderless for 15 s plus a retry period or two: about 15 to 20 s.',
        'A leader that cannot renew for 10 s, the renew deadline, steps down on its own at least 5 s before a standby may take over, so a leader cut off from the API server normally stops first.',
        'A leader paused for 20 s cannot step down: it wakes after the lease has passed to a standby and may act on stale state for a moment before its next failed renewal.',
        "So make the controller's actions safe to repeat, or send each update with the object's `resourceVersion`, which the API server checks: an update from the old leader based on stale state fails with a conflict, and its next failed renewal makes it step down.",
      ],
    },
  ],
  pitfalls: [
    'Checking that the lock is still held and then writing: a pause between the check and the write is exactly the case that breaks, so the check must happen at the store, atomically with the write.',
    'Releasing a lock with a plain `DEL`: if your lease expired and another client took the lock, you delete theirs. Store a unique value and delete only if it still matches, in one atomic script.',
    'Using a single Redis lock, or Redlock, for a correctness lock without fencing: a failover or a long pause produces two holders.',
    'Setting the TTL shorter than real pauses to get fast failover, then losing locks under every full garbage collection or VM stall.',
  ],
  followUps: [
    {
      question: 'The store cannot check a fencing token. What then?',
      answer:
        'Make the write safe on its own: an idempotent write keyed by a request id, or a compare-and-set on a version the store already keeps. If neither is possible, the lock can only be an efficiency lock: keep the TTL well above measured pauses, keep work under the lock short, stop working once the lease is near its end, and accept that a rare overlap can happen.',
    },
    {
      question: 'Why does the fencing token have to come from the lock service?',
      answer:
        'Tokens must be ordered the same way the lock was granted, across every holder. A consensus store gives that for free: the ZooKeeper `zxid` and the etcd revision increase with every change. A counter generated by the clients, or a timestamp from their clocks, can repeat or go backward, and a random unique value can only tell holders apart, not tell the store which one is newer.',
    },
    {
      question: 'How do you avoid a lock for a job that must run once a day across ten instances?',
      answer:
        'Record the run itself: insert a row keyed by the job name and date with a unique constraint, and only the instance whose insert succeeds runs the job. Make the job idempotent or checkpoint its progress, so a retry after a crash does not repeat side effects. Alternatively run one scheduler and give each partition of the work a single owner.',
    },
  ],
};
