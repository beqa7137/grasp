/** Goals the missions built on the case studies share, spread into each version's own. */
export const KEPT = { maxErrorRate: 0.001, requireDurableWrites: true } as const;
export const LEDGER = { ...KEPT, maxP99Ms: 200, synchronousWrites: true, noSinglePointOfFailure: true } as const;
export const WAVE = { ...KEPT, maxP99Ms: 250, noSinglePointOfFailure: true, maxDrainMinutes: 10 } as const;
