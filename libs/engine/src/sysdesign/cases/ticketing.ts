import type { CaseStudy } from './types.js';

export const TICKETING: CaseStudy = {
  id: 'ticketing',
  stages: [
    {
      kind: 'requirements',
      title: 'Clarify what matters',
      prompt:
        'Most of the year a ticketing site is a quiet catalog. Then one tour goes on sale at 10:00 and millions arrive at once. Which requirements shape the design, and which do you park?',
      decision: {
        question: 'Which property do you refuse to trade away, whatever the load?',
        options: [
          {
            label: 'A seat is never sold twice, even if the sale has to slow down or make people wait',
            best: true,
            why: 'A concert seat is one physical seat. Two tickets for it means two fans at the gate, refunds and a public incident. Everything else (speed, how current the seat map is) can bend; this cannot, so inventory writes need strong consistency.',
          },
          {
            label: 'Every buyer who reaches checkout gets through; fix the rare oversell afterwards',
            why: 'Airlines overbook on purpose because some passengers never show up and a later flight is a remedy. Here there is no spare seat to move anyone to, so "fix it afterwards" means canceling a fan who already paid.',
          },
          {
            label: 'The seat map every shopper sees is always exactly current',
            why: 'Sounds right but costs too much: with thousands of shoppers and hundreds of seat changes a second, every view would have to read the primary. The map can be a second or two stale as long as the hold itself is checked against the truth.',
          },
        ],
      },
      points: [
        'Functional: browse events, see a seat map with availability, hold chosen seats (or ask for the best available), pay within a time limit and receive the tickets. A limit of tickets per account per event, 4 in this case.',
        'Scale (from the interviewer): a 50,000-seat stadium, about 2 million fans online when the sale opens at 10:00, sold out in about 10 minutes. Thousands of smaller events keep selling normally at the same time.',
        'Non-functional: no double booking, ever. Browsing may be slightly stale. The site must stay up under the spike by making people wait, not by failing, and access should be fair rather than won by the fastest script.',
        'Out of scope unless asked: resale, dynamic pricing, tools for promoters to create events, and scanning tickets at the gate.',
      ],
    },
    {
      kind: 'estimation',
      title: 'Estimate the spike',
      prompt:
        '2 million fans sit in a waiting room, and each browser asks "is it my turn?" every 20 seconds. How many requests per second is that?',
      estimate: {
        question: 'Waiting room status requests per second',
        answer: 100_000,
        unit: 'requests/s',
        working: [
          '2,000,000 browsers, one request every 20 seconds each.',
          '2,000,000 / 20 is 100,000 requests per second, arriving within the first minute and staying there until the sale ends.',
          'Normal traffic for the whole site might be a few thousand requests a second, so this is a jump of well over ten times in seconds.',
        ],
      },
      points: [
        'About 100k requests a second just to wait, before anyone touches a seat. Autoscaling reacts in minutes; this arrives in seconds.',
        'Those requests must never reach the booking database. The waiting room lives at the edge, and the answer to "is it my turn?" should be cacheable.',
        'Every fan who refreshes the page makes it worse, so the waiting room must make refreshing pointless: a place in line that survives a reload.',
      ],
    },
    {
      kind: 'estimation',
      title: 'Estimate the sale itself',
      prompt:
        'The 50,000 seats go in orders of 2.5 tickets on average and sell out in 10 minutes. How many orders per second does the booking system actually complete?',
      estimate: {
        question: 'Completed orders per second during the on-sale',
        answer: 33,
        unit: 'orders/s',
        working: [
          'Orders: 50,000 seats / 2.5 tickets per order is 20,000 orders.',
          'Duration: 10 minutes is 600 seconds.',
          'Rate: 20,000 / 600 is about 33 orders per second.',
        ],
      },
      points: [
        'Only about 33 orders a second: throughput is not the problem, contention is. Thousands of people want the same few hundred good seats at the same moment.',
        'So admit shoppers from the waiting room at about the rate orders complete. At about 35 a second, with each shopper taking about 5 minutes to choose and pay, roughly 10,000 are inside at once (35 times 300 is 10,500).',
        'Inside, each shopper makes a request every 2 seconds or so (seat map refreshes, section views, hold attempts, payment): 10,000 / 2 is about 5,000 requests a second.',
        'About a tenth of those are writes (hold attempts, many of which lose a race, plus checkouts and releases): about 500 writes a second on one event.',
      ],
    },
    {
      kind: 'api',
      title: 'Hold, then pay',
      prompt:
        'Choosing seats takes seconds; paying can take a minute. How does a purchase proceed so nobody pays for a seat they do not get?',
      decision: {
        question: 'Which purchase flow would you build?',
        options: [
          {
            label: 'Reserve the seats as a hold with an expiry, then pay against the hold',
            best: true,
            why: 'The contended step (claiming seats) is one fast write, and the slow step (payment) happens only for seats already yours. An abandoned hold expires and the seats return to sale, so nobody can sit on inventory.',
          },
          {
            label: 'Charge the card first, then assign seats',
            why: 'Keeps payment off the contended write, but once seats run out you must refund people you already charged, and nobody can pick a specific seat. Tolerable for a small general admission drop, poor for a stadium with a seat map.',
          },
          {
            label: 'One request that locks the seats, calls the payment provider and commits, all in one database transaction',
            why: 'The payment call takes seconds, so row locks are held across an external call while hundreds queue behind them, and a timeout leaves you unsure whether the card was charged when the transaction rolls back.',
          },
          {
            label: 'No hold: seats go into a cart and availability is checked at payment',
            why: 'At an on-sale most carts hold seats someone else already bought, so fans fill in card details and fail at the last step, then retry all at once.',
          },
        ],
      },
      points: [
        '`GET /events/{id}/seatmap` returns availability per section; it may be a second or two stale.',
        '`POST /events/{id}/holds` with seat IDs (or a section and a count for best available) and an `Idempotency-Key` returns a hold ID and `expires_at`, or `409` naming the seats that are gone.',
        '`POST /holds/{id}/pay` with a payment method starts checkout; `DELETE /holds/{id}` releases the seats early.',
        '`GET /orders/{id}` reports pending, confirmed or failed. Every booking call carries the admission token from the waiting room.',
      ],
    },
    {
      kind: 'data',
      title: 'Never sell a seat twice',
      prompt: 'Two fans click the same seat within a millisecond. Both requests read "available". What makes exactly one of them win?',
      decision: {
        question: 'How do you claim a seat safely under heavy contention?',
        options: [
          {
            label: 'One conditional update: set the seat to held only where it is still available, and check the rows changed',
            best: true,
            why: 'The check and the write are one atomic statement, so there is no gap between them. The loser changes zero rows and gets an immediate "taken", row locks last only milliseconds, and nothing extra is read. It is optimistic concurrency with the check folded into the write.',
          },
          {
            label: 'Pessimistic row locks: `SELECT ... FOR UPDATE`, check the status, then update',
            why: 'Correct, and fine at low contention. At an on-sale it holds the locks across an extra round trip while everyone who wants that seat waits in line for it, and it gains nothing over the single statement, which takes the same row locks without the extra round trip.',
          },
          {
            label: 'Optimistic concurrency with a version column: read the seat, then update where the version is unchanged',
            why: 'Also correct, and a good fit for rarely contended data such as editing an order. When a thousand people want the same seat, nearly every attempt fails and rereads, which is wasted work at the worst moment.',
          },
          {
            label: 'A lock per seat in Redis (set if not exists, with a TTL), then write the order to the database',
            why: 'Fast, and some systems keep holds in Redis. But now two systems hold the truth: an asynchronously replicated Redis can lose a lock on failover and let a second fan through, so the database still needs its own guard.',
          },
        ],
      },
      points: [
        'Seats table: `event_id`, `seat_id`, section, row, price tier, status (available, held, paying, sold), `hold_id`, `held_until`, `order_id`. About 100 bytes a row: a 50,000-seat event is about 5 MB.',
        'The hold is one statement in a short transaction: set status to held, the hold ID and `held_until` where `event_id` and the seat IDs match and the seat is available, or held (not paying) with `held_until` in the past. If fewer rows changed than seats requested, roll back: holds are all or nothing.',
        'At their default isolation levels, Postgres and MySQL evaluate an UPDATE condition against the latest committed row once the lock is free, so the second fan sees the seat as held and changes nothing. The per-account limit is a counter row per account and event, raised in the same transaction by the same kind of conditional update (add n where the count plus n is at most 4), so two parallel holds from one account cannot both pass.',
        'Backstop: a unique constraint on `(event_id, seat_id)` in the tickets table, so even a bug in the hold path cannot issue two tickets for one seat.',
      ],
    },
    {
      kind: 'design',
      title: 'Put it together',
      prompt:
        'Trace a fan from the waiting room to a confirmed ticket. Which components see the 100,000 requests a second, and which see only the 500 writes?',
      lab: true,
      points: [
        'Fans load the event page from a CDN. At the on-sale the edge serves a waiting room: each fan gets a signed token with a place in line, and polls a cacheable "now serving" number to learn when it is their turn.',
        'When their turn comes, the queue service issues an admission token (account, event, expiry, signed) that the booking API checks on every call. Bot defense and per-account rate limits sit in front of the origin.',
        'Stateless booking servers read the seat map from a cache with a short TTL, and write holds, checkouts and orders as conditional updates on the primary that owns the event: inventory is sharded by event ID.',
        'Payment runs through the provider with a payment attempt ID (the hold ID plus an attempt number) as the idempotency key, so a fan whose card is declined can try another card while the hold lasts. Workers (not in the build) handle payment webhooks, release expired holds and issue tickets.',
        'Open the build in the Lab: 105,000 requests a second, 100,000 waiting room polls plus 5,000 from shoppers inside, with about 500 writes, and 40,000 bot requests on top (an assumption). The CDN stands for the edge waiting room, the limiter for bot defense and the database for the seat inventory sharded by event. Lower the CDN hit rate to see what the spike does to the origin.',
      ],
    },
    {
      kind: 'deep-dive',
      title: 'Run the waiting room fairly',
      prompt:
        'Two million people, 50,000 seats. Some arrived an hour early, some run scripts that fire the moment the sale opens. Who gets in first, and how do you keep bots out?',
      decision: {
        question: 'How does the waiting room order the fans?',
        options: [
          {
            label:
              'Shuffle everyone who joined before the start time into a random order, then add later arrivals first come, first served',
            best: true,
            why: 'Arriving at 09:30 or 09:59 gives the same chance, so there is no reason to refresh or to race a script to the millisecond. Later arrivals queue in arrival order, which people accept as fair.',
          },
          {
            label: 'Strict first come, first served by arrival time, to the millisecond',
            why: 'Simple and easy to explain, but at 10:00:00 the order is decided by network latency and scripts, not by who wanted it first, and fans refresh to try to get a better spot.',
          },
          {
            label: 'No waiting room: autoscale the booking tier and let the database settle who gets which seat',
            why: 'The scarce resource is the seat rows, not servers. Autoscaling lags the spike by minutes, and letting millions contend for the same rows turns the sale into timeouts and retries.',
          },
          {
            label: 'Registration days ahead, then a lottery for access codes',
            why: 'Defensible too, and used for the largest tours: it measures demand in advance and filters bots before the day. But it changes the product, so check with the interviewer, and the day of the sale still needs a waiting room.',
          },
        ],
      },
      points: [
        'At the start time the queue service shuffles the list of waiting tokens (2 million entries is small), and each client fetches its position once. After that it only polls the shared "now serving" number, which a CDN can cache for a second or two, so 100k polls a second cost the origin almost nothing.',
        'The admission rate is a feedback loop, not a constant: admit more when hold latency and the count of active shoppers are low, fewer when the inventory primary runs hot. A queue that moves slowly is fine; a booking tier that fails is not.',
        'One place in line per verified account: tie the token to the account and device, require a phone number or card on file, put the CAPTCHA or device check at queue entry rather than at checkout, and reject tokens that are copied to another client.',
        'Enforce the ticket limit per account in the database transaction, rate limit holds per account, and cancel orders a fraud check flags after the fact. Bots that still get through buy at most one account allowance.',
      ],
    },
    {
      kind: 'deep-dive',
      title: 'Expire holds and survive payment failures',
      prompt:
        "A fan holds four seats and walks away. Another fan's card is declined. A third payment times out with no answer. What happens to the seats in each case?",
      points: [
        'Holds last about 10 minutes. Expiry is lazy and eager at once: the hold statement treats an expired hold as available, so correctness needs no timer, and a sweeper (or a delayed message per hold) resets expired seats every few seconds so the seat map shows them again.',
        'At checkout the seats move from held to paying, which extends the deadline to cover the payment call. The sweeper never releases a paying seat without first asking the payment provider what happened.',
        'Payment succeeds: in one transaction set the seats to sold where the hold ID still owns them, and create the order. If that update changes fewer rows than expected, something is wrong: void or refund the payment automatically and alert.',
        'Payment is declined: move the seats back to held so the fan can try another card until the hold expires, or release them at once if the fan gives up. Payment times out or the answer is lost: keep the seats in paying, query the provider with the same idempotency key, and resolve from the answer or its webhook; release only once the payment is known to have failed.',
        'Released seats go straight back into the pool, which is why tickets often reappear minutes after a sell-out: fans still in the queue can be told that seats may come back.',
      ],
    },
    {
      kind: 'deep-dive',
      title: 'Shard the inventory and cache the seat map',
      prompt:
        'All 50,000 seats of one event get hammered while thousands of other events sell quietly. How do you split the data, and how fresh does the seat map need to be?',
      estimate: {
        question: 'Size of the whole venue as an availability bitmap',
        answer: 6.25,
        unit: 'KB',
        working: [
          'One bit per seat: 1 means available.',
          '50,000 seats is 50,000 bits.',
          '50,000 / 8 is 6,250 bytes, about 6.25 KB, before compression.',
        ],
      },
      points: [
        'Shard by event ID: every seat, hold and order row of one event lives on one primary, so each hold is a single-shard transaction with no distributed commit. Use a directory from event to shard rather than a bare hash, so a mega on-sale can get a primary of its own ahead of time.',
        'One hot event on one primary is fine here: about 500 writes a second is well within a single database, because the waiting room caps it. If one event ever outgrows its primary, split its inventory by section, since a hold stays within one section.',
        'General admission tickets are a count, not seats, and a single count row serializes every purchase. Split it into, say, 20 rows of 2,500 each and take from a random one that still has enough.',
        'The seat map is a per-event bitmap, small enough to cache whole with a TTL of a second or two, or to push as small diffs to shoppers on the page. Invalidating it on every change would miss the cache hundreds of times a second for nothing.',
        'Staleness is safe because the hold is checked against the primary: a stale map costs a fan one "just taken" message, and the page then refreshes and suggests the nearest free seats. Never cache or replicate the decision itself.',
      ],
    },
    {
      kind: 'wrap-up',
      title: 'Close the loop',
      prompt: 'You have five minutes left. What would you raise before the interviewer does?',
      points: [
        'Failover mid-sale: replicate the inventory primary synchronously, so an acknowledged hold survives a failover. While it fails over, pause admissions (people keep their place) and extend active holds by the length of the outage.',
        'Multi-region: the waiting room and seat map are served at the edge everywhere, but each event has one home region whose primary owns its inventory; bookings from elsewhere pay the extra round trip.',
        'Rehearse: load test the waiting room and the hold path with synthetic traffic before every major on-sale, and have a way to pause the sale.',
        'Monitoring: admission rate, hold success and conflict rates, hold latency p99, hold to order conversion, payment failures by cause, and an audit job whose answer must always be zero: seats with more than one ticket.',
      ],
    },
  ],
  pitfalls: [
    'Checking availability with one query and claiming the seat with another, leaving a gap where two fans both see "available".',
    'Holding a database transaction or row locks open while calling the payment provider.',
    'Letting the on-sale spike reach the origin and hoping autoscaling catches up, instead of a waiting room that meters admission.',
    'Treating the cached seat map as the truth, or invalidating it on every change so the cache never hits.',
    'Releasing seats when a payment times out, before knowing whether the fan was charged.',
  ],
  followUps: [
    {
      question: 'A payment succeeds just after the hold expired and another fan has taken the seat. What now?',
      answer:
        'The paying state is meant to prevent this, so treat it as a bug path. The confirming update changes no rows, so the order is not created; void or refund the payment automatically, tell the fan, offer comparable seats if any remain, and alert, because the count of such cases should be zero.',
    },
    {
      question: 'The venue sells only general admission, standing tickets. What changes?',
      answer:
        'There are no seat rows or seat map: inventory is a count per ticket type, claimed with a conditional decrement (subtract n where the remaining count is at least n), and a hold is a row with a quantity and an expiry that gives the quantity back. Split the count across several rows if one row becomes the bottleneck.',
    },
    {
      question: 'Fans complain that bots bought the tickets anyway. What else can you do?',
      answer:
        'Raise the cost of each account: verified phone numbers, payment cards used once per event, account age and purchase history in a risk score. Bind tickets to the buyer (mobile tickets that rotate and are revealed close to the show), limit transfers, and cancel orders linked to abuse after the sale.',
    },
  ],
};
