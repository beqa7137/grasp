import { InputError, type InputKind } from './types.js';

const MAX_ARRAY = 24;
const MAX_TEXT = 24;
const MAX_GRID = 12;

export function asNumbers(value: unknown, key: string, { sorted = false, minValue = -999, maxValue = 999 } = {}): number[] {
  const arr = Array.isArray(value) ? value : typeof value === 'string' ? splitList(value) : null;
  if (!arr) throw new InputError(`${key} must be a list of numbers`);
  const nums = arr.map((v) => Number(v));
  if (nums.length === 0) throw new InputError(`${key} must not be empty`);
  if (nums.length > MAX_ARRAY) throw new InputError(`${key} can hold at most ${MAX_ARRAY} numbers`);
  if (nums.some((n) => !Number.isInteger(n) || n < minValue || n > maxValue)) {
    throw new InputError(`${key} must contain integers between ${minValue} and ${maxValue}`);
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

export type Edge = [number, number, number?];

const EDGE_PATTERNS: Record<'edges' | 'directedEdges' | 'weightedEdges', RegExp> = {
  edges: /^(\d+)\s*-\s*(\d+)$/,
  directedEdges: /^(\d+)\s*>\s*(\d+)$/,
  weightedEdges: /^(\d+)\s*-\s*(\d+)\s*:\s*(\d+)$/,
};
const EDGE_SEPARATOR: Record<keyof typeof EDGE_PATTERNS, string> = { edges: '-', directedEdges: '>', weightedEdges: '-' };

/** Edges as `0-1`, `0>1` or `0-1:4`, between node ids 0..nodes-1, without self-loops or duplicates. */
export function asEdges(
  value: unknown,
  key: string,
  kind: keyof typeof EDGE_PATTERNS,
  nodes: number,
  { max = 20, maxWeight = 99 } = {},
): Edge[] {
  const items = Array.isArray(value) ? value : null;
  if (!items) throw new InputError(`${key} must be a list of edges`);
  if (items.length > max) throw new InputError(`${key} can hold at most ${max} edges`);
  const seen = new Set<string>();
  return items.map((raw) => {
    const edge = Array.isArray(raw) ? raw.map(Number) : null;
    const weighted = kind === 'weightedEdges';
    if (!edge || edge.length !== (weighted ? 3 : 2) || edge.some((n) => !Number.isInteger(n))) {
      throw new InputError(`${key}: write edges like ${weighted ? '0-1:4' : `0${EDGE_SEPARATOR[kind]}1`}`);
    }
    const [a, b, w] = edge;
    if (a < 0 || b < 0 || a >= nodes || b >= nodes) throw new InputError(`${key}: nodes go from 0 to ${nodes - 1}`);
    if (a === b) throw new InputError(`${key}: an edge cannot connect a node to itself`);
    if (weighted && (w < 1 || w > maxWeight)) throw new InputError(`${key}: weights go from 1 to ${maxWeight}`);
    const id = kind === 'directedEdges' ? `${a}>${b}` : `${Math.min(a, b)}-${Math.max(a, b)}`;
    if (seen.has(id)) throw new InputError(`${key}: edge ${id} appears twice`);
    seen.add(id);
    return (weighted ? [a, b, w] : [a, b]) as Edge;
  });
}

export function asWords(value: unknown, key: string, { max = 7, maxLength = 8 } = {}): string[] {
  const words = Array.isArray(value) ? value.map((w) => String(w).trim().toLowerCase()).filter(Boolean) : null;
  if (!words || words.length === 0) throw new InputError(`${key} must list at least one word`);
  if (words.length > max) throw new InputError(`${key} can hold at most ${max} words`);
  if (words.some((w) => !/^[a-z]+$/.test(w) || w.length > maxLength))
    throw new InputError(`${key}: words use letters a–z, up to ${maxLength} long`);
  return words;
}

export function parseField(kind: InputKind, text: string): unknown {
  switch (kind) {
    case 'edges':
    case 'directedEdges':
    case 'weightedEdges':
      return splitEdges(text).map((item) => {
        const m = EDGE_PATTERNS[kind].exec(item);
        return m ? m.slice(1).map(Number) : [item];
      });
    case 'intervals':
      return parseField('edges', text);
    case 'words':
      return splitList(text);
    case 'numbers':
    case 'sortedNumbers':
      return splitList(text).map(Number);
    case 'number':
      return Number(text);
    case 'text':
      return text;
    case 'grid':
      return text
        .split(/[\n/]+/)
        .map((r) => r.trim())
        .filter(Boolean);
  }
}

export function formatField(kind: InputKind, value: unknown): string {
  switch (kind) {
    case 'edges':
    case 'directedEdges':
      return (value as Edge[]).map(([a, b]) => `${a}${EDGE_SEPARATOR[kind]}${b}`).join(', ');
    case 'weightedEdges':
      return (value as Edge[]).map(([a, b, w]) => `${a}-${b}:${w}`).join(', ');
    case 'intervals':
      return formatField('edges', value);
    case 'words':
      return (value as string[]).join(', ');
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

function splitEdges(text: string): string[] {
  return text
    .split(/[,;\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);
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

/** `count` different integers from `lo` to `hi` inclusive, in the order they were first drawn. */
export function distinctInts(rand: () => number, count: number, lo: number, hi: number): number[] {
  const values = new Set<number>();
  while (values.size < count) values.add(randInt(rand, lo, hi));
  return [...values];
}

/** The indices from `a` to `b` inclusive, or none when `b` < `a`. */
export function rangeOf(a: number, b: number): number[] {
  return Array.from({ length: Math.max(0, b - a + 1) }, (_, k) => a + k);
}

/** A shuffled copy of `items` (Fisher–Yates); `items` itself is left alone. */
export function shuffle<T>(rand: () => number, items: readonly T[]): T[] {
  const out = [...items];
  for (let k = out.length - 1; k > 0; k--) {
    const j = randInt(rand, 0, k);
    [out[k], out[j]] = [out[j], out[k]];
  }
  return out;
}
