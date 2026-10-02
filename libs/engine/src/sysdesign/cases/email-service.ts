import { SMTP_RETRY, durationText, smtpRetry } from './email/smtp-retry.js';
import { MAIL_STORAGE, mailStorage, storageText, type MailStorageSettings } from './email/storage.js';
import type { CaseStudy } from './types.js';
import { num } from './widget-checkpoint.js';

const USERS = 500_000_000;
const RECEIVED_A_DAY = 40;
const SENT_A_DAY = 5;
const PEAK = 2;
const LISTS_A_DAY = 20;
const OPENS_A_DAY = 10;
const SEARCHES_A_DAY = 2;
const CHANGES_A_DAY = 10;
const ATTACHMENT_PCT = 10;
const ATTACHMENT_KB = 500;
const DEDUP_PCT = 30;
const MAX_ATTACHMENT_MB = 25;
/** Plain text a message gives the search index: subject, addresses, body text without markup, attachment names. */
const TEXT_KB = 4;
/** Lucene's documentation puts an index at roughly 20 to 30% of the text it indexes. */
const INDEX_SHARE = 0.25;
const MAILBOX_YEARS = 10;
const LAB_SHARE = 0.01;
const STALL_HOURS = 2;
const NEWSLETTER = { mb: 2, recipients: 100_000 };

const DAY_S = 86_400;
const perDay = (perUser: number) => USERS * perUser;
const peak = (perUser: number) => Math.round((perDay(perUser) / DAY_S) * PEAK);
const billions = (v: number) => `${Number((v / 1e9).toFixed(1))} billion`;

const received = perDay(RECEIVED_A_DAY);
const averageIn = received / DAY_S;
const peakIn = peak(RECEIVED_A_DAY);
const sent = perDay(SENT_A_DAY);
const year: MailStorageSettings = {
  usersM: USERS / 1e6,
  perDay: RECEIVED_A_DAY,
  attachmentPct: ATTACHMENT_PCT,
  attachmentKb: ATTACHMENT_KB,
  dedupPct: DEDUP_PCT,
  replication: 3,
};
const storage = mailStorage(year);
const erasure = mailStorage({ ...year, replication: 1.5 });
const { metadataKb, bodyKb, bodyCompression, quotaGb } = MAIL_STORAGE;
const averageKb = metadataKb + bodyKb + (ATTACHMENT_PCT / 100) * ATTACHMENT_KB;
const dailyBytes = received * averageKb * 1000;
const rawPb = Math.round(storage.rawBytes / 1e15);
const share = (part: number) => Math.round((part / storage.rawBytes) * 1000) / 10;
const peakGbits = Math.round(((dailyBytes / DAY_S) * PEAK * 8) / 1e9);
const indexKb = TEXT_KB * INDEX_SHARE;
const indexDaily = received * indexKb * 1000;
const indexYearUser = RECEIVED_A_DAY * 365 * indexKb * 1000;
const bigMailbox = RECEIVED_A_DAY * 365 * MAILBOX_YEARS;
const bigMailboxBodies = bigMailbox * bodyKb * 1000;

const lab = {
  incoming: peak(RECEIVED_A_DAY) * LAB_SHARE,
  outgoing: peak(SENT_A_DAY) * LAB_SHARE,
  changes: peak(CHANGES_A_DAY) * LAB_SHARE,
  lists: peak(LISTS_A_DAY) * LAB_SHARE,
  opens: peak(OPENS_A_DAY) * LAB_SHARE,
  searches: peak(SEARCHES_A_DAY) * LAB_SHARE,
};
const labWrites = Math.round(lab.incoming) + Math.round(lab.outgoing) + Math.round(lab.changes);
const labReads = Math.round(lab.lists) + Math.round(lab.opens) + Math.round(lab.searches);
const labRps = Math.round((labWrites + labReads) / 100) * 100;
const labReadShare = Math.floor((labReads / (labWrites + labReads)) * 100);

const retry = { outageMin: 360, firstRetryMin: 5, longestMin: 60, lifetimeMin: 7_200, reply: 'temporary' } as const;
const sixHours = smtpRetry(retry);
const sixDays = smtpRetry({ ...retry, outageMin: 8_640 });
const stalled = averageIn * LAB_SHARE * STALL_HOURS * 3_600;

export const EMAIL_SERVICE: CaseStudy = {
  id: 'email-service',
  stages: [
    {
      kind: 'requirements',
      title: 'Clarify the scope and the one promise',
      prompt: `A large consumer mailbox provider at Gmail or Outlook scale: ${num(USERS / 1e6)} million daily active mailboxes receive, store, search and send mail, from the web, phone apps and any IMAP client. This is not a marketing email sender (campaigns, templates, list management); that is a different system, and here it is only a source of incoming mail. Decide which promise is never traded away.`,
      decision: {
        question: 'Mail passes through SMTP servers, filters, storage, search and sync. Which promise must hold whatever fails?',
        options: [
          {
            label:
              'Once our server answers 250 OK to a sending server, the message is never lost: it is stored durably before that answer, while search, push and even filing may lag by seconds',
            best: true,
            why: 'The sending server deletes its copy when it sees 250, so from then on we hold the only one. Everything after it can be retried from that durable copy; a lost message cannot be retried.',
          },
          {
            label: 'Every message reaches its recipient within a second of being sent',
            why: "Mail between providers is store and forward: the sender's server may queue it, retry for days or be slow, and none of that is ours to control. Seconds between two of our users is a target, not a promise.",
          },
          {
            label: 'No spam ever reaches an inbox',
            why: 'Filters are statistical. Pushed to zero spam, they file real mail as spam, and a missed invoice or password reset costs the user more than a spam message they delete.',
          },
          {
            label: 'Every device shows exactly the same mailbox at every instant',
            why: 'Phones go offline and sync later. What matters is that each device converges on the same state when it next syncs, without losing a change.',
          },
        ],
      },
      points: [
        `Functional: receive mail from any server on the internet over SMTP and send to any; read, reply and forward; folders and labels; read and unread, starred, archived and deleted; conversations (threads); search; attachments up to a limit such as ${MAX_ATTACHMENT_MB} MB; spam, phishing and malware filtering. Contacts, calendars and chat are out of scope.`,
        'Clients: the web and phone apps use our own API; other clients use IMAP to read and SMTP submission to send, and JMAP is an open JSON alternative to IMAP. A change on one device reaches the others, and new mail is pushed.',
        'Durability: accepted mail is never lost, and deleted mail stays recoverable for a while (the trash keeps it 30 days, say).',
        'Latency targets on the server: the inbox list under 200 ms and opening a message under 500 ms at the 99th percentile, search under 1 s, and mail between two of our users visible within a few seconds.',
        'Availability: reading and sending are what users feel, so aim for 99.9% or better. Receiving tolerates short outages better, because a server that cannot reach us keeps the mail and retries.',
        `Scale (from the interviewer): ${num(USERS / 1e6)} million daily active mailboxes, each receiving about ${RECEIVED_A_DAY} messages a day and sending ${SENT_A_DAY}.`,
      ],
    },
    {
      kind: 'estimation',
      title: 'Estimate the mail flow',
      prompt: `Each of ${num(USERS / 1e6)} million mailboxes receives about ${RECEIVED_A_DAY} messages a day, mail filed as spam included, and sends ${SENT_A_DAY}. Mail arrives around the clock from every time zone; assume the peak hour runs at ${PEAK}x the daily average. How many messages a second must the receiving servers accept at peak?`,
      estimate: {
        question: 'Messages accepted per second at peak',
        answer: peakIn,
        unit: 'messages/s',
        working: [
          `${num(USERS / 1e6)} million × ${RECEIVED_A_DAY} = ${billions(received)} messages a day.`,
          `${billions(received)} / 86,400 s ≈ ${num(averageIn)} a second on average.`,
          `× ${PEAK} at peak ≈ ${num(peakIn)} a second.`,
        ],
      },
      points: [
        `Sending: ${num(USERS / 1e6)} million × ${SENT_A_DAY} = ${billions(sent)} messages a day, about ${num(sent / DAY_S)} a second and ${num(peak(SENT_A_DAY))} at peak. Mail between two of our users is delivered inside the system, with no SMTP hop; the rest leaves through the outbound queue.`,
        `Bandwidth: at the ${num(averageKb)} KB average message of the next stage, ${billions(received)} messages are ${Number((dailyBytes / 1e15).toFixed(2))} PB a day, about ${num(peakGbits)} Gbit/s at peak, before base64 makes attachments a third larger on the wire.`,
        `Reads: each user loads a list or syncs about ${LISTS_A_DAY} times a day, opens ${OPENS_A_DAY} messages and searches ${SEARCHES_A_DAY} times: at peak ${num(peak(LISTS_A_DAY))} list loads, ${num(peak(OPENS_A_DAY))} opens and ${num(peak(SEARCHES_A_DAY))} searches a second. Reads and writes are of the same order: every message is written once, and many are never opened.`,
        'Spam refused during the SMTP conversation is not counted here: turning it away at the door, before it costs a write, is part of the design.',
      ],
    },
    {
      kind: 'estimation',
      title: 'Estimate storage',
      prompt: `An average message has about ${metadataKb} KB of metadata (ids, labels, flags, sender, subject, a snippet) and ${bodyKb} KB of headers and body, and 1 in ${100 / ATTACHMENT_PCT} carries attachments of about ${ATTACHMENT_KB} KB in total. How much new mail arrives in a year, before compression, dedup and copies?`,
      estimate: {
        question: 'New mail a year, one copy, before savings',
        answer: rawPb,
        unit: 'PB',
        working: [
          `${metadataKb} KB + ${bodyKb} KB + ${ATTACHMENT_PCT}% × ${ATTACHMENT_KB} KB = ${num(averageKb)} KB a message on average.`,
          `${billions(received)} messages a day × ${num(averageKb)} KB = ${Number((dailyBytes / 1e15).toFixed(2))} PB a day.`,
          `× 365 ≈ ${num(rawPb)} PB a year.`,
        ],
      },
      points: [
        `By part: metadata ${storageText(storage.raw.metadata)}, bodies ${storageText(storage.raw.bodies)} and attachments ${storageText(storage.raw.attachments)} a year. Attachments ride on a tenth of the messages but are ${Math.round(share(storage.raw.attachments))}% of the bytes; metadata is ${share(storage.raw.metadata)}% of the bytes, yet it is what every list, sync and search reads.`,
        `Savings: bodies are text and HTML and compress about ${bodyCompression} to 1 (${storageText(storage.raw.bodies)} to ${storageText(storage.stored.bodies)}). Attachments are mostly compressed already (JPEG, PDF, Office files), but the same file often reaches many mailboxes, so storing each distinct file once saves what repeats: assume ${DEDUP_PCT}%, ${storageText(storage.dedupSaved)}. Kept once, a year is about ${storageText(storage.storedBytes)}.`,
        `Durability multiplies it again: three copies make ${storageText(storage.diskBytes)} a year; an erasure code with 6 data and 3 parity pieces stores 1.5 times the bytes, ${storageText(erasure.diskBytes)}, and survives losing any 3 of the 9 pieces.`,
        `Per mailbox: about ${storageText(storage.rawBytes / USERS)} of mail a year as received, so a ${quotaGb} GB free quota lasts about ${Math.floor(storage.quotaYears)} years; quota is charged at message size, before the savings, which only lower our cost.`,
        `Search index: about ${TEXT_KB} KB of text a message (subject, addresses, body text without markup, attachment names), and Lucene's documentation puts an index at roughly 20 to 30% of the text it indexes, so about ${indexKb} KB a message: ${storageText(indexDaily)} a day, ${storageText(indexDaily * 365)} a year, ${storageText(indexYearUser)} a mailbox a year.`,
      ],
    },
    {
      kind: 'api',
      title: 'Design the client API',
      prompt:
        'Clients list, open, label and send mail. The web and phone apps use our own API; other clients use IMAP and SMTP submission. Decide what happens when the user taps Send.',
      decision: {
        question: 'What does the API answer when a client sends a message?',
        options: [
          {
            label:
              'Store the message in the Sent folder and the outbound queue durably, then answer 202 Accepted with its id; delivery happens afterwards and a failure comes back later as a bounce. The client sends an idempotency key, so a retried tap never sends twice',
            best: true,
            why: 'Delivery to another provider can take seconds, or days of retries, so the client cannot wait for it. A durable queue makes Send fast and safe, and the key turns a retry after a lost response into a no-op.',
          },
          {
            label: "Wait until every recipient's server has accepted it, then answer 200",
            why: 'One slow or broken recipient server holds the request for hours; the client gives up and retries, sending duplicates to everyone else.',
          },
          {
            label: "Have the phone deliver it straight to each recipient's mail server over SMTP",
            why: 'A phone has no retry queue and no sending reputation, receiving servers commonly refuse mail from consumer IP ranges, and our DKIM signature and send limits would be bypassed.',
          },
          {
            label: 'Answer 200 at once and write the message to the queue in the background',
            why: 'A crash between the answer and the write loses a message the user saw as sent.',
          },
        ],
      },
      points: [
        '`GET /v1/messages` with a label and a page token returns summaries (sender, subject, snippet, date, flags, labels), newest first, 50 at a time; `GET /v1/messages/{id}` returns one message, with each attachment fetched by its own id.',
        '`POST /v1/messages:send` takes a draft id or a MIME message and an idempotency key and answers 202. `PATCH /v1/messages/{id}` changes flags and labels, and a batch call covers "select all".',
        'Attachments upload first, resumably, and the message refers to them by id, so a 25 MB send is not one fragile request.',
        '`GET /v1/changes` with a `since` state token returns what changed after it (the sync stage), so a client never lists the whole mailbox to catch up.',
        'Standard protocols: IMAP (IMAP4rev2 is RFC 9051; most clients still speak IMAP4rev1, RFC 3501) to read, and message submission (RFC 6409) on port 587 with STARTTLS or on port 465 with implicit TLS (RFC 8314), always authenticated. JMAP (RFC 8620, and RFC 8621 for mail) does the same over JSON and HTTP.',
      ],
    },
    {
      kind: 'data',
      title: 'Model mailboxes, messages and threads',
      prompt: `${Number((storage.messages / 1e12).toFixed(1))} trillion messages a year, each with about ${metadataKb} KB of metadata and ${num(averageKb - metadataKb)} KB of body and attachments on average. Almost every query is about one mailbox: its inbox, a label, a thread, its changes since some point.`,
      decision: {
        question: 'Where do message metadata, bodies and attachments live?',
        options: [
          {
            label:
              "Metadata in a database sharded by user id, so one mailbox's rows sit together; bodies and attachments in a blob store, referenced from the metadata by key",
            best: true,
            why: 'Every list, label and sync query stays on one shard and reads small rows, while the bulky, immutable bytes go to storage built for cheap, durable objects. Each part scales and is replicated in its own way.',
          },
          {
            label: 'All messages in one table sharded by message id',
            why: "A mailbox's messages spread over every shard, so a single inbox list asks all of them.",
          },
          {
            label: 'Everything, bodies and attachments too, in the metadata database',
            why: `Rows of ${num(averageKb)} KB on average and up to ${MAX_ATTACHMENT_MB} MB fill the database's memory, replication and backups with bytes that are written once and rarely read.`,
          },
          {
            label: 'One mbox file per mailbox on a file server',
            why: 'Appending is easy, but every flag change or delete rewrites or locks the file, a mailbox is tied to one server, and nothing is shared between mailboxes.',
          },
        ],
      },
      points: [
        'A metadata row: (user id, message id) as the key, then the thread id, received time, sender, recipients, subject, a snippet, the size, a flags word (read, starred, answered, draft), label ids, the blob keys of the body and each attachment, and the modification sequence of its last change.',
        "Folders and labels: a folder holds a message in one place; a label is a set, so a message can carry several, as in Gmail. Keep label ids on the message, with a per-user label table whose counts (total, unread) change in the same transaction. Gmail's IMAP shows each label as a folder.",
        'The inbox list is an index on (user id, label id, received time), newest first: the latest 50 come from one shard.',
        "Threads: a reply carries In-Reply-To (the parent's Message-ID) and References (the chain) headers, defined in RFC 5322 section 3.6.4. On delivery, look each one up in the user's map from Message-ID to thread: join the thread found, or start a new one. For clients that drop the headers, a normalized subject (without Re: and Fwd:) among recent messages from the same people can catch most replies.",
        'Shard by a hash of the user id into many logical shards mapped onto machines, so a heavy mailbox can be moved; one mailbox never spans shards, so its transactions stay local.',
        'A message to 10 of our users writes 10 metadata rows (each user has their own labels and flags) but its body and attachments once.',
        "Moving a mailbox: copy its metadata in the background, then replay the change log from the copy's modification sequence, briefly pause writes, switch the user's shard entry and resume; blobs stay put since they are content-addressed. Imports from another provider use IMAP or JMAP at a throttled rate and dedupe by Message-ID.",
      ],
    },
    {
      kind: 'design',
      title: 'Put it together',
      prompt:
        "Trace a message from another provider's server into a user's inbox on two devices, and the reply going back out. Name each component.",
      lab: true,
      points: [
        'Inbound SMTP servers (our MX hosts): accept connections, check each recipient, run the fast checks, write the message to the inbound queue and only then answer 250.',
        'Inbound queue: a log replicated across zones that holds accepted messages until they are delivered.',
        "Filter and delivery workers: SPF, DKIM and DMARC, spam and malware scoring and the user's own filters; then the body and attachments go to the blob store, a metadata row goes to each recipient's shard, and a change event goes out.",
        "Mailbox store: metadata shards with replicas, and a blob store for bodies and attachments. Search indexers consume the change events and update each user's index.",
        'API and sync servers: the web and phone API, IMAP and SMTP submission; push notifiers wake devices when a mailbox changes.',
        'Outbound: Send writes to the outbound queue; outbound servers sign with DKIM, look up MX records, deliver, retry, and turn failures into bounces.',
        `Open the build in the Design Lab for one shard group of ${num((USERS * LAB_SHARE) / 1e6)} million mailboxes, ${LAB_SHARE * 100}% of the users (groups are independent, so the service is many copies of it). At peak: ${num(lab.incoming)} incoming and ${num(lab.outgoing)} outgoing messages a second and ${num(lab.changes)} flag and label changes, ${num(labWrites)} writes; ${num(lab.lists)} list loads, ${num(lab.opens)} opens and ${num(lab.searches)} searches, ${num(labReads)} reads: about ${num(labRps)} requests a second, ${labReadShare}% reads. The app tier stands for the SMTP, API and sync servers; the queue and workers for the inbound pipeline; the database for the metadata shards; the object store for bodies and attachments.`,
      ],
    },
    {
      kind: 'deep-dive',
      title: 'Receive mail',
      prompt: `Another provider's server looks up our MX records and opens an SMTP connection to deliver a message to one of our users, ${num(peakIn)} times a second at peak.`,
      decision: {
        question: 'When does our server answer 250 OK to the end of the message, after DATA?',
        options: [
          {
            label:
              'Once the message is written to the inbound queue in at least two zones. Fast checks (SPF, DKIM, DMARC, sender reputation) may run first so clear spam is refused with a 5xx; filing, indexing and push happen after',
            best: true,
            why: 'The 250 hands over responsibility: the sender deletes its copy. Writing durably first means a crash after the answer loses nothing, and refusing during the conversation tells the real sender instead of bouncing to a forged address later.',
          },
          {
            label: 'As soon as the last byte arrives, writing the message in the background',
            why: 'A crash between the answer and the write loses mail the sender has already deleted, and nobody is told.',
          },
          {
            label: "Only after it is delivered to the mailbox, indexed and pushed to the user's devices",
            why: 'Every downstream system now sits inside the SMTP connection: a slow indexer holds hundreds of thousands of connections open, senders time out and retry, and each retry arrives as a duplicate.',
          },
          {
            label: 'Accept everything with 250, then bounce whatever fails the checks',
            why: 'The envelope sender of spam is usually forged, so those bounces land on innocent people (backscatter) and get our servers listed as a source of spam.',
          },
        ],
      },
      points: [
        'MX records name our inbound hosts, each with a preference; senders try the lowest value first (10 before 20) and move on when one fails (RFC 5321 section 5), so several hosts behind load balancers spread the load and a dead one is skipped.',
        'The conversation: EHLO, STARTTLS, MAIL FROM (the envelope sender, where bounces go), RCPT TO for each recipient (an unknown user is refused right there with 550 5.1.1), DATA with the message, then our reply. The SIZE extension (RFC 1870) announces a size limit, which is enforced as the message streams in.',
        "Authentication: SPF (RFC 7208) checks that the connecting IP may send for the envelope sender's domain; DKIM (RFC 6376) verifies a signature over headers and body against a key in the signing domain's DNS; DMARC (RFC 7489) requires one of them to pass for a domain aligned with the visible From address, and the domain's policy (none, quarantine or reject) says what to do when neither does. Forwarding breaks SPF and mailing lists often break DKIM; ARC (RFC 8617) lets them vouch for what they received.",
        'Spam and malware: connection signals first (IP and domain reputation, blocklists, rate per sender), then content classifiers, link and attachment scanning, and users\' own reports: "report spam" and "not spam" clicks train the per-user and global models. The verdict picks the inbox, the spam folder, or a refusal during the conversation.',
        "Feedback to senders: feedback-loop reports (ARF, RFC 5965) tell large senders that sign up which of their messages users reported. Gmail and Yahoo's 2024 sender rules require bulk senders to offer one-click unsubscribe (RFC 8058) and publish a spam-complaint threshold of 0.3%, above which a sender's mail is throttled or filed as spam.",
        "Delivery: a worker writes the body and attachments once to the blob store, then, for each of our recipients, one transaction in that user's shard: the metadata row with labels from their filters, the thread, the label counts and the change log. Then it emits the change for search and push.",
        "A full mailbox: answer RCPT TO with 452 4.2.2 (temporary, so the sender retries while the user cleans up) or, after a grace period, 552 5.2.2; count usage incrementally in the user's shard, in the same transaction as each delivery and delete, and warn the user well before the limit.",
        'Duplicates: if the connection drops after our write but before the sender sees 250, the sender retries and the message arrives again. Delivery drops a copy whose Message-ID and content hash already sit in that mailbox from the last few days.',
        'Bounces: refuse during the conversation whenever possible, so the sending server reports the failure to its own user. A problem found after the 250 sends a delivery status notification (RFC 3464) to the envelope sender, and only when that sender passed authentication, so forged senders cause no backscatter.',
      ],
    },
    {
      kind: 'deep-dive',
      title: 'Send mail and retry',
      prompt: `Our users send ${billions(sent)} messages a day, many to other providers whose servers are at times slow, overloaded or broken. One of them starts answering every delivery with 451 4.3.0, try again later.`,
      decision: {
        question: "The recipient's server answers 451, a 4xx reply. What does our outbound server do with the message?",
        options: [
          {
            label:
              'Keep it queued and retry with growing waits, for example 5 minutes doubling up to an hour, for about 5 days; then bounce it to the sender with a delivery status notification. A 5xx reply instead bounces it at once',
            best: true,
            why: 'A 4xx reply means try again later and a 5xx means do not. Growing waits stop us hammering a struggling server, and days of retries ride out long outages. RFC 5321 (section 4.5.4.1) suggests at least 30 minutes between retries in general, while allowing smarter schedules, and a give-up time of at least 4 to 5 days.',
          },
          {
            label: 'Bounce it to the sender at once',
            why: 'A 4xx reply is a temporary failure; most clear up within minutes or hours, and bouncing fails mail that a retry would deliver.',
          },
          {
            label: 'Retry every 10 seconds until it goes through',
            why: 'Thousands of queued messages hammering a struggling server help keep it down, and receivers throttle or block senders that retry this hard.',
          },
          {
            label: 'Retry 3 times over 10 minutes, then drop it',
            why: 'An outage of an hour loses the message, and dropping it silently means the sender never learns it failed.',
          },
        ],
      },
      widget: 'smtp-retry',
      points: [
        'Queue by destination domain, so a broken domain backs up only its own queue. Look up MX records and fall back to the next preference; a domain with no MX record is tried at its own address (RFC 5321 section 5.1).',
        'Reply codes: 2xx is success, 4xx a transient failure (retry), 5xx a permanent one (bounce now). Enhanced status codes (RFC 3463) give the detail, such as 4.2.2 for a full mailbox or 5.1.1 for no such user.',
        `In the model, ${SMTP_RETRY.perMinute} messages a minute go to the domain, with a 5-minute first retry doubling to an hour and a 5-day lifetime. A message sent as a 6-hour outage begins is delivered on attempt ${sixHours.attempts.length}, at ${durationText(sixHours.atMin)}; the domain's queue holds ${num(sixHours.queued)} messages when the server comes back and is empty within ${durationText(sixHours.drainMin)}. An outage of 6 days bounces it after ${durationText(sixDays.atMin)}.`,
        'Postfix, for example, waits between 300 and 4,000 seconds between attempts by default and gives up after 5 days; some servers also warn the sender after a few hours that a message is delayed, before the final bounce.',
        "A large sender should not wait out each message's backoff: when one delivery or a probe to a deferred domain succeeds, it releases that domain's queue at a controlled rate, which turns the tail of up to the longest wait into minutes.",
        "IP reputation and warm-up: receiving providers judge mail partly by the sending IP's history. A new IP has none, so move traffic onto it gradually over weeks, keep user mail on its own pools of IPs with matching reverse DNS, and watch the feedback (complaint rates, blocklists, postmaster dashboards).",
        'Per-domain limits: cap connections and messages a second per destination domain, and back off when a receiver answers 421 or a 4.7.x throttling code. Large receivers throttle senders they do not yet trust; small ones can simply fall over.',
        "DKIM signing: outbound servers sign each message with our domain's private key, whose public half is published in DNS under a selector; rotate keys by publishing a new selector before switching. Our domains publish SPF and a DMARC policy so receivers can tell our mail from forgeries.",
        'Abuse: per-account send limits (recipients a day) and outbound spam scoring, so a hijacked account cannot spend the reputation of the shared IPs.',
      ],
    },
    {
      kind: 'deep-dive',
      title: 'Store bodies and attachments once',
      prompt: `A newsletter with a ${NEWSLETTER.mb} MB PDF reaches ${num(NEWSLETTER.recipients)} of our users, and a team of 8 passes the same slide deck around. Attachments are ${Math.round(share(storage.raw.attachments))}% of the bytes.`,
      decision: {
        question: 'How do you store an attachment that many mailboxes received?',
        options: [
          {
            label:
              "Content-addressed: key each attachment by a hash of its bytes (SHA-256), store it once, and point each recipient's metadata at the hash",
            best: true,
            why: 'Identical bytes get the same key wherever they come from, so every further copy costs only a reference in metadata, and writing a key that already exists changes nothing.',
          },
          {
            label: "One copy per recipient, under each mailbox's own prefix in the blob store",
            why: `${num(NEWSLETTER.recipients)} copies of the same ${NEWSLETTER.mb} MB file are ${num((NEWSLETTER.recipients * NEWSLETTER.mb) / 1000)} GB for one newsletter.`,
          },
          {
            label: 'Deduplicate by file name and size',
            why: "Different files share names and sizes (scan.pdf, image001.png), so one user would be shown another user's file.",
          },
          {
            label: 'Compress every attachment harder instead',
            why: 'PDFs, images and Office files are already compressed, so compressing them again saves little; repeats of the same file are where the bytes are.',
          },
        ],
      },
      widget: 'mail-storage',
      points: [
        'Hash the decoded attachment bytes with SHA-256; an accidental collision is not a practical concern. Storing a hash that already exists only adds a reference.',
        'Deleting: a blob may go only when no message refers to it. A reference count kept across the metadata shards and the blob store drifts when a write fails half way, so pair it with a periodic sweep that finds blobs nothing refers to and deletes them after a grace period.',
        `Where it applies: attachments, and sometimes the identical body of bulk mail. Most bodies differ per recipient (a name, a tracking link), so bodies are compressed instead, about ${bodyCompression} to 1 for text and HTML.`,
        "Privacy: dedup across users means the store knows two mailboxes hold the same file. Keep that inside the system, so a user can never tell whether a file already exists elsewhere (count it against their quota as if stored anew). Encrypting each user's mail under their own key rules out dedup across users, a trade-off to choose deliberately.",
        'Layout: object stores charge per object and per request, so pack small bodies into larger append-only segment files with an index, and give big attachments objects of their own.',
        'Tiering: mail older than a few months is rarely opened, so move it to colder, cheaper storage with an erasure code; metadata stays hot.',
      ],
    },
    {
      kind: 'deep-dive',
      title: 'Search a mailbox',
      prompt: `${num(peak(SEARCHES_A_DAY))} searches a second at peak, each over one user's mail; a ${MAILBOX_YEARS}-year mailbox at this rate holds ${num(bigMailbox)} messages. A user expects a message that arrived a second ago to be found.`,
      decision: {
        question: 'How is mail indexed for search?',
        options: [
          {
            label:
              "An inverted index per user, kept with the user's shard and updated as each message is delivered; a query reads only that user's index and checks the few messages newer than it directly",
            best: true,
            why: "A query touches one small index instead of a giant one, deleting a mailbox deletes its index, and nobody else's mail is ever on the path. The messages delivered since the index's last update are scanned, so new mail is found at once.",
          },
          {
            label: 'One global inverted index over all mail, filtered by user at query time',
            why: "The postings for a word like invoice span billions of messages from every user; each query reads and throws away almost all of them, and a bug in the filter shows one user another's mail.",
          },
          {
            label: "Scan the user's messages at query time",
            why: `A ${MAILBOX_YEARS}-year mailbox has ${num(bigMailbox)} messages and about ${storageText(bigMailboxBodies)} of bodies to read for every search, far past a 1-second target.`,
          },
          {
            label: 'Rebuild every index in a nightly batch',
            why: 'Mail that arrived today cannot be found until tomorrow, which is exactly when people search for it.',
          },
        ],
      },
      points: [
        `Size: about ${indexKb} KB of index a message, ${storageText(indexYearUser)} a mailbox a year and ${storageText(indexYearUser * MAILBOX_YEARS)} after ${MAILBOX_YEARS} years: small enough to load on demand, so active users' indexes stay hot and the rest wait on disk.`,
        "Index on write: delivery emits a change event; indexers apply each user's events in order as small segments that merge in the background, as Lucene does. Text from PDF and Office attachments is extracted later, in a slower queue.",
        '"I just received it, why can\'t I find it?": the index records the highest modification sequence it includes, and a query also scans the few messages above that mark straight from metadata, so search agrees with the mailbox even while the indexer lags.',
        'Operators map to metadata: from:, to:, label:, has:attachment, is:unread and dates filter on fields; results sort newest first, with a little relevance for exact phrases and sender matches.',
        'Deletes and label changes reach the index too, and results are checked against current metadata, so a deleted message never shows up.',
      ],
    },
    {
      kind: 'deep-dive',
      title: 'Sync every device',
      prompt:
        'A user has a phone, a laptop and a desktop IMAP client, each last online at a different time. In between, mail arrived, was read on another device, labelled and deleted.',
      decision: {
        question: 'How does a device catch up with the mailbox?',
        options: [
          {
            label:
              'The mailbox keeps a change log ordered by a counter, a modification sequence. A device sends the last value it saw and gets every change since; a push tells it when there is something to fetch',
            best: true,
            why: "One request returns exactly what changed, however long the device was away, deletions included. This is what IMAP's CONDSTORE and QRESYNC extensions and JMAP's state strings provide.",
          },
          {
            label: 'Download the whole message list on every open and compare',
            why: 'A mailbox of 100,000 messages is megabytes of ids and flags per sync, every time, on a phone.',
          },
          {
            label: 'Poll the inbox for new messages every 10 seconds',
            why: 'It misses read flags, labels and deletes made elsewhere, and drains the battery with requests that mostly find nothing.',
          },
          {
            label: 'Push every change, message bodies included, to every device as it happens',
            why: 'A device that is offline misses the pushes, so it still needs a way to catch up, and pushing whole messages to devices that never open them wastes data.',
          },
        ],
      },
      points: [
        'The modification sequence is a per-mailbox counter, bumped in the same transaction as every change (a new message, a flag, a label, a move, a delete); each message stores the value of its last change, and the log keeps (counter, message id, kind).',
        'IMAP: CONDSTORE and QRESYNC (RFC 7162) give each message a MODSEQ and each mailbox a HIGHESTMODSEQ, so a client asks for changes since its value, and QRESYNC reports expunged messages as VANISHED. IDLE (RFC 2177) keeps a connection open to hear about new mail.',
        'JMAP (RFC 8620, with mail in RFC 8621): each data type has a state string; Email/changes returns the ids created, updated and destroyed since a state, and when the server can no longer work that out it answers cannotCalculateChanges and the client resyncs.',
        'Trim the log, keeping say 30 days of changes; a device away longer resyncs ids and flags in full and fetches bodies as they are opened.',
        'Push: phone apps cannot keep a connection open in the background, so the server sends a small notification through APNs or FCM (mailbox changed, perhaps with a sender and subject) and the app syncs.',
        'Conflicts: read on one device and marked unread on another resolve in the order the server applies them, last writer wins per flag; labels are added and removed one by one, so two devices labelling at once both take effect.',
      ],
    },
    {
      kind: 'deep-dive',
      title: 'Plan for failure',
      prompt:
        "A metadata shard's primary dies, a group of shards cannot take writes for two hours, and a bad deploy marks a slice of messages deleted. Start with incoming mail while part of the store is down.",
      decision: {
        question: `Mail for users on some shards cannot be delivered for ${STALL_HOURS} hours. What happens to new mail for them?`,
        options: [
          {
            label:
              'Keep accepting it into the replicated inbound queue, which holds the backlog until the shards are back; if the queue itself cannot write durably, answer 451 so senders keep the mail and retry',
            best: true,
            why: 'Accepting needs only the queue, not the mailbox store, so mail keeps flowing in safely; and when even the queue is down, a 4xx leaves the mail with senders who retry for days.',
          },
          {
            label: 'Answer 550 so senders stop sending until the store is back',
            why: 'A 5xx is permanent: every sender bounces the message to its user, and none of it is ever retried.',
          },
          {
            label: "Accept with 250 and hold the messages in the SMTP servers' memory",
            why: 'A restart or crash loses mail the senders have already deleted.',
          },
          {
            label: 'Remove our MX records until the store is back',
            why: 'Resolvers keep the old records until their TTL runs out, and a domain with no MX record is tried at its own address instead (RFC 5321 section 5.1), so mail goes to the wrong hosts or bounces.',
          },
        ],
      },
      points: [
        'Replication: a metadata shard confirms a write only once a replica in another zone has it, with more copies kept asynchronously; the inbound queue confirms only after writes in at least two zones; blobs are replicated or erasure coded across zones.',
        `Backlog: a ${STALL_HOURS}-hour stall of shards holding ${LAB_SHARE * 100}% of the users queues ${LAB_SHARE * 100}% × ${num(averageIn)} messages a second × ${num(STALL_HOURS * 3_600)} s ≈ ${num(stalled / 1e6)} million messages at the average rate. Workers that can run at twice the normal rate drain it in about as long as the stall lasted.`,
        'Senders retry for days: when we answer 4xx or cannot be reached at all, other providers keep the mail and retry (the model above), so an outage of hours delays mail without losing it. A 5xx sent by mistake, such as "no such user" because the user directory is down, bounces it for good.',
        "When an outage ends, every sender's queued mail arrives within its longest retry interval, on top of normal traffic: answer 421 to slow senders down rather than fall over.",
        'A replica is not a backup: a bug that deletes messages replicates the delete. Keep deleted messages for days (the trash, then a hidden hold), take point-in-time backups of metadata, and rehearse restores.',
        'Region failure: each user is homed in a region with copies in another; fail over the metadata, move MX and API traffic, and reconcile the last seconds of asynchronous changes afterwards.',
      ],
    },
    {
      kind: 'deep-dive',
      title: 'Protect mail in transit and at rest',
      prompt:
        'Mail crosses the internet between providers, sits in storage for years, and is a prime target: password resets, invoices, private conversations.',
      decision: {
        question: 'How do you stop an attacker on the network path from reading or changing mail between us and other providers?',
        options: [
          {
            label:
              'STARTTLS on every connection, plus an MTA-STS policy (and DANE where DNSSEC is deployed) so senders refuse to fall back to plain text or accept a forged certificate, with TLS reporting to show where it fails',
            best: true,
            why: 'STARTTLS alone is opportunistic. MTA-STS (RFC 8461) tells senders that TLS is required and which host names are valid, DANE (RFC 7672) pins certificates in DNSSEC-signed records, and TLS reporting (RFC 8460) sends back failures.',
          },
          {
            label: 'STARTTLS whenever the other side offers it',
            why: "An attacker in the middle deletes STARTTLS from the server's reply, and both sides carry on in plain text without noticing.",
          },
          {
            label: 'Require PGP or S/MIME for all mail',
            why: 'End-to-end encryption needs keys on both sides; almost no consumer correspondents have them, so most mail would be refused.',
          },
          {
            label: 'Encrypt mail at rest; the network path is not our problem',
            why: 'Encryption at rest protects disks, not the hops between providers.',
          },
        ],
      },
      points: [
        'At rest: disks and blobs encrypted with keys from a key management service, using envelope encryption with per-user or per-segment data keys, so every use of a key is audited and destroying a key makes its data unreadable.',
        'Encryption the provider can decrypt still lets it filter spam and build search indexes; end-to-end encryption would rule both out, which is why consumer mail providers rarely make it the default.',
        'Access: staff access to mail needs a reason and leaves an audit trail; services use their own identities with the least privilege they need.',
        'Accounts: two-factor sign-in, OAuth 2.0 for IMAP and SMTP clients instead of passwords, and alerts for new devices. A hijacked mailbox resets every other account its owner has.',
        'Abuse: limits at sign-up (phone checks, rate limits) slow the creation of spam accounts; per-account sending limits and outbound spam scoring stop hijacked ones; links and attachments are scanned for phishing and malware, and risky file types such as executables are blocked.',
      ],
    },
    {
      kind: 'wrap-up',
      title: 'Operate it',
      prompt: 'You have five minutes left. What do you watch, and what would page you?',
      points: [
        "Receiving: SMTP accept latency, refusals by reason, the inbound queue's depth and the age of its oldest message, and the time from our 250 to the message showing in the inbox (p99 within seconds).",
        'Sending: the outbound queue by destination domain, deferral and bounce rates, the domains failing most, and reputation (blocklist hits, complaint rates, postmaster dashboards).',
        'Spam: "not spam" and "report spam" clicks as the false positive and false negative rates; a jump in either pages someone.',
        'Storage: write errors, replica lag, background scrubbing that rereads blobs against their checksums and repairs bad copies, and quota growth.',
        'Search and sync: index lag in seconds and in modification sequences behind, sync latency, and the push delivery rate.',
        'Security: DMARC aggregate reports for our domains (who sends mail as us), TLS reporting failures and suspicious sign-ins.',
      ],
    },
  ],
  pitfalls: [
    'Answering 250 before the message is stored durably, or answering 5xx during an outage of our own.',
    'Accepting everything and bouncing later, so spam with forged senders turns into backscatter.',
    'Bodies and attachments in the metadata database, or one copy of an attachment per recipient.',
    'One global search index filtered by user instead of an index per user.',
    'Syncing devices by downloading the whole list instead of the changes since a modification sequence.',
    'Bouncing a 4xx at once or retrying it every few seconds; retrying a 5xx.',
    'STARTTLS without MTA-STS or DANE, so an attacker on the path can strip it.',
  ],
  followUps: [
    {
      question: 'How would you build undo send?',
      answer:
        'Hold the message in the outbound queue for a few seconds before its first attempt (Gmail lets users choose up to 30). Undo removes it from the queue and restores the draft; once another provider has accepted it, it cannot be recalled.',
    },
    {
      question: 'How would you add snooze and scheduled send?',
      answer:
        'Both are timers on a message: scheduled send is an outbound queue entry with a not-before time, and snooze removes the inbox label and adds it back at the chosen time, driven by a durable timer service like the one in the Job Scheduler case.',
    },
    {
      question: 'What changes for a business that brings its own domain?',
      answer:
        "The business points its domain's MX records at us; we verify that it owns the domain, sign its mail with DKIM keys published in its DNS, have it include our servers in its SPF record, and apply its policies (retention, legal hold, where data lives) to every mailbox under that domain.",
    },
  ],
};
