import type { CaseStudy } from './types.js';

export const URL_SHORTENER: CaseStudy = {
  id: 'url-shortener',
  stages: [
    {
      kind: 'requirements',
      title: 'Clarify what matters',
      prompt:
        'Before drawing anything, list the questions you would ask the interviewer. Keep the ones whose answers would change the design.',
      decision: {
        question: 'You have time for one question first. Which answer changes the design the most?',
        options: [
          {
            label: 'How many links are created per day, and how often is each one clicked?',
            best: true,
            why: 'Scale and the read to write ratio decide nearly everything that follows: key length, storage, caching and how many servers you need.',
          },
          {
            label: 'Can users pick a custom alias?',
            why: 'Worth asking, since it adds a uniqueness check on user input, but it changes one code path, not the architecture.',
          },
          {
            label: 'Which programming language should we use?',
            why: 'Interviewers rarely care. It changes nothing about capacity, storage or availability.',
          },
          {
            label: 'Should the short domain use HTTPS?',
            why: 'Yes, always, so there is nothing to decide. Asking it spends time without narrowing the design.',
          },
        ],
      },
      points: [
        'Functional: create a short link for a long URL, redirect a short link to its URL, optional custom alias and expiry.',
        'Out of scope unless asked: user accounts, editing links after creation, a full analytics dashboard.',
        'Scale (from the interviewer): 100 million new links a day, and reads outnumber writes about 100 to 1.',
        'Non-functional: redirects must be fast (under about 50 ms at the server) and highly available; a broken short link breaks every page that embeds it.',
        'Links should not be guessable in sequence, so nobody can enumerate private links.',
      ],
    },
    {
      kind: 'estimation',
      title: 'Estimate the traffic',
      prompt: 'With 100 million new links a day and 100 reads per write, how many redirects per second does the service serve on average?',
      estimate: {
        question: 'Average redirects per second',
        answer: 115_741,
        unit: 'redirects/s',
        working: [
          'A day has 86,400 seconds; round it to 100,000 when estimating in your head.',
          'Writes: 100 million / 100,000 is about 1,000 new links per second (1,160 exactly).',
          'Reads: 100 times that is about 100,000 redirects per second (116,000 exactly).',
          'Peaks run about twice the average, so plan for roughly 230,000 redirects per second.',
        ],
      },
      points: [
        'About 1.2k writes/s and 116k reads/s on average, with peaks near 230k reads/s.',
        'This is overwhelmingly read-heavy: the design is a fast key lookup with a slow trickle of inserts.',
        'Spread across three regions, each serves about 40k redirects per second on average.',
      ],
    },
    {
      kind: 'estimation',
      title: 'Estimate the storage',
      prompt: 'Links are kept for five years. If each record takes about 500 bytes, how much storage is that?',
      estimate: {
        question: 'Storage for five years of links',
        answer: 91,
        unit: 'TB',
        working: [
          'Links per year: 100 million a day times 365 is 36.5 billion.',
          'Five years: 182.5 billion links.',
          'At 500 bytes each: 182.5 billion times 500 bytes is about 91 trillion bytes, so about 91 TB.',
          'That is too much for one database server, so the data must be split across machines.',
        ],
      },
      points: [
        'About 180 billion links and 90 TB over five years, before replication.',
        'The key space must hold 180 billion codes: 62 characters (a to z, A to Z, 0 to 9) to the 7th power is 3.5 trillion, enough; 6 characters give only 57 billion.',
        'So codes are 7 base62 characters.',
      ],
    },
    {
      kind: 'api',
      title: 'Define the API',
      prompt: 'Sketch the two endpoints. What status code should a redirect return?',
      decision: {
        question: 'The product team wants click counts per link. Which redirect status fits?',
        options: [
          {
            label: '`302 Found` (temporary)',
            best: true,
            why: 'Browsers ask the service on every click, so every click can be counted, and a link can later be disabled if it turns malicious.',
          },
          {
            label: '`301 Moved Permanently`',
            why: 'Without `Cache-Control`, browsers cache it indefinitely and skip the service on repeat clicks, losing those counts, and the redirect cannot be taken back. A short `max-age` softens this, but 302 makes the intent explicit.',
          },
          {
            label: '`200 OK` with the URL in the body',
            why: 'The browser would not follow it. The client would need custom code, which breaks short links pasted anywhere.',
          },
        ],
      },
      points: [
        '`POST /links` with the long URL, and optional alias and expiry, returns `201` with the short code.',
        '`GET /{code}` returns `302` with a `Location` header, or `404` for unknown or expired codes.',
        'Validate the long URL and reject known malware domains at creation; rate limit creation per client.',
      ],
    },
    {
      kind: 'data',
      title: 'Model the data',
      prompt: 'What is stored, and what is the only query on the hot path?',
      points: [
        'One record per link: code (the primary key), long URL, creation time, expiry and an optional owner.',
        'The hot path is a single lookup by code, with no joins or range scans. A key-value store or a sharded relational table both fit.',
        'Shard by a hash of the code, so load and data spread evenly and each lookup goes to exactly one shard.',
        'Click counts are not written on the redirect path: they are sent to a log or queue and aggregated in batches.',
      ],
    },
    {
      kind: 'deep-dive',
      title: 'Generate the codes',
      prompt: 'Codes must be unique, 7 characters and hard to guess. How do you mint 1,200 of them a second?',
      decision: {
        question: 'Which way of generating codes would you defend?',
        options: [
          {
            label: 'Hand each server a range from a counter service and base62-encode, after shuffling the bits',
            best: true,
            why: 'No collisions and no coordination per write: a server fetches a range of, say, a million numbers only now and then. A keyed reversible permutation (a small Feistel cipher over 41-bit IDs, since 2 to the 41st is 2.2 trillion and fits in 7 characters) makes consecutive IDs look unrelated.',
          },
          {
            label: 'Pick 7 random characters and check that the code is free',
            why: 'Defensible too: a put-if-absent insert makes the check free, and with the space about 5% full after five years, retries stay rare. It needs no coordination service, but retries grow if the space is sized too tightly.',
          },
          {
            label: 'Hash the long URL (for example MD5) and keep the first 7 characters',
            why: 'Truncated hashes collide, so you still need a check and a fallback, and the same URL always gets the same code, which leaks that someone else shortened it.',
          },
          {
            label: 'A single auto-increment column in one database',
            why: 'Unique, but that one database becomes the write bottleneck and a single point of failure, and sequential codes are trivially enumerable.',
          },
        ],
      },
      points: [
        'A small coordination service (for example ZooKeeper or a single row updated in a transaction) hands out ranges; losing a server wastes the rest of its range, which is fine.',
        'Custom aliases share the table and its uniqueness constraint; requiring at least 8 characters means they never collide with 7-character generated codes.',
      ],
    },
    {
      kind: 'design',
      title: 'Put it together',
      prompt: 'Draw the path of a redirect. Where does the 116k per second actually land?',
      lab: true,
      points: [
        'Clients reach a load balancer pair, then a fleet of stateless app servers.',
        'A cache in front of the database holds hot codes; link popularity is heavily skewed, so a 90% hit rate is realistic.',
        'Misses go to the sharded database; read replicas absorb reads and keep a copy if a primary fails.',
        'Writes go to the owning shard directly. At 1.2k per second they are not the bottleneck.',
        'A CDN or edge cache can serve popular redirects with a short TTL, taking most of a viral load; clicks are then counted from edge logs.',
        'Open the build in the Lab: it serves one region at 40k redirects per second. Push the traffic up and see which component gives first.',
      ],
    },
    {
      kind: 'deep-dive',
      title: 'Handle a viral link',
      prompt: 'One link is posted on a huge account and gets 500,000 clicks a second. What breaks?',
      points: [
        'A single cache key gets all that traffic, and it lives on one cache node: a hot key.',
        'Keep a small in-process cache on each app server for the hottest codes, with a TTL of a few seconds, so the shared cache sees one request per server per TTL.',
        'Coalesce concurrent misses for the same key, so an expired hot entry triggers one database read, not thousands.',
        'Counting clicks stays off the request path, so the viral link cannot overload the analytics store either.',
        'Cache misses for unknown codes too, briefly, so a scan guessing codes cannot drive every guess to the database.',
      ],
    },
    {
      kind: 'wrap-up',
      title: 'Close the loop',
      prompt: 'You have five minutes left. What would you raise before the interviewer does?',
      points: [
        'Expiry: a daily job deletes expired links, and a lookup treats an expired record as missing even before the job runs.',
        'Abuse: scan new URLs against malware lists, rate limit creation, and let an operator disable a code (this is why 302 helps).',
        'Multi-region: codes are globally unique from the range service, so any region can create them, and reads are served from the nearest region. A link clicked elsewhere before it replicates misses there, so on a miss fall back to its home region, which the range can encode.',
        'Monitoring: redirect latency p99, cache hit rate and the error rate of the range service.',
      ],
    },
  ],
  pitfalls: [
    'Jumping to the database schema before estimating scale, then choosing a key length that runs out.',
    'Returning 301 without noticing it breaks click counting and link takedowns.',
    'Updating a click counter row on every redirect, turning a read-heavy service into a write-heavy one.',
    'Ignoring hot keys: average load is fine, but one viral link can melt a single cache node.',
  ],
  followUps: [
    {
      question: 'How would you show each link owner their click count within a minute?',
      answer:
        'Emit a click event to a queue on each redirect, aggregate per code in one-minute windows with a stream processor, and write the totals to a separate analytics store the dashboard reads.',
    },
    {
      question: 'What happens if the counter service is down?',
      answer:
        'Each app server keeps the rest of its current range, so creation continues until ranges run out: at about 36 writes a second per server, a million-number range lasts hours. Run the counter service replicated so a failover finishes well before then.',
    },
    {
      question: 'How do you stop someone enumerating every link?',
      answer:
        'Generated codes are not sequential, creation and lookups are rate limited per client, and private links can require a longer code or authentication.',
    },
  ],
};
