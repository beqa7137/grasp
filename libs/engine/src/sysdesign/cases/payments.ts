import type { CaseStudy } from './types.js';

export const PAYMENTS: CaseStudy = {
  id: 'payments',
  stages: [
    {
      kind: 'requirements',
      title: 'Clarify what matters',
      prompt:
        'A marketplace charges buyers and pays sellers, taking a fee in between. Before drawing boxes, pin down what "correct" means for money, and decide how close to card data you want to be.',
      decision: {
        question: 'How should the marketplace handle card details?',
        options: [
          {
            label:
              'Use external payment processors, and let their hosted fields or payment page collect card details, so our servers only ever see a token',
            best: true,
            why: 'Card numbers never touch our systems, which keeps most of them out of PCI DSS scope and shrinks the assessment to a short questionnaire. The processors bring card network access, fraud tools, 3-D Secure and seller payouts.',
          },
          {
            label: 'Collect card numbers in our own form and pass them to the processor from our backend',
            why: 'Works, and some large merchants do it to switch processors freely. Every server, log and network segment that sees a card number is now in PCI scope, which is a large, permanent compliance cost for no product gain here.',
          },
          {
            label: 'Store card numbers ourselves, encrypted, so repeat buyers can pay in one click',
            why: 'Processors already store the card and return a reusable token for saved cards. Holding the numbers ourselves brings full PCI scope, key management and breach liability for a feature we get for free.',
          },
          {
            label: 'Connect directly to the card networks as our own processor',
            why: 'That is building a payment processor: acquiring bank relationships, network certification and the highest PCI level. It is a different company, not a marketplace feature.',
          },
        ],
      },
      points: [
        'Functional: charge a buyer at checkout, hold the funds, pay each seller their share minus the platform fee after delivery, and support refunds and disputes (chargebacks).',
        'Correctness first: a buyer is never charged twice for one order, no money is created or lost in our books, and every cent can be traced to the event that moved it.',
        'External processors (for example Stripe or Adyen) charge cards and wallets; their marketplace products (Stripe Connect, Adyen for Platforms) hold seller accounts, verify seller identity (KYC) and send payouts.',
        'Scale (from the interviewer): 20 million payments a day, with sales events at about five times the average rate.',
        'Non-functional: checkout stays available, but a payment may take a few seconds and may be "processing" for a while; the ledger must never be wrong, even briefly.',
        'Out of scope unless asked: fraud scoring models, tax calculation, currency conversion and the processor internals themselves.',
      ],
    },
    {
      kind: 'estimation',
      title: 'Estimate the traffic',
      prompt:
        '20 million payments a day, and sales events run at five times the average. How many payments per second must the system handle at peak?',
      estimate: {
        question: 'Peak payments per second',
        answer: 1_157,
        unit: 'payments/s',
        working: [
          'Average: 20 million / 86,400 seconds is about 231 payments per second.',
          'Peak: five times that is about 1,157 payments per second; call it 1,200.',
          'Each payment makes about 10 API calls (create, confirm, a webhook, status polls, the order page), so the API sees about 12,000 requests a second at peak, roughly 40% of them writes.',
        ],
      },
      points: [
        'About 230 payments/s on average and 1,200 at peak: small by web standards. The hard part is correctness under failure, not throughput.',
        "Processor calls take from a few hundred milliseconds to several seconds. By Little's law, 1,200 calls a second at 2 seconds each is 2,400 calls in flight, so call processors from non-blocking clients with bounded pools and strict timeouts.",
        'Money moves in integer minor units (cents) with an ISO 4217 currency code, never floating point. Some currencies have no minor unit (JPY) and some have three decimals (KWD).',
      ],
    },
    {
      kind: 'estimation',
      title: 'Estimate the ledger',
      prompt:
        'Every payment writes a few journal entries: the capture, the processor settlement and a share of the seller payout. If that is about 8 ledger lines per payment at 250 bytes each with indexes, how much does the ledger grow per year?',
      estimate: {
        question: 'Ledger growth per year, before replication',
        answer: 14.6,
        unit: 'TB',
        working: [
          'Lines per day: 20 million payments times 8 lines is 160 million.',
          'Bytes per day: 160 million times 250 bytes is 40 GB.',
          'Per year: 40 GB times 365 is 14,600 GB, about 14.6 TB.',
        ],
      },
      points: [
        '160 million lines a day is about 1,850 inserts a second on average and about 9,300 at a fivefold peak.',
        'Financial records are kept for years (often seven or more, depending on the jurisdiction), so plan for about 100 TB: partition journal tables by month and move closed months to cheaper storage.',
        'The ledger is append only: rows are never updated or deleted, which makes it easy to replicate, archive and audit.',
      ],
    },
    {
      kind: 'api',
      title: 'Make retries safe',
      prompt:
        'The buyer taps "Pay", the phone loses signal, and the app retries. Some retries reach a server that already charged the card. How does the API make a retry harmless?',
      decision: {
        question: 'Where do you enforce the idempotency key?',
        options: [
          {
            label:
              'A row keyed by the idempotency key, written in the same database transaction as the payment, holding a hash of the request and the final response',
            best: true,
            why: 'The unique constraint makes the check atomic with creating the payment: the key and the payment commit together, so a duplicate finds the stored response, or gets `409` while the first request is still in flight. The processor call runs outside the transaction, protected by its own idempotency key, and the stored response is written when it returns.',
          },
          {
            label: 'A Redis lock (`SET NX` with a TTL) checked before the request runs',
            why: 'Fast, and fine as an extra guard in front, but it is not atomic with the payment write: a lock that expires mid-request or a Redis failover lets a duplicate through.',
          },
          {
            label: 'Detect duplicates by buyer, seller and amount within a few minutes',
            why: 'Buyers legitimately buy the same item twice, so it blocks real payments, and a retry after the window still double charges.',
          },
          {
            label: "Rely on the processor's idempotency keys",
            why: 'Use them too, but they only protect the processor call. Our own rows, ledger entries and emails can still be duplicated, and processors keep keys for a limited time (at least 24 hours at Stripe).',
          },
        ],
      },
      points: [
        '`POST /payments` with an `Idempotency-Key` header (a UUID the client makes once per checkout attempt), the order ID, amount, currency and the payment method token.',
        'Same key and same request hash: return the stored response. Same key and a different body: reject it with `422`. Key still in progress: return `409` so the client retries later.',
        'Scope keys per client and expire them after a set period, such as 24 hours; the order ID is also unique per successful payment, a second line of defence.',
        'Pass our own payment attempt ID to the processor as its idempotency key, so a retried processor call cannot create a second charge either.',
        '`GET /payments/{id}` returns the current state, and processors report outcomes to `POST /webhooks`, one path per processor.',
      ],
    },
    {
      kind: 'data',
      title: 'Keep a double-entry ledger',
      prompt:
        'A buyer pays 100. The seller is owed 88, the platform keeps 12, and later the processor takes a fee of 3. How do you record that so the books always balance and every balance can be explained?',
      decision: {
        question: 'How do you store money movements and balances?',
        options: [
          {
            label:
              'An append-only journal of entries whose debit and credit lines sum to zero; balances are the sum of lines, cached per account in the same transaction',
            best: true,
            why: 'Money is never created or lost by construction: every entry balances, so an error shows up as an imbalance instead of silently. History, audit and reconciliation fall out of the same tables.',
          },
          {
            label: 'A balance column per account, updated in place',
            why: 'Simple and fast, but there is no record of why a balance changed, a bad update is untraceable, and there is nothing to reconcile against the processor.',
          },
          {
            label: 'An event log in Kafka as the source of truth, with balances computed by consumers',
            why: 'Defensible for history, but the invariants (entries balance, no overdrawn account) must hold at write time, and a log checks neither. It also makes ad hoc audit queries hard.',
          },
          {
            label: 'One row per payment with the amount and a status',
            why: 'A single entry cannot say where the money went: the fee split, the processor fee and the payout have nowhere to live, and mistakes do not show up.',
          },
        ],
      },
      points: [
        'Accounts: buyer funds in transit (a receivable from the processor), seller payable per seller, platform fee revenue, processor fee expense and cash at the processor. On capture: debit receivable 100, credit seller payable 88, credit fee revenue 12.',
        'On settlement: debit cash 97, debit processor fees 3, credit receivable 100. On payout: debit seller payable 88, credit cash 88. Each entry sums to zero and references the payment or payout that caused it.',
        'Corrections are new entries (a refund or a reversal), never edits. A refund reverses the capture lines in proportion; a chargeback after payout leaves the seller payable negative, to recover from future sales.',
        'Strong consistency for the ledger: a relational database with serializable or carefully locked transactions, one leader per shard, and synchronous replication to a standby in another zone so a committed entry survives losing the primary.',
        "Shard by account so an entry stays on one shard: each seller's accounts live with the seller, and platform-wide accounts (fee revenue, cash) are split into one sub-account per shard, summed for reports. That also stops one hot row from serializing every payment.",
        'Read replicas and caches serve dashboards and history, which can be a second stale; a balance used to decide a payout is read from the primary.',
      ],
    },
    {
      kind: 'design',
      title: 'Put it together',
      prompt: 'Trace a checkout from the buyer tapping "Pay" to the order confirmation, and then the seller being paid a week later.',
      lab: true,
      points: [
        "The client collects the card in the processor's hosted fields and gets a token. It calls `POST /payments` with the token and an idempotency key.",
        "The payment service stores the idempotency key and a payment in `CREATED`, calls the processor to authorize (with the attempt ID as the processor's key), records the result and returns it. The order service confirms the order on `AUTHORIZED`.",
        "When the seller ships, a capture worker captures the authorization and writes the capture journal entry. Authorizations lapse after about 5 to 7 days depending on the card network, so if shipping can take longer, capture at checkout and hold the funds in the ledger instead, refunding on cancellation. A settlement worker records the processor's payout to us, and a payout worker pays sellers whose funds have cleared their holding period.",
        'Every state change writes an outbox row in the same transaction; a relay publishes it to an event log (for example Kafka) for orders, notifications and analytics.',
        'Open the build in the Lab: 12,000 requests a second at peak, 60% reads. The cache holds payment status for order pages; the sharded database is the payments tables and the ledger, with replicas for dashboards. The lab draws only the synchronous path: a lab queue would take every write off the request path, and a payment must commit before it answers. The outbox relay, the event log and the workers hang off the primary.',
      ],
    },
    {
      kind: 'deep-dive',
      title: 'Talk to the processor',
      prompt:
        'The authorize call has a 10 second timeout, and it just expired. Did the buyer get charged? What do you record, and what do you tell them?',
      decision: {
        question: 'The processor call timed out. What do you do?',
        options: [
          {
            label:
              'Record the attempt as `UNKNOWN`, show the buyer "processing", and resolve it by retrying with the same processor idempotency key or querying the processor for that attempt',
            best: true,
            why: 'A timeout means the outcome is unknown, not failed. Retrying with the same key cannot create a second charge, and the webhook or a status query settles the truth within seconds or minutes.',
          },
          {
            label: 'Mark the payment failed and let the buyer try again',
            why: 'The first charge may have succeeded at the processor, so the buyer is charged twice and the first charge becomes an orphan that only reconciliation finds.',
          },
          {
            label: 'Retry at once as a new request',
            why: 'Without the original idempotency key the processor treats it as a new charge: this is exactly how double charges happen.',
          },
          {
            label: 'Fail over to a second processor',
            why: 'Right only when the first call provably never left (connection refused, or a clear error before sending). After a timeout both processors may charge the card.',
          },
        ],
      },
      points: [
        'States: `CREATED`, `REQUIRES_ACTION` (3-D Secure), `AUTHORIZED`, `CAPTURED`, `PARTIALLY_REFUNDED`, `REFUNDED`, plus `DECLINED`, `FAILED` and `UNKNOWN`, and `EXPIRED` for authorizations that were never captured (they lapse after a few days).',
        'Transitions are conditional writes that name the state they expect (`AND state = ?` in the `WHERE` clause). If no row changes, someone else already moved it, so re-read and act on the new state. Illegal transitions are rejected, not applied.',
        'Retry only what is safe: timeouts and 5xx responses with the same key, backing off with jitter; never retry a decline. A circuit breaker per processor stops piling calls onto one that is down.',
        'A sweeper finds attempts stuck in `UNKNOWN` or in flight for too long and queries the processor; anything still unresolved goes to reconciliation.',
      ],
    },
    {
      kind: 'deep-dive',
      title: 'Exactly-once effects',
      prompt:
        "Once a payment is captured, the order service, the seller's notification and the ledger must all hear about it exactly once, even if a server crashes at the worst moment. How?",
      decision: {
        question: 'How does the payment service publish "payment captured"?',
        options: [
          {
            label:
              'A transactional outbox: insert the event into an outbox table in the same transaction as the state change, and a relay publishes it; consumers deduplicate by event ID',
            best: true,
            why: 'The event exists if and only if the state change committed. The relay may publish twice after a crash, which idempotent consumers absorb: at-least-once delivery plus deduplication is exactly-once effect.',
          },
          {
            label: 'Commit the transaction, then publish to Kafka from the same code',
            why: 'A crash between the two loses the event forever; publishing first instead can announce a capture that then rolls back.',
          },
          {
            label: 'A distributed transaction (two-phase commit) across the database and the broker',
            why: "Kafka's transactions do not join an XA transaction with an external database, and two-phase commit blocks everyone while its coordinator is down, on the most critical path.",
          },
          {
            label: 'Let consumers poll the payments table for changes',
            why: 'Defensible at small scale, but it couples every consumer to the schema and puts their polling load on the primary.',
          },
        ],
      },
      points: [
        'The relay polls the outbox for unpublished rows in order, or tails the database log with change data capture (for example Debezium). Published rows are marked and deleted later.',
        "Webhooks are the inbound side of the same problem: verify the signature, insert the raw event into an inbox table keyed by the processor's event ID (duplicates hit the unique key), return `200` quickly, and process it asynchronously.",
        'Webhooks arrive late, twice and out of order: a "captured" event can come before "authorized". Apply events through the state machine, ignore transitions already applied, and when in doubt fetch the current object from the processor API.',
        "Exactly-once delivery across a network does not exist; exactly-once effect does, by making every consumer idempotent (a processed-events table, or a natural unique key such as the journal entry's source event).",
      ],
    },
    {
      kind: 'deep-dive',
      title: 'Reconcile with the outside world',
      prompt:
        "Our ledger says one thing, the processor's settlement report says another, and the bank statement a third. How do you find and fix the differences before the auditors do?",
      points: [
        "Every day, import the processor's settlement report (a file or API) and match each line to our payment by the processor's reference: amount, currency, fee and status must agree.",
        'Match the other way too: every captured payment in our ledger must appear in a report within its settlement window. Money the processor has and we do not know about is usually an `UNKNOWN` attempt that succeeded.',
        'Match settlement deposits against the bank statement, so the cash account in the ledger equals the money actually in the bank.',
        'Mismatches ("breaks") go to a queue with a reason: timing, fee differences, disputes, refunds issued in the processor\'s dashboard. Known kinds are fixed automatically with correcting entries; the rest go to a finance operations team.',
        'Internal checks run continuously: all journal lines sum to zero, cached balances equal the sum of their lines, and no payment sits in a non-final state past its deadline.',
      ],
    },
    {
      kind: 'wrap-up',
      title: 'Close the loop',
      prompt: 'You have five minutes left. What would you raise before the interviewer does?',
      points: [
        "PCI scope: card data stays in the processor's iframe or hosted page, so we store only tokens and the last four digits. Keep the checkout page itself locked down (a content security policy, reviewed scripts), since a malicious script there could still skim cards.",
        "Multi-region: keep each account's ledger shard single-leader in a home region; serve reads locally and fail over the leader deliberately, never with two leaders accepting writes.",
        'Payouts: batch them per seller, hold funds until delivery plus a dispute window, and give each payout its own idempotency key and journal entries.',
        'Monitoring: authorization rate by processor and card type, payments stuck in `UNKNOWN`, outbox lag, webhook backlog, reconciliation breaks, and any journal imbalance (which pages someone at once).',
      ],
    },
  ],
  pitfalls: [
    'Treating a timeout as a failure and letting the buyer pay again, or retrying the processor without the original idempotency key.',
    'Storing money as floating point, or keeping only a mutable balance column with no journal behind it.',
    'Publishing events outside the database transaction, so a crash loses a capture or announces one that rolled back.',
    'Trusting webhooks to arrive once and in order, or acting on them without verifying the signature.',
    'Pulling card numbers through our own servers without realizing it puts every one of them in PCI scope.',
  ],
  followUps: [
    {
      question: 'A buyer disputes a charge after the seller has been paid. What happens in the books?',
      answer:
        "The processor debits the disputed amount (plus a dispute fee) and sends a webhook. We record an entry that debits the seller payable and credits cash at the processor (the fee is booked the same way, to the seller or to an expense, per policy), so the seller's balance goes negative and is recovered from future sales or collected. If we win the dispute, a reversing entry restores it.",
    },
    {
      question: 'How would you add a second processor for resilience and lower fees?',
      answer:
        'Put processors behind one internal interface with a router that picks one per attempt (by card type, country, cost or health). Each attempt belongs to exactly one processor for life, and a new attempt on another processor is allowed only once the previous one is known to have failed. Saved cards need a token per processor, or a network token that works across them.',
    },
    {
      question: 'How do you prove the ledger is correct at the end of the month?',
      answer:
        'Close the period: every journal line in it sums to zero, each account balance equals its opening balance plus its lines, every captured payment is matched in a settlement report, and cash equals the bank statement. Then freeze the period so later corrections land in the next one as dated adjustments.',
    },
  ],
};
