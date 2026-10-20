import type { CaseStudy } from './types.js';

export const HOTEL_BOOKING: CaseStudy = {
  id: 'hotel-booking',
  stages: [
    {
      kind: 'requirements',
      title: 'Clarify what matters',
      prompt:
        'A traveler searches Lisbon for three nights next month, compares a few hotels and books the last double room. Meanwhile the same hotel sells rooms on other sites and at its front desk. Which requirements shape the design, and which do you park?',
      decision: {
        question: 'What do you promise about availability and bookings?',
        options: [
          {
            label:
              'Confirmed bookings never exceed what the hotel allows for any night of the stay, while search results may be a few minutes stale',
            best: true,
            why: 'Hotels set how many rooms of each type they will sell per night, sometimes a few more than they have, expecting late cancellations and no-shows. Going past that limit means a guest turned away at the desk. A search that shows a room which is gone costs one "no longer available" message, because the booking itself is checked against the truth.',
          },
          {
            label: 'Search shows exactly current availability for every hotel it lists',
            why: 'A city search covers hundreds of hotels, each across several nights. Reading all of that from the inventory primaries on every search, at about 200 searches per booking, would put almost the whole read load on the one store that must stay fast for bookings.',
          },
          {
            label: 'Never sell more rooms than physically exist: no overbooking, ever',
            why: "Sounds safest, but it is the hotel's decision, not the platform's: many hotels overbook slightly on purpose because some guests cancel late or never arrive. The system should enforce the hotel's limit, which is usually the room count and sometimes a little more.",
          },
        ],
      },
      points: [
        'Functional: search hotels by city (or a map area), dates and guests, with prices and availability; view a hotel with its room types, rates and cancellation policies; book and pay (or leave a card to pay at the hotel); cancel; and let hotels, directly or through a channel manager, update rooms and rates.',
        'Scale (from the interviewer): 1 million hotels with about 5 room types each, 1 million bookings a day, about 200 searches for every booking, and a peak hour at three times the average rate. Hotels sell up to a year ahead.',
        'Non-functional: no night of a stay beyond the hotel limit; a retried booking never creates two reservations or two charges; search fast and at most a few minutes stale; booking keeps working even when search degrades.',
        'Out of scope unless asked: reviews, ranking and recommendations, loyalty programs, how hotels set prices, and paying the hotels.',
      ],
    },
    {
      kind: 'estimation',
      title: 'Estimate the search load',
      prompt:
        'Travelers run about 200 searches for every booking, there are 1 million bookings a day, and the peak hour runs at three times the average. How many searches per second arrive at peak?',
      estimate: {
        question: 'Searches per second at peak',
        answer: 6_944,
        unit: 'searches/s',
        working: [
          '1 million bookings x 200 searches is 200 million searches a day.',
          '200,000,000 / 86,400 seconds is about 2,315 searches per second on average.',
          'At three times the average: 600,000,000 / 86,400 is about 6,944 searches per second at peak.',
        ],
      },
      points: [
        'Bookings are tiny by comparison: 1 million a day is about 12 a second on average and 35 at peak. A look to book ratio like this is why search and booking are built as two different paths.',
        'Each search covers a city and every night of the stay. Read naively from inventory, 300 hotels x 5 room types x 3 nights is 4,500 rows per search, and 4,500 x 6,944 is about 31 million row reads a second.',
        'Add hotel pages (about 3,000 a second at peak, an assumption), a few hundred booking, payment and cancellation calls, and rate and availability updates from hotels and channel managers (about 1,500 a second, also an assumption): about 12,000 requests a second, 85% of them reads.',
        'So the design splits: a read-optimized search path that never touches the inventory primaries, and a small booking path that must be strongly consistent.',
      ],
    },
    {
      kind: 'api',
      title: 'Make booking safe to retry',
      prompt:
        'A traveler taps "Book" on a train, the connection drops, and the app retries. How does the API make sure the retry creates neither a second reservation nor a second charge?',
      decision: {
        question: 'How do you make a booking request idempotent?',
        options: [
          {
            label:
              'The client creates an idempotency key when checkout opens and sends it on every attempt; the server stores it with the booking under a unique constraint',
            best: true,
            why: 'The key is written in the same transaction as the hold, so a retry either finds the finished booking and returns the same answer, or finds nothing and runs once. The booking ID plus an attempt number, which rises only after a declined card, then keys the payment call, so a retried charge is deduplicated by the provider too.',
          },
          {
            label: 'Treat the same guest, hotel, room type and dates within a few minutes as a retry',
            why: 'Catches most double taps, but a family booking two identical rooms as two bookings gets the second one silently dropped, and a retry after the window still creates a duplicate.',
          },
          {
            label: 'Keep recent keys in a cache with a TTL and check it before booking',
            why: 'Fast, but the check and the booking live in two systems with a gap between them: two retries arriving together both miss, and an eviction or failover forgets a key while its booking exists. The database constraint is the guard; a cache can only sit in front of it.',
          },
          {
            label: 'Disable automatic retries and tell the guest to wait',
            why: 'Moves the problem to the guest, who taps again or reloads. Networks drop responses after the server has acted, so the server must handle repeats anyway.',
          },
        ],
      },
      points: [
        '`GET /search` with a city or map box, check-in and check-out dates, guests and filters returns a page of hotels with the lowest available price for the stay. It may be a few minutes stale.',
        '`GET /hotels/{id}/rooms` with dates returns room types, rate plans, cancellation policies and near current availability, so the guest sees fresher numbers than search before committing.',
        '`POST /bookings` with hotel, room type, rate plan, dates, guests and an `Idempotency-Key` holds the rooms and returns a booking ID, the total price and `expires_at`, or `409` naming the sold out night.',
        '`POST /bookings/{id}/pay` pays or stores the card; `GET /bookings/{id}` reports held, paying, confirmed, expired or cancelled; `DELETE /bookings/{id}` cancels under the saved policy.',
      ],
    },
    {
      kind: 'data',
      title: 'Count rooms per night',
      prompt:
        'A guest books a double room for three nights. What exactly is decremented, and what stops two guests from taking the last room on the same night?',
      decision: {
        question: 'How do you model what a hotel can sell?',
        options: [
          {
            label: 'A counter row per room type per night, and a booking updates every night of the stay conditionally in one transaction',
            best: true,
            why: 'Guests book a room type, not room 412; the hotel assigns rooms at check-in. One small row per night makes the check exact and cheap, a three night stay touches three rows on one shard, and an overbooking allowance is just a higher limit on the row.',
          },
          {
            label: 'A row per physical room per night, and a booking picks a free room',
            why: 'Works, and it is the right model for rentals where every unit differs. For hotels it multiplies the rows by the room count, forces an early room assignment the front desk then overrides, and makes search count free rooms at read time.',
          },
          {
            label: 'Store only bookings with their dates, and count overlapping bookings at booking time',
            why: 'Nothing extra to keep in step, but every check scans overlapping bookings, and two concurrent bookings can both count before either inserts, so it needs a lock over the whole room type to be safe.',
          },
        ],
      },
      estimate: {
        question: 'Inventory rows for every room type, one year ahead',
        answer: 1_825_000_000,
        unit: 'rows',
        working: [
          '1 million hotels x 5 room types is 5 million room types.',
          'One row per room type per night, 365 nights ahead: 5,000,000 x 365 is 1.825 billion rows.',
          'At about 50 bytes a row that is about 91 GB, easily spread over a handful of shards.',
        ],
      },
      points: [
        'Inventory: hotel ID, room type ID, date, `total` (rooms the hotel will sell that night, including any overbooking allowance), `booked` and `held`. Rates live in their own table per room type, rate plan and night.',
        'A hold is one statement: add n to `held` on every night from check-in up to the night before check-out, only where booked plus held plus n is at most `total`. If fewer rows changed than the stay has nights, roll back: a stay is all or nothing.',
        'Overbooking is a hotel setting stored as the gap between `total` and the physical room count, per room type and night: two extra standard rooms on an ordinary Tuesday, none during a sold out festival. The platform enforces the number; it does not choose it.',
        'Bookings: booking ID, hotel, guest, room type, dates, count, status, `hold_expires_at`, the idempotency key, and snapshots of the price and cancellation policy. They live on the same shard as the hotel inventory, so hold and booking are one local transaction.',
        'Shard inventory, rates and bookings by hotel ID: a stay is always at one hotel, so every hold and confirmation is a single-shard transaction. A guest list of bookings is a separate index keyed by guest, updated asynchronously.',
      ],
    },
    {
      kind: 'design',
      title: 'Put it together',
      prompt:
        'Trace a search and a booking through the system. Which store answers the 7,000 searches a second, and which one sees the bookings?',
      lab: true,
      points: [
        'Search: a search service over an index of hotels (location, stars, amenities, room types) that also holds a summary per hotel, room type and night: rooms left and the lowest price. It keeps the hotels that are open for every night of the stay and ranks them.',
        'Results are cached by a normalized key (city or map tile, dates, guests, filters, currency) for a few minutes. Many travelers search the same cities for the same popular dates, so a large share hits the cache, and a miss costs one index query, never a read of the inventory primaries.',
        'Booking: stateless booking servers write holds and bookings with conditional updates on the primary that owns the hotel. Payment goes to the provider with the booking ID plus an attempt number as its idempotency key.',
        'Every inventory, rate or booking change writes an outbox row in the same transaction. Workers read the outbox to update the search summaries within seconds, to push availability to the channel manager and to send confirmations; inbound channel manager updates arrive through the same queue.',
        'Open the build in the Lab: 12,000 requests a second, 85% reads, on 4 primaries sharded by a hash of the hotel ID, with replicas. The cache stands for the search index and result cache, and the queue and workers for the outbox and channel sync. Lower the cache hit rate to see what searches would do to the primaries.',
      ],
    },
    {
      kind: 'deep-dive',
      title: 'Hold rooms and take payment',
      prompt:
        'A guest holds the last room, then spends eight minutes on the payment page. Another guest wants the same room. A third payment times out with no answer. What happens to the inventory in each case?',
      decision: {
        question: 'When do the rooms leave inventory?',
        options: [
          {
            label: 'Hold them with a short expiry when checkout starts, then confirm when payment succeeds',
            best: true,
            why: 'The contended step is one fast conditional write, payment happens only for rooms that are already yours, and an abandoned checkout gives the rooms back by itself. Hotel checkouts are unhurried, so a hold of 10 to 15 minutes fits.',
          },
          {
            label: 'Take payment first, then try to book the rooms',
            why: 'Keeps payment away from the inventory write, but when the last room goes meanwhile you must refund a guest you already charged. Rare on a quiet night, and frequent on exactly the busy nights guests care about.',
          },
          {
            label: 'Lock the inventory rows, call the payment provider and commit, all in one transaction',
            why: 'The payment call takes seconds, sometimes minutes when the bank asks the guest to confirm in an app, so row locks are held across it while every other booking for that hotel and night waits, and a timeout leaves you unsure whether the card was charged.',
          },
        ],
      },
      points: [
        'The hold raises `held` on each night and creates the booking in state held with `hold_expires_at`, in one transaction. A sweeper releases expired holds every few seconds: subtract from `held` and mark the booking expired, only if it is still held. Until it runs, an expired hold still blocks the room, which errs on the safe side.',
        'At payment the booking moves from held to paying, which extends its deadline. The sweeper never releases a paying booking without first asking the payment provider what happened.',
        'Success: in one transaction move n from `held` to `booked` on each night and mark the booking confirmed, only where it is still paying. The outbox then sends the confirmation and the channel manager update.',
        'Declined: back to held, so the guest can try another card until the hold expires. Timeout or a lost answer: stay in paying, ask the provider with the same idempotency key, and decide from its answer or its webhook; release the rooms only once the payment is known to have failed.',
        'Cancellation applies the policy saved on the booking (free until a date, then a fee), subtracts from `booked` on each night and emits an update, so the room is on sale again everywhere.',
      ],
    },
    {
      kind: 'deep-dive',
      title: 'Keep search fresh and sync channels',
      prompt:
        'The hotel also sells on other sites and at its desk, through a channel manager that keeps one count across all of them. Search reads a summary that lags behind. Where can a room be sold twice, and what do you do about it?',
      decision: {
        question: 'How do you apply availability updates from a channel manager?',
        options: [
          {
            label:
              'Treat each update as the absolute number of rooms you may sell for a room type and night, with a sequence number, and ignore anything older',
            best: true,
            why: 'An absolute value is idempotent, so a duplicated or retried message changes nothing, and a lost message is repaired by the next one. The sequence number stops a late, older message from overwriting a newer one.',
          },
          {
            label: 'Apply updates as deltas: "one room fewer" or "two rooms more"',
            why: 'Smaller messages, but a duplicated delta counts twice and a lost one never heals, so the counts drift apart until someone reconciles them by hand.',
          },
          {
            label: 'Poll every hotel for its full calendar every few minutes',
            why: 'Simple and self-correcting, and a good nightly reconciliation job. As the main path it is slow, with minutes of lag on every change, and wasteful, since most of a year-long calendar does not change between polls.',
          },
        ],
      },
      points: [
        'Search reads the summary, which the outbox workers update within seconds of each change, and the result cache adds a few minutes more. Both are safe because the hold checks the inventory row: a stale result costs a "sold out, here are similar rooms" message, never a double booking.',
        'Do not invalidate cached searches on every booking: one room sold in a city of 300 hotels would flush every cached search for that city and those dates. Short TTLs plus the check at hold time are simpler and cheaper.',
        'Outbound: each booking and cancellation writes an outbox row in its own transaction, and a worker pushes it to the channel manager with retries and an idempotency key, so the other channels close the room within seconds.',
        'Inbound: each update also says which of our booking notifications it already reflects, and we subtract the bookings made since. Without that, an update that crosses one of our bookings in flight would put the room back on sale.',
        'A small window remains where two channels sell the last room within the same few seconds. Closing it would need one lock shared across companies, so it is handled by policy: a buffer or overbooking allowance, and a guest who cannot be housed is moved to a comparable hotel nearby ("walked", in hotel terms). Track how often it happens per hotel.',
      ],
    },
    {
      kind: 'wrap-up',
      title: 'Close the loop',
      prompt: 'You have five minutes left. What would you raise before the interviewer does?',
      points: [
        'Failover: replicate the inventory primaries synchronously so a confirmed booking survives a failover. While a shard fails over, search keeps serving from the index and bookings for its hotels return a retryable error.',
        'Multi-region: search and the result cache run in every region; each hotel has one home region whose primary owns its inventory, and bookings from elsewhere pay one extra round trip, which is fine at 35 a second.',
        'Reconciliation: a nightly job compares our counts with each channel manager calendar and with confirmed bookings, and reports any room type and night where `booked` exceeds `total`.',
        'Monitoring: search latency and cache hit rate, summary lag behind inventory, hold success and "sold out at checkout" rates, hold to booking conversion, payment failures by cause, channel sync lag and walked guests per hotel.',
      ],
    },
  ],
  pitfalls: [
    'Answering search from the inventory primaries, so 7,000 searches a second compete with bookings for the same rows.',
    'Reading availability for each night and then booking with a separate write, leaving a gap where two guests both see the last room.',
    'Booking the nights of a stay in separate transactions, so a failure on the third night leaves the first two held.',
    'Treating overbooking as a bug to forbid rather than a hotel setting to enforce, or assuming this site is the only one selling the rooms.',
    'Relying on the client not to retry instead of storing an idempotency key with the booking under a unique constraint.',
  ],
  followUps: [
    {
      question: 'A hotel lowers its price while a guest is on the payment page. What does the guest pay?',
      answer:
        'The price quoted when the hold was created, which is saved on the booking together with the cancellation policy. The hold promises both the rooms and the price until it expires; a guest who comes back later sees the current price.',
    },
    {
      question: 'How would you support vacation rentals, where each listing is one unique unit?',
      answer:
        'Inventory becomes one row per listing per night with a limit of 1, and hosts rarely allow any overbooking. Minimum stays and gaps between stays become rules the hold checks, and search must filter on the exact dates, since a unit is either free for the whole stay or not.',
    },
    {
      question: 'Guests want to search for any weekend in the next three months. How does search cope?',
      answer:
        'Keep a bit per night per room type in the search index (a year fits in 46 bytes), filter hotels on it for any free Friday and Saturday pair, and price only the candidates. Cache these results by city and month, since flexible queries repeat far more than exact dates.',
    },
  ],
};
