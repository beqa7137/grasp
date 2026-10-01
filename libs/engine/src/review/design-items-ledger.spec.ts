import { describe, expect, it } from 'vitest';
import { generateQuestion, getReviewItem } from './items.js';

const SEEDS = Array.from({ length: 40 }, (_, i) => i * 7_919 + 3);
const right = (id: string, seed: number) => {
  const q = generateQuestion(id, seed);
  return { q, answer: q.choices[q.answer] };
};

describe('payment ledger review items', () => {
  it('reviews the case under its topics', () => {
    expect(
      ['hot-account', 'retry-duplicates', 'minor-units', 'posting-cloze', 'ledger-invariant', 'cross-shard-transfer'].map(
        (id) => getReviewItem(`sd:${id}`)?.topic,
      ),
    ).toEqual(['sd-locks', 'sd-api-design', 'sd-api-design', 'sd-transactions', 'sd-transactions', 'sd-sharding']);
  });

  it('blanks one posting of a capture, and the posting that fits makes the entry sum to zero', () => {
    for (const seed of SEEDS) {
      const { q, answer } = right('sd:posting-cloze', seed);
      const lines = q.code!.lines.slice(1).map((l) => l.trim());
      expect(answer).toBe(q.code!.lines[q.code!.blank!].trim());
      expect(lines.reduce((sum, l) => sum + Number(l.split(' ')[0]), 0)).toBe(0);
      expect(new Set(q.choices).size).toBe(4);
    }
  });

  it('works out the committed rate, the duplicates and the minor units from the stated numbers', () => {
    for (const seed of SEEDS) {
      const hot = right('sd:hot-account', seed);
      const [offered, lockMs] = [...hot.q.prompt.matchAll(/([\d,]+) (?:postings a second|ms)/g)].map((m) =>
        Number(m[1].replaceAll(',', '')),
      );
      const rows = Number(/split into (\d+)/.exec(hot.q.prompt)?.[1] ?? 1);
      const batch = Number(/applies (\d+) postings/.exec(hot.q.prompt)?.[1] ?? 1);
      expect(hot.answer).toBe(`${Math.round(Math.min(offered, (rows * batch * 1000) / lockMs)).toLocaleString('en-US')} postings/s`);

      const dup = right('sd:retry-duplicates', seed);
      const [pct, retries, payments] = [...dup.q.prompt.matchAll(/([\d,]+)(?:%| times| payments)/g)].map((m) =>
        Number(m[1].replaceAll(',', '')),
      );
      const p = pct / 100;
      const expected = payments * Array.from({ length: retries }, (_, k) => p ** (k + 1)).reduce((a, b) => a + b, 0);
      expect(dup.answer).toBe(`about ${Math.round(expected).toLocaleString('en-US')}`);

      const money = right('sd:minor-units', seed);
      const [, major, currency] = /for ([\d.]+) ([A-Z]{3})\?/.exec(money.q.prompt)!;
      const exponent = { USD: 2, EUR: 2, JPY: 0, KWD: 3, BHD: 3 }[currency]!;
      expect(money.answer).toBe(`\`${Math.round(Number(major) * 10 ** exponent)}\``);
      expect(money.q.choices.length).toBeGreaterThanOrEqual(3);
    }
  });
});
