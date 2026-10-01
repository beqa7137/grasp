/** Digits and letters without a, i, l and o: one character carries 5 bits. */
const BASE32 = '0123456789bcdefghjkmnpqrstuvwxyz';

/** The mean radius of the Earth (IUGG). */
export const EARTH_RADIUS_KM = 6371.0088;
/** One degree of latitude, or of longitude at the Equator, on that sphere. */
export const KM_A_DEGREE = (2 * Math.PI * EARTH_RADIUS_KM) / 360;

export interface CellBounds {
  south: number;
  north: number;
  west: number;
  east: number;
}

const rad = (deg: number) => (deg * Math.PI) / 180;

/** Halves the longitude range, then the latitude range, alternately, one bit each, starting with longitude. */
export function geohashEncode(lat: number, lon: number, precision: number): string {
  if (!(Math.abs(lat) <= 90 && Math.abs(lon) <= 180 && precision >= 1 && precision <= 12)) throw new Error('Out of range');
  const range = { lat: [-90, 90], lon: [-180, 180] };
  let hash = '';
  let bits = 0;
  let value = 0;
  let even = true;
  while (hash.length < precision) {
    const [axis, v] = even ? (['lon', lon] as const) : (['lat', lat] as const);
    const mid = (range[axis][0] + range[axis][1]) / 2;
    value <<= 1;
    if (v >= mid) {
      value |= 1;
      range[axis][0] = mid;
    } else range[axis][1] = mid;
    even = !even;
    if (++bits === 5) {
      hash += BASE32[value];
      bits = 0;
      value = 0;
    }
  }
  return hash;
}

export function geohashBounds(hash: string): CellBounds {
  const lat = [-90, 90];
  const lon = [-180, 180];
  let even = true;
  for (const ch of hash) {
    const value = BASE32.indexOf(ch);
    if (value < 0) throw new Error(`Not a geohash: ${hash}`);
    for (let bit = 4; bit >= 0; bit--) {
      const range = even ? lon : lat;
      const mid = (range[0] + range[1]) / 2;
      if ((value >> bit) & 1) range[0] = mid;
      else range[1] = mid;
      even = !even;
    }
  }
  return { south: lat[0], north: lat[1], west: lon[0], east: lon[1] };
}

/**
 * The 8 cells around one, clockwise from north: step one cell from its centre and encode again, wrapping longitude at
 * 180 degrees. Beyond a pole there is no cell, so a polar cell has 5 neighbours.
 */
export function geohashNeighbours(hash: string): string[] {
  const b = geohashBounds(hash);
  const lat = (b.south + b.north) / 2;
  const lon = (b.west + b.east) / 2;
  const h = b.north - b.south;
  const w = b.east - b.west;
  const steps = [
    [1, 0],
    [1, 1],
    [0, 1],
    [-1, 1],
    [-1, 0],
    [-1, -1],
    [0, -1],
    [1, -1],
  ];
  return steps.flatMap(([dy, dx]) => {
    const y = lat + dy * h;
    if (Math.abs(y) > 90) return [];
    const x = ((((lon + dx * w + 180) % 360) + 360) % 360) - 180;
    return [geohashEncode(y, x, hash.length)];
  });
}

/** Great-circle distance on a sphere: d = 2R asin(sqrt(sin²(Δφ/2) + cos φ1 cos φ2 sin²(Δλ/2))). */
export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number, radiusKm = EARTH_RADIUS_KM): number {
  const a = Math.sin(rad(lat2 - lat1) / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lon2 - lon1) / 2) ** 2;
  return 2 * radiusKm * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** A cell's size in km at a latitude: 5 bits a character, longitude first, and longitude shrinking with the cosine. */
export function geohashCellKm(precision: number, latitude: number): { widthKm: number; heightKm: number } {
  const bits = 5 * precision;
  const lonDeg = 360 / 2 ** Math.ceil(bits / 2);
  const latDeg = 180 / 2 ** Math.floor(bits / 2);
  return { widthKm: lonDeg * KM_A_DEGREE * Math.cos(rad(latitude)), heightKm: latDeg * KM_A_DEGREE };
}
