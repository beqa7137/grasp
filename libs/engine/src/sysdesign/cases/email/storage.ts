import { num, spacedChoices, type WidgetCheckpoint } from '../widget-checkpoint.js';

/** Stated assumptions of the storage model. Sizes in KB (1,000 bytes). */
export const MAIL_STORAGE = {
  /** The row the mailbox store keeps per message: ids, folder and labels, flags, thread, sender, subject, snippet, sizes. */
  metadataKb: 1,
  /** Headers plus the text and HTML parts. */
  bodyKb: 20,
  /** Text and HTML compress well; attachments (PDF, JPEG, Office files) are already compressed and are stored as they are. */
  bodyCompression: 3,
  /** The free storage a consumer account gets, shared with its other files. */
  quotaGb: 15,
} as const;

/** How every stored byte is kept durable: three full copies, or an erasure code such as 6 data and 3 parity pieces. */
export const REPLICATIONS = [3, 1.5] as const;
export type Replication = (typeof REPLICATIONS)[number];

export interface MailStorageSettings {
  /** Mailboxes, in millions. */
  usersM: number;
  /** Messages each mailbox receives a day. */
  perDay: number;
  /** Percent of messages that carry attachments. */
  attachmentPct: number;
  /** Total attachment size of such a message, decoded from base64. */
  attachmentKb: number;
  /** Percent of attachment bytes that are already stored, because the same file was sent before. */
  dedupPct: number;
  replication: Replication;
}

export const STORAGE_LIMITS = {
  usersM: { min: 50, max: 1_000, step: 50 },
  perDay: { min: 10, max: 200, step: 10 },
  attachmentPct: { min: 0, max: 50, step: 5 },
  attachmentKb: { min: 100, max: 3_000, step: 100 },
  dedupPct: { min: 0, max: 80, step: 5 },
} as const;

export type MailPart = 'metadata' | 'bodies' | 'attachments';
export const MAIL_PARTS: readonly MailPart[] = ['metadata', 'bodies', 'attachments'];

export interface MailStorageRun {
  messages: number;
  /** Bytes a year as they arrive, before compression and dedup. */
  raw: Record<MailPart, number>;
  /** Bytes a year as stored, one copy. */
  stored: Record<MailPart, number>;
  rawBytes: number;
  storedBytes: number;
  /** Stored bytes with every copy or parity piece. */
  diskBytes: number;
  compressionSaved: number;
  dedupSaved: number;
  perUserBytes: number;
  /** Years until one mailbox fills the free quota, charged at message size: the savings lower our cost, not the user's quota. */
  quotaYears: number;
}

const KB = 1_000;

/** One year of mail. */
export function mailStorage(s: MailStorageSettings): MailStorageRun {
  if (!(s.usersM > 0 && s.perDay > 0 && s.attachmentKb > 0 && s.attachmentPct >= 0 && s.dedupPct >= 0 && s.dedupPct < 100))
    throw new Error('Settings must be positive');
  const { metadataKb, bodyKb, bodyCompression, quotaGb } = MAIL_STORAGE;
  const users = s.usersM * 1e6;
  const messages = users * s.perDay * 365;
  const raw = {
    metadata: messages * metadataKb * KB,
    bodies: messages * bodyKb * KB,
    attachments: (messages * s.attachmentPct * s.attachmentKb * KB) / 100,
  };
  const stored = {
    metadata: raw.metadata,
    bodies: raw.bodies / bodyCompression,
    attachments: (raw.attachments * (100 - s.dedupPct)) / 100,
  };
  const sum = (r: Record<MailPart, number>) => r.metadata + r.bodies + r.attachments;
  const storedBytes = sum(stored);
  const perUserBytes = storedBytes / users;
  return {
    messages,
    raw,
    stored,
    rawBytes: sum(raw),
    storedBytes,
    diskBytes: storedBytes * s.replication,
    compressionSaved: raw.bodies - stored.bodies,
    dedupSaved: raw.attachments - stored.attachments,
    perUserBytes,
    quotaYears: (quotaGb * 1e9) / (sum(raw) / users),
  };
}

/** Bytes in the unit that keeps the number between 1 and 1,000: `519 PB`, `1.6 EB`. */
export function storageText(bytes: number): string {
  const units = ['bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB'];
  let i = 0;
  let v = bytes;
  while (v >= 1_000 && i < units.length - 1) {
    v /= 1_000;
    i++;
  }
  return `${v < 10 && i > 0 ? Number(v.toFixed(2)) : v < 100 && i > 0 ? Number(v.toFixed(1)) : num(v)} ${units[i]}`;
}

export const PART_TEXT: Record<MailPart, string> = {
  metadata: 'Message metadata',
  bodies: 'Message bodies',
  attachments: 'Attachments',
};

export const replicationText = (r: Replication) => (r === 3 ? 'three copies' : 'an erasure code storing 1.5 times the bytes');

const describe = (s: MailStorageSettings) =>
  `${num(s.usersM)} million mailboxes each receive ${num(s.perDay)} messages a day; ${num(s.attachmentPct)}% carry ${num(s.attachmentKb)} KB of attachments, ${num(s.dedupPct)}% of those bytes are files already stored, and the store keeps ${replicationText(s.replication)}`;

type StorageQuestion = 'largest' | 'disk' | 'dedup';

/** Picked from the settings so it varies as the learner moves them. */
function questionFor(s: MailStorageSettings): StorageQuestion {
  const { usersM, perDay, attachmentPct, attachmentKb, dedupPct } = STORAGE_LIMITS;
  const pick =
    s.usersM / usersM.step +
    s.perDay / perDay.step +
    s.attachmentPct / attachmentPct.step +
    s.attachmentKb / attachmentKb.step +
    s.dedupPct / dedupPct.step;
  return (['largest', 'disk', 'dedup'] as const)[Math.round(pick) % 3];
}

const perMessage = (bytes: number, messages: number) => `${Number((bytes / messages / KB).toFixed(2))} KB`;

/**
 * A prediction about the current settings, read from the run: which part of the mail takes the most storage, how much a
 * year takes on disk with its copies, or how much deduplicating attachments saves. Distractors are what the same question
 * gives when a saving or the copies are forgotten, or under neighboring settings.
 */
export function mailStorageCheckpoint(s: MailStorageSettings, run = mailStorage(s)): WidgetCheckpoint {
  const situation = describe(s);
  const question = questionFor(s);
  const { metadataKb, bodyKb, bodyCompression } = MAIL_STORAGE;
  if (question === 'largest') {
    const largest = MAIL_PARTS.reduce((a, b) => (run.stored[b] > run.stored[a] ? b : a));
    const share = (p: MailPart) => `${PART_TEXT[p].toLowerCase()} ${perMessage(run.stored[p], run.messages)}`;
    return {
      prompt: `Predict: ${situation}. Which part of a year of mail takes the most storage after compression and dedup?`,
      choices: MAIL_PARTS.map((p) => PART_TEXT[p]),
      answer: MAIL_PARTS.indexOf(largest),
      explain: `Per message, on average: metadata ${metadataKb} KB; bodies ${bodyKb} KB compressed ${bodyCompression} to 1; attachments ${num(s.attachmentPct)}% × ${num(s.attachmentKb)} KB less the ${num(s.dedupPct)}% already stored. Stored, that is ${MAIL_PARTS.map(share).join(', ')}, so ${PART_TEXT[largest].toLowerCase()} take the most. Metadata is the smallest part but the one every list, sync and search reads, which is why it lives in its own store.`,
    };
  }
  const other = REPLICATIONS.find((r) => r !== s.replication)!;
  if (question === 'disk') {
    return {
      prompt: `Predict: ${situation}. How much disk does a year of mail take, copies included?`,
      ...spacedChoices(
        run.diskBytes,
        [run.storedBytes, run.rawBytes * s.replication, run.storedBytes * other, run.rawBytes, run.diskBytes * 10],
        storageText,
        1,
      ),
      explain: `${num(run.messages / 1e9)} billion messages a year. As they arrive they are ${storageText(run.rawBytes)}; compressing bodies saves ${storageText(run.compressionSaved)} and dedup saves ${storageText(run.dedupSaved)} of attachments, leaving ${storageText(run.storedBytes)}. Keeping ${replicationText(s.replication)} makes it ${s.replication} × ${storageText(run.storedBytes)} = ${storageText(run.diskBytes)}.`,
    };
  }
  return {
    prompt: `Predict: ${situation}. How much does deduplicating attachments save in a year, one copy?`,
    ...spacedChoices(
      run.dedupSaved,
      [(run.rawBytes * s.dedupPct) / 100, run.dedupSaved * s.replication, run.compressionSaved, run.raw.attachments, run.storedBytes],
      storageText,
      1,
    ),
    explain:
      run.dedupSaved === 0
        ? `No attachment bytes repeat (${s.attachmentPct === 0 ? 'no message carries one' : 'the dedup rate is 0%'}), so dedup saves nothing; compressing bodies still saves ${storageText(run.compressionSaved)}.`
        : `Dedup applies to attachments only: ${num(run.messages / 1e9)} billion messages × ${num(s.attachmentPct)}% × ${num(s.attachmentKb)} KB = ${storageText(run.raw.attachments)} of attachments, and ${num(s.dedupPct)}% of that, ${storageText(run.dedupSaved)}, is stored once instead of again. Bodies are mostly personal (a name, an unsubscribe link), so they are compressed rather than deduplicated.`,
  };
}
