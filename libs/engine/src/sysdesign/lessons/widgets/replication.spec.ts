import { describe, expect, it } from 'vitest';
import { replicaOutcome, replicaRead, replicaReads } from './replication.js';

describe('replica outcome', () => {
  it('names every read time that would be stale: before the lag, or after a pin that ends before it', () => {
    const base = { lagMs: 800, readMs: 300, readYourWrites: false, pinMs: 1_000 };
    expect(replicaOutcome(base)).toEqual({ stale: true, servedBy: 'replica', staleFrom: 0, staleTo: 800, staleMs: 800 });
    expect(replicaOutcome({ ...base, readYourWrites: true })).toMatchObject({ stale: false, servedBy: 'primary', staleMs: 0 });
    expect(replicaOutcome({ ...base, lagMs: 2_000, readMs: 1_200, readYourWrites: true })).toMatchObject({
      stale: true,
      servedBy: 'replica',
      staleFrom: 1_000,
      staleTo: 2_000,
      staleMs: 1_000,
    });
  });

  it("sends a read at the pin's last moment to the primary, where the band ends", () => {
    expect(replicaRead(3_000, 3_000, true, 3_000)).toEqual({ stale: false, servedBy: 'primary' });
    expect(replicaRead(3_000, 3_000, false, 3_000)).toEqual({ stale: false, servedBy: 'replica' });
  });

  it('streams a read every quarter second, stale exactly inside the window', () => {
    const reads = replicaReads({ lagMs: 2_000, readYourWrites: true, pinMs: 1_000 });
    expect(reads).toHaveLength(13);
    expect(reads.filter((r) => r.stale).map((r) => r.at)).toEqual([1_250, 1_500, 1_750]);
  });
});
