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

/** A shuffled copy of `items` (Fisher–Yates); `items` itself is left alone. */
export function shuffle<T>(rand: () => number, items: readonly T[]): T[] {
  const out = [...items];
  for (let k = out.length - 1; k > 0; k--) {
    const j = randInt(rand, 0, k);
    [out[k], out[j]] = [out[j], out[k]];
  }
  return out;
}
