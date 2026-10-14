import { cacheLayout, waffleSide } from './cache-layout';
import { TAG, overlaps } from './focus-layout';

describe('cacheLayout', () => {
  it('keeps one height per layout, whatever the width, and switches to one row from 520px', () => {
    expect(new Set([254, 300, 346, 519].map((w) => cacheLayout(w).height)).size).toBe(1);
    expect(new Set([520, 600, 694].map((w) => cacheLayout(w).height)).size).toBe(1);
    expect(cacheLayout(519).wide).toBe(false);
    expect(cacheLayout(520).wide).toBe(true);
  });

  it.each([254, 346, 520, 694])('keeps every part inside a %ipx stage', (width) => {
    const L = cacheLayout(width);
    const boxes = [
      { x: L.bar.x0, right: L.bar.x1 },
      { x: L.meter.x, right: L.meter.x + L.meter.width },
      { x: L.chart.x, right: L.chart.x + L.chart.width },
      { x: L.waffle.x, right: L.waffle.x + waffleSide(L.waffle) },
      { x: L.readout.x, right: L.readout.x + L.readout.width },
    ];
    for (const b of boxes) {
      expect(b.x).toBeGreaterThanOrEqual(0);
      expect(b.right).toBeLessThanOrEqual(width);
    }
    expect(L.bar.x1 - L.bar.x0).toBeGreaterThan(200);
    expect(L.chart.y + L.chart.height).toBeLessThan(L.height);
    expect(L.readout.width).toBeGreaterThanOrEqual(96);
  });
});

describe('cacheLayout focus outlines', () => {
  it.each([254, 320, 346, 520, 694])(
    'keep each outline whole, cutting no text, and its "Look here" tag off every text at %ipx',
    (width) => {
      const L = cacheLayout(width);
      expect(L.focus.map((f) => f.id)).toEqual(['gauge', 'waffle', 'readout', 'chart']);
      const within = (a: { x: number; y: number; width: number; height: number }, b: typeof a) =>
        a.x >= b.x && a.y >= b.y && a.x + a.width <= b.x + b.width && a.y + a.height <= b.y + b.height;
      for (const f of L.focus) {
        expect(f.x).toBeGreaterThanOrEqual(1);
        expect(f.y).toBeGreaterThanOrEqual(1);
        expect(f.x + f.width).toBeLessThanOrEqual(width - 1);
        expect(f.y + f.height).toBeLessThanOrEqual(L.height - 1);
        const tag = { ...f.tag, width: TAG.width, height: TAG.height };
        expect(tag.y).toBeGreaterThanOrEqual(1);
        expect(tag.y + tag.height).toBeLessThanOrEqual(L.height - 1);
        for (const t of L.texts) {
          expect(overlaps(tag, t), `${f.id} tag on ${JSON.stringify(t)}`).toBe(false);
          expect(within(t, f) || !overlaps(t, f), `${f.id} outline cuts ${JSON.stringify(t)}`).toBe(true);
        }
      }
    },
  );

  it('routes miss dots above the bar, clear of the labels inside it, and the phone drop link clear of the CACHE label', () => {
    for (const width of [254, 694]) {
      const L = cacheLayout(width);
      // The leg that crosses the bar's width runs above it, between its labels and its top edge.
      const legs = L.dots.miss.slice(1).map((p, i) => [L.dots.miss[i], p] as const);
      const across = legs.find(([a, b]) => Math.min(a[0], b[0]) <= L.bar.x0 + 24 && Math.max(a[0], b[0]) >= L.bar.x1)!;
      expect(across[0][1]).toBe(across[1][1]);
      expect(across[0][1]).toBeLessThan(L.bar.top - 3);
      expect(across[0][1]).toBeGreaterThan(L.bar.labelY + 3);
    }
    const narrow = cacheLayout(254);
    expect(narrow.link.in[0][0] + 8).toBeLessThan(narrow.bar.labelX);
  });
});
