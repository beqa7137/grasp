import type { CaseStudy } from './types.js';

export const MESSAGE_QUEUE: CaseStudy = {
  id: 'message-queue',
  stages: [
    {
      kind: 'requirements',
      title: 'Clarify what matters',
      prompt:
        'Hundreds of services publish events (orders, clicks, database changes) and hundreds more consume them, some in real time, some hours later, some replaying last week. Before drawing boxes, find out what the log must promise, because the promises decide the replication and the client protocol.',
      decision: {
        question: 'You have time for one question first. Which answer changes the design the most?',
        options: [
          {
            label: 'Once a message is acknowledged, may it ever be lost, and may consumers see it twice?',
            best: true,
            why: 'Durability and delivery semantics shape everything: how many replicas must have a message before the producer hears "ok", what happens when a leader dies, and whether producers need sequence numbers and transactions. A metrics pipeline that tolerates loss and a payments topic that does not are different systems.',
          },
          {
            label: 'How many messages a second, and how large?',
            why: 'You will ask it next, since it sizes brokers, disks and partitions. But the shape (partitioned, replicated logs with consumer offsets) is the same at 10,000 or 10 million messages a second.',
          },
          {
            label: 'Do consumers need every message in one global order?',
            why: 'Worth settling, but the answer is almost always "per key" once you ask what the order is for, and a single global order caps the system at one machine. It is a follow-up to the guarantees, not the first question.',
          },
          {
            label: 'Should we use Kafka or RabbitMQ?',
            why: 'The interviewer asked you to design the queue, not to pick one. Naming a product spends the first question on an answer you are expected to reason your way to.',
          },
        ],
      },
      points: [
        'Functional: producers append messages (an optional key, a value and headers) to named topics; consumers in a group share the work of a topic and each message goes to one member of each group; any number of groups read the same topic independently; consumers can rewind to an offset or a time and replay.',
        'Guarantees (from the interviewer): an acknowledged message survives the loss of any one broker; order is kept per key; delivery is at least once by default, with exactly once available to jobs that read and write the log.',
        'Scale (from the interviewer): one shared cluster takes 500 MB/s of messages on average and three times that at peak, messages average 1 KB, data is kept for 7 days, and each message is read by about 3 consumer groups.',
        'Non-functional: produce latency in single-digit to tens of milliseconds at the 99th percentile, no single point of failure, and throughput that grows by adding brokers.',
        'Out of scope unless asked: per-message routing rules and priorities (a task queue feature), delayed delivery, and cross-region replication, which comes up in the wrap-up.',
      ],
    },
    {
      kind: 'estimation',
      title: 'Estimate the disks',
      prompt:
        '500 MB/s arrives on average, every message is kept for 7 days, and each partition has 3 replicas. How much disk does the cluster need to hold its retention?',
      estimate: {
        question: 'Disk needed for 7 days of retention with 3 replicas',
        answer: 907,
        unit: 'TB',
        working: [
          'Per day: 500 MB/s x 86,400 seconds is 43,200,000 MB, about 43.2 TB.',
          'Seven days: 43.2 TB x 7 is 302.4 TB of unique data.',
          'Three replicas: 302.4 TB x 3 is 907.2 TB on disk, about 907 TB, before compression and headroom.',
        ],
      },
      points: [
        'Brokers: with 12 disks of 4 TB each (48 TB raw) kept under about 60% full for headroom and rebuilds, a broker holds about 28.8 TB. 907 / 28.8 is about 31.5, so about 32 brokers, set by disk capacity.',
        'Peak writes: 1.5 GB/s from producers plus 3 GB/s of replication (two followers copy every byte) is 4.5 GB/s written across the cluster, about 140 MB/s per broker, which spinning disks in parallel or SSDs handle easily as sequential appends.',
        'Peak reads: 3 consumer groups x 1.5 GB/s plus 3 GB/s fetched by followers is 7.5 GB/s, about 234 MB/s or 1.9 Gbit/s per broker. A 25 Gbit network card is far from full, so disk capacity, not bandwidth, sets the broker count here.',
        'Messages: 1.5 GB/s of 1 KB messages is 1.5 million messages a second at peak. Sent one at a time that is 1.5 million requests; batched about 200 to a produce request it is 7,500, which is why batching is not optional.',
        'Compression on the producer (lz4 or zstd on whole batches) often shrinks text formats such as JSON several times over, cutting disks, network and the broker count together. Measure it on real data before counting on it.',
      ],
    },
    {
      kind: 'api',
      title: 'Produce and fetch',
      prompt:
        'A producer sends messages and a consumer group works through them. Who remembers how far each consumer has read, and what happens when a consumer crashes halfway through a batch?',
      decision: {
        question: 'How does the system track consumer progress?',
        options: [
          {
            label: 'Messages stay in the log; each group commits the next offset it will read, per partition',
            best: true,
            why: 'Progress is one number per partition per group, so tracking it costs almost nothing however many messages flow. Any number of groups read the same data, a new group can start from the beginning, and replay is just resetting an offset. Retention, not consumption, deletes data.',
          },
          {
            label: 'The broker tracks an acknowledgement per message and deletes a message once it is acknowledged',
            why: 'The classic task queue model (RabbitMQ, SQS): fine for jobs where each message is worked on independently, and it allows one slow message to be retried without holding up the rest. But per-message state at 1.5 million messages a second is heavy, each extra reader needs its own copy, and nothing can be replayed.',
          },
          {
            label: 'Consumers keep their own position in their own database, and the broker knows nothing',
            why: 'Defensible for a job that stores its output and position in the same database transaction, which is a real pattern for exactly once into an external store. As the only mechanism it loses lag monitoring, and the group coordinator cannot hand a partition to a new owner at the right place.',
          },
        ],
      },
      points: [
        '`produce` sends batches grouped by partition to each partition leader, with `acks` set by the producer. The response carries the base offset of each batch, or a retryable error such as not the leader.',
        '`fetch` names a partition, an offset and a byte limit, and returns whole batches from that offset, still compressed, up to the high watermark: the first offset not yet copied to every in-sync replica.',
        'Consumer groups: members join through a group coordinator broker, which assigns partitions. A commit of the next offset per partition stores progress in an internal compacted topic, `__consumer_offsets`, so offsets get the same replication as data.',
        'Metadata: clients ask any broker for the cluster map (topics, partitions, the leader of each) and talk to leaders directly. There is no proxy in the data path, and a client refreshes the map when a leader moves.',
      ],
    },
    {
      kind: 'data',
      title: 'Store a partition as a log',
      prompt:
        'One partition receives thousands of messages a second and is read by several groups at different positions, one of them a week behind. How is it laid out on disk so that both appends and reads are cheap?',
      decision: {
        question: 'How does a broker store a partition?',
        options: [
          {
            label: 'Append-only segment files with a sparse offset index, read through the operating system page cache',
            best: true,
            why: 'Writes are sequential appends, the fastest thing a disk does. A read finds its segment by file name (its base offset), jumps near the offset through the sparse index and streams bytes. Deleting old data is deleting whole files, and recent data is served from memory without a cache of our own.',
          },
          {
            label: 'A table in an embedded key-value store such as RocksDB, keyed by offset',
            why: 'Works, and gives point lookups for free. But the log is only ever appended and scanned in order, so compaction and write amplification are cost with no benefit, and deleting a week of data becomes millions of deletes rather than a file removal.',
          },
          {
            label: 'One file per message',
            why: 'Simple to picture, but 1.5 million files a second exhausts inodes and turns every read into a file open. Batching messages into large files is the point of a log.',
          },
          {
            label: 'Keep messages in memory and snapshot them to disk periodically',
            why: 'Fast until a broker crashes and loses everything since the last snapshot, and 7 days of data is hundreds of terabytes, which no cluster keeps in RAM.',
          },
        ],
      },
      points: [
        'A partition is a directory of segments, each rolled at about 1 GB by default, named by the first offset they hold, with an offset index and a time index beside each. Only the newest segment takes writes.',
        'Producers send record batches, and the broker appends them as they arrive, still compressed, and assigns offsets. Consumers get the same bytes back, so compression costs CPU only at the two ends and saves disk and network everywhere between.',
        'Page cache: a broker with 64 GB of RAM for the page cache and 140 MB/s of writes keeps about 450 seconds of recent data in memory, so consumers within a few minutes of the head never touch the disk. A consumer a week behind reads from disk, sequentially.',
        'Ordering is per partition: offsets are assigned in append order, and a key always hashes to the same partition, so all events for one order or one user stay in order. There is no order across partitions.',
        'Retention deletes whole segments older than the limit (7 days by default in Kafka) or beyond a size cap. Compacted topics instead keep the latest value per key: a cleaner rewrites old segments without superseded values, and a null value (a tombstone) deletes a key after a grace period.',
      ],
    },
    {
      kind: 'design',
      title: 'Put it together',
      prompt:
        'Trace a message from a producer to three consumer groups. Where is it batched, where is it replicated, when is it acknowledged, and who decides which consumer reads it?',
      lab: true,
      points: [
        'Producers pick a partition (a hash of the key, or a sticky partition for keyless messages to fill batches), buffer records per partition for a few milliseconds (`linger.ms`) up to a batch size, compress, and send one request per broker with the batches it leads.',
        'The partition leader appends the batch to its log. Followers fetch from the leader like consumers do and append the same bytes. When every in-sync replica has the batch, the high watermark advances and, with `acks=all`, the producer gets its answer.',
        'Consumers in a group each own some partitions, fetch from their leaders in large reads, process, and commit offsets. More consumers than partitions leaves the extra ones idle, so partitions cap the parallelism of a group.',
        'A controller quorum (Raft in Kafka since KRaft; ZooKeeper before) stores cluster metadata: topics, partition leaders, the in-sync replica sets. It picks a new leader when a broker dies and tells the brokers.',
        'Open the build in the Lab: 37,500 requests a second at peak, 7,500 produce requests (1.5 million messages in batches of 200) and 30,000 fetches. The Lab has no log component, so read it as an analogy: the load balancer stands for the routing clients do from metadata, the app tier for the request handlers on the brokers, the cache for the page cache, the database shards for partition leaders and the replicas for followers. Lower the cache hit rate to see what lagging consumers cost the disks.',
      ],
    },
    {
      kind: 'deep-dive',
      title: 'Replicate without losing acknowledged messages',
      prompt:
        'A broker holding the leader of a partition loses power just after a producer was told "ok". What must already be true for that message to survive, and what stops a stale replica from becoming leader?',
      decision: {
        question: 'Which durability settings do you choose for important topics?',
        options: [
          {
            label: 'Replication factor 3, `acks=all` and `min.insync.replicas=2`',
            best: true,
            why: 'A write is acknowledged only once at least two replicas have it, so any single broker can die without losing an acknowledged message. If only one replica is left in sync the partition refuses writes rather than accepting ones a single failure could lose, and one slow follower drops out of the in-sync set instead of stalling everyone.',
          },
          {
            label: '`acks=1`: the leader acknowledges as soon as it has appended',
            why: 'Lower latency, and fine for data you can afford to lose such as metrics. But if the leader dies before a follower copied the batch, a follower becomes leader without it and the acknowledged message is gone.',
          },
          {
            label: '`acks=all` with `min.insync.replicas=1`',
            why: 'Looks safe, since the producer asked for all. But when both followers fall out of sync, "all" means the leader alone, and losing that one disk loses acknowledged data. The minimum is what gives acks=all its meaning.',
          },
          {
            label: 'Wait for all 3 replicas every time, whether in sync or not',
            why: 'Durable, but one slow or dead follower stalls every write to its partitions until an operator steps in. The in-sync set exists so a lagging replica can be dropped and caught up later.',
          },
        ],
      },
      points: [
        'The in-sync replica set (ISR) holds the leader and every follower that has caught up recently: a follower that has not caught up within `replica.lag.time.max.ms` (30 seconds by default) is removed, and rejoins once it catches up.',
        'Only an in-sync replica may become leader, so the new leader has every acknowledged message. Unclean leader election (off by default) lets an out-of-sync replica lead to restore availability, at the cost of losing messages.',
        'Leader epochs: each new leader starts a new epoch, and a returning replica truncates any entries past the point where its epoch diverged, so it never keeps writes the new leader does not have.',
        'Durability comes from replication, not fsync: brokers write to the page cache and let the OS flush. Three copies on three machines, ideally in three racks or zones, survive a power loss better than one fsynced disk.',
        'Spread leaders evenly across brokers and place replicas across racks. After a broker returns, move leadership back to the preferred replicas so load stays balanced.',
      ],
    },
    {
      kind: 'deep-dive',
      title: 'Delivery semantics and rebalancing',
      prompt:
        'A stream job reads payments from one topic, computes fees and writes them to another. It crashes after writing some fees but before committing its offsets. How do you make each payment produce exactly one fee?',
      decision: {
        question: 'How does the job get exactly-once results?',
        options: [
          {
            label: 'Transactions: write the fees and commit the input offsets in one transaction; downstream reads with `read_committed`',
            best: true,
            why: 'The output and the progress commit together or not at all. After a crash the aborted fees are never shown to `read_committed` readers, and the job resumes from the last committed offsets. Fencing by transactional ID stops a zombie copy of the job from committing too.',
          },
          {
            label: 'An idempotent producer alone',
            why: 'Needed, and on by default in recent Kafka clients: the producer ID and a sequence number per partition let the broker drop duplicate batches from retries. But it covers one producer session only. After the crash the job reprocesses from old offsets and writes the fees again as new messages.',
          },
          {
            label: 'Commit offsets before processing',
            why: 'That is at most once: nothing is written twice, but a crash after the commit and before the write loses those fees for good. Acceptable for sampling or metrics, not for money.',
          },
          {
            label: 'Deduplicate in the consumers of the fee topic by payment ID',
            why: 'Defensible, and the right tool when the output leaves the log for an external database, where an idempotent upsert keyed by payment ID is exactly once in effect. Inside the log it pushes the problem onto every downstream reader.',
          },
        ],
      },
      points: [
        'Three semantics: at most once commits before processing; at least once commits after, so a crash means reprocessing and duplicates; exactly once needs idempotent writes plus atomic commit of output and offsets, which transactions give when both live in the log.',
        'Order under retries: with idempotence on, a producer can keep up to 5 requests in flight per connection and still keep order, because the broker rejects a batch whose sequence number skips ahead.',
        'Rebalancing: when a consumer joins, leaves or misses heartbeats, the coordinator moves partitions. The old protocol stopped the whole group; cooperative rebalancing moves only the partitions that change owner, and static membership lets a restarting consumer keep its partitions without a rebalance.',
        'A consumer that takes longer than `max.poll.interval.ms` between polls is considered dead and its partitions move, often to a consumer that then also times out. Keep processing per poll short, or pause partitions while slow work runs.',
        'Partition count: if one consumer handles 10 MB/s and a topic peaks at 300 MB/s, it needs at least 30 partitions, with room to grow. Adding partitions later changes which partition a key hashes to, so ordering by key breaks across the change: plan for growth up front.',
      ],
    },
    {
      kind: 'wrap-up',
      title: 'Close the loop',
      prompt: 'You have five minutes left. What would you raise before the interviewer does?',
      points: [
        'Tiered storage: keep recent segments on local disks and move older ones to object storage. Long retention stops setting the broker count, and a replaced broker has far less to copy.',
        'Multi-region: run a cluster per region and mirror topics between them asynchronously (MirrorMaker 2 or a managed equivalent). Offsets differ between clusters, so failover needs offset translation, and a few seconds of messages can be lost or duplicated.',
        'Quotas: a shared cluster needs produce and fetch byte-rate limits per client, or one runaway producer or a replaying consumer starves every other team.',
        'Monitoring: consumer lag per group and partition, under-replicated and offline partitions, produce and fetch latency p99, disk usage against retention, ISR shrink and expand rates, and controller elections.',
      ],
    },
  ],
  pitfalls: [
    'Promising a total order across a topic, which forces one partition and caps the system at one machine, instead of order per key.',
    'Setting `acks=all` but leaving `min.insync.replicas` at 1, so a leader alone can acknowledge and then lose the message.',
    'Claiming exactly once end to end from an idempotent producer alone, without transactions or idempotent writes at the sink.',
    'Sizing partitions only for today, then adding partitions later and breaking the order of keys that move.',
    'Sending messages one at a time, so request overhead rather than bytes caps the throughput.',
  ],
  followUps: [
    {
      question: 'One key (a huge customer) produces a third of the traffic of a topic. What do you do?',
      answer:
        'Its partition becomes the bottleneck for both the broker and the one consumer that owns it. If that key needs order only per sub-entity (per account of the customer, say), key by the sub-entity instead. Otherwise salt the key into a few sub-keys and accept order per sub-key, or give that customer its own topic with more partitions.',
    },
    {
      question: 'A bug in a consumer corrupted a database from yesterday at 14:00. How do you recover?',
      answer:
        'Fix the consumer, restore or clean the affected rows, then reset the group offsets to 14:00 (a lookup in the time index finds the offset per partition) and replay. This only works because the log still holds the data within retention, and it is safe only if the consumer writes idempotently.',
    },
    {
      question: 'How would you build a delayed queue (deliver this message in 30 minutes) on top of the log?',
      answer:
        'A log delivers in offset order, so it cannot skip a message that is not due. Use a few delay topics (1 minute, 5 minutes, 30 minutes): a consumer on each waits until the head message is due, then republishes it to the target topic. Every message in a delay topic has the same delay, so the head is always the first due.',
    },
  ],
};
