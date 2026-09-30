import { describe, expect, it } from 'vitest';
import { durability } from './durability.js';

const disks = { afr: 0.02, repairHours: 24 };

describe('durability', () => {
  it('costs three times the space for three copies, and half as much again for 6 + 3 erasure coding', () => {
    expect(durability({ kind: 'replicas', copies: 3 }, disks)).toMatchObject({ overhead: 3, tolerates: 2, repairRead: 1 });
    expect(durability({ kind: 'erasure', data: 6, parity: 3 }, disks)).toMatchObject({ overhead: 1.5, tolerates: 3, repairRead: 6 });
  });

  it('gives erasure coding more nines than three copies for half the space, and fewer to two copies', () => {
    const three = durability({ kind: 'replicas', copies: 3 }, disks).nines;
    expect(durability({ kind: 'erasure', data: 6, parity: 3 }, disks).nines).toBeGreaterThan(three);
    expect(durability({ kind: 'replicas', copies: 2 }, disks).nines).toBeLessThan(three);
  });

  it('loses nines as repairs take longer', () => {
    const fast = durability({ kind: 'replicas', copies: 3 }, disks).nines;
    expect(durability({ kind: 'replicas', copies: 3 }, { ...disks, repairHours: 168 }).nines).toBeLessThan(fast - 1);
  });
});
