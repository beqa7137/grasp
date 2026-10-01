import { describe, expect, it } from 'vitest';
import {
  CAPACITY_LIMITS,
  DENSITIES,
  QUADTREE,
  buildQuadtree,
  bytesText,
  nearestPlaces,
  placesIn,
  quadPlaces,
  quadQueries,
  quadtree,
  quadtreeCheckpoint,
  quadtreeQueries,
  type QuadNode,
  type QuadtreeSettings,
} from './quadtree.js';

/** Every leaf capacity the slider allows, for every density. */
function* sweep(): Generator<QuadtreeSettings> {
  for (const density of DENSITIES)
    for (let capacity = CAPACITY_LIMITS.min; capacity <= CAPACITY_LIMITS.max; capacity += CAPACITY_LIMITS.step) yield { capacity, density };
}

const leavesOf = (n: QuadNode): QuadNode[] => (n.kids ? n.kids.flatMap(leavesOf) : [n]);

describe('quadtree', () => {
  it('splits until every leaf holds at most the capacity, keeping every place exactly once inside its leaf', () => {
    for (const density of DENSITIES) {
      const points = quadPlaces(density);
      for (const capacity of [1, 5, 100]) {
        const leaves = leavesOf(buildQuadtree(points, capacity));
        expect(leaves.every((l) => placesIn(l).length <= capacity)).toBe(true);
        const ids = leaves.flatMap((l) => [...placesIn(l)]);
        expect(new Set(ids).size).toBe(points.length);
        for (const l of leaves)
          for (const i of placesIn(l)) {
            const [x, y] = points[i];
            expect(x >= l.x && x < l.x + l.size && y >= l.y && y < l.y + l.size).toBe(true);
          }
      }
    }
  });

  it('counts nodes as 1 + 4 per split, build steps as the sum of depths, and memory from the stated sizes', () => {
    const run = quadtree({ capacity: 100, density: 'city' });
    expect(run.nodes).toBe(1 + 4 * (run.nodes - run.leaves.length));
    expect(run.leaves.length).toBe(1 + (3 * (run.nodes - 1)) / 4);
    expect(run.leaves.reduce((sum, l) => sum + l.count, 0)).toBe(QUADTREE.places);
    expect(run.buildSteps).toBe(run.leaves.reduce((sum, l) => sum + l.count * l.depth, 0));
    expect(run.memoryBytes).toBe(QUADTREE.places * QUADTREE.entryBytes + run.nodes * QUADTREE.nodeBytes);
    expect(run.scaledBytes).toBe(QUADTREE.scaleTo * QUADTREE.entryBytes + run.nodes * 20_000 * QUADTREE.nodeBytes);
    expect(bytesText(run.scaledBytes)).toBe('6.9 GB');
  });

  it('goes deeper where places cluster, and deeper and bigger as leaves shrink', () => {
    const even = quadtree({ capacity: 100, density: 'even' });
    const city = quadtree({ capacity: 100, density: 'city' });
    expect(city.depth).toBeGreaterThan(even.depth);
    expect(even.depth).toBe(Math.ceil(Math.log(QUADTREE.places / 100) / Math.log(4)));
    expect(quadtree({ capacity: 5, density: 'city' }).nodes).toBeGreaterThan(10 * city.nodes);
  });

  it('finds the same nearest places as checking every place, opening few leaves', () => {
    for (const density of DENSITIES) {
      const points = quadPlaces(density);
      const root = buildQuadtree(points, 20);
      for (const [qx, qy] of quadQueries(density).slice(0, 25)) {
        const { found, examined } = nearestPlaces(root, points, qx, qy, QUADTREE.nearest);
        const brute = points
          .map((p, i) => ({ i, d: Math.hypot(p[0] - qx, p[1] - qy) }))
          .sort((a, b) => a.d - b.d)
          .slice(0, QUADTREE.nearest)
          .map((p) => p.i);
        expect(found).toEqual(brute);
        expect(examined).toBeLessThan(points.length / 20);
      }
    }
  });

  it('measures queries apart from the build, as the average over the seeded queries', () => {
    const s = { capacity: 100, density: 'city' } as const;
    expect(quadtree(s)).not.toHaveProperty('examined');
    const points = quadPlaces('city');
    const root = buildQuadtree(points, 100);
    const runs = quadQueries('city').map(([x, y]) => nearestPlaces(root, points, x, y, QUADTREE.nearest));
    const cost = quadtreeQueries(s);
    expect(cost.examined).toBeCloseTo(runs.reduce((sum, r) => sum + r.examined, 0) / runs.length, 9);
    expect(cost.visited).toBeCloseTo(runs.reduce((sum, r) => sum + r.visited, 0) / runs.length, 9);
    expect(quadtreeQueries(s)).toBe(cost);
  });

  it('checks fewer places and walks more nodes as leaves shrink', () => {
    const big = quadtreeQueries({ capacity: 400, density: 'city' });
    const small = quadtreeQueries({ capacity: 5, density: 'city' });
    expect(small.examined).toBeLessThan(big.examined);
    expect(small.visited).toBeGreaterThan(big.visited);
    expect(() => quadtree({ capacity: 0, density: 'even' })).toThrow();
  });
});

describe('quadtree checkpoint', () => {
  it('has exactly one right answer, the readout the model gives, on every setting', () => {
    for (const s of sweep()) {
      const at = JSON.stringify(s);
      const run = quadtree(s);
      const c = quadtreeCheckpoint(s, run);
      const right = c.choices[c.answer];
      const expected = c.prompt.includes('How many levels')
        ? `${run.depth} level${run.depth === 1 ? '' : 's'}`
        : c.prompt.includes('How many nodes')
          ? `${run.nodes.toLocaleString('en-US')} nodes`
          : `${Math.round(quadtreeQueries(s).examined).toLocaleString('en-US')} places`;
      expect(right, at).toBe(expected);
      expect(c.choices.length, at).toBeGreaterThanOrEqual(3);
      expect(new Set(c.choices).size, at).toBe(c.choices.length);
    }
  });

  it('varies the question with the settings', () => {
    const asked = new Set([...sweep()].map((s) => quadtreeCheckpoint(s).prompt.split('. ').at(-1)));
    expect(asked.size).toBe(3);
    expect(quadtreeCheckpoint({ capacity: 100, density: 'city' }).prompt).not.toBe(
      quadtreeCheckpoint({ capacity: 105, density: 'city' }).prompt,
    );
  });
});
