export const SPEND_DAY_MS = 86_400_000;
export const SPEND_HISTORY_MS = 90 * SPEND_DAY_MS;
export const LEGACY_SPEND_KEY = 'ai-spend-usd';
export const MAX_SPEND_MICROS = BigInt(Number.MAX_SAFE_INTEGER);

export interface SpendReservation {
  id: string;
  day: string;
  amountMicros: number;
}

export abstract class SpendStore {
  abstract reserve(id: string, amountMicros: number, budgetMicros: number | null): Promise<SpendReservation | null>;
  abstract settle(id: string, actualMicros: number): Promise<void>;
  abstract spentToday(): Promise<number>;
  abstract sweep(): Promise<number>;
}

export function assertSpendMicros(value: number, positive = false): void {
  if (!Number.isSafeInteger(value) || value < (positive ? 1 : 0)) throw new RangeError('Invalid spend amount');
}

export function assertReservationId(id: string): void {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    throw new TypeError('Invalid spend reservation ID');
  }
}

export function legacySpendMicros(value: number): bigint {
  if (!Number.isFinite(value) || value < 0) throw new RangeError('Invalid legacy spend amount');
  const [coefficient, exponent = '0'] = value.toString().split('e');
  const [whole, fraction = ''] = coefficient.split('.');
  const digits = BigInt(whole + fraction);
  const places = Number(exponent) + 6 - fraction.length;
  const micros = places >= 0 ? digits * 10n ** BigInt(places) : (digits + 10n ** BigInt(-places) - 1n) / 10n ** BigInt(-places);
  if (micros > MAX_SPEND_MICROS) throw new RangeError('Spend total exceeds supported range');
  return micros;
}

export function safeSpendTotal(value: bigint): number {
  if (value < 0n || value > MAX_SPEND_MICROS) throw new RangeError('Spend total exceeds supported range');
  return Number(value);
}
