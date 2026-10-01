import { mulberry32, randInt, shuffle } from '../../../algorithms/random.js';
import { formatMinor } from './checkpoint.js';

export type BreakKind = 'matched' | 'timing' | 'missed-capture' | 'fee' | 'duplicate' | 'investigate';

/** Our side: a capture we posted, or an attempt whose outcome we never learned (it timed out). Amounts in cents. */
export interface LedgerRecord {
  order: string;
  charge: string | null;
  amount: number;
  status: 'captured' | 'unknown';
  /** When we captured or attempted it, `HH:MM` in the report's time zone. */
  time: string;
}

/** The processor's settlement report: one line per charge it captured before the cut-off. */
export interface ReportLine {
  order: string;
  charge: string;
  gross: number;
  fee: number;
}

export interface ReconDay {
  cutoff: string;
  ledger: LedgerRecord[];
  report: ReportLine[];
}

export interface ReconRow {
  order: string;
  ledger: LedgerRecord | null;
  report: ReportLine[];
  kind: BreakKind;
  /** The report's gross for this order less what we recorded as captured. */
  grossDifference: number;
}

/** The answers a learner chooses from, one per kind the day's generator makes. */
export const RECON_ACTIONS: readonly { kind: BreakKind; label: string }[] = [
  { kind: 'matched', label: 'Nothing: it matches' },
  { kind: 'timing', label: 'Carry it to the next report' },
  { kind: 'missed-capture', label: 'Post the missed capture, then fulfil or refund' },
  { kind: 'fee', label: 'Book the actual fee and query the difference' },
  { kind: 'duplicate', label: 'Record and refund the second charge' },
];

/** The fee in this example's contract: 2.9% plus 30 cents, rounded to the cent. */
export const contractFee = (gross: number) => Math.round((gross * 29) / 1000) + 30;

export function classify(ledger: LedgerRecord | null, lines: readonly ReportLine[], cutoff: string): BreakKind {
  const captured = ledger?.status === 'captured';
  if (captured && !lines.length) return ledger.time >= cutoff ? 'timing' : 'investigate';
  if (ledger && !captured && lines.length === 1 && lines[0].gross === ledger.amount) return 'missed-capture';
  if (!captured || !lines.every((l) => l.gross === ledger.amount) || !lines.some((l) => l.charge === ledger.charge)) return 'investigate';
  if (lines.length === 2) return 'duplicate';
  if (lines.length !== 1) return 'investigate';
  return lines[0].fee === contractFee(lines[0].gross) ? 'matched' : 'fee';
}

/** Groups both sides by our order reference, which we pass to the processor with every charge. */
export function reconcile(day: ReconDay): ReconRow[] {
  const orders = [...new Set([...day.ledger.map((r) => r.order), ...day.report.map((l) => l.order)])];
  return orders.map((order) => {
    const ledger = day.ledger.find((r) => r.order === order) ?? null;
    const report = day.report.filter((l) => l.order === order);
    const recorded = ledger?.status === 'captured' ? ledger.amount : 0;
    return {
      order,
      ledger,
      report,
      kind: classify(ledger, report, day.cutoff),
      grossDifference: report.reduce((sum, l) => sum + l.gross, 0) - recorded,
    };
  });
}

export interface ReconTotals {
  ledgerCaptured: number;
  reportGross: number;
  /** Fees the processor took above (or below) the contract's. */
  feeDifference: number;
}

export function reconTotals(day: ReconDay): ReconTotals {
  return {
    ledgerCaptured: day.ledger.filter((r) => r.status === 'captured').reduce((sum, r) => sum + r.amount, 0),
    reportGross: day.report.reduce((sum, l) => sum + l.gross, 0),
    feeDifference: day.report.reduce((sum, l) => sum + l.fee - contractFee(l.gross), 0),
  };
}

const usd = (cents: number) => formatMinor(cents, 'USD');

export function explainRow(row: ReconRow, cutoff: string): string {
  const [first, second] = row.report;
  const amount = usd(row.ledger?.amount ?? first?.gross ?? 0);
  switch (row.kind) {
    case 'matched':
      return `Our capture of ${amount} matches ${first.charge}: same amount, and its ${usd(first.fee)} fee is the contract fee.`;
    case 'timing':
      return `We captured ${amount} at ${row.ledger!.time}, after the report's ${cutoff} cut-off, so it belongs in the next report. Carry it forward, and raise it only if it is missing there too.`;
    case 'missed-capture':
      return `Our attempt timed out and is still unknown, but the processor captured ${amount} as ${first.charge}. The customer paid: post the capture so the books hold the money, then fulfil the order or refund it.`;
    case 'fee': {
      const expected = contractFee(first.gross);
      return `The amount matches, but the processor took ${usd(first.fee)} against the contract's ${usd(expected)}, for example a surcharge for a card issued abroad. Book the fee actually charged (${usd(first.fee - expected)} more fee expense) and query it.`;
    }
    case 'duplicate':
      return `The processor charged this order twice, ${first.charge} and ${second.charge}, usually a retry sent without the original idempotency key. Record the second capture, refund it, and find the retry that caused it.`;
    default:
      return 'The two sides disagree in a way no rule explains: it goes to the finance operations queue for a person to investigate.';
  }
}

const BREAKS: readonly BreakKind[] = ['timing', 'missed-capture', 'fee', 'duplicate'];

/** Five orders from one day: two that match and three different breaks, in a seeded order. */
export function reconciliationDay(seed: number): ReconDay {
  const rand = mulberry32(seed);
  const kinds = shuffle(rand, ['matched', 'matched', ...shuffle(rand, BREAKS).slice(0, 3)] as BreakKind[]);
  const used = new Set<string>();
  const id = (prefix: string, length: number) => {
    let value: string;
    do value = prefix + Array.from({ length }, () => '0123456789abcdefghjkmnpqrstuvwxyz'[randInt(rand, 0, 31)]).join('');
    while (used.has(value));
    used.add(value);
    return value;
  };
  const time = (from: number, to: number) =>
    `${String(randInt(rand, from, to)).padStart(2, '0')}:${String(randInt(rand, 0, 59)).padStart(2, '0')}`;
  const day: ReconDay = { cutoff: '23:00', ledger: [], report: [] };
  for (const kind of kinds) {
    const order = id('ord_', 4);
    const charge = id('ch_', 6);
    const amount = randInt(rand, 5, 500) * 100 + randInt(rand, 0, 99);
    const at = kind === 'timing' ? `23:${String(randInt(rand, 5, 59)).padStart(2, '0')}` : time(8, 22);
    day.ledger.push({
      order,
      charge: kind === 'missed-capture' ? null : charge,
      amount,
      status: kind === 'missed-capture' ? 'unknown' : 'captured',
      time: at,
    });
    if (kind === 'timing') continue;
    const fee = contractFee(amount) + (kind === 'fee' ? Math.round((amount * 15) / 1000) : 0);
    day.report.push({ order, charge, gross: amount, fee });
    if (kind === 'duplicate') day.report.push({ order, charge: id('ch_', 6), gross: amount, fee: contractFee(amount) });
  }
  return day;
}
