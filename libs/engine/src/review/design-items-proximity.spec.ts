import { describe, expect, it } from 'vitest';
import { kmText } from '../sysdesign/cases/proximity/cells.js';
import { geohashCellKm, haversineKm } from '../sysdesign/cases/proximity/geohash.js';
import { generateQuestion, getReviewItem } from './items.js';

const SEEDS = Array.from({ length: 40 }, (_, i) => i * 7_919 + 3);
const IDS = ['geohash-cell-width', 'radius-precision', 'degree-distance', 'latlon-band', 'index-swap', 'nearest-k'];
const right = (id: string, seed: number) => {
  const q = generateQuestion(`sd:${id}`, seed);
  return { q, answer: q.choices[q.answer] };
};
const numbers = (text: string) => [...text.matchAll(/(\d[\d,]*(?:\.\d+)?)/g)].map((m) => Number(m[1].replaceAll(',', '')));

describe('proximity service review items', () => {
  it('reviews the case under its topics', () => {
    expect(IDS.map((id) => getReviewItem(`sd:${id}`)?.topic)).toEqual([
      'sd-geo',
      'sd-geo',
      'sd-geo',
      'sd-data-modeling',
      'sd-search',
      'sd-geo',
    ]);
  });

  it('offers four distinct choices with one right answer on every seed', () => {
    for (const id of IDS)
      for (const seed of SEEDS) {
        const { q } = right(id, seed);
        expect(new Set(q.choices).size, `${id} ${seed}`).toBe(4);
        expect(q.answer).toBeGreaterThanOrEqual(0);
      }
  });

  it('works the numbers out from the stated settings', () => {
    for (const seed of SEEDS) {
      const width = right('geohash-cell-width', seed);
      const [precision, , , lat] = numbers(width.q.prompt);
      expect(width.answer).toBe(kmText(geohashCellKm(precision, lat).widthKm));

      const fit = right('radius-precision', seed);
      const [at, radius] = numbers(fit.q.prompt.replace(/8 neighbours/, ''));
      const km = fit.q.prompt.includes(`${radius} m`) ? radius / 1000 : radius;
      const p = Number(fit.answer.split(' ')[1]);
      const side = (q: number) => Math.min(geohashCellKm(q, at).widthKm, geohashCellKm(q, at).heightKm);
      expect(side(p), fit.q.prompt).toBeGreaterThanOrEqual(km);
      if (p < 7) expect(side(p + 1)).toBeLessThan(km);

      const apart = right('degree-distance', seed);
      const [shopLat, step] = numbers(apart.q.prompt);
      expect(apart.answer).toBe(kmText(haversineKm(shopLat, 10, shopLat, 10 + step)));

      const band = right('latlon-band', seed);
      const [bandLat, r] = numbers(band.q.prompt);
      const ratio = (4 * 6371.0088 * Math.cos((bandLat * Math.PI) / 180)) / r;
      expect(Math.abs(numbers(band.answer)[0] / ratio - 1)).toBeLessThan(0.06);
    }
  });

  it('asks varied numeric questions', () => {
    for (const id of ['geohash-cell-width', 'radius-precision', 'degree-distance', 'latlon-band'])
      expect(new Set(SEEDS.map((s) => generateQuestion(`sd:${id}`, s).prompt)).size, id).toBeGreaterThanOrEqual(5);
  });
});
