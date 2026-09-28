import type { SdLesson } from './types.js';

export const STORAGE_LESSON: SdLesson = {
  why: 'Under every database sits a storage engine that decides how a write reaches disk and how a read finds it again, and the two families make opposite bets. A B-tree updates pages in place and keeps reads cheap and predictable; an LSM tree turns writes into sequential appends and pays later in background compaction. Interviewers probe whether you can say what each costs in disk writes, reads and space for a given workload, and why an ingest pipeline that crawls on Postgres flies on Cassandra, or the other way round for a read-heavy service.',
  widget: {
    kind: 'storage-engine',
    tryThis: [
      'Keep the defaults: 100 GB of 100-byte records, 10 MB/s of new data, 4 KB pages, size ratio 10, bloom filters on. The B-tree has 5 levels and a write amplification of about 42 (a whole 4 KB page plus its log record for each 100-byte update), so 10 MB/s of data becomes about 420 MB/s of disk writes. The LSM tree has 4 levels, amplification 24 and 240 MB/s. Both need one disk read per lookup. Raise the record size to 1,000 bytes: the B-tree drops to about 5 and 51 MB/s while the LSM stays at 24, since its cost does not depend on record size. At 200 bytes the B-tree is already slightly cheaper, about 21.5.',
      'Back at 100-byte records, set the page size to 16 KB: the B-tree gets shorter, 4 levels, because each page holds more child pointers, but every small update now rewrites 16 KB, so amplification jumps to about 165 and disk writes to about 1,650 MB/s. Return to 4 KB and slide the data size from 10 GB to 1,000 GB: the B-tree grows from 4 to 5 levels and its amplification does not move, while the LSM grows from 3 to 5 levels and from 18.5 to 29.5, since every extra level is another rewrite.',
      'Back to the defaults, turn bloom filters off: an LSM lookup now costs 5 disk reads instead of 1, and the B-tree is unchanged. Turn them back on and slide the size ratio to 5: amplification falls from 24 to 17 with 5 levels. At 4 it is still 17 but with 6 levels; at 20 there are only 3 levels and amplification rises to 33.5. The model is rough: it assumes each B-tree update writes its page back alone, where a real buffer pool often absorbs several updates to a hot page first, and it treats the upper levels of both engines as cached.',
    ],
  },
  concepts: [
    {
      title: 'What a storage engine does',
      body: 'The engine is the layer under the query planner that stores keys and values in files, finds them again, and makes each committed write survive a crash. The same database can swap engines: MySQL runs InnoDB (a B-tree) or MyRocks (an LSM tree on RocksDB), and MongoDB runs WiredTiger. The engine decides the physical costs a design pays: how many bytes hit disk per byte written, how many disk reads a lookup takes, and how much disk the data occupies beyond its live size.',
    },
    {
      title: 'B-trees: pages updated in place',
      body: 'A B-tree stores sorted keys in fixed-size pages (8 KB in Postgres, 16 KB in InnoDB), each interior page pointing to hundreds of children, so even a large table is only 3 to 5 levels deep. The upper levels are small and stay in memory, so a lookup costs about one disk read, and range scans walk neighboring leaves in order. An update changes its page in the buffer pool, appends a record to the write-ahead log (WAL) so a crash can replay it, and writes the whole page back later. A full page splits in two, so pages under random inserts sit around 70% full. Reads and latency are predictable; the cost is rewriting a whole page for a small change at a random position.',
    },
    {
      title: 'LSM trees: memtable, SSTables, compaction',
      body: 'A log-structured merge tree appends each write to a WAL and inserts it into a sorted in-memory table, the memtable. When the memtable fills (64 MB by default in RocksDB) it is flushed as an immutable sorted file, an SSTable, and compaction later merges files into larger levels, keeping the newest version of each key. Leveled compaction keeps one sorted run per level, each level about ratio times larger than the one above (10 by default in RocksDB). Moving data down a level rewrites the overlapping part of the level below, several times the data moved, which the widget models as about (ratio + 1) / 2 rewrites per level. Tiered compaction (size-tiered in Cassandra, universal in RocksDB) waits until several runs of similar size exist and merges them together: fewer rewrites, but more runs to check on a read and more temporary space. All disk writes are large and sequential, which suits both SSDs and spinning disks.',
    },
    {
      title: 'Write, read and space amplification',
      body: 'Write amplification is bytes written to disk per byte of new data; read amplification is disk reads per lookup; space amplification is bytes on disk per byte of live data. The RUM conjecture says an access method can minimize at most two of Read, Update and Memory (space) overheads. A B-tree has low read cost, moderate space (pages about 70% full) and high write cost for small random updates, roughly page size divided by record size. A leveled LSM tree writes less for small records, wastes about 10% of space at ratio 10 because the last level holds about 90% of the data, and needs bloom filters to keep reads cheap. Tiered compaction writes least and pays in reads and space. Write amplification also wears out flash: every byte counts against a drive rated in drive writes per day.',
    },
    {
      title: 'Bloom filters: point lookups, not ranges',
      body: 'Without help, an LSM lookup for a missing or old key checks the memtable and then every level on disk. A bloom filter per SSTable, kept in memory, answers "definitely not here" or "maybe here", so the engine reads only files that might hold the key: about one disk read per lookup. About 10 bits per key gives roughly a 1% false positive rate, so a billion keys cost about 1.25 GB of memory. A filter over whole keys cannot answer "is any key between a and b here", so a range scan still opens a run in every level and merges them; prefix bloom filters help only scans within one key prefix.',
    },
    {
      title: 'Deletes and tombstones',
      body: 'An LSM tree cannot erase a key in an immutable file, so a delete writes a tombstone: a marker that hides older versions. Both the tombstone and the value it hides take space until compaction carries the tombstone down to the last level, where it can be dropped. Until then, scans read past every tombstone, which is why using Cassandra as a queue (insert, read, delete) slows down, and why Cassandra warns at 1,000 tombstones in one read and aborts at 100,000 by default. Time-series data should expire by dropping whole files or partitions, not row by row. B-trees delete in place, but not free either: Postgres marks the row dead and `VACUUM` reclaims it later.',
    },
    {
      title: 'Choosing an engine for a workload',
      body: 'Pick a B-tree engine (Postgres, MySQL InnoDB, SQLite) for read-heavy work, transactions, rich secondary indexes and range queries that need steady latency. Pick an LSM engine (RocksDB, Cassandra, ScyllaDB, HBase; CockroachDB and TiKV sit on LSM engines too) for write-heavy ingest of small records, large datasets where compressed immutable files save space, and mostly point lookups. The LSM price is background compaction: it competes with foreground I/O, causes latency spikes, and if it falls behind, files pile up in the first level and RocksDB throttles and then stops writes until it catches up.',
    },
  ],
  examples: [
    {
      title: 'Size disk bandwidth for a metrics store',
      problem:
        'A metrics service ingests 20 MB/s of new points, about 100 bytes each, and keeps 1,000 GB on each node. Its NVMe drives sustain about 1,000 MB/s of writes and are rated for one full drive write per day on a 7.68 TB drive. How much disk write bandwidth does a B-tree need, how much does a leveled LSM tree need, and what would you actually build?',
      insight:
        'Multiply new data by write amplification before comparing to the drive, then check both bandwidth and endurance: time-ordered data that is never updated needs neither per-level rewrites nor random page writes.',
      steps: [
        'B-tree with 4 KB pages: each 100-byte update rewrites a 4 KB page plus a log record, 4,096 / 100 + 1, about 42 times the data. 20 MB/s times 42 is about 840 MB/s: most of the drive, with nothing left for reads or checkpoints.',
        'Leveled LSM at ratio 10 with a 64 MB memtable: 1,000 GB / 64 MB is about 16,000, which needs 5 levels of ratio 10. Log and flush cost 2, each level about (10 + 1) / 2 = 5.5, so 2 + 5 times 5.5 = 29.5, and 20 MB/s becomes 590 MB/s. Compaction also reads roughly what it writes.',
        'Endurance: 590 MB/s for 86,400 seconds is about 51 TB a day, against a rating of 7.68 TB a day. A five-year rating is about 14,000 TB written, so the drive would use it up in about nine months.',
        'Metrics arrive in time order and are not updated. Time-window compaction (Cassandra TWCS, or one table per day) merges files only within their window, so each point is written a few times instead of once per level; if that averages about 4, 20 MB/s is 80 MB/s, about 6.9 TB a day, just inside the rating.',
        'Retention becomes cheap too: when a window expires, the engine drops its files whole instead of writing a tombstone per point and compacting them away.',
      ],
    },
    {
      title: 'A B-tree index slows ingest',
      problem:
        'A Postgres events table takes 5,000 inserts a second of 200-byte rows. Besides the primary key, a random UUIDv4, it has three secondary indexes, one of which no query uses. Each index is about 40 GB and the server caches about 32 GB. Ingest was fine at launch and now falls behind. Why, and what fixes it?',
      insight:
        'Appending to the table is cheap; each index on a random key turns every insert into a random page read and a random page write once the index outgrows memory.',
      steps: [
        'The heap takes new rows on its last page, which stays cached: 5,000 rows of 200 bytes is 1 MB/s, and with 8 KB pages about 40 rows fill each page, about 125 page writes a second.',
        'The primary key and three indexes, four in all, each put the new entry at a random leaf. With 160 GB of index and 32 GB of cache, most leaves are not in memory: up to 4 times 5,000 = 20,000 random reads a second, on a volume that may be provisioned for 10,000 IOPS.',
        'Each dirtied leaf is later written back as a whole 8 KB page. In the worst case, one page per entry, that is 20,000 times 8 KB, about 160 MB/s for 1 MB/s of rows, and after every checkpoint the first change to each page also copies the full page into the WAL.',
        'Drop the unused index (its scan count stays at zero in `pg_stat_user_indexes`), and switch the primary key to a time-ordered one, a bigint identity or UUIDv7: new keys then land on the rightmost leaf, which stays cached and fills in order. Two random indexes remain, halving the random I/O.',
        'Partition by day: at 432 million rows a day, each partition has its own smaller indexes, the current one stays mostly in cache, and old days are dropped as partitions instead of deleted row by row. If ingest still dominates, move raw events to an LSM store and keep Postgres for the queried aggregates.',
      ],
    },
    {
      title: 'Compaction falls behind',
      problem:
        'A RocksDB-backed service holds 100 GB of 100-byte values and takes 10 MB/s of new writes on a cloud volume capped at 250 MB/s of throughput. Under load, level 0 files pile up and RocksDB stalls writes. Leveled compaction runs at ratio 10. What are the options, and what does each cost?',
      insight: 'Every byte of compaction you save is paid for in reads, space or money; pick the cost the workload can afford.',
      steps: [
        '100 GB / 64 MB is 1,600 memtables, which needs 4 levels at ratio 10. Write amplification is 2 + 4 times 5.5 = 24, so 10 MB/s becomes 240 MB/s of writes, 96% of the cap before compaction reads anything. Compaction cannot keep up.',
        'Lower the ratio to 5: 5 levels of 3 rewrites each, 2 + 15 = 17, so 170 MB/s. That leaves room only if compaction reads mostly come from cache; if reads count against the same cap, even ratio 5 needs more throughput or tiered compaction. Going to 4 buys nothing here: 6 levels of 2.5 is still 17. Going up to 20 makes it worse: 3 levels of 10.5 is 33.5.',
        'The price of ratio 5: the last level now holds about 80% of the data instead of 90%, so space overhead in the worst case rises from about 11% to about 25%, and a range scan merges one more level. Point lookups stay at about one read thanks to bloom filters.',
        'Tiered (universal) compaction would cut rewrites further, but a full merge can briefly need about twice the data size on disk, and reads check more runs. A compaction rate limiter only smooths bursts: it cannot lower the total, and if it throttles below the steady rate, stalls come back.',
        'Compare with simply buying bandwidth: if the volume can be provisioned higher for a modest cost, that keeps the read path and space unchanged. Tune the ratio when space is cheap and throughput is not; buy throughput when reads matter most.',
      ],
    },
  ],
  pitfalls: [
    'Benchmarking an LSM store for a few minutes on an empty database: compaction debt appears only once data reaches the lower levels, so sustained throughput is lower and write stalls show up hours later.',
    'Using random keys such as UUIDv4 as the primary key of a high-ingest B-tree table: every insert hits a random leaf, and once the index outgrows memory each one costs a random read and a page write.',
    'Building a queue or a delete-heavy table on Cassandra or another LSM store: tombstones pile up until compaction reaches them, and reads slow down scanning past them.',
    'Sizing disks by live data alone: an LSM tree needs space for obsolete versions and for compaction output, up to about double the data with size-tiered compaction, and a B-tree carries partly empty pages and dead rows.',
  ],
  followUps: [
    {
      question: 'Why are B-tree read latencies more predictable than in an LSM tree?',
      answer:
        'A B-tree lookup follows one path of fixed length, and the work behind a write happens right away. An LSM lookup may read several levels on a bloom false positive or a range scan, and compaction runs in the background competing for the same disk, so p99 latency spikes when a large merge runs or compaction falls behind.',
    },
    {
      question: 'How would you delete a year of old data from a 10 TB table cheaply?',
      answer:
        'Avoid row-by-row deletes: in an LSM store they write billions of tombstones, and in Postgres they leave dead rows for vacuum and bloat the indexes. Partition by time and drop whole partitions (Postgres), or use time-window compaction with a TTL (Cassandra) so expired files are removed whole. Design this in at the start: repartitioning 10 TB later is itself a large migration.',
    },
    {
      question: 'Both engines write a log before anything else. Why, and what does it cost?',
      answer:
        'The WAL makes a commit durable with one sequential append and `fsync`, before the page or memtable reaches its final place on disk; after a crash the engine replays the log. It adds one write of every change, which is why the model counts it in both engines. Group commit batches the fsyncs of many transactions into one, so the cost per commit stays low under load.',
    },
  ],
};
