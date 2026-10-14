import { REPLICA_EXPERIMENTS } from './replication-experiments.js';
import type { SdLesson } from './types.js';

export const REPLICATION_LESSON: SdLesson = {
  why: 'Replicas are the first tool for scaling reads and surviving a dead database, and the most often misapplied. Every replica replays every write, so replicas add nothing to write throughput, and an asynchronous replica is always a little behind: a user posts, reloads and their post is gone, or a failover quietly drops the last writes the primary had acknowledged. Interviewers probe exactly these seams: which reads may be stale, which writes may be lost, and what stops two primaries.',
  widget: {
    kind: 'replica-lag',
    experiments: REPLICA_EXPERIMENTS,
  },
  concepts: [
    {
      title: 'What replicas buy, and what they do not',
      body: 'Replicas scale reads (ten replicas serve about ten times the reads), give you a warm standby to fail over to, and put read copies near users in other regions. They do not scale writes: every replica applies every write, so a primary at its write limit stays there. And they are not backups: a bad `DELETE` replicates in milliseconds, so keep point-in-time backups too.',
    },
    {
      title: 'Synchronous, asynchronous, semi-synchronous',
      body: 'Synchronous: the commit waits until a replica has the write, so a failover loses nothing, but every commit pays a round trip and a slow or dead replica stalls writes. Asynchronous: the commit returns at once and the replica catches up later, so a failover loses whatever had not arrived yet. Semi-synchronous waits for one replica to receive the log, not apply it; in MySQL it falls back to async after a timeout, so it narrows the loss window rather than closing it. The common setup is one synchronous standby (or any one of two) and the rest async. Synchronous protects durability, not reads: a standby may have the write on disk but not yet applied, unless it waits for apply.',
    },
    {
      title: 'Lag and its anomalies',
      body: 'Replication lag is usually milliseconds, but it spikes to seconds or minutes under bulk writes, long queries on the replica or a network hiccup. Two anomalies follow. Read-your-writes: a user writes, then reads from a replica that has not caught up, and their change seems lost. Monotonic reads: consecutive reads hit different replicas, so a comment appears, then vanishes on the next reload.',
    },
    {
      title: 'Getting consistent reads back',
      body: 'Read data the user can edit (their own profile, their own posts) from the primary. Or pin a user to the primary for a window after each write, which works only if the window outlasts the lag. The robust fix is a version token: the client keeps the log position of its last write, and a replica serves the read only once it has applied that position, otherwise the read waits or goes to the primary. For monotonic reads, send each user to the same replica, for example by hashing the user id.',
    },
    {
      title: 'Leader-follower, multi-leader, leaderless',
      body: 'Leader-follower: one primary takes all writes, so there are no write conflicts; this is the default. Multi-leader: each region or device accepts writes, which cuts write latency and survives a region loss, but two leaders can change the same row, and last-write-wins silently drops one change. Leaderless (Dynamo, Cassandra): the client writes to N replicas and waits for W, reads from R, and W + R > N makes every read set overlap the latest write set. With N = 3, W = 2 and R = 2, one node can be down for reads and writes.',
    },
    {
      title: 'Failover and split brain',
      body: 'Failover detects a dead primary (missed heartbeats for, say, 10 to 30 seconds), promotes the most up-to-date replica and repoints clients. A short timeout fails over on a GC pause; a long one extends the outage. The danger is split brain: the old primary comes back still accepting writes. Elect with a majority (Raft, etcd or ZooKeeper behind a tool such as Patroni) and fence: each new leader gets a higher term, and storage or proxies reject writes carrying an older one.',
    },
    {
      title: 'Watching lag and failing over',
      body: 'Alert on replication lag measured as replay delay, not only on whether a replica is connected. On failover, promote the replica furthest ahead so the fewest acknowledged writes are lost, and fence the old primary before the new one takes writes.',
    },
  ],
  examples: [
    {
      title: 'Size replicas for a read load',
      problem:
        'An app peaks at 40,000 reads and 2,000 writes a second. One database node handles 10,000 queries a second and you plan to run at 60%. How many replicas, and when do replicas stop helping?',
      insight: 'Each replica spends part of its capacity replaying the writes, so its read capacity is its budget minus the write rate.',
      steps: [
        'At 60%, each node has a budget of 6,000 queries a second.',
        'The primary takes the 2,000 writes: 33% of its budget, comfortable.',
        'Each replica replays the same 2,000 writes, a simplification that prices applying a write like serving a query, so it has 4,000 left for reads.',
        '40,000 / 4,000 = 10 replicas. Add one, so losing a replica leaves exactly 10 at 60%.',
        'If writes grow to 6,000 a second, replaying them uses a whole replica budget and no replica serves any reads, while the primary sits at its planned 60%. Adding replicas cannot fix that: cache reads, batch writes or shard.',
      ],
    },
    {
      title: 'Choose sync or async: payments versus a feed',
      problem:
        'A payments database commits 500 payments a second; a social feed commits 5,000 posts a second. Async lag is typically 200 ms. Which replication mode fits each?',
      insight:
        'Ask what a failover may lose: async loses the writes inside the lag window, and only you can say whether those are acceptable.',
      steps: [
        'With async, a primary crash loses about 500 times 0.2, or 100 acknowledged payments. Customers were told those succeeded: unacceptable.',
        'Make payments synchronous to a standby in another availability zone. Each commit pays a cross-zone round trip of about 1 to 2 ms, which is affordable.',
        'So that one slow standby cannot stall every payment, wait for any one of two standbys (quorum commit), and replicate to a far region asynchronously for disaster recovery.',
        'The feed on async loses about 5,000 times 0.2, or 1,000 posts, in a rare failover. Many teams accept that for lower write latency and writes that never wait on a replica, though semi-sync inside a region is a cheap way to shrink the window.',
      ],
    },
    {
      title: 'The comment the user cannot see',
      problem:
        'A user posts a comment and the page reloads 150 ms later, reading from a replica. Lag is usually 50 ms but reaches 400 ms at peak. Sometimes the comment is missing. Why, and what fixes it?',
      insight: 'A read that can land inside the lag window is stale for that user; route it by what the user just wrote.',
      steps: [
        'The write went to the primary; the reload went to a replica. At 400 ms of lag, a read at 150 ms is 250 ms too early, so the comment is not there yet.',
        'Quick fix: store the time of the last write in the session and route reads from that user to the primary for 1 s. That covers the 400 ms peak, but not a lag spike past 1 s.',
        'Robust fix: store the commit log position in the session. A replica serves the read only if it has replayed past it (in Postgres, compare with `pg_last_wal_replay_lsn()`); otherwise the read goes to the primary.',
        'Keep each user on one replica by hashing their id, so a second reload cannot land on a replica further behind and hide the comment again.',
        'Also show the posted comment in the page from the write response, so the author never waits on replication; the routing fixes still matter on their other devices.',
      ],
    },
  ],
  pitfalls: [
    'Adding replicas to fix a write bottleneck: every replica replays every write, so the primary stays saturated.',
    'Treating replicas as backups: a bad migration or `DROP TABLE` reaches every replica within seconds.',
    'Reading from a replica to decide a write, such as checking a balance or that a username is free: decide on the primary in one atomic step, such as a conditional `UPDATE` or a unique constraint.',
    'Automatic failover without fencing: a network blip promotes a replica while the old primary still takes writes, and the two histories diverge.',
  ],
  followUps: [
    {
      question: 'Does W + R > N make a leaderless store strongly consistent?',
      answer:
        'Not by itself. Sloppy quorums may write to stand-in nodes outside the N, concurrent writes resolved by last-write-wins lose one under clock skew, and a write that reached fewer than W nodes may or may not show up in reads. It makes stale reads rare, and read repair plus anti-entropy close the gaps over time.',
    },
    {
      question: 'How do you stop two primaries after a failover?',
      answer:
        'Elect through a majority of an odd number of voters across zones, so only one side of a partition can win. Every leader gets a higher term, and storage or the proxy rejects any write carrying an older term, so a returning old primary cannot commit. The old primary also stops taking writes when its lease expires, and the new leader waits out that lease before accepting any.',
    },
    {
      question: 'Users in three regions all need to write. How would you replicate?',
      answer:
        'Give each user or record a home region whose leader takes its writes, with async replicas elsewhere for local reads. That avoids conflicts entirely. Use true multi-leader only for data that merges cleanly, such as counters or sets built as CRDTs, and accept that a region failover loses its lag window.',
    },
  ],
};
