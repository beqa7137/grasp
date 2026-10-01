import { describe, expect, it } from 'vitest';
import { formatMinor, minorExponent } from './checkpoint.js';
import {
  RECON_ACTIONS,
  classify,
  contractFee,
  explainRow,
  reconTotals,
  reconcile,
  reconciliationDay,
  type LedgerRecord,
} from './reconcile.js';

const SEEDS = Array.from({ length: 300 }, (_, i) => i * 104_729 + 11);

describe('reconciliation', () => {
  it('makes two matches and three different breaks a day, each one an action the learner can pick', () => {
    const kinds = new Set(RECON_ACTIONS.map((a) => a.kind));
    for (const seed of SEEDS) {
      const rows = reconcile(reconciliationDay(seed));
      expect(rows).toHaveLength(5);
      expect(rows.filter((r) => r.kind === 'matched')).toHaveLength(2);
      const breaks = rows.filter((r) => r.kind !== 'matched').map((r) => r.kind);
      expect(new Set(breaks).size).toBe(3);
      for (const k of breaks) expect(kinds.has(k)).toBe(true);
    }
  });

  it('varies the breaks and their order with the seed, and repeats a seed exactly', () => {
    const plans = new Set(
      SEEDS.map((s) =>
        reconcile(reconciliationDay(s))
          .map((r) => r.kind)
          .join(),
      ),
    );
    expect(plans.size).toBeGreaterThan(30);
    expect(reconciliationDay(42)).toEqual(reconciliationDay(42));
  });

  it('explains the gap between the report and the ledger with the breaks, row by row', () => {
    for (const seed of SEEDS) {
      const day = reconciliationDay(seed);
      const rows = reconcile(day);
      const totals = reconTotals(day);
      expect(totals.reportGross - totals.ledgerCaptured).toBe(rows.reduce((sum, r) => sum + r.grossDifference, 0));
      for (const r of rows) {
        const amount = r.ledger!.amount;
        const expected = { matched: 0, fee: 0, timing: -amount, 'missed-capture': amount, duplicate: amount }[r.kind as 'fee'];
        expect(r.grossDifference, r.kind).toBe(expected);
      }
      const fee = rows.find((r) => r.kind === 'fee');
      expect(totals.feeDifference).toBe(fee ? fee.report[0].fee - contractFee(fee.report[0].gross) : 0);
      for (const r of rows) expect(explainRow(r, day.cutoff)).not.toContain('investigate');
    }
  });

  it('sends anything no rule explains to a person', () => {
    const captured: LedgerRecord = { order: 'ord_1', charge: 'ch_1', amount: 1_000, status: 'captured', time: '10:00' };
    const line = { order: 'ord_1', charge: 'ch_1', gross: 1_000, fee: contractFee(1_000) };
    expect(classify(captured, [line], '23:00')).toBe('matched');
    expect(classify(captured, [], '23:00')).toBe('investigate');
    expect(classify(captured, [{ ...line, gross: 900 }], '23:00')).toBe('investigate');
    expect(classify(captured, [{ ...line, charge: 'ch_2' }], '23:00')).toBe('investigate');
    expect(classify(captured, [line, line, line], '23:00')).toBe('investigate');
    expect(classify({ ...captured, status: 'unknown', charge: null }, [], '23:00')).toBe('investigate');
    expect(classify(null, [line], '23:00')).toBe('investigate');
    expect(explainRow({ order: 'ord_1', ledger: null, report: [line], kind: 'investigate', grossDifference: 1_000 }, '23:00')).toContain(
      'finance operations',
    );
  });

  it('charges the contract fee of 2.9% plus 30 cents, rounded to the cent', () => {
    expect(contractFee(10_000)).toBe(320);
    expect(contractFee(1_234)).toBe(66);
  });
});

describe('money in minor units', () => {
  it('formats whole minor units by the currency exponent without floating point', () => {
    expect(formatMinor(123_456, 'USD')).toBe('$1,234.56');
    expect(formatMinor(-5, 'USD')).toBe('-$0.05');
    expect(formatMinor(1_500, 'JPY')).toBe('¥1,500');
    expect(formatMinor(2_500, 'KWD')).toBe('2.500 KWD');
    expect(formatMinor(900_719_925_474_099, 'EUR')).toBe('€9,007,199,254,740.99');
    expect(minorExponent('BHD')).toBe(3);
  });

  it('refuses fractions of a minor unit and unknown currencies', () => {
    expect(() => formatMinor(1.5, 'USD')).toThrow();
    expect(() => formatMinor(100, 'XYZ')).toThrow();
  });
});
