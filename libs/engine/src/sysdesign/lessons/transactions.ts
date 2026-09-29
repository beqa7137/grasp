import type { SdLesson } from './types.js';

export const TRANSACTIONS_LESSON: SdLesson = {
  why: 'Almost every design with more than one service has a business action that touches several of them: an order that reserves stock, charges a card and books a courier, or a transfer between accounts on different shards. One database transaction cannot cover them, so the design must say what happens when step three fails after steps one and two succeeded, and how an event gets published if the process dies right after its write commits. Interviewers probe whether you know why two-phase commit blocks, how a saga undoes work, how an outbox removes the dual write, and when the better answer is to keep the data in one database.',
  widget: {
    kind: 'transactions',
    tryThis: [
      'Keep the defaults, Two-phase commit with 4 services and no failure: the client waits 30 ms (a prepare round trip with 20 ms of local work, then a commit round trip), locks are held for the same 30 ms, and nothing half-done is ever visible. Slide the services to 8: still 30 ms, because the model prepares every service in parallel; a real coordinator waits for the slowest participant, so more participants make the slow case more likely. Switch to Saga at 4 services: 100 ms, since the steps run one after another, but each step holds its locks for only its own 20 ms, while other readers can see the half-done state for 75 ms. At 8 services the saga takes 200 ms and is half-done for 175 ms.',
      'On Saga with 4 services, set the failing step to Step 4: the outcome is rolled back after 3 compensations, and the client waits 175 ms, 100 ms going forward and 75 ms undoing steps 3, 2 and 1, and readers can see a half-done order for 150 ms, from step 1 committing until the last compensation lands. Step 3 fails after 125 ms with 2 compensations, and Step 1 fails in 25 ms with nothing to undo. Switch to Two-phase commit with Step 3 failing: rolled back in 30 ms, no compensations and nothing half-done, because the failing service votes no during prepare and nobody has committed yet.',
      'On Two-phase commit, tick the coordinator crash: the outcome is blocked, and the client waits and the locks stay held until the coordinator returns, whatever the service count or failing step. Every service that voted yes may no longer decide alone, since it cannot tell what the others voted, so any other transaction that needs those rows waits too. Switch to Saga: the checkbox disappears, because each saga step commits locally and holds its locks for 20 ms at most; a crashed orchestrator delays the saga, but it resumes from its log and blocks no one else. The price is the half-done state from the previous experiment.',
    ],
  },
  concepts: [
    {
      title: 'One transaction lives in one database',
      body: "ACID transactions are a feature of one database: its lock manager and its log decide atomically whether every write in the transaction commits. When orders, payments and inventory each own their database, as microservices should, there is no shared log or lock manager, and a network call to another service inside a local transaction does not make that call part of it: if the local transaction then rolls back, the remote change stays. So the first question is whether the data needs to be split at all. Data that is always changed together, such as an order and its line items or both sides of a ledger entry, belongs in one database, and a sharding key chosen so related rows land on the same shard (all of one customer's data, say) keeps most transactions local. Distributed transactions are for the actions that genuinely cross owners.",
    },
    {
      title: 'Two-phase commit and why it blocks',
      body: "A coordinator runs the transaction across participants. In the prepare phase it asks each participant to make its changes durable and hold its locks; a participant that votes yes has promised it can commit and may no longer abort on its own. If every vote is yes, the coordinator writes the commit decision to its log (the commit point) and sends commit to all; any no or timeout means abort. The cost is two round trips plus forced log writes, with locks held from prepare until the decision arrives. The flaw: if the coordinator crashes after participants have voted yes, they are in doubt and must wait, holding their locks, until it recovers, because committing or aborting alone could disagree with what others did. XA is the standard interface for this between a transaction manager and resource managers (Java's JTA uses it; Postgres has `PREPARE TRANSACTION`, off by default, and MySQL has `XA PREPARE`), but most brokers and HTTP APIs cannot take part. Systems that rely on 2PC, such as Spanner, make the coordinator and each participant a replicated Paxos group, so a crash does not block.",
    },
    {
      title: 'Sagas: orchestration and choreography',
      body: "A saga replaces one distributed transaction with a sequence of local transactions, each committing in its own service, plus a compensating action for each step that undoes it if a later step fails. In orchestration, a central orchestrator (often a workflow engine such as Temporal or AWS Step Functions) calls each step, records progress in a durable log, and on failure runs the compensations in reverse order; the flow lives in one place, which makes it easy to read, change and monitor. In choreography there is no coordinator: each service reacts to the previous service's event and emits its own (OrderCreated, StockReserved, PaymentFailed), which keeps services decoupled but spreads the flow across many codebases, so for more than three or four steps it becomes hard to see what happens, and cycles appear. Either way, every step and every compensation is retried until it succeeds, so each must be idempotent.",
    },
    {
      title: 'Compensations, pending states and what cannot be undone',
      body: 'A compensation is a new business action, not a rollback: a refund reverses a charge, and releasing a reservation reverses a hold, but both leave history, and other transactions may have seen or used the intermediate state. Sagas give up isolation, so design for it. Semantic locks mark records in flight with a pending state (order PENDING, stock RESERVED, not decremented), which other operations respect and which a timeout clears if the saga dies. Some actions cannot be compensated at all: a sent email, a shipped parcel, a captured payment that the customer has already spent. Order the steps so the ones that can fail come first, the irreversible ones last, after the point where the saga can no longer fail (the pivot); split actions into reversible halves where the provider allows, such as authorizing a card early and capturing it at shipping. Anything irreversible that still goes wrong needs a business answer, such as a correction email or an apology credit.',
    },
    {
      title: 'The dual write and the transactional outbox',
      body: "A service that commits an order to its database and then publishes OrderCreated to Kafka is doing a dual write: a crash, deploy or broker error between the two leaves the order without its event, or, if it publishes first, an event for an order that rolled back. Retrying cannot fix it, because the process that knew what to send is gone. The transactional outbox makes the event part of the local transaction: insert it into an outbox table in the same transaction as the order, and a separate relay reads committed outbox rows, publishes them and marks them sent. The relay can poll the table, or use change data capture: a tool such as Debezium tails the database's replication log (the Postgres WAL or MySQL binlog) and streams each committed change, with no polling load and in commit order. Either way the relay can crash after publishing and before marking the row, so delivery is at least once.",
    },
    {
      title: 'Idempotent consumers and deduplication',
      body: 'Outboxes, broker redelivery and saga retries all deliver at least once, so every consumer must make a duplicate harmless. Give each event or command a unique id (the outbox row id, or a saga id plus step), and have the consumer record processed ids in its own database in the same local transaction as the effect, under a unique constraint: a duplicate hits the constraint and is skipped. Keep the ids longer than the longest redelivery window. Where possible, make the operation idempotent by nature instead: set the status to SHIPPED rather than toggle it, apply an update only if its version is newer than the stored one, or pass the same idempotency key on to a payment provider. Kafka transactions give exactly once only for reads and writes inside Kafka; an effect on an outside database still needs deduplication or offsets stored in that same database transaction.',
    },
    {
      title: 'Try-confirm-cancel',
      body: 'TCC is a reservation pattern that sits between 2PC and a saga. Try reserves the resource in each service without applying it (hold 2 seats, freeze 80 dollars in the wallet); if every try succeeds, Confirm turns each reservation into the real change, otherwise Cancel releases them. Unlike 2PC, each phase is an ordinary committed local transaction, so no database locks span the network; unlike a plain saga, other transactions only see reservations, never a finished half. Every service must expose three business operations, confirm and cancel must be idempotent and retried until they succeed, reservations need a timeout so an abandoned try frees itself, and a cancel that arrives before its try must be recorded so the late try is refused.',
    },
  ],
  examples: [
    {
      title: 'A checkout saga',
      problem:
        "Checkout spans four services: order (create the order), inventory (reserve stock), payment (charge the card) and shipping (book a courier). Peak load is 2,000 checkouts a second; 0.5% fail at inventory for lack of stock and 3% fail at payment with a declined card. Using the widget's timings, design the saga and count the compensations.",
      insight:
        'Put the steps that can fail before the ones that cannot be undone, and make every intermediate state an explicit pending state that other readers understand.',
      steps: [
        "Why not 2PC: the card processor and the courier's API cannot take part in XA, and a crashed coordinator would leave stock rows locked under 2,000 checkouts a second. So each step commits locally, and an orchestrator records every transition in its own log, about 2,000 times 5 = 10,000 small writes a second.",
        'Order of steps: create the order as PENDING, reserve stock (a RESERVED count, not a decrement, that expires after 15 minutes), authorize the card rather than capture it, then book the courier and mark the order CONFIRMED. The confirmation email goes out only after that, since an email cannot be compensated; the capture happens when the parcel ships.',
        'Happy path in the widget, Saga with 4 services: 4 steps of 25 ms is 100 ms, and the order sits in PENDING for 75 ms of it. The order page shows it as processing, and stock reports count RESERVED units as unavailable.',
        'Compensations: out of stock is 0.5% of 2,000 = 10 checkouts a second failing at step 2, each cancelling the order, 10 compensations. Declines are 3% = 60 a second failing at step 3, each releasing stock and cancelling the order, 120 compensations. That is 130 compensations a second, all routine traffic that must be as reliable as the forward steps.',
        'A decline costs 75 ms forward and 50 ms of undo, 125 ms, matching the widget with Step 3 failing. Each compensation carries the saga id, so a retried release after a timeout is recognized and skipped instead of releasing stock twice.',
      ],
    },
    {
      title: 'Publishing order events without losing any',
      problem:
        'An order service commits 5,000 orders a second to Postgres and then publishes each to Kafka for billing and analytics. About 0.01% of publishes fail after the commit (deploys, broker timeouts), and billing has missing invoices. Fix it, and size the outbox and the deduplication state.',
      insight:
        'Make the event part of the same local transaction as the write, then accept at-least-once delivery and dedupe at the consumer.',
      steps: [
        'Loss today: 5,000 times 86,400 is 432 million orders a day, and 0.01% of that is about 43,200 orders a day with no event. Publishing before the commit would not help: it would send events for orders that then roll back.',
        'Outbox: the order insert and an outbox insert (event id, topic, key, payload of about 1 KB) share one transaction, so both commit or neither does. The extra write adds about 5 MB a second to the database, and rows are deleted once published, so the table holds only minutes of backlog.',
        'Relay: Debezium tails the Postgres WAL and publishes each outbox row in commit order, keyed by order id so events for one order stay on one partition and in order. If the relay crashes after publishing and before recording its position, it republishes the last batch: duplicates, never losses.',
        'Billing dedupes: it inserts the event id into a processed_events table in the same transaction as the invoice, under a unique constraint. Keeping ids for 24 hours is 432 million rows; at about 50 bytes each with the index, about 22 GB, cleared by a partition drop per hour or day.',
        'Result: no lost events and no double invoices, at the cost of one extra insert per order and delivery that lags the commit by the relay delay, typically tens to hundreds of milliseconds.',
      ],
    },
    {
      title: 'Transfers across shards',
      problem:
        'A wallet stores 50 million accounts on 16 Postgres shards by account id and runs 10,000 transfers a second between random accounts. Compare XA two-phase commit with a ledger saga, including what a coordinator crash that takes 90 seconds to recover does under 2PC.',
      insight:
        'Two-phase commit turns a coordinator failure into held locks on real accounts; a saga with an in-flight state keeps accounts available and makes the money in transit visible and countable.',
      steps: [
        'Cross-shard share: with random accounts, the destination is on another shard 15 times in 16, so about 9,400 transfers a second need a distributed transaction. The rest are one local transaction on one shard.',
        'XA 2PC: in the widget, 30 ms per transfer with both account rows locked for 30 ms. A hot account can then take at most about 1,000 / 30 = 33 transfers a second, however fast the shards are.',
        'Coordinator crash: about 9,400 times 0.03 = 280 transfers are in flight, and those that have prepared stay in doubt for 90 seconds, holding up to about 560 account rows. Every other transfer or balance read that needs those rows waits or times out, and the participants cannot resolve them without the coordinator log. Postgres also keeps each prepared transaction open, which holds back vacuum.',
        'Saga: one local transaction on the source shard debits the account, writes a transfer row in state SENT and an outbox event. The destination shard credits the account and records the transfer id under a unique constraint, so a redelivered event is ignored. If the destination account is closed, the compensation is a refund credit back to the source, never a deletion.',
        'Visibility: at 10,000 transfers a second and about 50 ms from debit to credit, about 500 transfers are in flight at any moment. Their money has left one balance and not reached the other, so reconciliation sums balances plus in-flight transfers, and the sender sees the transfer as pending until it lands.',
      ],
    },
  ],
  pitfalls: [
    'Writing to the database and then publishing to a broker or calling another service as two separate steps: a crash between them loses the event or leaves an effect for data that rolled back. Use an outbox or change data capture.',
    "Running irreversible steps (sending an email, capturing a payment, shipping) before steps that can still fail, then discovering there is no compensation for them. Order steps so irreversible ones come after the saga's last possible failure.",
    'Writing compensations and consumers that are not idempotent: retries and at-least-once delivery will run them twice, releasing stock twice or issuing two refunds. Key every step and every compensation by a saga or event id.',
    'Reaching for XA across services or holding a database transaction open across network calls: every slow or crashed participant then holds locks for everyone, and most brokers and third-party APIs cannot join anyway. First check whether the data can simply live in one database.',
  ],
  followUps: [
    {
      question: 'Why not three-phase commit, which was designed not to block?',
      answer:
        'Three-phase commit adds a pre-commit phase so participants can finish without the coordinator, but it is only safe if message delays are bounded and nodes fail by crashing. Under a network partition, two sides can time out and reach different decisions, which is worse than blocking. Real systems instead replicate the coordinator and participants with a consensus protocol such as Paxos or Raft, as Spanner does, so a crashed coordinator is replaced by a replica that knows the decision.',
    },
    {
      question: 'Orchestration or choreography for a new checkout flow?',
      answer:
        'Orchestration for anything beyond two or three steps with compensations: the flow, its timeouts and its retries live in one place, and a workflow engine persists state so a crashed orchestrator resumes where it stopped. Choreography suits simple fan-out, where independent services react to one fact (OrderPlaced updates search, sends a receipt, feeds analytics) and nothing needs undoing. Many systems use both: an orchestrated saga for the transaction, and events for everything that merely listens.',
    },
    {
      question: 'What happens when a compensation itself keeps failing?',
      answer:
        'Retry it with backoff, since compensations are designed to succeed eventually: a refund or a stock release should not be refusable by business rules, and each is idempotent so retries are safe. If it still fails after the limit, for example because the provider is down for hours, park the saga in a failed state, alert, and let an operator or a repair job finish it. Never drop it silently: a stuck compensation is money or stock in the wrong place, which a reconciliation job should detect as well.',
    },
  ],
};
