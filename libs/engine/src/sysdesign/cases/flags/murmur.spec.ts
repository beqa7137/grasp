import { describe, expect, it } from 'vitest';
import { murmur3 } from './murmur.js';

describe('murmur3', () => {
  it('matches the published MurmurHash3 x86 32-bit vectors, across every tail length and seeds that use all 32 bits', () => {
    const vectors: [string, number, number][] = [
      ['', 0, 0],
      ['', 1, 0x514e28b7],
      ['', 0xffffffff, 0x81f16f39],
      ['a', 0x9747b28c, 0x7fa09ea6],
      ['abc', 0, 0xb3dd93fa],
      ['aaaa', 0x9747b28c, 0x5a97808a],
      ['test', 0, 0xba6bd213],
      ['hello', 0, 0x248bfa47],
      ['Hello, world!', 0x9747b28c, 0x24884cba],
      ['The quick brown fox jumps over the lazy dog', 0x9747b28c, 0x2fa826cd],
      ['new-checkout:user-1', 0, 0x84f04c17],
    ];
    for (const [key, seed, hash] of vectors) expect(murmur3(key, seed), `${key} ${seed}`).toBe(hash);
  });

  it('hashes the UTF-8 bytes, so non-ASCII ids match other languages', () => {
    expect(murmur3('héllo ✓')).toBe(0x763a420a);
  });
});
