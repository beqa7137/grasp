import { describe, expect, it } from 'vitest';
import {
  CELL_PRECISIONS,
  CELL_SEARCH,
  RADIUS_LIMITS,
  cellPlaces,
  cellSearch,
  cellSearchCheckpoint,
  placesText,
  sharedPrefix,
  type CellScope,
  type CellSearchSettings,
} from './cells.js';
import { geohashBounds, geohashEncode, geohashNeighbours, haversineKm } from './geohash.js';

const SCOPES: CellScope[] = ['own', 'neighbours'];

/** Every precision, scope and radius the controls allow. */
function* sweep(): Generator<CellSearchSettings> {
  const steps = Math.round((RADIUS_LIMITS.max - RADIUS_LIMITS.min) / RADIUS_LIMITS.step);
  for (const precision of CELL_PRECISIONS)
    for (const scope of SCOPES)
      for (let i = 0; i <= steps; i++)
        yield { precision, scope, radiusKm: Number((RADIUS_LIMITS.min + i * RADIUS_LIMITS.step).toFixed(1)) };
}

describe('the seeded town', () => {
  it('puts every place within the box around the user, and the first one just across a precision 3 edge', () => {
    const places = cellPlaces();
    expect(places).toHaveLength(CELL_SEARCH.places);
    const { user, across, boxKm } = CELL_SEARCH;
    for (const p of places) {
      expect(haversineKm(user.lat, user.lon, user.lat, p.lon)).toBeLessThanOrEqual(boxKm + 1e-6);
      expect(haversineKm(user.lat, user.lon, p.lat, user.lon)).toBeLessThanOrEqual(boxKm + 1e-6);
    }
    expect(places[0].km).toBeCloseTo(0.0674, 3);
    expect(geohashBounds(geohashEncode(user.lat, user.lon, 3)).east).toBe(-73.125);
    for (const precision of CELL_PRECISIONS) {
      const mine = geohashEncode(user.lat, user.lon, precision);
      const theirs = geohashEncode(across.lat, across.lon, precision);
      expect(geohashNeighbours(mine)[2], String(precision)).toBe(theirs);
      expect(sharedPrefix(mine, theirs)).toBe(2);
    }
  });
});

describe('cell search', () => {
  it('reads the places in its cells and checks their true distance, on every setting', () => {
    const places = cellPlaces();
    for (const s of sweep()) {
      const run = cellSearch(s);
      const cells = new Set(run.cells);
      expect(run.cells).toHaveLength(s.scope === 'own' ? 1 : 9);
      const read = places.filter((p) => cells.has(geohashEncode(p.lat, p.lon, s.precision)));
      const within = places.filter((p) => p.km <= s.radiusKm);
      expect(run.read, JSON.stringify(s)).toBe(read.length);
      expect(run.within).toBe(within.length);
      expect(run.found).toBe(read.filter((p) => p.km <= s.radiusKm).length);
      expect(run.found + run.missed).toBe(run.within);
      expect(run.found + run.extra).toBe(run.read);
      expect(run.marks.filter((m) => m === 'missed')).toHaveLength(run.missed);
    }
  });

  it('misses the place across the edge from the user cell alone, and never misses within what 9 cells cover', () => {
    for (const s of sweep()) {
      const run = cellSearch(s);
      if (s.scope === 'own') expect(run.marks[0]).toBe('missed');
      else {
        expect(run.marks[0]).toBe('found');
        if (s.radiusKm <= run.coveredKm) expect(run.missed, JSON.stringify(s)).toBe(0);
        if (s.radiusKm <= Math.min(run.widthKm, run.heightKm)) expect(run.missed).toBe(0);
      }
    }
    expect(cellSearch({ precision: 6, radiusKm: 1, scope: 'neighbours' }).missed).toBeGreaterThan(0);
    expect(() => cellSearch({ precision: 6, radiusKm: 0, scope: 'own' })).toThrow();
  });
});

describe('cell search checkpoint', () => {
  it('has exactly one right answer, the count the model gives, on every setting', () => {
    for (const s of sweep()) {
      const at = JSON.stringify(s);
      const run = cellSearch(s);
      const c = cellSearchCheckpoint(s, run);
      const expected = c.prompt.includes('does it find') ? run.found : c.prompt.includes('does it miss') ? run.missed : run.read;
      expect(c.choices[c.answer], at).toBe(placesText(expected));
      expect(c.choices.length, at).toBeGreaterThanOrEqual(3);
      expect(new Set(c.choices).size, at).toBe(c.choices.length);
    }
  });

  it('asks from the settings: the user cell alone what it finds, 9 cells what they read, or miss when the radius is wider than a cell', () => {
    const asked = (s: CellSearchSettings) => cellSearchCheckpoint(s).prompt.split('. ').at(-1)!;
    expect(asked({ precision: 6, radiusKm: 0.5, scope: 'own' })).toMatch(/does it find\?$/);
    expect(asked({ precision: 6, radiusKm: 0.5, scope: 'neighbours' })).toMatch(/does it read before checking distances\?$/);
    expect(asked({ precision: 6, radiusKm: 1, scope: 'neighbours' })).toMatch(/does it miss\?$/);
    expect(new Set([...sweep()].map(asked)).size).toBeGreaterThan(3);
  });
});
