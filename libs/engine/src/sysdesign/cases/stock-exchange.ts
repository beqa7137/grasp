import type { CaseStudy } from './types.js';

export const STOCK_EXCHANGE: CaseStudy = {
  id: 'stock-exchange',
  stages: [
    {
      kind: 'requirements',
      title: 'Clarify what matters',
      prompt:
        'Brokers and trading firms send buy and sell orders; the exchange matches them and tells the whole market what traded. Latency is measured in microseconds, but it is not the only thing that matters. Which requirements shape the design?',
      decision: {
        question: 'Which property do you refuse to trade away, even for speed?',
        options: [
          {
            label:
              'Every event passes through one total order, and matching is deterministic, so the same input log always rebuilds the same book',
            best: true,
            why: 'Fairness (first come, first served at a price), recovery, standby replication and every audit or dispute rest on this one property. With it, speed is an engineering problem; without it, no amount of speed makes the results defensible.',
          },
          {
            label: 'The lowest possible latency on every message, whatever it takes',
            why: 'Members do pay for speed, and the design will chase microseconds. But latency spent on durability and ordering is not waste: an exchange that answers in 5 microseconds and cannot say which of two orders came first has failed at its main job.',
          },
          {
            label: 'Always accept orders, even while a component is failing over',
            why: 'Right for a shop, wrong here. Accepting orders you might lose or match twice creates trades that must be busted later. Exchanges halt a symbol or the whole market instead, and members accept that.',
          },
        ],
      },
      points: [
        'Functional: accept new orders, cancels and replaces (modify) for limit and market orders with time in force (day, immediate or cancel); match them by price-time priority; report acknowledgements and fills to the sender; publish market data to everyone; send trades to clearing.',
        'Scale (from the interviewer): about 5,000 symbols and a few hundred member firms. The day averages 100,000 messages a second over a 6.5 hour session, peaks at 500,000 a second, and the busiest symbol carries about 5% of the flow.',
        'Non-functional: order entry to acknowledgement in tens of microseconds, with a tight tail (p99.99 matters more than the median), fair and reproducible ordering, no acknowledged order ever lost, and failover within seconds.',
        'Most messages are not trades: for many active algorithms, the large majority of orders are cancelled or replaced before they ever fill, so cancels must be as cheap as adds.',
        'Out of scope unless asked: clearing and settlement, the member-side trading systems, options and multi-leg orders, and the regulatory reporting pipeline.',
      ],
    },
    {
      kind: 'estimation',
      title: 'Estimate the event log',
      prompt:
        'The sequencer writes every inbound event to a log that recovery replays. The day averages 100,000 events a second over a 6.5 hour session, and each event is 64 bytes. How large is one day of log?',
      estimate: {
        question: 'Size of one trading day of sequenced input events',
        answer: 150,
        unit: 'GB',
        working: [
          '6.5 hours x 3,600 seconds is 23,400 seconds of continuous trading.',
          '100,000 events a second x 23,400 seconds is 2,340,000,000 events.',
          '2,340,000,000 x 64 bytes is 149,760,000,000 bytes, about 150 GB a day, which fits on local NVMe drives many times over.',
        ],
      },
      points: [
        'The log holds inputs only. Outputs (acknowledgements, fills, market data) follow deterministically from the inputs, so they can be regenerated rather than trusted from a second copy.',
        'Per symbol, the load is small: 5% of the 500,000 a second peak is 25,000 messages a second for the busiest book. At about 1 microsecond of matching work each, that is 25 ms of work per second, under 3% of one core.',
        'So the limit is never throughput per symbol, it is latency and jitter. One core per book has plenty of headroom, and the design can spend its effort on keeping every message path short and predictable.',
        'Market data: 500,000 events a second at about 50 bytes is 25 MB/s, 200 Mbit/s. Sent once per subscriber over TCP to 1,000 subscribers that is 200 Gbit/s; over multicast it is 200 Mbit/s per link, whoever listens.',
      ],
    },
    {
      kind: 'api',
      title: 'Talk to members',
      prompt:
        'A trading firm keeps a connection open all day and sends thousands of orders a second. What does the order entry interface look like, and how does a firm know an order was not lost or sent twice?',
      decision: {
        question: 'Which protocol do members use for order entry?',
        options: [
          {
            label:
              'A native binary protocol over long-lived TCP sessions, with session sequence numbers and client order IDs; a FIX gateway alongside it',
            best: true,
            why: 'Fixed-width binary messages decode in nanoseconds, the session sequence lets a firm resume after a reconnect without gaps or duplicates, and the client order ID makes every request idempotent. FIX serves firms that value one standard over the last microseconds.',
          },
          {
            label: 'REST with JSON over HTTPS',
            why: 'Familiar and easy to test, and fine for retail brokers talking to their own customers. For an exchange, a new connection per request, TLS, text parsing and no session ordering add hundreds of microseconds and lose the guarantee that messages arrive in the order sent.',
          },
          {
            label: 'FIX tag-value only',
            why: 'The industry standard, and every exchange offers it. As the only protocol it is slower to parse, since fields are variable-length text, which is why most venues also run a native binary protocol for firms that care about latency.',
          },
        ],
      },
      points: [
        'Inbound: `NewOrder` (client order ID, symbol, side, quantity, price as an integer number of ticks, type, time in force), `Cancel` and `Replace`, each naming the client order ID it acts on.',
        'Outbound on the same session: `Accepted` (with the exchange order ID and timestamp), `Rejected` with a reason, `Executed` (quantity, price, match ID) and `Canceled`. A fill is reported to both sides.',
        'Replace keeps time priority only when it reduces quantity at the same price; a higher quantity or a new price goes to the back of the queue, on most venues, so nobody can jump the line by editing an order.',
        'Market data is separate and one to many: an order-by-order feed (Nasdaq ITCH is one example) over UDP multicast, sent on two redundant lines (A and B), with a sequence number per packet so a subscriber sees gaps, plus a retransmission service and periodic snapshots.',
        'Cancel on disconnect is a session option: if a firm loses its connection, the exchange cancels its resting orders, so a crashed algorithm does not leave stale quotes in the book.',
      ],
    },
    {
      kind: 'data',
      title: 'Build the order book',
      prompt:
        'A book holds thousands of resting orders at hundreds of prices. Every message adds an order, cancels one, or trades against the best price. What structure makes all three fast?',
      decision: {
        question: 'How do you store one symbol order book in memory?',
        options: [
          {
            label:
              'Per side, price levels in an array indexed by tick (or a sorted map), each level a FIFO linked list, plus a map from order ID to its node',
            best: true,
            why: 'Adding at an existing price appends to a list, a cancel unlinks its node through the ID map in O(1), and the best price is a pointer to the top level. The list order is time priority, the level order is price priority, so the structure is the rule.',
          },
          {
            label: 'One priority queue (heap) per side, keyed by price then arrival time',
            why: 'Matching the best order is fast, but most messages are cancels, and removing an arbitrary heap entry needs a search or lazy deletion that leaves garbage in the heap. It also has no cheap view of the total quantity at each price, which market data needs.',
          },
          {
            label: 'A database table of open orders with an index on side, price and time',
            why: 'Durable and easy to query, and a fine store for the post-trade record. On the matching path every message becomes an index update of tens of microseconds or more, and the durability comes from the event log anyway.',
          },
        ],
      },
      points: [
        'Prices and quantities are integers: a price is a count of ticks (the minimum price step for that symbol), never a float, so rounding can never make two equal prices compare unequal.',
        'The array indexed by tick works because prices cluster around the last trade: keep a window of a few thousand ticks around it and fall back to a sorted map for far-away orders. The top of the book stays in the CPU cache.',
        'Preallocate order nodes in a pool at start of day, so the hot path never allocates memory or triggers a garbage collector pause.',
        'The source of truth is the sequenced input log, not the book: the book is a view that can be rebuilt by replay. Engines also snapshot their books at a known sequence number, so recovery is the latest snapshot plus the tail of the log.',
        'Post-trade data (orders, executions, trades sent to clearing) flows from the engine output into ordinary databases for members, surveillance and reporting, off the latency path.',
      ],
    },
    {
      kind: 'design',
      title: 'Put it together',
      prompt:
        'Trace an order from a firm connection to a fill and a market data update. Where does the order of events get decided, and which parts must be on the microsecond path?',
      lab: true,
      decision: {
        question: 'Where does the single order of events come from?',
        options: [
          {
            label:
              'A sequencer stamps every inbound message with a gap-free sequence number and writes it to a replicated log; engines consume the log in order',
            best: true,
            why: 'One writer decides the order, so there is nothing to agree on afterwards. Every engine, standby and downstream reader sees the same sequence, and replaying it reproduces the day exactly.',
          },
          {
            label: 'Gateways timestamp each order and the engine sorts by timestamp',
            why: 'Clocks on different machines drift by microseconds even with PTP, which is the same scale as the gaps between competing orders. The engine would also have to wait for stragglers before it could safely process anything.',
          },
          {
            label: 'Gateways call the matching engine directly, and it processes whatever arrives first',
            why: 'Simple and fast, and first to arrive is fair enough. But the order exists only in the running process: it cannot be replayed, a standby cannot follow it, and after a crash nobody can prove which order came first.',
          },
        ],
      },
      points: [
        'Order gateways terminate member sessions, decode messages, check the session sequence and run stateless risk checks (price collars, maximum order size and value, permitted symbols). They forward the order to the sequencer for its symbol partition.',
        'Symbols are split into partitions, each with its own sequencer and matching engine. Symbols never interact, so a total order per partition is all matching needs, and partitions scale out without coordination.',
        'The sequencer assigns the next sequence number and timestamp, replicates the event, and hands it to the engine, which matches it against the book and emits outputs: acknowledgements and fills routed back to the gateways, market data to the publishers, trades to clearing.',
        'Stateful risk checks, such as a credit limit per member across all symbols, need a running total. A risk process consumes fills from the output stream and holds the running exposure; the gateway blocks new orders once a member exceeds its limit.',
        'Open the build in the Lab: a scaled slice at 30,000 requests a second, 12,000 orders and cancels plus 18,000 order status and book snapshot queries. The lab counts milliseconds and has no multicast, so it draws the shape: the load balancer and app servers are the gateways, the queue is the sequenced log, the workers are matching engines, and the database with its cache is the post-trade store members query.',
      ],
    },
    {
      kind: 'deep-dive',
      title: 'One thread per book',
      prompt:
        'A reviewer asks why a machine with 64 cores runs each order book on a single thread. Would several threads matching one symbol not be faster?',
      decision: {
        question: 'How do you run matching for one symbol?',
        options: [
          {
            label: 'One thread owns each book end to end, fed in sequence order; spread symbols across threads and machines to scale',
            best: true,
            why: 'Matching one order takes about a microsecond, less than a contended lock costs. With a single owner there are no locks, the book stays in one core cache, and the result is deterministic, so replay and standbys work. At under 3% of one core for the busiest symbol, there is nothing to parallelize.',
          },
          {
            label: 'A shared book with a lock per price level, so several threads match one symbol at once',
            why: 'Everyone trades at the top of the book, so every thread wants the same one or two locks. An order that sweeps several levels takes several locks, and which thread wins them decides priority, which breaks time priority and makes the result impossible to replay.',
          },
          {
            label: 'Lock-free matching with compare-and-swap retries on the book',
            why: 'Avoids blocking, but the hot top of the book means constant conflicts and retries, and the outcome still depends on thread timing. It adds complexity to speed up work that was never the bottleneck.',
          },
        ],
      },
      points: [
        'The pattern is well known: LMAX described a single-threaded business logic processor fed by ring buffers (the Disruptor), where journaling and replication of each input run in parallel with each other on other threads and the business logic processes the input once both are done.',
        'Determinism inside the engine means no wall clock reads (the time comes with the event from the sequencer), no random numbers, no iteration over hash maps in unspecified order, and no dependence on thread timing.',
        'An illustrative wire to wire budget of about 20 microseconds: decode at the gateway 2, risk checks 1, hop to the sequencer 3, sequence and replicate to a quorum 8, matching 1, encode and send acknowledgement and market data 5.',
        'Jitter hurts more than the median: pin each engine thread to an isolated core, busy spin instead of sleeping, use kernel bypass networking, avoid allocation and garbage collection on the hot path, and watch p99.99, not the average.',
        'Some venues move the gateway or even the matching logic into FPGAs for the last microseconds. That is an optimization of the same design, not a different one.',
      ],
    },
    {
      kind: 'deep-dive',
      title: 'Recovery and hot standby',
      prompt:
        'The primary matching engine for a partition dies mid-session with thousands of resting orders. Members were told their orders were accepted. How does trading continue within seconds, with nothing lost?',
      decision: {
        question: 'How do you keep a standby ready to take over?',
        options: [
          {
            label:
              'Replicate the sequenced input log to standbys that replay it through the same engine; release no output until a quorum holds the event',
            best: true,
            why: 'Because matching is deterministic, a standby fed the same log holds the same book, byte for byte. A quorum means any acknowledged order survives the loss of one machine, and a consensus protocol such as Raft decides which replica takes over as leader.',
          },
          {
            label: 'Snapshot every order book to a database every second and restore the latest snapshot',
            why: 'Snapshots are part of the answer, since they shorten replay. On their own they lose up to a second of acknowledged orders and fills that members have already acted on, which an exchange cannot do.',
          },
          {
            label: 'Run two engines active-active and let members use whichever answers first',
            why: 'Without one shared order of inputs, the two engines can see competing orders in different orders and produce different fills. Reconciling two versions of who traded with whom is far worse than a short failover.',
          },
        ],
      },
      points: [
        'The engine may match while an event is still being replicated, as long as no acknowledgement, fill or market data leaves the exchange until that event is on a quorum. Otherwise a failover could forget a trade the world has already seen.',
        'Replication stays in one data centre, with replicas a few microseconds apart over kernel bypass networking; a cross-region quorum would add milliseconds to every order.',
        'Failover: the new leader has applied every event up to the last committed sequence number, so it continues from there. Gateways reconnect to it, and members resynchronize using their session sequence numbers.',
        'A backup site in another region receives the log asynchronously. Moving there is a declared event, with trading halted and members reconnecting, not an automatic failover.',
        'Replay also serves testing: run a new engine version against a recorded day of input and compare its outputs with the originals before it goes live.',
      ],
    },
    {
      kind: 'wrap-up',
      title: 'Close the loop',
      prompt: 'You have five minutes left. What would you raise before the interviewer does?',
      points: [
        'Opening and closing auctions: orders collect without matching, then the engine computes one price that maximizes executed volume and uncrosses the book at it. It runs as an event in the same log.',
        'Market protections: price bands and trading halts (in the US, the Limit Up-Limit Down plan and market-wide circuit breakers), self-trade prevention, and a kill switch that cancels every order of a member at once.',
        'Fair access: colocation with equal-length cables to every member rack, published latency figures, and identical treatment of every session in the same order entry tier.',
        'Monitoring: latency histograms at every hop (p99.99 and the maximum), sequencer and replication lag, standby divergence checks, market data gap requests and retransmissions, and rejects by reason.',
      ],
    },
  ],
  pitfalls: [
    'Storing prices as floating point numbers, so two equal prices can compare unequal after arithmetic.',
    'Putting locks around a shared order book and matching one symbol on several threads, which breaks time priority and replay.',
    'Ordering events by timestamps from different machines instead of a single sequencer.',
    'Acknowledging an order, or publishing its trade, before the event is durable on a quorum.',
    'Sending market data over one TCP connection per subscriber, so one slow reader holds back the rest, instead of multicast with gap recovery.',
    'Letting nondeterminism into the engine (wall clock reads, random numbers, hash map iteration order), which silently breaks replay and standby replication.',
  ],
  followUps: [
    {
      question: 'A market data subscriber falls behind or misses packets. What does the exchange do?',
      answer:
        'Nothing that slows anyone else. Multicast does not wait for readers. The subscriber detects the gap from the packet sequence numbers, fills it from the other line (A or B), asks the retransmission service for a small gap, or starts over from the latest snapshot plus the live feed for a large one.',
    },
    {
      question: 'A member algorithm goes wrong and floods the book with orders at absurd prices. What protects the market?',
      answer:
        'Price collars reject orders far from the reference price, per-session message rate limits and maximum order sizes cap the damage, credit limits stop new orders once exposure is too high, and the member or the exchange can hit a kill switch that cancels all its orders in one event.',
    },
    {
      question: 'Product wants multi-leg orders, such as buying one symbol and selling another as one package. What changes?',
      answer:
        'The legs live in different books, possibly in different partitions, so the single owner per book is no longer enough. Venues usually run a separate spread book with its own engine that trades the package, and implied pricing between it and the leg books needs all of them in one partition, behind one sequencer, so it stays deterministic.',
    },
  ],
};
