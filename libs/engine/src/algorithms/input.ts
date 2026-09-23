import { InputError, type InputKind } from './types.js';

const MAX_ARRAY = 24;
const MAX_TEXT = 24;
const MAX_GRID = 12;

export function asNumbers(value: unknown, key: string, { sorted = false } = {}): number[] {
  const arr = Array.isArray(value) ? value : typeof value === 'string' ? splitList(value) : null;
  if (!arr) throw new InputError(`${key} must be a list of numbers`);
  const nums = arr.map((v) => Number(v));
  if (nums.length === 0) throw new InputError(`${key} must not be empty`);
  if (nums.length > MAX_ARRAY) throw new InputError(`${key} can hold at most ${MAX_ARRAY} numbers`);
  if (nums.some((n) => !Number.isInteger(n) || Math.abs(n) > 999)) {
    throw new InputError(`${key} must contain integers between -999 and 999`);
  }
  return sorted ? [...nums].sort((a, b) => a - b) : nums;
}

export function asNumber(value: unknown, key: string): number {
  const n = Number(value);
  if (value === '' || value === null || !Number.isInteger(n) || Math.abs(n) > 9999) {
    throw new InputError(`${key} must be an integer`);
  }
  return n;
}

export function asText(value: unknown, key: string): string {
  if (typeof value !== 'string' || value.length === 0) throw new InputError(`${key} must be non-empty text`);
  if (value.length > MAX_TEXT) throw new InputError(`${key} can be at most ${MAX_TEXT} characters`);
  return value;
}

export function asGrid(value: unknown, key: string): string[] {
  const rows = Array.isArray(value) ? value.map(String) : typeof value === 'string' ? value.split(/[\n/]+/) : null;
  if (!rows) throw new InputError(`${key} must be rows of text`);
  const clean = rows.map((r) => r.trim()).filter(Boolean);
  if (clean.length === 0 || clean.length > MAX_GRID) throw new InputError(`${key} must have 1–${MAX_GRID} rows`);
  const width = clean[0].length;
  if (width > MAX_GRID || clean.some((r) => r.length !== width)) {
    throw new InputError(`${key} rows must all have the same width (max ${MAX_GRID})`);
  }
  if (clean.some((r) => /[^.#SG]/.test(r))) throw new InputError(`${key} may only contain . # S G`);
  const joined = clean.join('');
  if ((joined.match(/S/g) ?? []).length !== 1 || (joined.match(/G/g) ?? []).length !== 1) {
    throw new InputError(`${key} needs exactly one S and one G`);
  }
  return clean;
}

export function parseField(kind: InputKind, text: string): unknown {
  switch (kind) {
    case 'numbers':
    case 'sortedNumbers':
      return splitList(text).map(Number);
    case 'number':
      return Number(text);
    case 'text':
      return text;
    case 'grid':
      return text.split(/[\n/]+/).map((r) => r.trim()).filter(Boolean);
  }
}

export function formatField(kind: InputKind, value: unknown): string {
  switch (kind) {
    case 'numbers':
    case 'sortedNumbers':
      return (value as number[]).join(', ');
    case 'grid':
      return (value as string[]).join('\n');
    default:
      return String(value);
  }
}

function splitList(text: string): string[] {
  return text.split(/[\s,]+/).filter(Boolean);
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randInt(rand: () => number, min: number, max: number): number {
  return min + Math.floor(rand() * (max - min + 1));
}
