import { durationText, smtpRetry } from '../sysdesign/cases/email/smtp-retry.js';
import { mailStorage, storageText, type MailStorageSettings } from '../sysdesign/cases/email/storage.js';
import { num } from '../sysdesign/cases/widget-checkpoint.js';
import { concept, item, type DesignItemDefinition } from './design-item-kit.js';
import { pick, withChoices } from './random.js';
import type { DesignItemId } from './summaries.js';

/** The first `count` labels that differ from the correct one and from each other. */
const others = (correct: string, labels: string[], count = 3) =>
  labels.filter((l, i) => l !== correct && labels.indexOf(l) === i).slice(0, count);

const acceptAfterWrite = concept(
  'An inbound mail server has received a whole message over SMTP. When may it answer 250 OK?',
  'Once the message is stored durably in more than one place',
  [
    'As soon as the last byte has arrived',
    'Once the message is filed in the inbox and indexed for search',
    'Once the spam filter has scored it, stored or not',
  ],
  'The sending server deletes its copy when it sees 250, so from then on the receiver holds the only one: it must be durable first, for example in a queue replicated across two zones. Filing and indexing follow from that copy; tying them to the SMTP reply only holds connections open and invites duplicate retries.',
);

const temporaryFailure = concept(
  'Your inbound mail servers cannot reach the user directory for an hour, so they cannot tell whether a recipient exists. What should they answer to RCPT TO?',
  '451: a temporary failure, so the sender keeps the message and retries',
  ['550 5.1.1: no such user', '250 OK, and sort it out once the directory is back', '554: transaction failed, so the sender stops trying'],
  'A 4xx reply is transient: the sending server queues the message and retries, typically for days. A 5xx is permanent and bounces the message to its sender for good, and 250 takes responsibility for mail that may be for a user who does not exist, which then needs a bounce later.',
);

const retryDelivery = item('When a retried message is delivered after an outage', (rand) => {
  const outageMin = pick(rand, [60, 120, 180, 360, 720, 1_440]);
  const firstRetryMin = pick(rand, [1, 5, 10, 15]);
  const longestMin = pick(rand, [30, 60, 120, 240]);
  const s = { outageMin, firstRetryMin, longestMin, lifetimeMin: 7_200, reply: 'temporary' } as const;
  const run = smtpRetry(s);
  const fixed = Math.ceil(outageMin / firstRetryMin) * firstRetryMin;
  const uncapped = smtpRetry({ ...s, longestMin: Number.MAX_SAFE_INTEGER }).atMin;
  const right = durationText(run.atMin);
  const wrong = [outageMin, outageMin + longestMin, uncapped, fixed, run.atMin + longestMin, run.atMin * 2].map(durationText);
  return {
    prompt: `A remote mail server answers 451 for ${durationText(outageMin)}. Your server retries first after ${durationText(firstRetryMin)} and doubles the wait each time, up to ${durationText(longestMin)}. How long after it was sent is a message sent as the outage began delivered?`,
    ...withChoices(rand, right, others(right, wrong)),
    explain: `The attempts come at ${run.attempts.slice(0, 7).map(durationText).join(', ')}${run.attempts.length > 7 ? ' and so on' : ''}. With nothing telling the queue the server is back (Postfix's default), the message waits for the first attempt at or after ${durationText(outageMin)}: attempt ${run.attempts.length}, at ${right}, ${run.afterRecoveryMin ? `${durationText(run.afterRecoveryMin)} after recovery` : 'just as the server is back'}. Without the ${durationText(longestMin)} cap the waits would keep doubling and it would arrive at ${durationText(uncapped)}.`,
  };
});

const storageYear = item('A year of new mail before savings', (rand) => {
  const s: MailStorageSettings = {
    usersM: pick(rand, [100, 200, 500, 1_000]),
    perDay: pick(rand, [20, 40, 80]),
    attachmentPct: pick(rand, [5, 10, 20]),
    attachmentKb: pick(rand, [200, 500, 1_000]),
    dedupPct: 0,
    replication: 3,
  };
  const run = mailStorage(s);
  const average = run.rawBytes / run.messages / 1000;
  const right = storageText(run.rawBytes);
  return {
    prompt: `${num(s.usersM)} million mailboxes each receive ${s.perDay} messages a day. A message has 1 KB of metadata and 20 KB of headers and body, and ${s.attachmentPct}% also carry ${num(s.attachmentKb)} KB of attachments. How much new mail arrives in a year, one copy, before compression and dedup?`,
    ...withChoices(
      rand,
      right,
      others(right, [run.rawBytes / 365, run.rawBytes * 3, run.rawBytes * 1000, run.raw.bodies].map(storageText)),
    ),
    explain: `1 KB + 20 KB + ${s.attachmentPct}% × ${num(s.attachmentKb)} KB = ${num(average)} KB a message on average. ${num(s.usersM)} million × ${s.perDay} messages × 365 days = ${num(run.messages / 1e9)} billion messages × ${num(average)} KB = ${right}. Three copies would triple it; compressing bodies and storing repeated attachments once shrink it.`,
  };
});

const attachmentDedup = item('Savings from storing each attachment once', (rand) => {
  const s: MailStorageSettings = {
    usersM: pick(rand, [100, 500, 1_000]),
    perDay: 40,
    attachmentPct: pick(rand, [10, 20]),
    attachmentKb: pick(rand, [200, 500, 1_000]),
    dedupPct: pick(rand, [20, 30, 40]),
    replication: 3,
  };
  const run = mailStorage(s);
  const right = storageText(run.dedupSaved);
  return {
    prompt: `${num(s.usersM)} million mailboxes each receive 40 messages a day; ${s.attachmentPct}% carry ${num(s.attachmentKb)} KB of attachments, and ${s.dedupPct}% of those bytes are files already stored. How much does keying attachments by a hash of their bytes save in a year, one copy?`,
    ...withChoices(
      rand,
      right,
      others(right, [(run.rawBytes * s.dedupPct) / 100, run.raw.attachments, run.dedupSaved * 3, run.compressionSaved].map(storageText)),
    ),
    explain: `Attachments are ${num(run.messages / 1e9)} billion messages × ${s.attachmentPct}% × ${num(s.attachmentKb)} KB = ${storageText(run.raw.attachments)} a year, and the ${s.dedupPct}% that repeats is stored once: ${right} saved. Dedup applies to attachments, not to bodies, which differ per recipient and are compressed instead.`,
  };
});

const perUserIndex = concept(
  'A mail service indexes every message for search. Why build one inverted index per user rather than one global index?',
  "A query reads only the user's own postings, small enough to load on demand, and no one else's mail is on the path",
  [
    'A global index cannot be split across machines',
    'Per-user indexes need no update when new mail arrives',
    'Per-user indexes rank common words better',
  ],
  "Every search is over one mailbox. In a global index the postings for a word like invoice span every user's mail, so each query reads and discards almost all of it, and a filter bug leaks mail between users. A per-user index is about 1 KB a message, lives with the user's shard, is updated as mail arrives and is deleted with the mailbox.",
);

const syncChanges = concept(
  'A phone was offline for a day while, on another device, mail was read, labelled and deleted. How does the phone catch up?',
  'It sends the last modification sequence it saw and gets every change since, deletions included',
  [
    'It downloads the whole message list and compares',
    'It waits for push notifications of the changes it missed',
    'It asks for the messages newer than the newest one it holds',
  ],
  'Each mailbox keeps a change log ordered by a counter that every change bumps. Asking for the changes since a value (IMAP CONDSTORE and QRESYNC, JMAP /changes) returns flags, labels and deletions in one request. Asking only for newer messages misses changes to old ones, pushes sent while offline are lost, and a full list costs megabytes on every sync.',
);

const mtaSts = concept(
  'Two mail servers use STARTTLS whenever the other side offers it. What can an attacker on the network path between them still do?',
  'Strip the STARTTLS offer, so both sides carry on in plain text without noticing',
  [
    'Nothing: a server that offers STARTTLS always gets an encrypted connection',
    'Only read mail once it is stored on the receiving server',
    'Only slow the connection down, never read it',
  ],
  'STARTTLS is opportunistic: the offer travels in plain text, so an attacker can remove it, or present a forged certificate, and the sender carries on. An MTA-STS policy (RFC 8461) or DANE (RFC 7672) tells senders that TLS with a valid certificate is required, and TLS reporting (RFC 8460) shows where it fails.',
);

export const EMAIL_ITEMS = {
  'accept-after-write': acceptAfterWrite,
  'smtp-temporary-failure': temporaryFailure,
  'smtp-retry-delivery': retryDelivery,
  'mail-storage-year': storageYear,
  'attachment-dedup': attachmentDedup,
  'per-user-index': perUserIndex,
  'mail-sync-changes': syncChanges,
  'mta-sts': mtaSts,
} satisfies Partial<Record<DesignItemId, DesignItemDefinition>>;
