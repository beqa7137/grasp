import { describe, expect, it } from 'vitest';
import {
  MAIL_PARTS,
  PART_TEXT,
  REPLICATIONS,
  STORAGE_LIMITS,
  mailStorage,
  mailStorageCheckpoint,
  storageText,
  type MailStorageSettings,
} from './storage.js';

const steps = ({ min, max, step }: { min: number; max: number; step: number }) =>
  Array.from({ length: Math.round((max - min) / step) + 1 }, (_, i) => min + i * step);

/** Every attachment share, dedup rate and copy scheme, over a spread of the other sliders. */
function* sweep(): Generator<MailStorageSettings> {
  for (const usersM of [50, 500, 1_000])
    for (const perDay of [10, 40, 200])
      for (const attachmentPct of steps(STORAGE_LIMITS.attachmentPct))
        for (const attachmentKb of [100, 500, 1_500, 3_000])
          for (const dedupPct of steps(STORAGE_LIMITS.dedupPct))
            for (const replication of REPLICATIONS) yield { usersM, perDay, attachmentPct, attachmentKb, dedupPct, replication };
}

/** Equal to within float rounding, relative to the size. */
const near = (a: number, b: number) => Math.abs(a - b) <= 1e-9 * Math.max(Math.abs(a), Math.abs(b), 1);

const base: MailStorageSettings = { usersM: 500, perDay: 40, attachmentPct: 10, attachmentKb: 500, dedupPct: 30, replication: 3 };

describe('the storage model', () => {
  it('works a year out from the stated sizes', () => {
    const run = mailStorage(base);
    expect(run.messages).toBe(7.3e12);
    expect(run.raw.metadata).toBe(7.3e15);
    expect(run.raw.bodies).toBe(146e15);
    expect(run.raw.attachments).toBe(365e15);
    expect(run.rawBytes).toBeCloseTo(518.3e15, -12);
    expect(run.stored.bodies).toBeCloseTo(146e15 / 3, -3);
    expect(run.stored.attachments).toBeCloseTo(255.5e15, -3);
    expect(run.compressionSaved).toBeCloseTo((146e15 * 2) / 3, -3);
    expect(run.dedupSaved).toBeCloseTo(109.5e15, -3);
    expect(storageText(run.rawBytes)).toBe('518 PB');
    expect(storageText(run.storedBytes)).toBe('311 PB');
    expect(storageText(run.diskBytes)).toBe('934 PB');
    expect(storageText(run.perUserBytes)).toBe('623 MB');
    expect(Math.floor(run.quotaYears)).toBe(24);
  });

  it('keeps the parts, savings and copies consistent on every setting', () => {
    for (const s of sweep()) {
      const run = mailStorage(s);
      const at = JSON.stringify(s);
      const sum = (r: Record<string, number>) => Object.values(r).reduce((a, b) => a + b, 0);
      expect(near(run.rawBytes, sum(run.raw)), at).toBe(true);
      expect(near(run.storedBytes, sum(run.stored)), at).toBe(true);
      expect(near(run.rawBytes - run.storedBytes, run.compressionSaved + run.dedupSaved), at).toBe(true);
      expect(near(run.diskBytes, run.storedBytes * s.replication), at).toBe(true);
      expect(near(run.perUserBytes * s.usersM * 1e6, run.storedBytes), at).toBe(true);
      expect(run.stored.metadata).toBe(run.raw.metadata);
      expect(near(run.dedupSaved, (run.raw.attachments * s.dedupPct) / 100), at).toBe(true);
      // Bodies alone, compressed, outweigh the metadata, so metadata is never the largest part.
      expect(run.stored.bodies).toBeGreaterThan(run.stored.metadata);
    }
  });

  it('grows in proportion to users and messages, and refuses impossible settings', () => {
    const one = mailStorage(base);
    expect(near(mailStorage({ ...base, usersM: 1_000 }).diskBytes, one.diskBytes * 2)).toBe(true);
    expect(near(mailStorage({ ...base, perDay: 80 }).storedBytes, one.storedBytes * 2)).toBe(true);
    expect(mailStorage({ ...base, attachmentPct: 0 }).dedupSaved).toBe(0);
    expect(() => mailStorage({ ...base, usersM: 0 })).toThrow();
    expect(() => mailStorage({ ...base, dedupPct: 100 })).toThrow();
  });

  it('writes sizes in the unit that keeps them short', () => {
    expect([0, 999, 1_500, 623e6, 7.3e15, 48.67e15, 1.55e18].map(storageText)).toEqual([
      '0 bytes',
      '999 bytes',
      '1.5 KB',
      '623 MB',
      '7.3 PB',
      '48.7 PB',
      '1.55 EB',
    ]);
  });
});

describe('the storage checkpoint', () => {
  it("has exactly one right answer, the model's, among at least three distinct choices, on every setting", () => {
    const asked = new Set<string>();
    for (const s of sweep()) {
      const at = JSON.stringify(s);
      const run = mailStorage(s);
      const c = mailStorageCheckpoint(s, run);
      const right = c.choices[c.answer];
      if (c.prompt.includes('takes the most storage')) {
        asked.add('largest');
        const largest = MAIL_PARTS.reduce((a, b) => (run.stored[b] > run.stored[a] ? b : a));
        expect(right, at).toBe(PART_TEXT[largest]);
      } else if (c.prompt.includes('How much disk')) {
        asked.add('disk');
        expect(right, at).toBe(storageText(run.diskBytes));
      } else {
        asked.add('dedup');
        expect(right, at).toBe(storageText(run.dedupSaved));
      }
      expect(c.choices.length, at).toBeGreaterThanOrEqual(3);
      expect(new Set(c.choices).size, at).toBe(c.choices.length);
    }
    expect([...asked].sort()).toEqual(['dedup', 'disk', 'largest']);
  });

  it('names bodies the largest part when no message carries an attachment', () => {
    const s = { ...base, attachmentPct: 0, dedupPct: 0 };
    const run = mailStorage(s);
    expect(MAIL_PARTS.reduce((a, b) => (run.stored[b] > run.stored[a] ? b : a))).toBe('bodies');
  });
});
