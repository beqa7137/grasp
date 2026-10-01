const C1 = 0xcc9e2d51;
const C2 = 0x1b873593;
const encoder = new TextEncoder();

const scramble = (k: number) => Math.imul(rotl(Math.imul(k, C1), 15), C2);
const rotl = (x: number, r: number) => (x << r) | (x >>> (32 - r));

/** MurmurHash3, the 32-bit x86 variant, over the UTF-8 bytes of `key`: the hash Unleash uses to bucket users. */
export function murmur3(key: string, seed = 0): number {
  const bytes = encoder.encode(key);
  const tail = bytes.length & ~3;
  let h = seed | 0;
  for (let i = 0; i < tail; i += 4) {
    h ^= scramble(bytes[i] | (bytes[i + 1] << 8) | (bytes[i + 2] << 16) | (bytes[i + 3] << 24));
    h = (Math.imul(rotl(h, 13), 5) + 0xe6546b64) | 0;
  }
  let k = 0;
  for (let i = bytes.length - 1; i >= tail; i--) k = (k << 8) | bytes[i];
  if (bytes.length > tail) h ^= scramble(k);
  h ^= bytes.length;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}
