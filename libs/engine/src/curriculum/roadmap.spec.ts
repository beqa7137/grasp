import { describe, expect, it } from 'vitest';
import { ALGORITHM_CATALOG } from '../algorithms/catalog.js';
import { PATTERN_CATALOG } from './catalog.js';
import { VISUALIZERS_IN_ORDER, nextVisualizer, patternNeighbours } from './roadmap.js';

describe('the roadmap', () => {
  it('gives a pattern its neighbors within its track, and the pattern after it across tracks', () => {
    expect(patternNeighbours('binary-search')).toMatchObject({
      previous: { id: 'sliding-window' },
      next: null,
      following: { id: 'prefix-sum' },
    });
    expect(patternNeighbours('hashing')).toMatchObject({ previous: null, next: { id: 'two-pointers' } });
    expect(patternNeighbours('bitmask-dp')).toMatchObject({ next: null, following: null });
    expect(patternNeighbours('nope')).toEqual({ previous: null, next: null, following: null });
  });

  it('keeps every pattern, in track and roadmap order', () => {
    const ids: string[] = PATTERN_CATALOG.map((p) => p.id);
    const chain: string[] = [PATTERN_CATALOG[0].id];
    while (patternNeighbours(chain.at(-1)!).following) chain.push(patternNeighbours(chain.at(-1)!).following!.id);
    expect(chain).toEqual(ids);
    expect(PATTERN_CATALOG.map((p) => p.order)).toEqual(ids.map((_, i) => i + 1));
  });

  it('orders the visualizers by their pattern and names the next one', () => {
    expect(VISUALIZERS_IN_ORDER).toHaveLength(ALGORITHM_CATALOG.length);
    expect(VISUALIZERS_IN_ORDER[0].id).toBe('two-sum-hash');
    expect(nextVisualizer('dijkstra')?.id).toBe('kruskal-mst');
    expect(nextVisualizer('binary-search')?.id).toBe('subarray-sum-prefix');
    expect(nextVisualizer(VISUALIZERS_IN_ORDER.at(-1)!.id)).toBeNull();
    expect(nextVisualizer('nope')).toBeNull();
  });
});
