import { cacheLayout } from './cache-layout';
import { barAt, meterAt, meterMarks, waffleCells, waffleCounts, waffleLegend } from './cache-view';

describe('cache view', () => {
  const L = cacheLayout(694);

  it('puts each nine one step further along the bar, leaving room past 99.9%', () => {
    const at = [0, 90, 99, 99.9].map((h) => barAt(L.bar, h));
    const step = at[2] - at[1];
    expect(at[1] - at[0]).toBeCloseTo(step, 6);
    expect(at[3] - at[2]).toBeCloseTo(step, 6);
    expect(at[3]).toBeLessThan(L.bar.x1);
  });

  it('draws load and capacity on the meter log scale, with the overload cross at the fill end', () => {
    const m = L.meter;
    expect(meterAt(m, 10)).toBe(m.start);
    expect(meterAt(m, 10_000)).toBe(m.start - m.length);
    const marks = meterMarks(m, 1_000, 1_000);
    expect(marks.fill.height).toBeCloseTo((2 / 3) * m.length, 6);
    expect(marks.capacity[1]).toBeCloseTo(marks.fill.y, 6);
    // The overload × sits at the fill's low end, away from the capacity handle however close the load is to it.
    expect(meterMarks(m, 2_100, 2_000).cross).toBe(`translate(${m.cross} ${m.start - 9})`);
  });

  it('counts 100 requests in whole cells, and says "1 in N" when fewer than 1 in 100 miss', () => {
    expect(waffleCounts(0.1, 0)).toEqual({ hits: 90, answered: 10, lost: 0, oneIn: null });
    expect(waffleCounts(1, 0.8)).toEqual({ hits: 0, answered: 20, lost: 80, oneIn: null });
    expect(waffleCounts(0.005, 0)).toEqual({ hits: 100, answered: 0, lost: 0, oneIn: 200 });
    expect(waffleLegend(waffleCounts(0.01, 0))).toEqual({ hits: '99 hits', misses: '1 miss answered', lost: '0 timing out now' });
    expect(waffleLegend(waffleCounts(0.1, 0)).misses).toBe('10 misses answered');
    expect(waffleLegend(waffleCounts(0.001, 0)).misses).toBe('1 in 1,000 misses');
    expect(waffleLegend(waffleCounts(0.99, 0)).hits).toBe('1 hit');
  });

  it('lays the slowest requests last, so the 99th cell is p99', () => {
    const cells = waffleCells(L.waffle, waffleCounts(0.05, 0.02));
    expect(cells.filter((c) => c.kind === 'hit')).toHaveLength(95);
    expect(cells.slice(95).map((c) => c.kind)).toEqual(['miss', 'miss', 'miss', 'lost', 'lost']);
    expect(waffleCells(L.waffle, waffleCounts(0.01, 0))[98].kind).toBe('hit');
  });
});
