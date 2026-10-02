import { describe, expect, it } from 'vitest';
import { durationText, smtpRetry } from '../sysdesign/cases/email/smtp-retry.js';
import { mailStorage, storageText } from '../sysdesign/cases/email/storage.js';
import { generateQuestion, getReviewItem } from './items.js';

const SEEDS = Array.from({ length: 40 }, (_, i) => i * 7_919 + 3);
const IDS = [
  'accept-after-write',
  'smtp-temporary-failure',
  'smtp-retry-delivery',
  'mail-storage-year',
  'attachment-dedup',
  'per-user-index',
  'mail-sync-changes',
  'mta-sts',
];
const right = (id: string, seed: number) => {
  const q = generateQuestion(`sd:${id}`, seed);
  return { q, answer: q.choices[q.answer] };
};
const numbers = (text: string) => [...text.matchAll(/(\d[\d,]*(?:\.\d+)?)/g)].map((m) => Number(m[1].replaceAll(',', '')));
/** Minutes from a duration as the items write it: `6 h`, `5 min`, `1 d`. */
const minutes = (text: string) => {
  const [, v, unit] = text.match(/(\d+) (min|h|d)\b/)!;
  return Number(v) * { min: 1, h: 60, d: 1_440 }[unit as 'min' | 'h' | 'd'];
};

describe('email service review items', () => {
  it('reviews the case under its topics', () => {
    expect(IDS.map((id) => getReviewItem(`sd:${id}`)?.topic)).toEqual([
      'sd-durability',
      'sd-reliability',
      'sd-queues',
      'sd-estimation',
      'sd-storage',
      'sd-search',
      'sd-consistency',
      'sd-security',
    ]);
  });

  it('offers four distinct choices with one right answer on every seed', () => {
    for (const id of IDS)
      for (const seed of SEEDS) {
        const { q } = right(id, seed);
        expect(new Set(q.choices).size, `${id} ${seed}`).toBe(4);
        expect(q.answer).toBeGreaterThanOrEqual(0);
      }
  });

  it('works the numbers out from the models', () => {
    for (const seed of SEEDS) {
      const retry = right('smtp-retry-delivery', seed);
      const [outage, first, longest] = retry.q.prompt
        .match(/answers 451 for (.+?)\. Your server retries first after (.+?) and doubles the wait each time, up to (.+?)\./)!
        .slice(1)
        .map(minutes);
      const run = smtpRetry({ outageMin: outage, firstRetryMin: first, longestMin: longest, lifetimeMin: 7_200, reply: 'temporary' });
      expect(retry.answer, retry.q.prompt).toBe(durationText(run.atMin));

      const year = right('mail-storage-year', seed);
      const [usersM, perDay, , , attachmentPct, attachmentKb] = numbers(year.q.prompt);
      const raw = mailStorage({ usersM, perDay, attachmentPct, attachmentKb, dedupPct: 0, replication: 3 }).rawBytes;
      expect(year.answer, year.q.prompt).toBe(storageText(raw));

      const dedup = right('attachment-dedup', seed);
      const [users, , pct, kb, rate] = numbers(dedup.q.prompt);
      const saved = mailStorage({
        usersM: users,
        perDay: 40,
        attachmentPct: pct,
        attachmentKb: kb,
        dedupPct: rate,
        replication: 3,
      }).dedupSaved;
      expect(dedup.answer, dedup.q.prompt).toBe(storageText(saved));
    }
  });

  it('asks varied numeric questions', () => {
    for (const id of ['smtp-retry-delivery', 'mail-storage-year', 'attachment-dedup'])
      expect(new Set(SEEDS.map((s) => generateQuestion(`sd:${id}`, s).prompt)).size, id).toBeGreaterThanOrEqual(5);
  });
});
