import type { SdLesson } from './types.js';

export const CONSENSUS_LESSON: SdLesson = {
  why: 'Every failover, lock service and cluster controller has to answer one question: who is in charge right now, and what has been decided? Get it wrong and a network partition leaves two leaders both accepting writes, and their histories never merge. Consensus answers it with majorities, and interviewers probe whether you know what a majority buys, what it costs per write, and why the old leader on the wrong side of a partition must stop.',
  widget: {
    kind: 'partition',
    tryThis: [
      'Keep the defaults: 5 nodes, 2 on the left, the old leader on the left. A majority is 3 and the cluster tolerates 2 failures. Only the right side holds 3 nodes, so it elects a new leader and keeps committing, while the old leader is stranded with 2 and cannot commit. Move the leader to the right: it keeps leading. Put it back on the left and slide the left side to 3: now the left holds the majority and the old leader stays.',
      'Set 4 nodes with 2 on the left: a majority is 3, so 4 nodes tolerate only 1 failure, the same as 3 nodes, and a 2 and 2 split leaves neither side a majority, so the whole cluster stops committing wherever the leader is. Slide the left side to 1: the right side has 3 and carries on. The fourth node added cost and a way to stall, not fault tolerance.',
      'Set 7 nodes with 3 on the left and the leader on the left: a majority is 4, the cluster tolerates 3 failures, and the right side with 4 elects a new leader. Now set 6 nodes with 3 on the left: a majority is 4, it tolerates 2 like 5 nodes, and the 3 and 3 split leaves no side a majority. Odd sizes are the ones that buy tolerance.',
    ],
  },
  concepts: [
    {
      title: 'What consensus decides',
      body: 'Consensus gets a group of nodes to agree on one value despite crashes and lost messages, and to never change its mind. Systems use it to agree on a replicated log: the same commands in the same order on every node, so each node applies them to an identical state machine. Agreeing on the log also means agreeing on who leads, which is what stops two primaries. Paxos (in practice Multi-Paxos) and Raft both provide this; Raft is structured around a strong leader to be easier to implement correctly, and ZooKeeper uses its own protocol, Zab.',
    },
    {
      title: 'Majority quorums, and why sizes are odd',
      body: 'A decision needs a majority, floor(n / 2) + 1 nodes. Any two majorities share at least one node, so two conflicting decisions cannot both win, and that one shared node carries what was decided into every later majority. A cluster of n tolerates n minus the majority failures: 3 tolerates 1, 5 tolerates 2, 7 tolerates 3. An even size tolerates no more than the odd size below it (4 tolerates 1, like 3), needs a bigger quorum per write, and can split evenly with no majority anywhere. Larger clusters also write more slowly, since the leader waits for more acknowledgements.',
    },
    {
      title: 'Leader election in Raft',
      body: 'Time is divided into terms, numbered upward, with at most one leader per term. The leader sends heartbeats; a follower that hears none for its election timeout, randomized (the Raft paper suggests 150 to 300 ms) so that usually one node times out first, becomes a candidate: it increments the term, votes for itself and asks the others for votes. Each node grants at most one vote per term, so at most one candidate reaches a majority. A node that sees a higher term steps down and adopts it. A split vote simply times out into a new term.',
    },
    {
      title: 'The log restriction and the commit rule',
      body: 'A voter refuses a candidate whose log is less up to date than its own: compare the term of the last entry, then the log length. The leader marks an entry committed once it is stored on a majority, and only then applies it and answers the client. A committed entry sits on a majority and every election needs a majority, so some voter holds it and rejects any candidate missing it: every new leader has every committed entry. One subtlety: a leader counts replicas only for entries of its own term; older entries become committed when an entry of the current term after them is.',
    },
    {
      title: 'Split brain and the stranded leader',
      body: 'A leader cut off in a minority cannot commit, since no majority acknowledges its writes, but it may still believe it leads and answer reads from stale state. Two fixes: before serving a read, confirm leadership with a round of heartbeats to a majority (ReadIndex in etcd), or hold a lease, a promise that no other leader can be elected for a period. Raft leaders can also step down when they have not heard from a majority for an election timeout (CheckQuorum). A lease relies on clocks measuring durations at nearly the same rate: if the leader clock runs slow or its process pauses, it serves reads after a new leader exists, so leases need a bound on clock drift and a safety margin.',
    },
    {
      title: 'Fencing tokens for locks',
      body: 'A lock with a timeout does not protect the resource on its own: a holder can pause (GC, a VM stall, a slow disk) past its expiry, another client takes the lock, and the first wakes up still believing it holds it. Fencing fixes this at the resource: the lock service hands out a number that increases with every grant (a Raft term and index, or a ZooKeeper zxid), clients send it with each write, and the storage rejects any write carrying a lower number than one it has already seen.',
    },
    {
      title: 'What consensus costs, and where it runs',
      body: 'Every committed write costs a round trip from the leader to a majority plus a durable log write on each, and all writes funnel through one leader. Inside a region that is a millisecond or two; across regions it is tens of milliseconds per write. So consensus stores small, critical metadata, not the data path: etcd holds all Kubernetes cluster state, Kafka runs its metadata on a Raft quorum of controllers (KRaft, which replaced ZooKeeper), Consul and ZooKeeper hold service config and locks, and failover managers such as Patroni keep the Postgres leader key in etcd, Consul or ZooKeeper.',
    },
  ],
  examples: [
    {
      title: 'Place a consensus cluster across zones',
      problem:
        'You run etcd for a platform in one region with three availability zones and must survive the loss of any one zone. How many members, placed how? And why not save money with two zones?',
      insight: 'Count the members that survive the worst loss and compare that with the majority, for every failure you must ride out.',
      steps: [
        'Three members, one per zone: a majority is 2, and losing any zone leaves 2. It survives one zone, but a zone outage plus one more member down (say, a rolling upgrade) stops writes.',
        'Five members placed 2, 2 and 1: a majority is 3. Losing a zone with 2 leaves 3, exactly a majority; losing the zone with 1 leaves 4. Any zone can fail, and with every zone up, any 2 members can be down at once (an upgrade plus a dead disk) and writes continue.',
        'Two zones cannot survive losing either one. Place 3 members as 2 and 1: losing the zone with 2 leaves 1 of 3, no majority. Place 4 as 2 and 2: losing either zone leaves 2 of 4, and the majority is 3. Whichever zone holds at least half the members takes the cluster down with it.',
        'If only two zones carry real load, a single tie-breaking member (a witness) in a third location is enough: with 2, 2 and 1, either big zone can fail and the other plus the witness still make 3 of 5.',
        'Latency check: a leader in a zone with a second member needs 2 more acknowledgements, one of which is local and one cross-zone, so a write costs about one cross-zone round trip (1 to 2 ms) plus the disk sync.',
      ],
    },
    {
      title: 'A paused lock holder corrupts a file',
      problem:
        'Two workers use a lock service with a 10 s lease to take turns writing a shared file in object storage. Worker A takes the lock, then stalls in a 15 s garbage collection pause just before writing. Occasionally the file ends up corrupted. What happened, and what fixes it?',
      insight: 'The lock expired while its holder was paused, and the holder cannot notice; only the storage can reject the late write.',
      steps: [
        'At t = 0 A acquires the lock, lease until t = 10. At t = 1 its GC pause starts and lasts until t = 16.',
        'At t = 10 the lease expires. At t = 11 worker B acquires the lock and writes its version of the file.',
        'At t = 16 A resumes, with no idea time has passed, and writes its stale version over B. Both believed they held the lock, and A checking the lock just before writing would not help, since the pause can fall between the check and the write.',
        'Fix: the lock service returns a fencing token that grows with each grant, say 33 for A and 34 for B. Each write carries it, and the storage remembers the highest token seen.',
        "B's write with 34 is accepted and recorded; A's late write with 33 is rejected. The storage has to check the token atomically with the write, for example as a conditional write or a compare and set on a stored version.",
      ],
    },
    {
      title: 'A partition strands the old leader',
      problem:
        'A 5 node Raft cluster runs across 3 zones placed 2, 2 and 1. The leader, in term 7, sits in zone A with one follower. Zone A is cut off from B and C for 30 s. Walk through what each side does, and what clients see.',
      insight: 'Only the side with a majority can commit; everything the stranded leader accepted is either retried or thrown away.',
      steps: [
        'Zone A holds 2 of 5, the majority is 3. The old leader keeps receiving client writes and appends them, but at most 2 nodes store each one, so nothing commits and clients time out without an acknowledgement.',
        'In B and C, 3 followers stop hearing heartbeats. The first whose randomized timeout fires becomes a candidate for term 8 and needs 3 votes: its own plus both others on its side.',
        'Every entry committed before the cut was on at least 3 of 5 nodes, so at least one of the 3 in B and C has it, and by the log restriction that node refuses any candidate lacking it. The new leader has every committed write. Meanwhile nothing is committed at all for roughly the election timeout plus one round of votes.',
        'Clients that retry against B and C succeed. Reads from the old leader are stale unless it confirms leadership with a majority first or relies on a lease, and with a lease the new leader must not be elected before the old lease runs out.',
        'When the partition heals, the old leader sees term 8, steps down and replaces its uncommitted entries with the entries of the new leader. Those writes were never acknowledged, so clients must retry them, with idempotency keys so a write that did apply is not applied twice.',
      ],
    },
  ],
  pitfalls: [
    'Running an even-sized cluster, or spreading one across two zones: it tolerates no more failures than one member fewer, and one zone loss can remove the majority.',
    'Treating a lock with a timeout as mutual exclusion: without fencing tokens checked by the resource, a paused or slow holder writes after its lock has passed to someone else.',
    'Serving reads from the leader without confirming leadership: a stranded leader answers with stale data for as long as it goes unchecked.',
    'Putting high-volume data or large values in etcd, ZooKeeper or Consul: every write goes through one leader and a majority round trip, so they are built for small metadata.',
  ],
  followUps: [
    {
      question: 'Can a two-node cluster use consensus to fail over?',
      answer:
        'Not usefully. A majority of 2 is 2, so it tolerates no failures, and neither node alone can tell a dead peer from a broken link. Add a third voter, often a lightweight witness in another location, or use an external arbiter, and fence the loser so it cannot keep writing.',
    },
    {
      question: 'Why does consensus rely on timeouts if timeouts can be wrong?',
      answer:
        'The FLP result shows no deterministic protocol can guarantee it always reaches agreement (terminates) in a fully asynchronous network if even one node may crash. Raft and Paxos keep safety without any timing assumption: a wrong timeout causes an extra election, never two committed values. Timing only matters for progress, which is why elections need timeouts well above the heartbeat interval (etcd defaults to 100 ms heartbeats and a 1 s election timeout).',
    },
    {
      question: 'How do you replace a member without losing the majority?',
      answer:
        'Change membership one server at a time (Raft single-server changes) or through joint consensus, so old and new configurations cannot form separate majorities. Add the new member first, ideally as a non-voting learner until its log catches up, then remove the old one, so the cluster never runs with fewer voters than it needs.',
    },
  ],
};
