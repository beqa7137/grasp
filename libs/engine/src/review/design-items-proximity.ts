import { kmText } from '../sysdesign/cases/proximity/cells.js';
import { EARTH_RADIUS_KM, geohashCellKm, haversineKm } from '../sysdesign/cases/proximity/geohash.js';
import { num } from '../sysdesign/cases/widget-checkpoint.js';
import { concept, item, type DesignItemDefinition } from './design-item-kit.js';
import { pick, withChoices } from './random.js';
import type { DesignItemId } from './summaries.js';

const cos = (deg: number) => Math.cos((deg * Math.PI) / 180);
const sin = (deg: number) => Math.sin((deg * Math.PI) / 180);

const cellWidth = item('Geohash cell width away from the Equator', (rand) => {
  const precision = pick(rand, [5, 6, 7]);
  const lat = pick(rand, [20, 40, 60, 70]);
  const equator = geohashCellKm(precision, 0).widthKm;
  const width = geohashCellKm(precision, lat).widthKm;
  return {
    prompt: `A geohash cell at precision ${precision} is ${kmText(equator)} wide at the Equator. How wide is a precision ${precision} cell at ${lat}° N?`,
    ...withChoices(rand, kmText(width), [kmText(equator), kmText(equator * sin(lat)), kmText(equator / cos(lat))]),
    explain: `A cell spans a fixed number of degrees of longitude, and a degree of longitude shrinks with the cosine of the latitude: ${kmText(equator)} × cos ${lat}° = ${kmText(width)}. Its height, in degrees of latitude, stays the same, so pick the precision at the user's latitude.`,
  };
});

const radiusPrecision = item('Geohash precision for a search radius', (rand) => {
  const radiusKm = pick(rand, [0.1, 0.5, 2, 4, 10]);
  const lat = pick(rand, [0, 40, 60]);
  const fits = (p: number) => {
    const { widthKm, heightKm } = geohashCellKm(p, lat);
    return Math.min(widthKm, heightKm) >= radiusKm;
  };
  const precision = [7, 6, 5, 4].find(fits)!;
  const { widthKm, heightKm } = geohashCellKm(precision, lat);
  const finer = geohashCellKm(precision + 1, lat);
  return {
    prompt: `A nearby search at ${lat}° latitude reads the user's geohash cell and its 8 neighbors. Which is the finest precision that never misses a place within ${kmText(radiusKm)}?`,
    ...withChoices(
      rand,
      `Precision ${precision}`,
      [4, 5, 6, 7].filter((p) => p !== precision).map((p) => `Precision ${p}`),
    ),
    explain: `From anywhere in the middle cell, the 3 × 3 block reaches at least one cell side, so the cells must be at least the radius wide and tall. Precision ${precision} is ${kmText(widthKm)} by ${kmText(heightKm)} here; precision ${precision + 1} is ${kmText(finer.widthKm)} by ${kmText(finer.heightKm)}, too small for ${kmText(radiusKm)}.`,
  };
});

const degreeDistance = item('Distance across a fraction of a degree of longitude', (rand) => {
  const lat = pick(rand, [30, 50, 60, 70]);
  const step = pick(rand, [0.01, 0.1]);
  const d = haversineKm(lat, 10, lat, 10 + step);
  const equator = haversineKm(0, 10, 0, 10 + step);
  return {
    prompt: `Two shops at ${lat}° N are ${step}° of longitude apart, at the same latitude. How far apart are they?`,
    ...withChoices(rand, kmText(d), [kmText(equator), kmText(equator * sin(lat)), kmText(equator / cos(lat))]),
    explain: `${step}° of longitude is ${kmText(equator)} at the Equator, and a degree of longitude shrinks with the cosine of the latitude: about ${kmText(d)} at ${lat}°. Comparing raw degrees treats it as ${kmText(equator)}, which is why nearby search computes true distances (haversine) instead.`,
  };
});

const latLonBand = item('Rows a latitude index reads for a radius search', (rand) => {
  const radiusKm = pick(rand, [1, 2, 5]);
  const lat = pick(rand, [0, 40, 60]);
  const ratio = (at: number) => (4 * EARTH_RADIUS_KM * cos(at)) / radiusKm;
  const times = (v: number) => {
    const digits = 10 ** Math.max(0, Math.floor(Math.log10(v)) - 1);
    return `About ${num(Math.round(v / digits) * digits)} times`;
  };
  const right = ratio(lat);
  const other = lat === 0 ? ratio(60) : ratio(0);
  return {
    prompt: `Businesses are spread evenly near ${lat}° latitude, and a B-tree on (latitude, longitude) answers "within ${radiusKm} km". The index can seek only on latitude. How many times more businesses does it read than lie in the circle?`,
    ...withChoices(rand, times(right), [times(right / 10), times(right * 10), times(other)]),
    explain: `It reads the whole band ${2 * radiusKm} km tall around the planet, 2πR × cos ${lat}° = ${num(2 * Math.PI * EARTH_RADIUS_KM * cos(lat))} km long, and filters longitude inside it: ${num(2 * radiusKm * 2 * Math.PI * EARTH_RADIUS_KM * cos(lat))} km² against π × ${radiusKm}² = ${Number((Math.PI * radiusKm ** 2).toFixed(1))} km² for the circle, about ${num(right)} times as much. A spatial index (geohash or S2 cells, a quadtree, an R-tree) reads only the area around the circle.`,
  };
});

const indexSwap = concept(
  'A search server holds the location index in memory, and a new nightly version is ready. How should the server start using it?',
  'Load the new version beside the old one, then switch to it in one step',
  [
    'Pause searches while the new version replaces the old one in place',
    'Apply the new version cell by cell while searches keep running',
    'Restart the server so it reads the new version on startup',
  ],
  'Loading beside the old version means no search ever sees a half-updated index and nothing pauses; switching one reference is atomic, and the old version stays at hand for an instant rollback. It costs memory for two copies for a moment, a few GB.',
);

const nearestK = concept(
  'A search wants the nearest 20 places with no radius, reading geohash cells around the user. When may it stop widening?',
  'When 20 places lie within the distance the cells read are sure to cover',
  [
    'As soon as the cells read hold at least 20 places',
    'When the 9 cells at the default precision have been read',
    'After a fixed 50 km radius, wherever the user is',
  ],
  'Cells read so far cover the user only out to their nearest edge. A place just beyond it can be closer than a candidate in a far corner, so the search stops only when 20 places are within that covered distance; otherwise it widens by a ring or a coarser precision.',
);

export const PROXIMITY_ITEMS = {
  'geohash-cell-width': cellWidth,
  'radius-precision': radiusPrecision,
  'degree-distance': degreeDistance,
  'latlon-band': latLonBand,
  'index-swap': indexSwap,
  'nearest-k': nearestK,
} satisfies Partial<Record<DesignItemId, DesignItemDefinition>>;
