import { describe, expect, it } from 'vitest';
import { PAYMENT_LEDGER } from './payment-ledger.js';

const estimates = PAYMENT_LEDGER.stages.flatMap((s) => (s.estimate ? [s.estimate] : []));

describe('payment ledger case', () => {
  it('works its estimates out from the stated assumptions', () => {
    expect(estimates.map((e) => e.answer)).toEqual([18_519, 29.2, 17, 72_000_000]);
    expect(estimates[0].working.at(-1)).toContain('18,519');
    expect(estimates[2].working.at(-1)).toContain('16.5, so 17 sub-accounts');
  });

  it('runs a model in three stages, each after the stage asks the learner to commit', () => {
    const widgets = PAYMENT_LEDGER.stages.filter((s) => s.widget);
    expect(widgets.map((s) => s.widget)).toEqual(['retries', 'hot-account', 'reconcile']);
    for (const s of widgets) expect(Boolean(s.decision || s.estimate), s.title).toBe(true);
  });

  it('quotes the numbers its models give', () => {
    const text = JSON.stringify(PAYMENT_LEDGER);
    expect(text).toContain('about 50,050 duplicate charges a day');
    expect(text).toContain('one row takes 4,000 a second');
    expect(text).toContain('about 65,753 rows for this merchant');
  });
});
