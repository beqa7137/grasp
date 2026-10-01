import { num } from './ledger/checkpoint.js';
import { hotAccount, subAccountsNeeded } from './ledger/contention.js';
import { expectedCharges } from './ledger/retries.js';
import type { CaseStudy } from './types.js';

const PAYMENTS_A_DAY = 50_000_000;
const POSTINGS_A_PAYMENT = 8;
const PEAK = 4;
const POSTING_BYTES = 200;
const LOCK_MS = 5;
const BUSY = 0.7;
const MERCHANT_POSTINGS_A_MONTH = 2_000_000;

const postingsADay = PAYMENTS_A_DAY * POSTINGS_A_PAYMENT;
const averagePostings = postingsADay / 86_400;
const peakPostings = averagePostings * PEAK;
const gbADay = (postingsADay * POSTING_BYTES) / 1e9;
const tbAYear = (gbADay * 365) / 1000;
const feePeak = (PAYMENTS_A_DAY / 86_400) * PEAK;
const oneRow = hotAccount({ offered: feePeak, lockMs: LOCK_MS, subAccounts: 1, batch: 1 });
const feeRows = subAccountsNeeded(feePeak, LOCK_MS, 1, BUSY);
const batched = hotAccount({ offered: feePeak, lockMs: LOCK_MS, subAccounts: 1, batch: 20 });
const lostResponse = 0.001;
const duplicatesADay = PAYMENTS_A_DAY * (expectedCharges(lostResponse, 0, 3, 'none') - 1);
const merchantRows = MERCHANT_POSTINGS_A_MONTH * 12 * 3;
const merchantDay = (MERCHANT_POSTINGS_A_MONTH * 12) / 365;

export const PAYMENT_LEDGER: CaseStudy = {
  id: 'payment-ledger',
  stages: [
    {
      kind: 'requirements',
      title: 'Clarify what it must never get wrong',
      prompt:
        'A payments company moves money for millions of merchants: card captures, fees, refunds, disputes, payouts and transfers between balances. Every one of them is recorded in one ledger. Before drawing boxes, decide what the ledger may never get wrong, and what it may give up to get there.',
      decision: {
        question: "The ledger database's primary is unreachable for 30 seconds. What should a request to post an entry get?",
        options: [
          {
            label: 'An error it can retry with the same idempotency key, while reads keep working from replicas marked as possibly stale',
            best: true,
            why: 'Money writes choose consistency over availability. Refusing for 30 seconds costs some retries; accepting writes that nothing checks against current balances can let two withdrawals spend the same money. Callers keep the request in their outbox and retry safely with its key, so the outage delays postings and loses none.',
          },
          {
            label: 'Accept it into a buffer on the API server and post it when the primary returns',
            why: 'The caller hears that money moved when nothing durable says so: a crash loses the entry, and the balance check was skipped, so the buffer can hold entries that overdraw an account.',
          },
          {
            label: 'Write it to a replica in another region and merge the two histories later',
            why: 'Two writable copies of one balance accept conflicting spends during the split, and no merge can take back money already paid out.',
          },
          {
            label: 'Post it without the balance check and claw back any overdraft afterwards',
            why: 'Defensible for credits that cannot overdraw anything, such as fee revenue. For debits it turns a short outage into losses, and fraud looks for exactly that window.',
          },
        ],
      },
      points: [
        "Functional: post journal entries that move money between accounts (captures, fees, refunds, disputes, payouts, transfers), read an account's balance now or as of any time, and list its postings as a statement for any period.",
        'Every entry is a set of postings that sum to zero in each currency, and nothing is ever edited or deleted: a mistake is fixed by a new entry, so the history is the audit trail.',
        'Correctness over availability for writes: a posting either commits durably, checked against current balances, or fails with an error the caller can retry. Reads may be slightly stale where nothing is decided from them.',
        'Auditability: each entry records what created it (the source system and its idempotency key), when the money moved (effective time) and when it was recorded, so any balance can be explained posting by posting.',
        "Retention: financial records must be kept for years, commonly five to ten depending on the country and the kind of record, and a customer's request to delete their data does not override that duty for the money records themselves.",
        `Scale (from the interviewer): ${num(PAYMENTS_A_DAY / 1e6)} million payments a day, each touching the ledger about ${POSTINGS_A_PAYMENT} times over its life, with a holiday peak at ${PEAK} times the yearly average.`,
        'Out of scope: card processing itself, fraud scoring and tax. The ledger records what those systems decide.',
      ],
    },
    {
      kind: 'estimation',
      title: 'Estimate the write load',
      prompt: `${num(PAYMENTS_A_DAY / 1e6)} million payments a day, about ${POSTINGS_A_PAYMENT} postings each over their life: a capture of 3 postings, a settlement of 3, and on average 2 more from refunds, disputes and payouts. At a peak of ${PEAK} times the average, how many postings a second must the ledger write?`,
      estimate: {
        question: 'Peak postings per second',
        answer: Math.round(peakPostings),
        unit: 'postings/s',
        working: [
          `Postings a day: ${num(PAYMENTS_A_DAY / 1e6)} million × ${POSTINGS_A_PAYMENT} = ${num(postingsADay / 1e6)} million.`,
          `Average: ${num(postingsADay / 1e6)} million / 86,400 seconds ≈ ${num(averagePostings)} a second.`,
          `Peak: ${PEAK} × ${num(averagePostings)} ≈ ${num(peakPostings)} a second; call it 20,000.`,
        ],
      },
      points: [
        `About ${num(peakPostings)} postings a second is well within a sharded relational database. The hard part is keeping every transaction correct and short, and one busy row, not the total.`,
        "Settlements and payouts arrive in daily batches (a processor's settlement file, a payout run), so leave headroom for bursts that do not follow customer traffic.",
        'Reads outnumber writes: a balance check on every debit, dashboards, statements and reconciliation jobs, most of them servable from replicas.',
      ],
    },
    {
      kind: 'estimation',
      title: 'Estimate the storage',
      prompt: `Each posting row takes about ${POSTING_BYTES} bytes with its share of the indexes: ids, the account, a signed amount, the currency and timestamps. How much does the postings table grow in a year, before replication?`,
      estimate: {
        question: 'Posting storage per year, before replication',
        answer: Math.round(tbAYear * 10) / 10,
        unit: 'TB',
        working: [
          `Postings a day: ${num(postingsADay / 1e6)} million.`,
          `Bytes a day: ${num(postingsADay / 1e6)} million × ${POSTING_BYTES} bytes = ${num(gbADay)} GB.`,
          `A year: ${num(gbADay)} GB × 365 = ${num(gbADay * 365)} GB, about ${num(tbAYear)} TB.`,
        ],
      },
      points: [
        `Kept for 7 years that is about ${num(tbAYear * 7)} TB before replicas, and three copies make it over ${num(Math.floor((tbAYear * 21) / 100) * 100)} TB. Partition postings by month, so a closed month moves to cheaper storage as a whole and stays queryable for audits.`,
        'An append-only table archives well, since a closed month never changes; the hot working set is the recent months and the current balances.',
        'Entries add a smaller table, one row per entry with its source, idempotency key and description; balances are one row per account (or sub-account).',
      ],
    },
    {
      kind: 'data',
      title: 'Model money as double entry',
      prompt:
        'A customer pays a merchant $100.00 by card. The merchant is owed $97.10, the platform keeps a $2.90 fee, and the processor will pay us the $100.00 later. Record it so the books always balance and every balance can be explained.',
      decision: {
        question: "Where does an account's balance come from?",
        options: [
          {
            label: 'The sum of its immutable postings, cached in a balances row that the same transaction updates',
            best: true,
            why: 'The journal is the source of truth, and the cache can always be rebuilt and checked against it. Updating both in one transaction keeps them equal, so a mismatch is a bug that monitoring finds, not a silent loss.',
          },
          {
            label: 'A balance column per account, updated in place, with a history log written afterwards',
            why: 'Two writes that can disagree: a crash between them leaves a balance nothing explains, and nothing stops a bug from changing a balance with no log line. Auditors need the reverse, balances that follow from the history.',
          },
          {
            label: 'Sum every posting of the account on each read, with nothing cached',
            why: 'Correct and simple at first, but a busy account gets millions of postings, so every balance check slows down forever. Keep the derivation, and add the cache and snapshots.',
          },
          {
            label: 'Keep balances in each service that moves money, and copy them to the ledger nightly',
            why: 'Each service then has its own idea of a balance, money moved by two services is counted twice or not at all, and the ledger only describes yesterday.',
          },
        ],
      },
      points: [
        'Tables: `accounts` (id, owner, currency, type such as asset or liability), `entries` (id, source, idempotency key, effective time, description) and `postings` (entry id, account id, signed amount in minor units, currency). One common convention makes debits positive and credits negative, so an entry balances when its amounts sum to zero.',
        "The capture: `+10000` to processor receivable, `-9710` to the merchant's payable, `-290` to fee revenue, which sums to zero. When the processor settles, a second entry clears the receivable into cash at the bank and books the processor's own fee as an expense.",
        'An entry balances in each currency separately. A conversion from dollars to euros is four postings: dollars move from the customer to an FX account, and euros move from that FX account to the merchant.',
        'Never update a balance in place without the journal. The posting is the reason the balance changed; without it a wrong balance cannot be explained, corrected or reconciled. Corrections are new entries: a reversal that mirrors the wrong entry, then the right one.',
        "Amounts are integers in the currency's minor unit, never floating point: binary floats cannot hold 0.10 exactly, so sums drift (`0.1 + 0.2` is `0.30000000000000004`). ISO 4217 gives the exponent: 2 for USD and EUR, 0 for JPY, 3 for KWD and BHD.",
        'Splitting an amount (a fee share, a refund across items) rounds each part, so a fixed rule gives the leftover minor units to one part and the parts still sum to the whole. Store amounts as 64-bit integers or decimals, and send them in JSON as integers or strings: a JavaScript number is exact only up to 2^53.',
      ],
    },
    {
      kind: 'api',
      title: 'Make posting idempotent',
      prompt:
        'Callers post entries over networks and through queues that deliver at least once, so the same request will arrive twice. Picture the card charged and the response lost: what stops the retry from charging again?',
      decision: {
        question:
          "The payment service sends 'post this capture' through a queue that can deliver it twice. How does the ledger apply it exactly once?",
        options: [
          {
            label:
              'The request carries an idempotency key from its source, such as the event id, and a unique constraint on (source, key) is checked by inserting the entry in the same transaction as its postings',
            best: true,
            why: 'The check and the write are one atomic step, so two deliveries racing on two servers cannot both post: one commits, the other hits the constraint and gets the stored entry back. The same key with a different body is a bug, and is rejected.',
          },
          {
            label: 'Look the key up first, and insert the entry only when it is not there',
            why: 'Two deliveries can both look, both find nothing and both insert. Without a unique constraint behind it, the lookup only narrows the race.',
          },
          {
            label: 'Configure the queue for exactly-once delivery',
            why: "Exactly-once features in brokers such as Kafka cover reads and writes inside the broker. The ledger's database is outside it, so a crash after the commit and before the acknowledgment still redelivers.",
          },
          {
            label: 'Skip a posting with the same accounts and amount as one in the last minute',
            why: 'Customers really do pay the same merchant the same amount twice, so this drops real money movements, and a retry after the minute still posts twice.',
          },
        ],
      },
      widget: 'retries',
      points: [
        '`POST /v1/entries` with an `Idempotency-Key` header, the effective time and the postings as account, amount and currency. The response is the stored entry; the same key with a different body gets `422`, and a key whose first request is still running gets `409`, so the caller retries later.',
        'The client makes one key per payment and resends it on every retry. A new key on every attempt, an easy bug when the key is made inside the retry loop, is no better than no key.',
        `With ${num(PAYMENTS_A_DAY / 1e6)} million payments a day, if ${lostResponse * 100}% of attempts lose their response after the server committed and clients retry up to 3 times, no key means about ${num(duplicatesADay)} duplicate charges a day. One key per payment means none.`,
        'A key must outlive the longest retry window, which for a queue that redelivers after an outage can be days; kept on the entry row, it lasts as long as the ledger.',
        'Reads: `GET` on `/accounts/{id}/balance`, optionally as of a time, and on `/accounts/{id}/postings` with a cursor for statements.',
      ],
    },
    {
      kind: 'design',
      title: 'Put it together',
      prompt: "Trace a card capture from the payment service to the merchant's statement, and name each component on the way.",
      lab: true,
      points: [
        "The payment service commits the capture in its own database with an outbox row; a relay publishes it, and the ledger's consumer posts the entry with the event id as its idempotency key.",
        'The ledger service is stateless. It checks that the postings sum to zero per currency and that every account exists, is open and is in that currency, then runs one transaction on the shard that owns the accounts.',
        'Storage: a relational database such as Postgres, sharded by account owner, each shard with a synchronous standby in another zone so a committed entry survives losing the primary, and asynchronous replicas for statements and dashboards.',
        'A balance that decides something (can this wallet pay?) is read on the primary inside the posting transaction; balances on screens and statements read replicas.',
        "Around the database: the ledger's own outbox (entry posted) for notifications and analytics, nightly balance snapshots, reconciliation jobs against processor and bank files, and an archive of closed months.",
        'Open the build in the Design Lab: 14,000 requests a second at peak, half of them reads. The cache holds statement pages and balances for display; the sharded database is the ledger, with replicas for statements. The lab draws only the synchronous path; the outbox relay, snapshots and reconciliation hang off the primaries.',
      ],
    },
    {
      kind: 'deep-dive',
      title: 'Post an entry atomically',
      prompt:
        'Two transfers leave the same wallet at the same moment, and each checks that the balance covers it. With $100 in the wallet and two $80 transfers, exactly one may succeed. What makes that true?',
      decision: {
        question: 'How does the posting transaction protect the balance check?',
        options: [
          {
            label:
              'One transaction at READ COMMITTED: `SELECT ... FOR UPDATE` the balance rows of every account in the entry, in account id order, check the limits, insert the entry and postings, update the balances, commit',
            best: true,
            why: 'The second transfer waits on the row lock until the first commits, then reads the new balance and is refused. Locking in one fixed order means two entries touching the same accounts cannot deadlock, and waiting costs less than aborting and retrying.',
          },
          {
            label: 'The same transaction at SERIALIZABLE isolation, retried whenever the database reports a serialization failure',
            why: 'Also correct, and safer when code forgets a lock. But conflicts end in aborts rather than waits: on a busy account many attempts roll back and retry, which wastes work exactly where the load is highest.',
          },
          {
            label: 'Read the balance, check it in the application, then subtract with a relative update (`amount = amount - 80`)',
            why: 'At READ COMMITTED both transactions read $100 before either writes, both pass the check, and the wallet ends at -$60. The relative update avoids a lost update, not the stale check.',
          },
          {
            label: 'Check the balance in a cache in front of the database, which is faster',
            why: 'The cache is one more copy that two requests can read at once. The check must happen where writes are serialized, in the database transaction.',
          },
        ],
      },
      points: [
        'All postings of an entry, the balance updates and the idempotency key commit in one ACID transaction on one database, so half an entry never exists.',
        'Keep the transaction short: no calls to other services while holding locks. Anything slow (fraud checks, the processor) happens before the transaction or after it, through the outbox.',
        'A conditional update checks and writes in one statement: subtracting 80 only `WHERE amount >= 80` takes the row lock and checks the condition against the latest committed balance, and zero rows updated means insufficient funds.',
        'Holds: an authorization reserves money without moving it, as postings to a held balance that the capture releases; the available balance is the posted balance less holds.',
        `A transaction holds its locks from the first \`FOR UPDATE\` until the commit returns, and with a synchronous standby the commit waits for the standby too: about ${LOCK_MS} ms here, which is what makes one busy account a bottleneck.`,
      ],
    },
    {
      kind: 'deep-dive',
      title: 'Cool down hot accounts',
      prompt: `Every capture credits the platform's fee revenue account, one row that every payment locks. At peak that is ${num(PAYMENTS_A_DAY / 1e6)} million × ${PEAK} / 86,400 ≈ ${num(feePeak)} postings a second, and each transaction holds the lock for about ${LOCK_MS} ms.`,
      estimate: {
        question: `Sub-accounts the fee account needs to stay at most ${BUSY * 100}% busy`,
        answer: feeRows,
        unit: 'sub-accounts',
        working: [
          `One row commits one transaction per lock hold: 1,000 / ${LOCK_MS} ms = ${num(oneRow.capacity)} postings a second.`,
          `At most ${BUSY * 100}% busy leaves room for bursts: ${num(oneRow.capacity)} × ${BUSY} = ${num(oneRow.capacity * BUSY)} a second per row.`,
          `${num(feePeak)} / ${num(oneRow.capacity * BUSY)} ≈ ${(feePeak / (oneRow.capacity * BUSY)).toFixed(1)}, so ${feeRows} sub-accounts; round up to 32 for growth.`,
        ],
      },
      widget: 'hot-account',
      points: [
        `One row serializes: at ${LOCK_MS} ms a transaction it commits at most ${num(oneRow.capacity)} postings a second against a peak of ${num(feePeak)}. Faster disks barely help, since the lock is held through the commit's round trip to the standby.`,
        'Split the account into sub-accounts, each its own row, and post each entry to one of them (round robin, or by a hash of the entry id). Capacity grows with the count; the balance is the sum of the rows, which is fine for a revenue account that reports read.',
        `Batch: apply many entries in one transaction, so the hot row is locked and updated once for all of them while each entry still balances on its own. With 20 entries a transaction one row takes ${num(batched.capacity)} a second, at the price of waiting for a batch to fill (about ${batched.batchWaitMs.toFixed(1)} ms on average at this rate).`,
        'An account that checks a limit, such as a wallet that must not go negative, is harder to split: checking a sum of sub-accounts would lock them all. Give each sub-account its own share of the money and rebalance when one runs low, or keep it whole and limit how fast it can be debited.',
        'Find hot accounts before they find you: platform-wide accounts (fee revenue, processor receivable, settlement cash) and the largest merchants. Sharding cannot spread one row; only splitting or batching can.',
      ],
    },
    {
      kind: 'deep-dive',
      title: 'Shard the ledger',
      prompt: `One database will not hold ${num(tbAYear)} TB a year or ${num(peakPostings)} postings a second at peak. How do you split the ledger so that most entries still commit in one local transaction?`,
      decision: {
        question: 'What do you shard postings and balances by?',
        options: [
          {
            label:
              "The account owner (merchant or customer), so all of an owner's accounts share a shard, with one sub-account of each platform account per shard",
            best: true,
            why: "A capture touches the merchant's payable and platform accounts. With a sub-account of each platform account on every shard, the whole entry lands on the merchant's shard and commits locally. Platform balances are the sum over shards, read by reports rather than the hot path.",
          },
          {
            label: 'A hash of the journal entry id',
            why: "Spreads writes evenly, but one account's postings land on every shard: its balance needs a read across shards, and locking it for a check needs a distributed transaction.",
          },
          {
            label: 'The date, a new shard each month',
            why: 'Good for archiving, but every write goes to the newest shard, and balances need all of history. Partition by month inside each shard instead.',
          },
          {
            label: 'The currency',
            why: 'A handful of shards, with the largest currency taking most of the load, so it does not scale, and conversions cross shards anyway.',
          },
        ],
      },
      points: [
        "A transfer between owners on different shards cannot be one local transaction. Split it into two entries through in-transit accounts: on shard A, debit the sender's wallet and credit 'in transit to B'; on shard B, debit 'in transit from A' and credit the receiver. Each entry balances on its own shard.",
        'The second entry travels through the outbox of shard A with the transfer id as its idempotency key, so it posts exactly once however often it is delivered. Until it lands, the in-transit accounts hold the money visibly, and their sum across shards is the money in flight.',
        'If the second entry cannot post (the receiving account was closed), shard B refuses it and shard A posts a reversal: debit in transit, credit the sender. That is a saga, compensated with new entries, never rolled back.',
        'Inside each shard, partition postings by month, so a closed month can be archived as a whole.',
        'Resharding moves whole owners with all their accounts, never half an owner, so their entries stay local. A directory from owner to shard makes moves possible without rehashing everyone.',
      ],
    },
    {
      kind: 'deep-dive',
      title: 'Read balances and statements fast',
      prompt: `A large merchant's payable account gets ${num(MERCHANT_POSTINGS_A_MONTH / 1e6)} million postings a month. Three years in, the merchant opens its dashboard. If the balance were summed from every posting, how many postings would one balance read add up?`,
      estimate: {
        question: 'Postings summed for one balance read, without snapshots',
        answer: merchantRows,
        unit: 'postings',
        working: [
          `${num(MERCHANT_POSTINGS_A_MONTH / 1e6)} million postings a month × 12 months × 3 years = ${num(merchantRows / 1e6)} million.`,
          'Even at millions of rows a second that is many seconds a read, and it grows every day.',
        ],
      },
      points: [
        'The current balance is the cached row that the posting transaction updates: one row read, exact when read where it is written.',
        `Balance snapshots (checkpoints): every night, record each account's balance as of its last posting of the day. A balance as of any time is the snapshot before it plus the postings after it, at most a day of postings: about ${num(merchantDay)} rows for this merchant instead of ${num(merchantRows / 1e6)} million.`,
        "Snapshots also check the cache: yesterday's snapshot plus today's postings must equal the cached balance, and a difference pages someone.",
        'Statements page with a cursor on a per-account sequence (`WHERE seq > :last`, `LIMIT 100`), served by an index on (account id, seq). An offset would make the database walk every earlier posting for each deeper page.',
        "A statement's opening balance comes from the snapshot before its period, and its closing balance must equal the opening balance plus the postings listed.",
        'Number postings with the per-account sequence in the posting transaction rather than ordering by timestamp: clocks tie and skew, and a statement must list the same postings in the same order every time.',
      ],
    },
    {
      kind: 'deep-dive',
      title: 'Stay consistent across services',
      prompt:
        "The payment service, the payout service and the ledger each own a database. A payout must debit the merchant's balance in the ledger and send money through a bank. What ties these together when any step can fail?",
      decision: {
        question: "How do you keep the payment service's records and the ledger in step?",
        options: [
          {
            label:
              'Each service commits its change with an outbox row in one local transaction, a relay delivers the events at least once, and the ledger posts idempotently by event id; multi-step flows such as payouts run as sagas with compensating entries',
            best: true,
            why: 'No step depends on two databases committing together. A crash anywhere leaves an event that will be delivered again or an entry that a retry will find, and a failed step is undone by a new entry, so the history shows it.',
          },
          {
            label: 'Two-phase commit (XA) across the payment database, the ledger database and the bank',
            why: "The bank's API cannot take part, and a coordinator that dies between prepare and commit leaves balance rows locked in doubt on the busiest path there is. Payment systems avoid it for these reasons.",
          },
          {
            label: 'The payment service calls the ledger API, then commits its own transaction',
            why: 'A dual write: if the ledger call succeeds and the local commit fails, or the reverse, the two disagree and nothing remembers to fix it.',
          },
          {
            label: "The ledger reads the payment service's tables directly",
            why: "It couples the ledger to another team's schema and load, and it still cannot tell a committed payment from one about to roll back.",
          },
        ],
      },
      points: [
        "A payout saga: post 'debit the merchant's payable, credit payouts in transit'; send the bank transfer with the payout id as its idempotency key; when the bank confirms, post 'debit payouts in transit, credit cash'. If the transfer fails or the bank returns it, post a reversal that credits the merchant's payable again.",
        'Order a saga so that steps that can fail come before the ones that cannot be undone: the money is set aside in the ledger before the bank is asked to move it.',
        'Partial failures and retries: each step is retried with backoff until it succeeds or is compensated, so each must be idempotent; a step that keeps failing parks the saga for a person, never drops it.',
        'Late webhooks: a processor may report a capture minutes or days after we gave up on the attempt. Post it as a new entry when it arrives, effective when the processor captured it, then fulfil or refund; never edit the closed attempt. If its period is already closed, it lands in the open period as a dated adjustment.',
        'Two-phase commit is not banned: inside one database, or across the shards of a database built for it such as Spanner, it is how a distributed transaction commits. What payment systems avoid is 2PC across independent services and outside parties.',
      ],
    },
    {
      kind: 'deep-dive',
      title: 'Reconcile with processors and banks',
      prompt:
        'Every night the processor sends a settlement report, one line per charge it captured with its fee, and the bank sends a statement. The ledger has its own record of the day. Match them, and decide what to do with each difference before the month-end close.',
      decision: {
        question:
          "A customer's payment attempt timed out, so they paid again and it worked. Two days later the processor's webhook says the first attempt was captured too. What does the ledger do?",
        options: [
          {
            label:
              'Post the first capture now as a new entry, effective when the processor captured it, then refund it with a second entry and tell the customer',
            best: true,
            why: 'The money really moved, so the books must show it, and the refund is its own entry, so the history shows the double charge and its repair. Waiting for reconciliation would find it a day or more later, with an angrier customer.',
          },
          {
            label: 'Ignore it: that attempt was closed as failed',
            why: "The processor holds the customer's money and our books do not show it. The next reconciliation reports a break, and meanwhile the customer sees two charges.",
          },
          {
            label: "Change the failed attempt to captured and delete the second payment's entry",
            why: 'Editing history destroys the audit trail, and the second charge is real too: deleting its entry only hides money the customer paid.',
          },
          {
            label: 'Refund the second payment instead, since it came later',
            why: "Defensible for the money, but the order and its receipt point at the second payment. Refunding the unexpected one keeps the order's records intact.",
          },
        ],
      },
      widget: 'reconcile',
      points: [
        'Match by our own reference, which we send with every charge, not by amount: amounts repeat. Compare amount, currency, fee and status line by line, in both directions: lines the processor has that we lack, and captures we have that it lacks.',
        "Timing breaks resolve themselves: a capture after the report's cut-off appears in the next one. Keep open items with their age, and escalate any that outlive their expected settlement.",
        "Then match the processor's payout to the bank statement, so the cash account in the ledger equals the money actually in the bank.",
        'Known kinds of break are fixed automatically with correcting entries (missed captures, fee differences within a tolerance); everything else goes to a finance operations queue with the evidence attached.',
        'Breaks are data: their rate by kind is a health metric. Rising missed captures mean timeouts are not being resolved; duplicate charges mean a client is retrying without its idempotency key.',
      ],
    },
    {
      kind: 'wrap-up',
      title: 'Operate and audit it',
      prompt: 'You have five minutes left. What do you monitor, and how do you show an auditor that the ledger is right?',
      points: [
        'Invariants, checked continuously and paged on: every entry sums to zero per currency; the sum of all postings in the ledger is zero per currency; each cached balance equals its last snapshot plus the postings since; the in-transit accounts add up to the transfers in flight.',
        'Pipeline health: outbox lag, saga steps past their deadline, payment attempts in an unknown state, reconciliation breaks by kind and age, and lock waits on hot accounts.',
        'Period close: at month end, check the invariants for the period, reconcile cash with the bank, then freeze it; later corrections are dated adjustments in the open period.',
        'Audit: every entry says what created it and why. Access is least privilege, nobody can change a posting (not even administrators: direct writes are revoked and the posting tables refuse updates and deletes), and auditors can trace any balance to its postings and each posting to its source.',
        'Retention: closed periods move to cheaper, write-once storage, stay queryable for as long as the law requires, then expire on a schedule. An erasure request removes personal details kept around the ledger, not the money records.',
      ],
    },
  ],
  pitfalls: [
    'Storing money in floating point, or as a balance column updated in place with no journal behind it.',
    'Checking idempotency keys with a lookup and no unique constraint, or making a new key on every retry.',
    'Checking a balance outside the transaction that writes it, so two concurrent debits both pass.',
    'Leaving a platform account as one hot row that every payment locks.',
    'Reaching for two-phase commit across services and outside parties instead of an outbox and a saga.',
    'Telling a customer that a timed-out payment failed, so they pay again and are charged twice.',
  ],
  followUps: [
    {
      question: 'How do you support several currencies?',
      answer:
        "Every account holds one currency, and every entry balances per currency. A conversion posts to FX accounts in both currencies at the rate used, and gains or losses from rates moving are booked when positions are revalued, never by editing old postings. Amounts stay in minor units with each currency's own exponent.",
    },
    {
      question: 'An entry went to the wrong merchant last month. How do you correct it?',
      answer:
        "Never edit it. Post a reversal that mirrors it, linked to the original, then post the correct entry. If last month is closed, both land in the open period as adjustments, and each merchant's statement shows the correction.",
    },
    {
      question: 'A bug corrupted some cached balances. How do you rebuild them?',
      answer:
        "Recompute each affected balance from its last good snapshot plus its postings, holding the balance row's lock so no posting lands meanwhile, and compare with the cache. Because balances are derived, a rebuild is a computation, and the differences point at the postings or the code path that caused the drift.",
    },
  ],
};
