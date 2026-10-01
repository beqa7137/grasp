import { describe, expect, it } from 'vitest';
import { CASE_LABS } from './labs.js';
import { cellSearch } from './proximity/cells.js';
import { quadtree } from './proximity/quadtree.js';
import { PROXIMITY_SERVICE } from './proximity-service.js';

const estimates = PROXIMITY_SERVICE.stages.flatMap((s) => (s.estimate ? [s.estimate] : []));
const text = JSON.stringify(PROXIMITY_SERVICE);

describe('proximity service case', () => {
  it('works its estimates out from the stated assumptions', () => {
    expect(estimates.map((e) => e.answer)).toEqual([17_361, 200]);
    expect(estimates[0].working).toEqual([
      '100 million users × 5 searches = 500 million searches a day.',
      '500 million / 86,400 s ≈ 5,787 searches a second on average.',
      '× 3 at peak ≈ 17,361 searches a second.',
    ]);
    expect(estimates[1].working[0]).toBe('200 million businesses × 1 KB = 200 GB.');
    expect(text).toContain('200 million × 32 bytes = 6.4 GB');
    expect(text).toContain('2 million edits a day, about 23 a second, 69 at peak');
  });

  it('sizes the Design Lab build to the searches, page views and edits it describes', () => {
    const { workload } = CASE_LABS['proximity-service'];
    expect(text).toContain('17,361 searches and as many page views a second at peak, 34,722 reads, plus 69 edits');
    expect(text).toContain(`about ${workload.rps.toLocaleString('en-US')} requests a second, ${workload.readRatio * 100}% reads`);
  });

  it('runs the cell and quadtree models after the stage asks the learner to commit', () => {
    const widgets = PROXIMITY_SERVICE.stages.filter((s) => s.widget);
    expect(widgets.map((s) => s.widget)).toEqual(['cells', 'quadtree']);
    for (const s of widgets) expect(Boolean(s.decision), s.title).toBe(true);
  });

  it('quotes the numbers its models give, with one example user and town', () => {
    const own = cellSearch({ precision: 6, radiusKm: 0.5, scope: 'own' });
    const nine = cellSearch({ precision: 6, radiusKm: 0.5, scope: 'neighbours' });
    const wide = cellSearch({ precision: 6, radiusKm: 1, scope: 'neighbours' });
    const coarse = cellSearch({ precision: 5, radiusKm: 1, scope: 'neighbours' });
    expect(text).toContain(`It finds ${own.found} of the ${own.within} places within 0.5 km`);
    expect(text).toContain(`the 9 cells read ${nine.read} places and keep the ${nine.found} within 0.5 km`);
    expect(text).toContain(`so 9 of them miss ${wide.missed} of ${wide.within} places here`);
    expect(text).toContain(`finds all ${coarse.found} but reads ${coarse.read.toLocaleString('en-US')}`);
    expect(text).toContain('A user stands 42 m from the east edge of their cell, dr5zzf');
    expect(text).toContain('67 m away in drhpb4, across the east edge');
    expect(text.match(/67 m/g)!.length).toBeGreaterThanOrEqual(3);
    expect(text).not.toMatch(/68 m|66 m/);

    const tree = quadtree({ capacity: 100, density: 'city' });
    const tiny = quadtree({ capacity: 5, density: 'city' });
    expect(text).toContain(
      `a tree ${tree.depth} levels deep with ${tree.nodes} nodes, and a search for the nearest 20 visits about ${Math.round(tree.visited)} nodes and checks about ${Math.round(tree.examined)} places`,
    );
    expect(text).toContain(`At 5 a leaf it is ${tiny.depth} levels and ${tiny.nodes.toLocaleString('en-US')} nodes`);
    expect(text).toContain('(6.9 GB for 200 million at 100 a leaf)');
  });

  it('explains the latitude band, the poles and the cell sizes from the geometry', () => {
    expect(text).toContain('a band 4 km tall around the whole planet');
    expect(text).toContain('about 121,000 km², about 9,700 times the 12.6 km² circle');
    expect(text).toContain('at 89° N a precision 5 cell is 85 m by 4.89 km');
    expect(text).toContain('5, 4.89 km by 4.89 km; 6, 1.22 km by 611 m');
    expect(text).toContain('cells are 24% narrower than at the Equator');
  });

  it('keeps relevance ranking and reviews out of scope', () => {
    expect(text).toContain('Ranking by ratings, reviews and personal taste, and the reviews and photos themselves, are out of scope');
    expect(text).not.toMatch(/sort by rating|ranked by rating/i);
  });
});
