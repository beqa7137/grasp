/** A question a case widget asks about its own settings, answered before the widget shows the result. */
export interface WidgetCheckpoint {
  prompt: string;
  choices: string[];
  answer: number;
  explain: string;
}

export const num = (v: number) => Math.round(v).toLocaleString('en-US');

const EXPONENTS: Readonly<Record<string, number>> = { USD: 2, EUR: 2, GBP: 2, JPY: 0, KRW: 0, KWD: 3, BHD: 3 };
const SYMBOLS: Readonly<Record<string, string>> = { USD: '$', EUR: '€', GBP: '£', JPY: '¥' };

/** The ISO 4217 minor unit exponent: 2 for cents, 0 for currencies without a minor unit, 3 for fils. */
export function minorExponent(currency: string): number {
  const exponent = EXPONENTS[currency];
  if (exponent === undefined) throw new Error(`Unknown currency ${currency}`);
  return exponent;
}

/** An integer amount of minor units as the major amount, without ever going through floating point division. */
export function formatMinor(minor: number, currency: string): string {
  if (!Number.isSafeInteger(minor)) throw new Error('Amounts are whole minor units');
  const exponent = minorExponent(currency);
  const digits = String(Math.abs(minor)).padStart(exponent + 1, '0');
  const whole = Number(digits.slice(0, digits.length - exponent)).toLocaleString('en-US');
  const amount = exponent ? `${whole}.${digits.slice(-exponent)}` : whole;
  const symbol = SYMBOLS[currency];
  return `${minor < 0 ? '-' : ''}${symbol ?? ''}${amount}${symbol ? '' : ` ${currency}`}`;
}
