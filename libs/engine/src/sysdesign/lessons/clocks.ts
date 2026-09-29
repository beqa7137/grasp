import type { SdLesson } from './types.js';

export const CLOCKS_LESSON: SdLesson = {
  why: 'Every machine has its own clock, and no two agree: they are synced to within milliseconds at best, drift apart between syncs, and can jump backwards. Any design that orders events or expires leases by timestamp inherits that error, and the usual symptom is silent: last-write-wins throws away a newer update, or two nodes both believe they hold a lease. Interviewers probe whether you know which clock to use for what, how far apart clocks can be, and how logical clocks keep cause before effect without trusting time at all.',
  widget: {
    kind: 'clocks',
    tryThis: [
      'Pick wall clocks with a sync error of 10 ms, drift of 50 ppm, a sync every 64 s, a gap of 5 ms and B reading A first: the worst skew is 26.4 ms (each clock can be 10 ms off at sync plus 3.2 ms of drift, in opposite directions), so B can lose although it wrote later and even saw A. Slide the gap to 30 ms: B is safe. Now set the sync to every 1,024 s: drift alone adds 51.2 ms per clock, the skew is 122.4 ms, and the 30 ms gap can lose again; it takes a gap of 125 ms to be safe.',
      'Keep those settings (sync every 1,024 s, gap 30 ms) and switch to a hybrid logical clock: B read A, so its timestamp is above A, and the later write cannot lose. Push the sync error to 100 ms and drift to 200 ppm: the skew is 609.6 ms and B still cannot lose, even at a gap of 0. Now turn off B reading A first: B can lose again. Writes that never saw each other are concurrent, and no clock decides which one the user meant.',
      'Back on wall clocks, set a sync error of 1 ms, drift of 50 ppm and a sync every 16 s: the skew falls to 3.6 ms, and a 5 ms gap is safe. Slide the gap to 0: it can lose again. Tighter sync shrinks the window but never closes it; that is why Spanner waits out its known uncertainty instead of hoping that writes land far apart.',
    ],
  },
  concepts: [
    {
      title: 'Wall clocks, monotonic clocks, and leap seconds',
      body: 'A wall clock (`CLOCK_REALTIME`, `Date.now()`) reports the time of day and can jump: NTP steps it when the error is large, an operator sets it, a VM resumes with a stale clock. A monotonic clock (`CLOCK_MONOTONIC`, `System.nanoTime()`) only moves forward, but its value means nothing on another machine. So measure timeouts, durations and lease time with the monotonic clock, and use the wall clock only for timestamps shown to people or compared loosely. Leap seconds are a scheduled jump: UTC adds a 61st second, Unix time cannot represent it, so the clock repeats a second, and the 2012 leap second sent Linux servers running Java and MySQL into high CPU. Google and AWS instead smear the second across 24 hours by running their clocks slightly slow, so never mix smeared and unsmeared time servers: mid-smear they disagree by half a second. There has been no leap second since the end of 2016, and the plan is to stop adding them by or before 2035.',
    },
    {
      title: 'How far apart synced clocks can be',
      body: 'A quartz oscillator drifts, typically by tens of parts per million, and more as temperature changes: 50 ppm is 4.32 s a day (50 × 10^-6 × 86,400). NTP corrects it by polling servers, typically every 64 to 1,024 s, and its accuracy is limited by network asymmetry: it assumes the request and reply take equal time, so its error can reach half the round trip. Expect about a millisecond or better on a good LAN and tens of milliseconds over the internet. Between syncs the clock drifts freely, and two clocks can be off in opposite directions, so the worst skew between two nodes is twice (sync error + drift × poll interval). With 10 ms, 50 ppm and 1,024 s that is 2 × (10 + 51.2) = 122.4 ms.',
    },
    {
      title: 'Last write wins silently loses updates',
      body: 'Last-write-wins keeps the write with the larger timestamp and discards the other without an error. Cassandra resolves every cell this way, and DynamoDB global tables use it between regions. If B writes 5 ms after A but its clock is 20 ms behind, B carries the smaller timestamp and its newer value vanishes. It also loses writes that are truly concurrent: two users increment a counter from 7 to 8 and one increment disappears. Use it only where losing a concurrent update is fine, such as a presence heartbeat; otherwise use a conditional write on a version number, a transaction, or a merge that keeps both.',
    },
    {
      title: 'Lamport clocks and happened-before',
      body: 'Event a happened before b if they are on the same node in that order, or a is a send and b the matching receive, or a chain of those links them. A Lamport clock is a counter per node: increment it on every event, attach it to every message, and on receipt set it to max(local, received) + 1. Then if a happened before b, L(a) < L(b), and breaking ties by node id gives a total order that every node agrees on. The converse fails: L(a) < L(b) does not mean a caused b, or even that a came first in real time, so a Lamport clock cannot tell you that two writes were concurrent. It orders them anyway, and one is dropped as if it were stale.',
    },
    {
      title: 'Vector clocks detect concurrency',
      body: 'A vector clock keeps one counter per node (or per replica). A write increments its own entry; merging takes the element-wise maximum. Compare two versions entry by entry: if every entry of one is at least the other, it descends from it and can replace it; if each is ahead somewhere, they are concurrent. Dynamo and Riak then keep both values as siblings and hand them to the next reader, who merges them (a union of cart items, say) and writes back a version that descends from both. The cost is size: a vector grows with the number of writers, so stores key it by replica rather than by client and prune old entries.',
    },
    {
      title: 'Hybrid logical clocks',
      body: 'A hybrid logical clock (HLC) stamps events with a pair: the largest physical time the node has seen, plus a small counter for events within the same tick. On every send and receive it takes the maximum of its own clock and the incoming stamp, so like a Lamport clock it never issues a stamp below one it has seen, and cause stays before effect. Unlike a Lamport clock it stays within the clock skew of real time, so it still works for snapshots as of a time and for time-to-live. CockroachDB, YugabyteDB and MongoDB use HLCs. CockroachDB also assumes a maximum clock offset: a read that finds a value stamped just above its own timestamp, within that offset, cannot tell whether it was written first, so it restarts at a higher timestamp, and a node whose clock strays too far from the others shuts itself down.',
    },
    {
      title: 'TrueTime and commit wait',
      body: "Spanner's TrueTime API does not return a time; it returns an interval [earliest, latest] that is guaranteed to contain the true time. Its width comes from time masters with GPS receivers and atomic clocks in every datacenter, so the uncertainty ε is a few milliseconds (the 2012 paper reports 1 to 7 ms). To commit, Spanner picks a timestamp s no earlier than the current latest, then holds the locks until earliest has passed s, so s is certainly in the past. That commit wait lasts about 2ε, overlaps with Paxos replication, and buys external consistency: a transaction that starts after another has committed always gets a larger timestamp. The same idea with NTP-grade uncertainty would cost tens to hundreds of milliseconds per commit, which is why small ε matters.",
    },
    {
      title: 'Leases and fencing depend on bounded drift',
      body: 'A lease is time-based ownership: the holder acts until its lease ends, then the next holder takes over. That is safe only if the holder and the lease service measure the lease at close enough rates, so the holder stops a margin before the service reassigns it. Rates are the easy part: at 200 ppm a 10 s lease differs by only 2 ms. The hard parts are clocks that step (measure with a monotonic clock) and processes that pause between checking the lease and acting, which no margin covers. Spanner leaders hold 10 s leases, and Raft lease reads also assume bounded drift. Where a stale holder would corrupt data, add a fencing token: a number that rises with every grant and that the storage checks, so a late writer is rejected whatever its clock says.',
    },
  ],
  examples: [
    {
      title: 'The profile edit that disappears',
      problem:
        'A Cassandra cluster resolves writes by timestamp. Nodes sync by NTP to within 10 ms, drift up to 50 ppm and poll every 1,024 s. A user saves their profile, then corrects a typo 30 ms later, and the second request lands on a different coordinator. Can the correction be lost, and what fixes it?',
      insight:
        'A later write is safe under last-write-wins only if the gap between the writes exceeds the worst skew between the clocks that stamp them.',
      steps: [
        'Drift between polls: 50 × 10^-6 × 1,024 s = 51.2 ms. Each clock can be off by 10 + 51.2 = 61.2 ms.',
        'Two clocks off in opposite directions: 2 × 61.2 = 122.4 ms of worst skew. The 30 ms gap is far inside that, so the correction can carry the smaller timestamp and be dropped with no error.',
        'Polling every 64 s cuts drift to 3.2 ms, so the skew is 2 × 13.2 = 26.4 ms and a 30 ms gap is safe, but a 20 ms gap is not. Better sync narrows the window without closing it.',
        'Remove the dependence on clocks where it matters: stamp both writes from the same client (a single monotonic source), or make the update conditional on the version the user read, such as a lightweight transaction with `IF version = 7`.',
        'Since the second write came after the user saw the first, a hybrid logical clock carried in the session would also work: its stamp exceeds the first write whatever the clocks say.',
      ],
    },
    {
      title: 'Two carts: Lamport versus vector clocks',
      problem:
        'A Dynamo-style store has replicas X, Y and Z. A client writes a cart through X twice (D1, then D2). Then two clients each read D2: one adds a book through Y (D3), the other adds a lamp through Z (D4). Stamp the versions both ways and say what each keeps.',
      insight:
        'A Lamport stamp orders the two edits even though neither saw the other; a vector clock shows they are concurrent, so the store can keep both.',
      steps: [
        'Lamport: D1 = 1 and D2 = 2 on X. Y receives D2 and stamps D3 = max(0, 2) + 1 = 3; Z does the same, so D4 = 3.',
        'The tie breaks by node id, say Y below Z, so D4 wins and the book is silently dropped, though nothing about D4 superseded it.',
        'Vector clocks: D1 = [X:1], D2 = [X:2], D3 = [X:2, Y:1], D4 = [X:2, Z:1].',
        'D3 is ahead on Y and D4 on Z, so neither descends from the other: they are concurrent, and the store keeps both as siblings.',
        'The next reader gets both, merges them into a cart with the book and the lamp, and writes D5 through X as [X:3, Y:1, Z:1], which descends from both and replaces them.',
      ],
    },
    {
      title: "Price Spanner's commit wait",
      problem:
        'TrueTime uncertainty is ε = 4 ms. Paxos replication to a majority takes 10 ms. What does commit wait add, and what if the uncertainty were ε = 100 ms, as with loose NTP?',
      insight:
        'Commit wait costs about 2ε, runs alongside replication, and holds the locks, so a small ε keeps both latency and hot-row throughput reasonable.',
      steps: [
        'TT.now() is the local clock reading c widened by ε on each side, [c − 4 ms, c + 4 ms]. Spanner picks s = TT.now().latest = c + 4 ms.',
        'It then waits until TT.now().earliest > s, that is until the clock reads more than s + 4 ms = c + 8 ms: about 2ε = 8 ms after choosing s.',
        'The wait overlaps the 10 ms of Paxos replication, so the client sees no extra latency; the commit returns after max(10, 8) = 10 ms.',
        'With ε = 100 ms the wait is about 200 ms, far above replication, so every commit takes about 200 ms.',
        'Locks are held through the wait, so one hot row commits at most about 1,000 / 200 = 5 times a second, against about 1,000 / 10 = 100 at ε = 4 ms. This is why Google invested in GPS and atomic clocks.',
      ],
    },
  ],
  pitfalls: [
    'Measuring a timeout or duration by subtracting wall-clock readings: an NTP step or a leap second makes it negative or huge.',
    'Trusting last-write-wins for data users edit: a newer write with a slightly behind clock is discarded without an error.',
    'Reading a Lamport timestamp as proof that one event caused another, or that two writes were not concurrent.',
    'Holding a lease past its end because the local clock says there is time left, with no margin and no fencing token at the storage.',
  ],
  followUps: [
    {
      question: 'Why not just sync every clock more tightly and keep last-write-wins?',
      answer:
        'Tighter sync (PTP, a local time service, frequent polls) shrinks the skew to a millisecond or less, but two writes closer together than the skew can still be misordered, a clock can still step, and truly concurrent writes still lose one update. Use clocks to bound the window, and versions or conditional writes to decide correctness.',
    },
    {
      question: 'When would you choose vector clocks over a hybrid logical clock?',
      answer:
        'When concurrent writes must be detected and merged rather than ordered, as in a multi-leader or leaderless store that keeps siblings. An HLC gives one total order that respects causality and tracks real time, which suits transactions and snapshots, but it still orders two concurrent writes arbitrarily.',
    },
    {
      question: 'Does TrueTime mean Spanner has perfectly synchronized clocks?',
      answer:
        'No. It means Spanner knows a bound on its error: every reading is an interval guaranteed to contain the true time. Commit wait turns that bound into ordering by waiting until a timestamp is certainly past. If a clock broke that bound, the guarantee would break, which is why time masters are cross-checked and machines with bad clocks are evicted.',
    },
  ],
};
