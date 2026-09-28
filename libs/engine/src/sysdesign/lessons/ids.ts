import type { SdLesson } from './types.js';

export const IDS_LESSON: SdLesson = {
  why: 'Every row, message and order needs an id, and the easy answer, one auto-increment counter in one database, becomes a bottleneck and a single point of failure the moment you shard. The choice of id then shapes much more than uniqueness: whether rows sort by time, how well the primary key index behaves, how big every foreign key is, and what an outsider learns from a URL. Interviewers ask you to generate ids without a central counter and to defend the bit layout with arithmetic.',
  widget: {
    kind: 'id-layout',
    tryThis: [
      'Keep the defaults, 10 generator bits, 12 sequence bits and a 1 ms tick: this is the Snowflake layout, with 41 timestamp bits lasting about 69.7 years, 1,024 generators and 4,096,000 ids a second per generator. Switch the tick to 10 ms: the timestamp lasts about 696.8 years, but each generator now makes only 409,600 ids a second.',
      'Switch the tick back to 1 ms and raise the generator bits to 16: you get 65,536 generators, but the timestamp shrinks to 35 bits and lasts only about 1.1 years. Every bit given to generators or the sequence halves the lifetime. Set 12 generator bits and 10 sequence bits instead: the timestamp is back to 41 bits and 69.7 years, with 4,096 generators at 1,024,000 ids a second each.',
      'In the random panel, keep 122 bits and a billion ids: the chance of any collision is about 9.4 × 10^-20, which is nothing. Switch to 64 bits: it jumps to about 2.7%. Now pick a trillion ids: at 64 bits a collision is near certain, while 122 bits still sit at about 9.4 × 10^-14. The risk grows with the square of the count and halves with every added bit.',
    ],
  },
  concepts: [
    {
      title: 'What an id must do',
      body: 'Unique, always, including across shards, regions and restarts. Often sortable by creation time, so a feed or a chat channel can page by id and recent rows stay together in the index. Compact: a 64-bit integer is half the size of a 128-bit UUID in every primary key, foreign key and index entry. And, if it appears in URLs, not guessable and not revealing. No single scheme wins on all four, so state which ones the design needs.',
    },
    {
      title: 'One counter, and how to split it',
      body: 'A single auto-increment is simple, compact and ordered, but every insert goes through one database. With shards you can give each shard an offset and a step (shard 1 issues 1, 4, 7; shard 2 issues 2, 5, 8 with a step of 3), which is hard to change when shards are added. Flickr ran two MySQL ticket servers, one issuing odd ids and one even, so either could fail. Range allocation (hi/lo) scales further: a node reserves a block, say 1,000 ids, with one database write and hands them out from memory. A crash leaves gaps, and ids only roughly follow time.',
    },
    {
      title: 'The Snowflake layout',
      body: "Twitter's Snowflake packs a signed 64-bit integer: a sign bit kept 0, 41 bits of milliseconds since a custom epoch, 10 bits of generator id and 12 bits of sequence within the millisecond. Each generator issues ids alone, with no coordination per id, and ids sort by time to the millisecond. The custom epoch matters: 2^41 ms is about 69.7 years, so counting from 1970 would run out in 2039, while counting from your launch date gives you the whole span. If a generator issues 4,096 ids in one millisecond, it waits for the next one.",
    },
    {
      title: 'Clocks and generator ids',
      body: 'The layout assumes two things. First, the clock never goes backwards: if an NTP step moves it back, a generator could reissue a timestamp and sequence it already used. A generator stores the last timestamp it used, waits out a small backwards jump and refuses to issue, and alerts, on a large one. Second, no two live generators share an id. Assign ids from static config for a fixed fleet, or lease them from a coordinator such as ZooKeeper or etcd at startup, and stop issuing if the lease is lost. A cloned config or a duplicated pod silently produces duplicate ids.',
    },
    {
      title: 'Random ids and the birthday bound',
      body: 'A UUIDv4 has 122 random bits (6 of its 128 are fixed for the version and variant), so any machine can mint one with no coordination at all. The chance of any repeat among n ids is about 1 - e^(-n^2 / 2^(b+1)) for b random bits: it grows with the square of the count, and reaches even odds near 2^(b/2) ids. For 122 bits that is beyond 10^18 ids, safe for anything real. For 64 random bits it is about 5 billion ids, and a billion already gives about a 2.7% chance, so random 64-bit ids need a uniqueness check.',
    },
    {
      title: 'Index locality: random versus time-ordered keys',
      body: 'A B-tree primary key likes inserts at its right edge: the hot pages stay in memory and pages fill completely. Random UUIDv4 keys land anywhere, so once the index outgrows memory each insert may read a cold page, pages split half full, and the index and write-ahead log grow faster. Time-ordered ids fix this. UUIDv7 (RFC 9562) puts a 48-bit Unix millisecond timestamp first and 74 random bits after it; ULID is 48 bits of milliseconds and 80 random bits, written as 26 characters. Both need no generator ids, at 128 bits instead of 64.',
    },
    {
      title: 'Ids the public can see',
      body: 'Sequential ids let anyone enumerate records by counting, and two orders a week apart reveal your order volume. A Snowflake id reveals when a row was created and on which generator. Unguessable ids are not access control: every read still checks permissions. When ids appear in URLs, keep the compact internal key and add a separate random public id, or encrypt the internal id into an opaque token. Short codes, as in a URL shortener, use base62 (a to z, A to Z, 0 to 9): 7 characters give 62^7, about 3.5 trillion codes, or about 41.7 bits.',
    },
  ],
  examples: [
    {
      title: 'Ids for a chat app on 1,000 servers',
      problem:
        'A chat service runs on 1,000 servers, each peaking at 10,000 messages a second. Message ids are the primary key, and a channel pages its history by id in time order. Design the ids.',
      insight:
        'Time-ordered 64-bit ids minted locally on each server meet all three needs: no central counter, sort by time, compact keys.',
      steps: [
        'The peak is 1,000 × 10,000 = 10 million messages a second: far beyond what one database counter can issue, and one counter would also be a single point of failure.',
        'UUIDv4 needs no coordination, but it is 128 bits in every key and index, it scatters inserts across the index, and it does not sort by time, so paging a channel needs a separate timestamp column.',
        'Use a Snowflake layout: 10 generator bits give 1,024 generator ids, enough for 1,000 servers with 24 spare. 12 sequence bits give 4,096 ids per millisecond, while a server needs 10,000 / 1,000 = 10 per millisecond: over 400 times headroom.',
        'Count 41 bits of milliseconds from a custom epoch at launch, say the start of 2026: they last about 69.7 years, to about 2095.',
        'Each server leases its generator id from etcd at startup and stops issuing if the lease lapses, so a restarted or cloned server can never share an id with a live one.',
        'Ids sort by millisecond, then by generator, so two messages from different servers a few milliseconds apart can swap order under clock skew. That is fine for chat; if a channel needs strict order, route all its writes through one server.',
      ],
    },
    {
      title: 'Size a Snowflake layout for a peak',
      problem:
        'A platform will run up to 3,000 id-generating processes at once, each peaking at 50,000 ids a second. Ids must fit a signed 64-bit column and last at least 50 years. Choose the bits.',
      insight:
        'Size the generator and sequence fields for the need plus headroom, then check the timestamp bits that remain still cover the lifetime.',
      steps: [
        'Generators: 2^11 = 2,048 is too few for 3,000, so take 12 bits, 4,096 generator ids.',
        'Sequence: 50,000 a second at a 1 ms tick is 50 per millisecond. 6 bits (64) would just cover it, but a burst stalls the generator, so take 10 bits: 1,024 per millisecond, 1,024,000 a second, about 20 times the peak.',
        'Timestamp: 63 - 12 - 10 = 41 bits. 2^41 = 2,199,023,255,552 ms, about 69.7 years: more than 50.',
        'Total capacity is 4,096 × 1,024,000, about 4.2 billion ids a second, against a platform peak of 3,000 × 50,000 = 150 million.',
        'If processes churn and each start takes a fresh generator id, 4,096 may run out; reuse ids through expiring leases rather than taking more bits, since each extra bit halves the lifetime to about 34.8 years.',
      ],
    },
    {
      title: 'Short-code length for a URL shortener',
      problem:
        'A URL shortener expects 1 billion links over 10 years, with base62 codes. How long must codes be, and should they be random or come from a counter?',
      insight:
        'A counter needs only enough characters to hold the count; random codes need far more room, because collisions grow with the square of the count.',
      steps: [
        '62^6 = 56,800,235,584, about 56.8 billion; 62^7 = 3,521,614,606,208, about 3.5 trillion.',
        'From a counter, 1 billion codes fit in 6 characters with about 57 times headroom. But sequential codes are enumerable, so pass the counter through a keyed permutation of the range (a small block cipher) before encoding.',
        'Random 7-character codes: with 1 billion stored, a new code hits an existing one with chance 1 billion / 3.52 trillion, about 1 in 3,500, so insert under a unique constraint and retry on conflict.',
        "Skip the check and the expected number of colliding pairs is 10^18 / (2 × 3.52 × 10^12), about 142,000: some links would silently point at other people's URLs.",
        'Even 8 characters (about 218 trillion codes) leave about 2,300 expected collisions among a billion, so random codes always need the uniqueness check; length only sets how often it retries.',
      ],
    },
  ],
  pitfalls: [
    'Counting a 41-bit millisecond timestamp from 1970: it runs out in 2039. Use a custom epoch near launch.',
    'Letting two live generators share an id, through a copied config or a cloned container: they issue duplicate ids with no error. Lease generator ids and keep a unique constraint on the key.',
    'Sending 64-bit ids to JavaScript as JSON numbers: numbers above 2^53 lose precision, so two ids can parse to the same value. Send them as strings.',
    'Treating an unguessable id as permission: a leaked link or log line exposes the record unless every read checks access.',
  ],
  followUps: [
    {
      question: 'Are Snowflake ids strictly increasing across the whole system?',
      answer:
        'No. They increase per generator, and across generators they are only roughly time-ordered: ids from the same millisecond sort by generator id, and clock skew between machines can put a later event behind an earlier one by a few milliseconds. A strict global order needs one sequencer, such as a single counter or a log partition, which is exactly the bottleneck the layout avoids.',
    },
    {
      question: 'The clock on a generator jumps back two seconds. What happens?',
      answer:
        'A naive generator reuses timestamps it has already issued and may repeat ids. A careful one compares with the last timestamp it used: for a short jump it waits until the clock passes that point, and for a long one it refuses to issue and alerts, so callers fail over to another generator. Running NTP in slew mode, which speeds or slows the clock instead of stepping it, keeps such jumps rare.',
    },
    {
      question: 'When would you pick UUIDv7 over a Snowflake id?',
      answer:
        'When clients or many short-lived services must mint ids with no generator id assignment at all, or ids must merge across systems you do not control. UUIDv7 needs no coordination and keeps inserts time-ordered, at 128 bits instead of 64. Pick Snowflake when key size matters across billions of rows and you can manage generator ids.',
    },
  ],
};
