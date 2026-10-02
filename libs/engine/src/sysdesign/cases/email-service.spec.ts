import { describe, expect, it } from 'vitest';
import { EMAIL_SERVICE } from './email-service.js';
import { smtpRetry } from './email/smtp-retry.js';
import { mailStorage, storageText } from './email/storage.js';
import { CASE_LABS } from './labs.js';

const estimates = EMAIL_SERVICE.stages.flatMap((s) => (s.estimate ? [s.estimate] : []));
const text = JSON.stringify(EMAIL_SERVICE);

describe('email service case', () => {
  it('works its estimates out from the stated assumptions', () => {
    expect(estimates.map((e) => e.answer)).toEqual([462_963, 518]);
    expect(estimates[0].working).toEqual([
      '500 million × 40 = 20 billion messages a day.',
      '20 billion / 86,400 s ≈ 231,481 a second on average.',
      '× 2 at peak ≈ 462,963 a second.',
    ]);
    expect(estimates[1].working).toEqual([
      '1 KB + 20 KB + 10% × 500 KB = 71 KB a message on average.',
      '20 billion messages a day × 71 KB = 1.42 PB a day.',
      '× 365 ≈ 518 PB a year.',
    ]);
    expect(text).toContain('2.5 billion messages a day, about 28,935 a second and 57,870 at peak');
    expect(text).toContain('about 263 Gbit/s at peak');
    expect(text).toContain('at peak 231,481 list loads, 115,741 opens and 23,148 searches a second');
  });

  it('quotes the storage model at the stated sizes, the same numbers the widget starts from', () => {
    const run = mailStorage({ usersM: 500, perDay: 40, attachmentPct: 10, attachmentKb: 500, dedupPct: 30, replication: 3 });
    expect(text).toContain(
      `metadata ${storageText(run.raw.metadata)}, bodies ${storageText(run.raw.bodies)} and attachments ${storageText(run.raw.attachments)} a year`,
    );
    expect(text).toContain('but are 70% of the bytes; metadata is 1.4% of the bytes');
    expect(text).toContain(`assume 30%, ${storageText(run.dedupSaved)}. Kept once, a year is about ${storageText(run.storedBytes)}`);
    expect(text).toContain(`three copies make ${storageText(run.diskBytes)} a year`);
    expect(text).toContain('stores 1.5 times the bytes, 467 PB');
    expect(text).toContain(
      'Per mailbox: about 1.04 GB of mail a year as received, so a 15 GB free quota lasts about 14 years; quota is charged at message size, before the savings, which only lower our cost.',
    );
    expect(text).not.toContain('623 MB');
    expect(text).toContain('so about 1 KB a message: 20 TB a day, 7.3 PB a year, 14.6 MB a mailbox a year');
    expect(text).toContain('14.6 MB a mailbox a year and 146 MB after 10 years');
    expect(text).toContain('A 10-year mailbox has 146,000 messages and about 2.92 GB of bodies');
  });

  it('quotes the retry model for one example outage', () => {
    const six = smtpRetry({ outageMin: 360, firstRetryMin: 5, longestMin: 60, lifetimeMin: 7_200, reply: 'temporary' });
    expect(six).toMatchObject({ atMin: 375, queued: 7_200, drainMin: 60 });
    expect(text).toContain(
      `delivered on attempt ${six.attempts.length}, at 6 h 15 min; the domain's queue holds 7,200 messages when the server comes back and is empty within 1 h`,
    );
    expect(text).toContain('An outage of 6 days bounces it after 5 d 15 min');
    expect(text).toContain('for example 5 minutes doubling up to an hour, for about 5 days');
  });

  it('sizes the Design Lab build to the shard group it describes', () => {
    const { workload } = CASE_LABS['email-service'];
    expect(text).toContain('4,630 incoming and 579 outgoing messages a second and 1,157 flag and label changes, 6,366 writes');
    expect(text).toContain('2,315 list loads, 1,157 opens and 231 searches, 3,703 reads');
    expect(text).toContain(`about ${workload.rps.toLocaleString('en-US')} requests a second, ${workload.readRatio * 100}% reads`);
  });

  it('runs the retry and storage models after the stage asks the learner to commit', () => {
    const widgets = EMAIL_SERVICE.stages.filter((s) => s.widget);
    expect(widgets.map((s) => s.widget)).toEqual(['smtp-retry', 'mail-storage']);
    for (const s of widgets) expect(Boolean(s.decision), s.title).toBe(true);
  });

  it('scopes the case to a consumer mailbox provider, not a marketing sender', () => {
    expect(EMAIL_SERVICE.stages[0].prompt).toContain('A large consumer mailbox provider at Gmail or Outlook scale');
    expect(EMAIL_SERVICE.stages[0].prompt).toContain('This is not a marketing email sender');
  });

  it('covers early recovery, full mailboxes, feedback loops and moving a mailbox', () => {
    expect(text).toContain(
      "A large sender should not wait out each message's backoff: when one delivery or a probe to a deferred domain succeeds, it releases that domain's queue at a controlled rate, which turns the tail of up to the longest wait into minutes.",
    );
    expect(text).not.toContain('Nothing tells our queue');
    expect(text).toContain('A full mailbox: answer RCPT TO with 452 4.2.2 (temporary, so the sender retries while the user cleans up)');
    expect(text).toContain('after a grace period, 552 5.2.2');
    expect(text).toContain('feedback-loop reports (ARF, RFC 5965)');
    expect(text).toContain('one-click unsubscribe (RFC 8058)');
    expect(text).toContain("Gmail and Yahoo's 2024 sender rules");
    expect(text).toContain('0.3%');
    expect(text).toContain('Moving a mailbox: copy its metadata in the background, then replay the change log');
    expect(text).toContain('dedupe by Message-ID');
  });

  it('names protocol facts exactly', () => {
    for (const fact of [
      'RFC 5321 (section 4.5.4.1) suggests at least 30 minutes between retries',
      'give-up time of at least 4 to 5 days',
      'SPF (RFC 7208)',
      'DKIM (RFC 6376)',
      'DMARC (RFC 7489)',
      'ARC (RFC 8617)',
      'delivery status notification (RFC 3464)',
      'Enhanced status codes (RFC 3463)',
      '4.2.2 for a full mailbox or 5.1.1 for no such user',
      'RFC 5322 section 3.6.4',
      'IMAP4rev2 is RFC 9051',
      'IMAP4rev1, RFC 3501',
      'message submission (RFC 6409) on port 587',
      'port 465 with implicit TLS (RFC 8314)',
      'JMAP (RFC 8620, and RFC 8621 for mail)',
      'CONDSTORE and QRESYNC (RFC 7162)',
      'IDLE (RFC 2177)',
      'MTA-STS (RFC 8461)',
      'DANE (RFC 7672)',
      'TLS reporting (RFC 8460)',
      'SIZE extension (RFC 1870)',
      'waits between 300 and 4,000 seconds between attempts by default and gives up after 5 days',
    ])
      expect(text).toContain(fact);
    expect(text).not.toMatch(/RFC 821\b|RFC 2821|RFC 4408|RFC 4871/);
  });
});
