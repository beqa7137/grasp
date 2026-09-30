export type Redundancy = { kind: 'replicas'; copies: number } | { kind: 'erasure'; data: number; parity: number };

export interface DurabilityRun {
  /** Bytes stored per byte of data. */
  overhead: number;
  /** Pieces that can be lost at once without losing the object. */
  tolerates: number;
  /** Chance a given object is lost in a year. */
  annualLoss: number;
  /** Nines of durability: 11 means 99.999999999%. */
  nines: number;
  /** Bytes read to rebuild one lost piece, per byte of that piece. */
  repairRead: number;
}

function atLeast(n: number, k: number, p: number): number {
  let total = 0;
  let term = (1 - p) ** n;
  for (let i = 0; i <= n; i++) {
    if (i >= k) total += term;
    term *= ((n - i) / (i + 1)) * (p / (1 - p));
  }
  return total;
}

/**
 * An object stored as `copies` full replicas, or cut into `data` pieces plus `parity` pieces of which any `data` rebuild
 * it, each piece on a different disk. Disks fail at `afr` a year, independently, and a failed piece is rebuilt in
 * `repairHours`. The object is lost when, after one piece fails, more than the tolerated number of the rest fail before
 * the repair ends. Correlated failures (a rack, a bad batch of disks) make real losses far likelier than this.
 */
export function durability(redundancy: Redundancy, options: { afr: number; repairHours: number }): DurabilityRun {
  const { afr, repairHours } = options;
  const pieces = redundancy.kind === 'replicas' ? redundancy.copies : redundancy.data + redundancy.parity;
  const tolerates = redundancy.kind === 'replicas' ? redundancy.copies - 1 : redundancy.parity;
  const overhead = redundancy.kind === 'replicas' ? redundancy.copies : pieces / redundancy.data;
  const pDuringRepair = afr * (repairHours / 8760);
  const annualLoss = Math.min(1, pieces * afr * atLeast(pieces - 1, tolerates, pDuringRepair));
  return {
    overhead,
    tolerates,
    annualLoss,
    nines: annualLoss > 0 ? -Math.log10(annualLoss) : Infinity,
    repairRead: redundancy.kind === 'replicas' ? 1 : redundancy.data,
  };
}
