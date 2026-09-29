import type { SdLesson } from './types.js';

export const MULTI_REGION_LESSON: SdLesson = {
  why: 'One region puts every user a long way from somewhere and bets the whole product on one location staying up. Spreading across regions fixes both, but a round trip between the US East coast and Western Europe takes about 80 ms in practice, most of it the speed of light in fiber, and no design removes it. Every multi-region design picks where writes go, how much data a lost region may take with it, and how long writes stop. Interviewers probe whether you can put numbers on those choices and name what each one gives up: stale reads, lost writes, slow writes or conflicting writes.',
  widget: {
    kind: 'multi-region',
    tryThis: [
      'Keep the defaults, One region in US East with 90% reads: every read and write costs 88 ms on average, because half the users are 20 ms away while EU users pay 100 ms and Asian users 240 ms. Move the primary to EU West: 92 ms, and to Asia: 178 ms. The middle region is not the best place; the region nearest the most users is. Destroying the region loses everything since the last backup, up to 1 h, and writes stop for about 4 h while you restore elsewhere.',
      'Switch to Read replicas with the primary in US East: reads drop to 20 ms everywhere, writes stay at 88 ms, and the mean at 90% reads is about 27 ms. Slide reads to 50%: the mean rises to 54 ms, since replicas only help reads. Move the primary to Asia: writes cost 178 ms and the mean at 90% reads is about 36 ms. A destroyed primary now loses only the 500 ms replication lag and writes resume after 60 s of promotion.',
      'Switch to Quorum with the leader in US East: writes cost 168 ms, the 88 ms trip to the leader plus 80 ms to EU West, the nearest region that makes a majority of two out of three. Reads cost 88 ms because they go to the leader. Move the leader to Asia: its nearest peer is 160 ms away, so writes cost 338 ms. Nothing acknowledged is lost (0 ms) and writes resume after a 10 s election. Then pick Active-active: reads and writes are 20 ms, but a lost region still takes its last 500 ms of writes, and write conflicts become possible. The RPO and RTO figures are fixed illustrative values per mode, not measurements.',
    ],
  },
  concepts: [
    {
      title: 'Why go multi-region, and what it costs',
      body: 'Three reasons justify it. Latency: light in fiber covers about 200 km per millisecond, so a round trip costs about 1 ms per 100 km of distance before any routing, and a user in Singapore talking to Virginia pays well over 200 ms per round trip. Disaster recovery: several availability zones in one region survive a burned data center, but not a region-wide outage of the network, a control plane or power. Data residency: some customers or laws require data to stay in a country or bloc. The costs are real: two or three times the infrastructure, cross-region transfer fees, and a harder consistency story. Multiple zones in one region cover most failures, so go multi-region when one of these three needs demands it.',
    },
    {
      title: 'RPO and RTO',
      body: 'The recovery point objective (RPO) is how much recent data you may lose, measured in time: nightly backups give an RPO of up to 24 hours, asynchronous replication an RPO of its lag, synchronous replication zero. The recovery time objective (RTO) is how long until the service works again: restoring terabytes from backup takes hours, promoting a warm replica takes a minute or two, a consensus election takes seconds. Get both numbers from the business first, since they pick the architecture: an RPO of zero across regions forces a synchronous cross-region round trip on every write, and a short RTO forces a standby that is already running.',
    },
    {
      title: 'Active-passive: async replicas and failover',
      body: 'One primary region takes every write; the other regions hold asynchronous replicas that serve local reads. Reads get fast and writes stay as slow as the trip to the primary. When the primary region dies, promote a replica in another region and move traffic to it. Whatever had not replicated is lost, so the RPO is the replication lag at that moment, which can be seconds during a spike. Failover is usually a human decision or a slow automatic one, because promoting a replica on a network blip creates two primaries: fence the old one (a higher epoch or term that storage and proxies enforce) before the new one takes writes.',
    },
    {
      title: 'Consensus across regions',
      body: 'Spanner (Paxos) and CockroachDB (Raft) replicate each range of data to several regions and commit a write once a majority has it, so losing any one region loses no acknowledged write and a new leader is elected in seconds. The price is write latency: a write travels to the leader, then waits for the nearest regions that complete a majority. With replicas in three regions that is the leader plus its closest peer, so put the leader in the region with the most writers and next to a close neighbor. Survive one region loss with three regions, two losses with five; two regions cannot do it, since one of them must hold the majority. Strong reads go to the leader (or leaseholder); reads that accept bounded staleness can be served locally, such as Spanner stale reads or CockroachDB follower reads.',
    },
    {
      title: 'Active-active and conflicts',
      body: 'Every region accepts writes locally and replicates them asynchronously to the others, so reads and writes are local and fast, but two regions can change the same record before either hears of the other. Last-writer-wins keeps the version with the higher timestamp and silently drops the other; with clock skew, the dropped one may be the later change. It is the default in Cassandra and, by default, in DynamoDB global tables. CRDTs (conflict-free replicated data types) are counters, sets and maps whose merge gives the same result in any order, so concurrent updates combine instead of overwrite. The cleanest option avoids conflicts: give each user or record a home region that takes all its writes, and use the other regions for reads and failover.',
    },
    {
      title: 'Routing users and keeping data in place',
      body: 'GeoDNS answers a lookup with the address of a region chosen by the resolver location or measured latency (Route 53 latency routing, for example); failing a region over means changing the answer, and clients keep using the old one until cached records expire, often longer than the TTL. Anycast announces one IP address from many locations over BGP, so the network delivers each packet to the nearest healthy site and a withdrawn site stops receiving traffic within seconds to minutes; CDNs and global load balancers use it. For data residency, pin each user to a home region by where their account belongs, store their records only there (and in a backup region inside the same jurisdiction), and keep global indexes free of personal data. GDPR restricts transfers of personal data out of the EEA rather than banning them, but many contracts and some national laws do require local storage.',
    },
    {
      title: 'Testing failover',
      body: 'A failover path that has not run recently does not work: runbooks go stale, a surviving region lacks capacity, or a hidden dependency (an auth service, a config store, a DNS provider) lived only in the lost region. Rehearse it on a schedule by draining a real region in production during business hours, as Netflix does with Chaos Kong. Measure the RTO and the data lost against the targets, and check that every surviving region has the headroom to absorb the traffic of the one that left.',
    },
  ],
  examples: [
    {
      title: 'Zero data loss has a latency floor',
      problem:
        'An app has users split 50% US East, 30% EU West and 20% Asia, 20 ms from their nearest region. Regions are 80 ms apart (US to EU), 220 ms (US to Asia) and 160 ms (EU to Asia). Losing a region must lose no acknowledged write, and mean write latency must stay under 150 ms. Does one consensus group with a US leader meet it? What does?',
      insight:
        'An RPO of zero across regions costs one cross-region round trip per write; the design choice is only which round trip, so start it as close to each writer as possible.',
      steps: [
        'One Raft group, replicas in all three regions, leader in US East. A write reaches the leader (20 ms for US users, 20 + 80 = 100 ms for EU, 20 + 220 = 240 ms for Asia), and the leader then waits 80 ms for EU, its nearest peer, to make two of three.',
        'Mean trip to the leader: 0.5 x 20 + 0.3 x 100 + 0.2 x 240 = 10 + 30 + 48 = 88 ms. Plus 80 ms for the majority: 168 ms, over budget.',
        'Instead, give each user a home region and place the leader of their rows there, still with replicas in all three regions (CockroachDB calls this `REGIONAL BY ROW` with region survival). Each write goes to the local leader and waits for the nearest other region.',
        'US users pay 20 + 80 = 100 ms, EU users 20 + 80 = 100 ms, Asian users 20 + 160 = 180 ms. Mean: 50 + 30 + 36 = 116 ms, inside the budget, and a lost region still loses nothing acknowledged.',
        'Asian users remain the slowest because their nearest majority partner is 160 ms away. A second Asian region helps only if the replicas of Asian rows sit in Singapore, Tokyo (about 70 ms apart) and one more region, so the majority is the leader plus Tokyo and writes cost about 90 ms.',
      ],
    },
    {
      title: 'What an async failover actually loses',
      problem:
        'A primary in US East takes 3,000 writes a second and replicates asynchronously to EU West. Lag is normally 200 ms but reaches 5 s during a nightly batch job. Health checks run every 30 s and three failures trigger failover; promotion takes 30 s; the DNS record has a 60 s TTL. Estimate the RPO and RTO.',
      insight:
        'The RPO is the lag at the moment of failure, not the average lag, and the RTO is the sum of detection, promotion and rerouting.',
      steps: [
        'Normal lag: 3,000 x 0.2 = 600 acknowledged writes lost. During the batch job: 3,000 x 5 = 15,000 lost, 25 times more. State the RPO as the worst case you tolerate, and alert when lag exceeds it.',
        'Detection: three failed checks 30 s apart take about 90 s. Promotion adds 30 s, so writes are possible in EU West after about 120 s.',
        'Rerouting: resolvers can hold the old record for the full 60 s TTL, and some clients cache longer, so most traffic arrives after about 180 s, 3 minutes, with a tail after that.',
        'Before promotion, fence US East (revoke its credentials or bump the epoch the storage layer checks), so that if it was only unreachable it cannot keep accepting writes.',
        'When US East returns, its unreplicated writes are a divergent history. Rebuild it as a replica of EU West, and extract those writes from its log for someone to reconcile rather than merging them automatically.',
      ],
    },
    {
      title: 'Counters and stock in active-active',
      problem:
        'A store runs active-active in US East and EU West with 500 ms replication. A product page shows a like count of 1,000; within the same half second US users add 3 likes and EU users add 2. The same product has 100 units of stock. How do you keep both right?',
      insight:
        'Data that merges (counts, sets) can use CRDTs; data with a hard limit (stock) needs one owner or a pre-split allowance per region.',
      steps: [
        'With last-writer-wins on the whole value, US writes 1,003 and EU writes 1,002. After replication both regions keep whichever has the later timestamp, so the count ends at 1,003 or 1,002, never the true 1,005.',
        'A grow-only counter CRDT keeps one slot per region: US holds 3 new likes in its slot, EU holds 2 in its slot, and the value is the sum. Merging takes the larger value per slot, so both regions converge on 1,000 + 3 + 2 = 1,005 in any order. A PN-counter (one grow-only counter for increments, one for decrements) handles unlikes.',
        'Stock cannot work that way: two regions each selling the last unit both succeed locally, and the merge cannot undo a shipped order. Either make one region the owner of each product stock and route reservations there (a cross-region trip only at checkout), or split the stock into allowances.',
        'Allowances (escrow): give US 60 units and EU 40, matching their sales share. Each region sells from its own allowance locally with no conflict; when one runs low, it asks the other to transfer units, a rare and slower operation.',
      ],
    },
  ],
  pitfalls: [
    'Choosing active-active for everything and relying on last-writer-wins: concurrent updates silently vanish, and nobody notices until a customer does.',
    'Running every region hot at 70% utilization: when the region with half the traffic fails, the survivors receive far more than they can serve and the outage spreads.',
    'Keeping one regional dependency, such as the auth service, feature flags or the deploy pipeline, so a region loss takes down the regions that were meant to survive it.',
    'Calling across regions inside a request: five sequential calls to a service 80 ms away add 400 ms, so keep each request inside one region and replicate data instead.',
  ],
  followUps: [
    {
      question: 'Why do Spanner and CockroachDB want three regions, not two, to survive a region failure?',
      answer:
        'A commit needs a majority of replicas. With two regions, one of them must hold the majority, and losing that region stops writes. With replicas in three regions, any one can fail and the other two still form a majority. Surviving two region failures at once needs five.',
    },
    {
      question: 'In a consensus setup, how do users far from the leader get fast reads?',
      answer:
        'Accept bounded staleness and read the local replica at a timestamp a few seconds old (Spanner stale reads, CockroachDB follower reads). For data that is read everywhere and rarely written, such as configuration or a product catalog, CockroachDB global tables serve consistent local reads in every region and make writes slower instead.',
    },
    {
      question: 'After an async failover, can the old primary simply rejoin?',
      answer:
        'No. It may hold writes that never reached the new primary, and the new primary has since accepted writes of its own, so the histories diverge. Rebuild it as a replica of the new primary (in Postgres, `pg_rewind` rewinds it to the fork point), and before that export the writes it has past that point so they can be reviewed and replayed by hand.',
    },
  ],
};
