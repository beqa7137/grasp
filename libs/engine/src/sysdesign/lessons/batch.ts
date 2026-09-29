import type { SdLesson } from './types.js';

export const BATCH_LESSON: SdLesson = {
  why: "Billing, recommendations, search indexes, analytics tables and model training all run on batch jobs that read terabytes, reshuffle them by key and write new datasets every night. They fail in predictable ways: one hot key keeps a single reducer busy for an hour while hundreds sit idle, a rerun after a crash appends its output a second time, and a backfill over last quarter quietly uses today's exchange rates. Interviewers probe whether you can estimate where the time goes, name the fix for skew, and make every run safe to repeat.",
  widget: {
    kind: 'batch-job',
    tryThis: [
      'Keep the defaults: 1,000 GB on 50 workers with 50 reducers. The model gives every machine 100 MB/s, so the map phase reads at 5 GB/s and takes 200 s, map output is half the input, and the 500 GB shuffle takes 100 s. Each reducer gets 10 GB and needs 100 s, for 400 s in all, about 6.7 minutes. Slide the workers to 100: map and shuffle halve to 100 s and 50 s and the total drops to 250 s, but the reduce phase is untouched. Back at 50 workers, raise the reducers to 200: each gets only 2.5 GB, but just 50 run at once, so they run in 4 waves and the reduce still takes 100 s. Now set 200 workers and 200 reducers: 50 s, 25 s and 25 s, 100 s in all. Drop the reducers to 1: that one reducer gets all 500 GB and needs 5,000 s, over 80 minutes.',
      "Back at the defaults, slide the hot key to 10%: the busiest reducer now gets the hot key's 50 GB plus its 9 GB share of the rest, 59 GB, and the reduce phase takes 590 s, so the job takes 890 s instead of 400 s. Raise the reducers to 200: the busiest one still gets 52.3 GB and needs about 523 s, because every record of one key goes to the same reducer, however many there are. Slide the hot key to 50%: 255 GB on one reducer, 2,550 s, and 2,850 s in all while 49 reducers finish in under a minute. Only a combiner or splitting the key (salting) helps; the widget models the combiner, not salting.",
      'Back at the defaults, turn the combiner on: each mapper pre-aggregates its own output, the shuffle shrinks from 500 GB to 50 GB and takes 10 s, each reducer gets 1 GB, and the job takes 220 s, 200 of them in the map phase. With the combiner on and a 10% hot key, the busiest reducer gets 5.9 GB and the job takes 269 s instead of 890 s. The model shrinks every key tenfold; for a sum or a count, a real combiner collapses a hot key to one record per map task, so it removes that skew almost entirely. It cannot help a function that must see every value, such as an exact median.',
    ],
  },
  concepts: [
    {
      title: 'MapReduce: map, shuffle, reduce',
      body: "The input is split into chunks, typically one 128 MB HDFS block or file part each, and a map task per chunk turns records into key-value pairs, such as (url, 1) for every log line. The shuffle partitions map output by key, by default `hash(key) mod R` for R reducers, sorts each partition and spills it to the mapper's local disk; each reducer then pulls its partition from every mapper, which makes the shuffle an all-to-all transfer across the network. A reducer sees each key with all its values and writes the result. A combiner is a reduce run on each mapper's output before the shuffle; it is valid when the function is associative and commutative (sum, count, max, or an average carried as a sum and count pair), and it can shrink the shuffle by orders of magnitude. Because inputs are immutable and tasks are deterministic, a failed or slow task is simply run again elsewhere (speculative execution runs a backup copy of a straggler).",
    },
    {
      title: 'Data skew and hot keys',
      body: 'A job finishes when its slowest task does, and with hash partitioning every record of a key lands on one reducer. One key with a fifth of the records (a home page, a bot account, a null user id) keeps one reducer busy long after the others finish, and adding reducers does not split it. For aggregations, use a combiner or two-stage aggregation: salt the key with a random suffix from 0 to N-1, aggregate by the salted key, then strip the salt and aggregate the N partial results. For joins, split the hot keys out: salt their rows on the big side and replicate the matching rows of the small side N times, or send the hot keys through a broadcast join. Find hot keys by counting keys on a sample first. Spark 3 adaptive query execution detects oversized shuffle partitions in a join and splits them automatically.',
    },
    {
      title: 'Spark: why it keeps data in memory',
      body: 'Classic MapReduce is one map and one reduce per job, and a pipeline of ten jobs writes every intermediate result to replicated HDFS and reads it back. Spark plans the whole pipeline as a DAG of stages: narrow transformations (map, filter, union) are pipelined record by record in memory within a stage, and only wide ones that need records from many partitions (groupBy, join, repartition) cut a stage boundary with a shuffle, which still writes to local disk. A dataset reused across steps, as in iterative algorithms such as PageRank or model training, can be cached in executor memory instead of reread each pass. A lost partition is recomputed from its lineage, the chain of transformations that produced it, instead of being replicated up front.',
    },
    {
      title: 'Columnar files and partition pruning',
      body: 'Parquet (and ORC) store a file as row groups, and within each row group every column contiguously, compressed with dictionary and run-length encoding, so a query that needs 4 of 40 columns reads roughly a tenth of the bytes. The footer keeps min and max statistics per column per row group, so a filter such as `amount > 1000` skips row groups that cannot match (predicate pushdown). On top, lay the files out in directories by a low-cardinality column such as `dt=2026-09-28/`: a query for one week reads 7 directories and never opens the rest (partition pruning). Partitioning by a high-cardinality column such as user id instead creates millions of tiny files; aim for files of a few hundred MB.',
    },
    {
      title: 'Idempotent reruns and atomic output',
      body: "Every batch job will be rerun: after a crash, after a bug fix, or twice by an eager on-call. Make a run a pure function of its logical date: read that date's input partitions, use reference data as of that date, never `now()`, and replace the whole output partition for that date (`INSERT OVERWRITE`) instead of appending. Output must also appear all at once, or a reader sees half a day. Write to a staging location and commit in one step: a rename on HDFS, or a snapshot commit in a table format such as Apache Iceberg or Delta Lake. On S3 a rename copies each object, so it is neither fast nor atomic; that is why the table formats exist.",
    },
    {
      title: 'Pipelines: ETL, ELT and DAG scheduling',
      body: 'ETL transforms data before loading it into the warehouse, which suited warehouses where storage and compute were scarce. ELT loads raw data first into a cloud warehouse or lake (BigQuery, Snowflake, Redshift, or Parquet on object storage) and transforms it there with SQL, often managed with dbt: the raw copy lets you fix a transformation and rebuild history. A scheduler such as Airflow runs the pipeline as a DAG of tasks with dependencies, one run per logical date, with retries, sensors that wait for upstream data to land, and backfills that run the same DAG for past dates. Because each task is idempotent and keyed by date, clearing a task and its downstream tasks for a range of dates reruns exactly that slice.',
    },
    {
      title: 'Batch versus streaming, Lambda and Kappa',
      body: 'Batch reads a bounded input, is simple to reason about, reprocesses history cheaply and tolerates late data by running after the day closes, at the cost of hours of latency. Streaming gives seconds, and pays for it with watermarks, state and checkpoints. The Lambda architecture runs both: a batch layer recomputes accurate views from the full immutable log, a speed layer covers the hours since, and queries merge the two, at the price of writing every piece of logic twice and keeping the two versions in agreement. The Kappa architecture keeps one streaming job and reprocesses by replaying a retained log through a new version of it. Choose batch when the consumer reads daily, the result needs the whole dataset (training, global ranking), or correctness matters more than freshness.',
    },
  ],
  examples: [
    {
      title: 'Daily views per URL from 2 TB of logs',
      problem:
        'A site writes 10 billion log lines a day, 200 bytes each. Compute views per URL and the top 100 URLs on a 100-machine cluster where each machine reads or sends about 100 MB/s. The map emits (url, 1), about 70 bytes a pair; the home page is 5% of all views; a 128 MB split holds about 50,000 distinct URLs. Estimate the phases with and without a combiner, using 100 reducers.',
      insight: 'The shuffle and the busiest reducer decide the job; a combiner shrinks both, and for counts it removes the hot key.',
      steps: [
        'Input: 10 billion times 200 bytes is 2 TB. The cluster reads 100 times 100 MB/s, 10 GB/s, so the map phase takes about 200 s. At 128 MB a split that is 15,625 map tasks of 640,000 lines each.',
        'Without a combiner every line becomes a pair: 10 billion times 70 bytes is 700 GB to shuffle, about 70 s of network across the cluster, plus spilling it to disk and sorting it.',
        'The busiest reducer holds the home page, 5% of 700 GB or 35 GB, plus its hundredth of the rest, 6.65 GB: about 42 GB, 417 s at 100 MB/s, while a typical reducer finishes its 6.65 GB in 67 s. The job takes about 200 + 70 + 417, roughly 11.5 minutes.',
        'With a combiner, each map task emits one (url, count) pair per distinct URL: 50,000 times 70 bytes, 3.5 MB instead of 44.8 MB. The shuffle falls to 15,625 times 3.5 MB, about 55 GB and 5.5 s, and the home page is at most one pair per map task, 15,625 pairs, about 1 MB. Each reducer gets about 0.55 GB, 5.5 s, and the job takes about 211 s, dominated by reading the input.',
        'Top 100: each URL lives on exactly one reducer, so each reducer keeps a heap of its 100 largest counts and emits them, and one final task merges 100 times 100, 10,000 candidates. No second full pass over the data is needed.',
      ],
    },
    {
      title: 'A join that waits 34 minutes for one task',
      problem:
        "A nightly job joins 1 TB of orders with a 50 GB sellers table on seller id, on 200 machines with 200 reducers, each at 100 MB/s. The marketplace's own store is the seller on 20% of all orders. The job used to take 5 minutes and now takes 40, with one task still running long after the others. Explain and fix it.",
      insight: 'Adding reducers cannot split a key; split the hot key yourself and replicate the one row it joins with.',
      steps: [
        "The shuffle hashes seller id, so all 200 GB of the store's orders go to one reducer, plus that reducer's 4 GB share of the other 800 GB. At 100 MB/s that is about 2,040 s, 34 minutes, while the other 199 reducers each handle about 4 GB of orders and 0.25 GB of sellers in about 43 s.",
        "Broadcasting the whole sellers table to every task avoids the shuffle, but 50 GB will not fit in each executor's memory; broadcast joins suit tables up to a few hundred MB.",
        'Find the hot keys first: count seller ids on a 1% sample of orders and flag any key above, say, 1% of rows. Here that is one seller.',
        "Salt it: give each of that seller's orders a random salt from 0 to 49 and join on (seller id, salt); on the sellers side, emit that seller's single row 50 times, once per salt. Each salted key carries 4 GB, so a reducer holds about 8 GB, or about 12 GB where hashing puts two salted keys together, and the busiest finishes in about 2 minutes instead of 34.",
        "Equivalent and simpler to explain: split the job. Join the hot seller's orders with a broadcast of its one row, join the rest normally, and union the results. In Spark 3, adaptive query execution does a similar split automatically when it sees one join partition far larger than the median.",
      ],
    },
    {
      title: 'A rerun that doubled revenue',
      problem:
        'A nightly job computes revenue per country for yesterday from events stored as Parquet, partitioned by date, 500 GB a day across 40 columns, and appends the rows to a warehouse table. It crashed at 3:00 after some tasks had written their output; the on-call reran it, and finance sees some countries at double revenue. The same week, a currency conversion bug is found that affects the last 90 days. Fix the job and plan the backfill; one run takes about 20 minutes on the shared cluster.',
      insight:
        'A run should be a pure function of its logical date that replaces its output atomically; then a rerun and a backfill are the same operation.',
      steps: [
        'Why double: output tasks commit independently, so the first attempt had appended rows for some countries before it failed, and the rerun appended every country again. Only the countries written twice doubled.',
        "Make it idempotent: the run for date D writes the complete result for D and replaces that date's partition, with `INSERT OVERWRITE` or a delete of D plus insert inside one transaction. Running it once or five times leaves the same rows.",
        'Make it atomic: write to a staging location and commit in one step, such as an Iceberg or Delta Lake snapshot commit, so readers see either the old day or the new day, never half.',
        "Make it deterministic: read only the input partition for D and the exchange rates as of D, never today's rates or `now()`. Otherwise the backfill recomputes March with September's rates.",
        'Each run reads one date directory (partition pruning) and 4 of the 40 columns, about 50 GB instead of 500 GB. The 90-day backfill is 90 runs of 20 minutes, 30 hours in sequence; run 6 at a time in a lower-priority pool, about 5 hours, so the nightly job still meets its deadline. Then clear the downstream DAG tasks for those 90 dates so dashboards and exports rebuild from the fixed data.',
      ],
    },
  ],
  pitfalls: [
    "Appending output on every run: a retry or a manual rerun duplicates rows. Overwrite the partition for the run's logical date and commit it atomically.",
    "Reading the wall clock or the latest reference data inside a job: a backfill for last quarter then computes with today's values. Pass the logical date in and read everything as of that date.",
    'Adding reducers to fix a slow job whose time is spent in one task: a hot key stays on one reducer however many there are. Look at the task duration spread, then salt, combine or split the hot keys.',
    'Partitioning output by a high-cardinality column or running thousands of reducers per partition: millions of tiny files make listing, planning and reading slow. Partition by date or another coarse column and compact to files of a few hundred MB.',
  ],
  followUps: [
    {
      question: 'How do you sort 100 TB so the output is globally ordered?',
      answer:
        'Hash partitioning scatters neighbouring keys, so use range partitioning instead: sample the keys, pick R-1 split points that divide the sample evenly, and send each record to the reducer owning its range. Each reducer sorts its range, and the output files in reducer order form one sorted sequence. This is how TeraSort works; a skewed sample gives uneven ranges, so sample enough keys.',
    },
    {
      question: 'How do you count distinct users per country when a combiner cannot just add numbers?',
      answer:
        'Exactly: two stages. First key by (country, user) to deduplicate, then key by country and count. Approximately and much cheaper: a HyperLogLog sketch per country, a few KB each; sketches merge, so mappers can combine them and reducers merge them, with a typical error around 1%.',
    },
    {
      question: 'How does a daily job know its input is complete?',
      answer:
        "Have the upstream writer commit a marker when a date is done, such as a success file or a table snapshot, and have the scheduler's sensor wait for it with a timeout that alerts. Data that still arrives late is handled by rerunning the last few days each night, which is safe only because each run overwrites its own date.",
    },
  ],
};
