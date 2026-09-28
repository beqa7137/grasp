import type { SdLesson } from './types.js';

export const ESTIMATION_LESSON: SdLesson = {
  why: 'Every design choice in an interview rests on a number: whether the data fits on one machine, whether reads need a cache, whether media needs a CDN. A two-minute estimate with its assumptions said out loud turns "it should scale" into "about 60,000 reads a second at peak, so one database is not enough". Interviewers grade the order of magnitude and the reasoning, not the digits.',
  widget: {
    kind: 'estimate-drill',
    tryThis: [
      'Answer the first two in your head, under a minute each, before typing anything. Round 86,400 seconds to 100,000: on the first question that gives 6,000 against an exact 6,944, still spot on.',
      'Write your assumptions down before the number, then type the rounded answer as you would say it: 7k, 1.1k or 250 all parse. On the storage question 1.1k lands within half a percent of the exact 1,095 TB.',
      'When a guess comes back "off by more than 2x", find the factor you dropped in the working. The usual culprits are bits versus bytes (8x), replication (3x) and peak versus average (2 to 3x): on the download question, answering about 9 (gigabytes a second, not gigabits) is off by about 8x.',
    ],
    drill: [
      {
        question:
          'A photo app has 20 million daily active users, and each makes 30 API requests a day. How many requests a second is that on average?',
        answer: 6_944,
        unit: 'requests/s',
        working: [
          'Requests a day: 20 million times 30 is 600 million.',
          'A day has 86,400 seconds; call it 100,000: 600 million / 100,000 is about 6,000 a second.',
          'Exactly: 600,000,000 / 86,400 is about 6,944 requests a second.',
        ],
      },
      {
        question:
          'A ticketing site gets 43.2 million requests a day, and its busiest hour carries 10% of the day. How many requests a second does it take in that hour?',
        answer: 1_200,
        unit: 'requests/s',
        working: [
          'The daily average is 43.2 million / 86,400, exactly 500 a second.',
          'The busiest hour carries 10% of the day: 4.32 million requests.',
          'An hour is 3,600 seconds: 4.32 million / 3,600 is exactly 1,200 a second.',
          'That is 2.4 times the average: an even spread would put only 1/24, about 4%, in each hour.',
        ],
      },
      {
        question:
          'A chat service stores 1 billion messages a day at 200 bytes each, keeps them 5 years, and stores 3 replicas. How much storage in TB (1 TB = 10^12 bytes)?',
        answer: 1_095,
        unit: 'TB',
        working: [
          'A day: 1 billion times 200 bytes is 200 GB.',
          'A year: 200 GB times 365 is 73 TB.',
          'Five years: 365 TB. Three replicas: 1,095 TB exactly, about 1.1 PB.',
        ],
      },
      {
        question:
          'An update server delivers a 400 MB file 2 million times a day, spread evenly. What is the average outbound bandwidth in Gbps (1 MB = 10^6 bytes)?',
        answer: 74,
        unit: 'Gbps',
        working: [
          'A day: 2 million times 400 MB is 800 TB.',
          'Per second: 800 TB / 100,000 is about 8 GB/s; exactly, 800 TB / 86,400 is about 9.3 GB/s.',
          'Links are quoted in bits: 9.26 GB/s times 8 is about 74 Gbps (74.07).',
          'The head version, 8 GB/s times 8 = 64 Gbps, is within 15% of that.',
        ],
      },
      {
        question:
          'A cache holds the hottest 20% of 400 million user profiles at 1 KB each, and keys, pointers and fragmentation add 50%. How much memory in GB (1 KB = 1,000 bytes)?',
        answer: 120,
        unit: 'GB',
        working: [
          'Hot set: 20% of 400 million is 80 million profiles.',
          'Data: 80 million times 1 KB is 80 GB.',
          'With 50% overhead: 120 GB exactly, so two 64 GB nodes at the least, and a third to survive losing one.',
        ],
      },
      {
        question:
          'A service averages 20,000 requests a second and peaks at 3 times that. One server handles 400 requests a second at full CPU, and you run servers at most 60% busy at peak. How many servers?',
        answer: 250,
        unit: 'servers',
        working: [
          'Peak: 20,000 times 3 is 60,000 requests a second.',
          'At 60% busy one server takes 400 times 0.6, or 240 a second.',
          '60,000 / 240 is exactly 250 servers, before any spare for a lost zone.',
        ],
      },
    ],
  },
  concepts: [
    {
      title: 'Numbers worth memorizing',
      body: 'A day is 86,400 seconds, about 10^5; a month about 2.6 million; a year about 31.5 million. So 1 million events a day is about 12 a second, and 1 billion a day about 12,000. Powers of 2 map to powers of 10: 2^10 is about a thousand (KB), 2^20 a million (MB), 2^30 a billion (GB), 2^40 a trillion (TB).',
    },
    {
      title: 'Latency numbers',
      body: 'A memory read takes about 100 ns; a random SSD read 20 to 100 µs; a spinning disk seek about 10 ms; a round trip inside a zone 0.1 to 0.5 ms, across zones 0.5 to 2 ms; California to Europe and back about 150 ms. The ratios matter more than the digits: memory is about 1,000 times faster than SSD, and hardware keeps improving the local numbers but never the speed of light.',
    },
    {
      title: 'From daily users to requests a second',
      body: 'Daily users times actions per user, divided by 86,400, gives the average. Split reads from writes, since the ratio (often 10:1 to 100:1) picks the design. Then size for peak: consumer traffic follows the day and peaks at about 2 to 3 times the average, while launches, ticket sales and breaking news can reach 10 times or more.',
    },
    {
      title: 'Storage',
      body: 'Record size times records a day times retention times replication. Add indexes and metadata (often 20 to 50% more), and state whether media sits in object storage while the database holds only small rows. Three full replicas triple the raw size; erasure coding in object stores costs closer to 1.5 times.',
    },
    {
      title: 'Bandwidth',
      body: 'Requests a second times response size gives bytes a second; multiply by 8 for bits, because network links and CDN bills are quoted in bits. 1 Gbps is only 125 MB/s. Separate ingress (uploads) from egress (views): for media, egress is usually 10 to 100 times larger and decides whether you need a CDN.',
    },
    {
      title: 'Round, say it, sanity-check',
      body: 'Round every input to one significant figure and say the assumptions before the arithmetic, so the interviewer can correct an input rather than your math. Then compare the result with something known: one relational database node takes roughly 10,000 simple writes a second, one Redis node about 100,000 operations, one app server hundreds to a few thousand requests. A result that needs one box or 10,000 boxes for a mid-sized product deserves a second look.',
    },
    {
      title: 'Throughput numbers',
      body: 'Pair the latencies with rates: a server network card moves 10 to 100 Gbps, an NVMe drive reads 2 to 7 GB/s sequentially, and reading 1 MB from memory takes tens of microseconds. They tell you whether a design is bound by the network, the disk or the CPU.',
    },
  ],
  examples: [
    {
      title: 'Photo sharing: storage and bandwidth',
      problem:
        'A photo app has 100 million daily users. Each uploads 0.1 photos and views 50 a day. A photo is stored as a 2 MB original plus 500 KB of resized versions, and views serve a 200 KB version. Plan storage for 5 years and the bandwidth for views.',
      insight: 'Uploads set storage and views set bandwidth; they are different problems with different answers.',
      steps: [
        'Uploads: 100 million times 0.1 is 10 million photos a day, about 100 a second (116 exactly). The write rate is not the hard part.',
        'Each photo keeps 2.5 MB, so a day adds 10 million times 2.5 MB, or 25 TB.',
        'A year is 25 TB times 365, about 9 PB (9,125 TB); five years about 46 PB. Three replicas make it about 137 PB, erasure coding about 68 PB: object storage, not a database.',
        'Views: 100 million times 50 is 5 billion a day, or 5 billion / 100,000, about 50,000 a second (57,870 exactly). Peak at twice that is about 115,000.',
        'Bandwidth: 57,870 times 200 KB is about 11.6 GB/s, or 93 Gbps on average and about 185 Gbps at peak.',
        'Serve views from a CDN near users, so the origin sees mostly first requests for new photos; the metadata database stays small by comparison.',
      ],
    },
    {
      title: 'A chat app message rate',
      problem:
        'A workplace chat app has 20 million daily users who each send 60 messages a day, nearly all within an 8-hour working day in nearby time zones. Each message reaches 10 recipients on average. What rates must the send path and the delivery path handle?',
      insight: 'Divide by the hours people are actually awake and working, not by 24, and count deliveries separately from sends.',
      steps: [
        'Messages a day: 20 million times 60 is 1.2 billion.',
        'Over 24 hours that is about 12,000 a second (13,900 exactly), but that average includes the empty night.',
        'Over 8 working hours, 28,800 seconds: 1.2 billion / 28,800 is about 42,000 a second, 3 times the 24-hour figure.',
        'Bursts inside the day (the start of work, after lunch) run higher again: plan for about twice that, about 83,000 sends a second.',
        'Deliveries are sends times 10: about 420,000 a second in working hours and 830,000 at peak. The delivery tier and its open connections are what you size.',
        'Sanity check: 83,000 writes a second is well past one relational primary, so the message store is partitioned, for example by channel.',
      ],
    },
    {
      title: 'Does the index fit in memory?',
      problem:
        'An orders table has 2 billion rows and grows 50% a year. Its index on `(user_id, created_at)` has 16-byte keys, an 8-byte row pointer and about 8 bytes of overhead per entry, in pages about 70% full. The server has 128 GB of RAM. Does the index fit now, and in two years?',
      insight: 'Entry size times entries, divided by page fill, against the memory the database actually gets.',
      steps: [
        'An entry is 16 + 8 + 8 = 32 bytes; 2 billion entries are 64 GB.',
        'Pages 70% full: 64 / 0.7 is about 91 GB.',
        'The buffer pool gets perhaps 75% of RAM, 96 GB: the index fits, barely, and leaves almost no room for the table rows themselves.',
        'Two years at 50% a year is 2.25 times: about 206 GB. It no longer fits.',
        'Why it matters: a page in memory costs about 100 ns, a page from SSD about 100 µs, 1,000 times more, and a lookup touches 3 or 4 pages.',
        'Because `user_id` leads the key, recent orders are scattered across the whole tree, so the hot part is not a small tail. Partition by month or shard by user to keep each index in memory; a bigger machine only buys time.',
      ],
    },
  ],
  pitfalls: [
    'Mixing bits and bytes: a 10 Gbps link moves 1.25 GB a second, and the slip is a silent 8x error.',
    'Sizing for the daily average: the system has to survive the busiest minute, often 2 to 3 times the average and more on launch days.',
    'Leaving replication, indexes and growth out of storage, which can turn "fits on one machine" into several times that.',
    'Spending five minutes on exact arithmetic, or giving a number without its assumptions: round hard, say the inputs, and use the result to make a decision.',
  ],
  followUps: [
    {
      question: 'How precise does an estimate need to be?',
      answer:
        'Precise enough to pick the design: one machine or many, cache or not, CDN or not. Being off by 2x rarely changes that choice; being off by 10x does, so the order of magnitude is what you defend.',
    },
    {
      question: 'How do you plan for growth?',
      answer:
        'Estimate for the horizon you will run the design, often one to three years, at a stated growth rate. Growth compounds: 50% a year for five years is about 7.6 times, which is often the difference between one database and a sharded one.',
    },
    {
      question: 'Does serving users worldwide smooth out the peak?',
      answer:
        'Partly: the global total is flatter because regions peak at different hours, but each region still peaks daily, and a round trip across an ocean costs about 150 ms. So size each region for its own peak and serve users from a nearby region.',
    },
  ],
};
