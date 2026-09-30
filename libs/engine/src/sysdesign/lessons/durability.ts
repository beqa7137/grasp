import type { SdLesson } from './types.js';

export const DURABILITY_LESSON: SdLesson = {
  why: 'Disks die every day in any large fleet, so a storage system survives only by keeping redundant pieces and rebuilding them faster than the next failures arrive. The choice between replicas and erasure codes sets how much raw storage you buy, how much network a repair burns and how many nines you can honestly claim. Interviewers probe whether you can price that trade-off, explain what the nines assume, and say what durability does not protect against.',
  widget: {
    kind: 'durability',
    tryThis: [
      'Pick 3 copies with a 2% yearly failure rate and 24 hours of repair: 3x storage, 2 failures tolerated, 9.7 nines, about 1 in 5.6 billion objects lost a year. Switch to 6 + 3 erasure coding: 1.5x storage, 3 failures tolerated and 11.8 nines (1 in 600 billion). Half the space buys two more nines, but a repair now reads 6x the lost piece instead of 1x.',
      'Keep 3 copies at 2% and move the repair time: 1 hour gives 12.5 nines, 24 hours 9.7, 168 hours 8.1. A week of repair costs 1.6 nines against a day, because both remaining copies must fail inside the window, so 7 times the window is about 49 times the loss. Try the same with 2 copies: 5.7 nines at 24 hours and 4.8 at 168, since one more failure is enough.',
      'Pick 10 + 4 at 2% and 24 hours: 1.4x storage, 4 failures tolerated, 14.7 nines, but each repair reads 10x. Now raise the failure rate to 10% and the repair time to 168 hours: 7.9 nines. Two copies at the same settings keep only 3.4 nines (1 in 2,600 a year). Failing disks and slow repairs cost the 10 + 4 code almost seven nines, however much parity it has.',
    ],
  },
  concepts: [
    {
      title: 'Durability is not availability, and not backup',
      body: 'Availability asks whether you can read the data right now; durability asks whether it still exists at all. A zone outage makes data unavailable for an hour and loses nothing; three disks dying before a repair loses it for good. Durability is quoted as the chance a stored object survives a year: 11 nines means a yearly loss chance of 1 in 100 billion per object. It covers hardware, not people: a delete, a buggy overwrite or ransomware is stored faithfully on every copy, which is what backups and versioning are for.',
    },
    {
      title: 'Replication: simple, and expensive',
      body: 'Keep n full copies on n different disks: the overhead is n times the data, and the object survives n - 1 losses. Reads can go to any copy, a repair copies one surviving replica, and nothing has to be decoded. Three copies became the default in systems such as GFS and HDFS because they tolerate two failures at once, while two copies leave no margin during a repair: one more failure and the object is gone.',
    },
    {
      title: 'Erasure coding',
      body: 'A Reed-Solomon code cuts an object into k data pieces and computes m parity pieces, n = k + m in all, such that any k of the n rebuild the object. The overhead is n / k and it survives any m losses: 6 + 3 stores 1.5x and tolerates 3, 10 + 4 stores 1.4x and tolerates 4, against 3x and 2 for three copies. The cost moves elsewhere: writes compute parity, a read of a missing piece has to fetch k others and decode, and small objects are spread over many disks, so one read becomes several seeks.',
    },
    {
      title: 'Repair traffic, and locally repairable codes',
      body: 'Rebuilding one lost replica reads one copy. Rebuilding one lost Reed-Solomon piece reads k pieces, so a 10 + 4 code reads 10 times the lost data over the network, and a 20 TB disk failure means about 200 TB of repair reads. Locally repairable codes cut that: Azure Storage uses an LRC with 12 data pieces in two groups of 6, one local parity per group and 2 global parities. It stores 16 / 12, about 1.33x like Reed-Solomon 12 + 4, tolerates any 3 losses (not any 4), and rebuilds a single lost data piece by reading 6 pieces of its local group instead of 12.',
    },
    {
      title: 'Repair speed is the main lever',
      body: 'An object is lost only if enough further failures land while an earlier one is being repaired. The chance of one more failure in the window grows with the window, and a scheme that tolerates t losses needs t more in the same window, so the yearly loss grows roughly with the repair time to the power t. Halving the repair time of three copies cuts losses about four times; for 6 + 3 about eight times. Real systems rebuild from many disks in parallel, prioritize objects that have lost the most pieces, and scrub data in the background, because a latent bad sector that nobody has read is a failure you have not counted.',
    },
    {
      title: 'Correlated failures and failure domains',
      body: 'The simple model, and the widget, assume disks fail independently. Real failures arrive together: a rack loses its switch or power, a batch of disks from one bad production run wears out in the same month, a firmware bug or a building power event takes many nodes at once. So place each copy or piece in a different failure domain: different disks, racks and power feeds, and different zones for anything that must survive a zone. Nines computed under independence are an upper bound, and real losses are likelier by a margin nobody can compute exactly.',
    },
    {
      title: 'Hot data replicated, cold data erasure coded',
      body: 'Recently written, frequently read data favours replicas: reads come from any single copy, a slow disk can be skipped, and nothing is decoded. Most bytes in a big store are cold, and there the 2x saving of erasure coding dominates. Large object and file stores do both: Facebook moved warm photos from replicated Haystack to f4, which uses Reed-Solomon 10 + 4, and HDFS offers policies such as RS 6 + 3 and RS 10 + 4 alongside 3x replication. Data is often written replicated and re-encoded once it cools.',
    },
  ],
  examples: [
    {
      title: 'Estimate the durability of three copies',
      problem:
        'An object is stored as 3 copies on 3 disks. Disks fail at 2% a year, independently, and a lost copy is rebuilt in 24 hours. Roughly how likely is the object to be lost in a year, and what happens if repairs take a week?',
      insight:
        'Loss needs a first failure and then every remaining copy failing before the repair ends, so the repair window is multiplied in once per extra failure.',
      steps: [
        'Chance a given disk fails during a 24 hour repair window: 0.02 × 24 / 8,760 ≈ 5.5 × 10^-5.',
        'A first failure hits one of the 3 disks at about 3 × 0.02 = 0.06 times a year.',
        'The object is lost only if both other copies fail inside that window: (5.5 × 10^-5)^2 ≈ 3.0 × 10^-9.',
        '0.06 × 3.0 × 10^-9 ≈ 1.8 × 10^-10 a year: about 9.7 nines, or 1 in 5.6 billion objects. Across 10 billion objects that is about 2 lost a year.',
        'With 168 hour repairs the window is 7 times longer and the per-disk chance is about 3.8 × 10^-4; squared and times 0.06 that is about 8.8 × 10^-9, or 8.1 nines. A 7 times slower repair loses 49 times more data.',
      ],
    },
    {
      title: 'Store 10 PB: replicas or erasure coding?',
      problem:
        'You must store 10 PB of cold objects on 20 TB disks that fail at 2% a year. Compare 3 copies, 6 + 3 and 10 + 4 on raw storage, disk count, and the network a year of repairs needs.',
      insight: 'Erasure coding halves the disks but multiplies the bytes each repair reads by k.',
      steps: [
        'Raw storage: 3 copies need 30 PB, 6 + 3 needs 10 × 1.5 = 15 PB, 10 + 4 needs 10 × 1.4 = 14 PB. That is 1,500, 750 and 700 disks of 20 TB.',
        'Failures a year at 2%: about 30, 15 and 14 disks.',
        'Repair reads per full disk: 20 TB for a replica, 6 × 20 = 120 TB for 6 + 3, 10 × 20 = 200 TB for 10 + 4. A year: 600 TB, 1.8 PB and 2.8 PB.',
        'To rebuild a 10 + 4 disk in 24 hours the cluster reads 200 TB / 86,400 s ≈ 2.3 GB/s, about 18.5 Gb/s, spread across the disks that hold the other pieces. Replicas need about 1.85 Gb/s.',
        'Choose 6 + 3 or 10 + 4 for the cold data: 750 to 800 fewer disks outweigh the repair traffic, which you throttle below user traffic. An LRC trims that traffic further; replicas stay the choice for hot, small objects.',
      ],
    },
    {
      title: 'The product asks for eleven nines',
      problem:
        'A team stores 10 million objects and wants eleven nines of yearly durability. What does that promise mean in objects, and what design gets there without fooling yourself?',
      insight:
        'Eleven nines is a design target from a model; hit it with margin under independence, then remove the correlations the model ignores.',
      steps: [
        'Amazon S3 and Google Cloud Storage say they are designed for eleven nines a year: a modelled design target, not a guarantee their SLAs pay out on. It is a loss chance of 10^-11 per object a year. Across 10 million objects that is 10^-4 objects a year: on average one object lost every 10,000 years.',
        'Three copies at 2% a year and 24 hour repairs reach about 9.7 nines by the independent model, short of the target. Repairing in 6 hours gives 10.9, still short.',
        '6 + 3 at the same 24 hour repairs gives about 11.8 nines at half the storage of three copies, and 10 + 4 about 14.7: some margin, which you need because the model is optimistic.',
        'Place the 9 pieces of 6 + 3 on 9 different racks, 3 per zone across 3 zones. A zone outage removes 3 pieces and leaves exactly 6, so data stays readable, but with no margin until the zone returns.',
        'Measure disk failure rates and repair times in production and re-run the numbers, and add versioning plus backups: none of these nines survive a bad delete.',
      ],
    },
  ],
  pitfalls: [
    'Quoting nines from an independent-failure model as a promise: racks, power events and bad disk batches make real losses far likelier than the arithmetic says.',
    'Putting two replicas or pieces of one object in the same rack, power domain or zone, so one event takes out more than the scheme tolerates.',
    'Treating durability as backup: a delete, a buggy overwrite or a ransomware encryption is stored durably on every copy.',
    'Erasure coding hot, small objects: every read touches several disks, a missing piece means decoding, and a disk failure starts a repair that reads k times its size.',
    'Letting repairs queue behind user traffic or skipping scrubs: every hour at reduced redundancy, and every unread bad sector, is durability quietly given up.',
  ],
  followUps: [
    {
      question: 'How can 6 + 3 be more durable than three copies while storing half as much?',
      answer:
        'Three copies are lost when 3 disks fail close together; 6 + 3 needs 4 of its 9 disks to fail inside one repair window. More pieces mean more chances of a first failure, but each extra required failure multiplies in another small probability, which wins by orders of magnitude. The price is paid in repair reads, decoding and read latency, not in durability.',
    },
    {
      question: 'Why do locally repairable codes exist if Reed-Solomon is optimal on storage?',
      answer:
        'Reed-Solomon uses the least storage for its fault tolerance, but rebuilding any one piece reads k pieces, and single-disk failures are by far the most common repair. An LRC adds a little storage or gives up a little tolerance so a single loss is rebuilt from a small local group: Azure halves repair reads from 12 pieces to 6 at the same 1.33x overhead as Reed-Solomon 12 + 4.',
    },
    {
      question: 'You cannot observe a 10^-11 loss rate. How do you know durability is healthy?',
      answer:
        'Watch its inputs: measured disk failure rates, time from failure to full redundancy, the count of objects below full redundancy and how far below, and scrub findings of silent corruption. Feed measured rates into the model, and alert on repair backlogs long before any object is at its last spare piece.',
    },
  ],
};
