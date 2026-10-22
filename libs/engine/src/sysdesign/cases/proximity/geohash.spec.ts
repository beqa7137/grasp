import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../../algorithms/random.js';
import { EARTH_RADIUS_KM, KM_A_DEGREE, geohashBounds, geohashCellKm, geohashEncode, geohashNeighbours, haversineKm } from './geohash.js';

describe('geohash', () => {
  it('matches the published vectors', () => {
    expect(geohashEncode(57.64911, 10.40744, 11)).toBe('u4pruydqqvj');
    expect(geohashEncode(42.6, -5.6, 5)).toBe('ezs42');
    expect(geohashEncode(0, 0, 12)).toBe('s00000000000');
    expect(geohashEncode(38.115556, 13.361389, 10)).toBe('sqc8b49rny');
    expect(geohashEncode(37.502669, 15.087269, 10)).toBe('sqdtr74hyu');
  });

  it('decodes a cell to the box its points encode into', () => {
    const b = geohashBounds('ezs42');
    expect((b.south + b.north) / 2).toBeCloseTo(42.60498046875, 10);
    expect((b.west + b.east) / 2).toBeCloseTo(-5.60302734375, 10);
    expect(b.north - b.south).toBeCloseTo(2 * 0.02197265625, 10);
    const rand = mulberry32(5);
    for (let i = 0; i < 2_000; i++) {
      const lat = rand() * 180 - 90;
      const lon = rand() * 360 - 180;
      const precision = 1 + Math.floor(rand() * 10);
      const hash = geohashEncode(lat, lon, precision);
      const box = geohashBounds(hash);
      expect(lat >= box.south && lat <= box.north && lon >= box.west && lon <= box.east, hash).toBe(true);
      expect(geohashEncode(lat, lon, precision + 2).startsWith(hash)).toBe(true);
    }
    expect(() => geohashBounds('ab')).toThrow();
    expect(() => geohashEncode(91, 0, 5)).toThrow();
  });

  it('splits the four quarters around latitude 0 and longitude 0 at the first character', () => {
    expect(
      [
        [0.0001, 0.0001],
        [0.0001, -0.0001],
        [-0.0001, -0.0001],
        [-0.0001, 0.0001],
      ].map(([lat, lon]) => geohashEncode(lat, lon, 6)[0]),
    ).toEqual(['s', 'e', '7', 'k']);
  });

  it('finds the 8 neighbors clockwise from north, wrapping at 180 degrees and stopping at the poles', () => {
    expect(geohashNeighbours('dqcjq')).toEqual(['dqcjw', 'dqcjx', 'dqcjr', 'dqcjp', 'dqcjn', 'dqcjj', 'dqcjm', 'dqcjt']);
    const eastmost = geohashEncode(0.01, 179.999, 5);
    expect(eastmost).toBe('xbpbp');
    expect(geohashNeighbours(eastmost)[2]).toBe('80000');
    expect(geohashBounds(geohashNeighbours(eastmost)[2]).west).toBe(-180);
    const polar = geohashEncode(89.99, 10, 2);
    expect(geohashBounds(polar).north).toBe(90);
    expect(geohashNeighbours(polar)).toHaveLength(5);
    expect(geohashNeighbours(polar).filter((n) => geohashBounds(n).south >= geohashBounds(polar).north)).toEqual([]);
  });

  it('gives cells their size in km, narrowing with the cosine of the latitude', () => {
    const p5 = geohashCellKm(5, 0);
    expect(p5.widthKm).toBeCloseTo(4.89, 2);
    expect(p5.heightKm).toBeCloseTo(4.89, 2);
    expect(geohashCellKm(6, 0).widthKm).toBeCloseTo(1.22, 2);
    expect(geohashCellKm(6, 0).heightKm).toBeCloseTo(0.611, 3);
    expect(geohashCellKm(6, 60).widthKm).toBeCloseTo(geohashCellKm(6, 0).widthKm / 2, 6);
    expect(geohashCellKm(6, 60).heightKm).toBe(geohashCellKm(6, 0).heightKm);
  });
});

describe('haversine', () => {
  it('matches known distances from a reference implementation on the same sphere', () => {
    expect(haversineKm(36.12, -86.67, 33.94, -118.4)).toBeCloseTo(2886.4484, 3);
    expect(haversineKm(51.5007, -0.1246, 40.6892, -74.0445)).toBeCloseTo(5574.8482, 3);
  });

  it('agrees with the geometry of the sphere', () => {
    expect(haversineKm(0, 0, 90, 0)).toBeCloseTo((Math.PI * EARTH_RADIUS_KM) / 2, 6);
    expect(haversineKm(0, 0, 0, 180)).toBeCloseTo(Math.PI * EARTH_RADIUS_KM, 6);
    expect(haversineKm(10, 20, 11, 20)).toBeCloseTo(KM_A_DEGREE, 6);
    expect(haversineKm(60, 0, 60, 1)).toBeCloseTo(KM_A_DEGREE / 2, 2);
    expect(haversineKm(0, 179.99, 0, -179.99)).toBeCloseTo(0.02 * KM_A_DEGREE, 6);
    expect(haversineKm(12, 34, 56, 78)).toBeCloseTo(haversineKm(56, 78, 12, 34), 9);
    expect(haversineKm(12, 34, 12, 34)).toBe(0);
  });
});
