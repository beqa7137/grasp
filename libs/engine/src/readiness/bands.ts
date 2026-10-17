// Apart from readiness.ts, so a page that only names a band (the Mock hub's cards) loads none of the skill states.

/** Coverage bands, lowest first; the number is coverage of the required skills, never a hire prediction. */
export const READINESS_BANDS = [
  { band: 'building', from: 0 },
  { band: 'getting-there', from: 40 },
  { band: 'loop-ready', from: 75 },
] as const;
export type ReadinessBand = (typeof READINESS_BANDS)[number]['band'];

/** How every screen names a band. */
export const READINESS_BAND_NAMES: Record<ReadinessBand, string> = {
  building: 'Building',
  'getting-there': 'Getting there',
  'loop-ready': 'Loop-ready',
};

export const readinessBand = (score: number): ReadinessBand =>
  READINESS_BANDS.reduce<ReadinessBand>((band, b) => (score >= b.from ? b.band : band), 'building');
