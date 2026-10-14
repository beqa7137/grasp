import { MARK_R, crosses, legendLines, markerXs, placeEventLabels } from './timeline-layout';

describe('timeline label layout', () => {
  it('tells whether a segment passes through a box', () => {
    const box = { x: 10, y: 10, width: 20, height: 10 };
    expect(crosses({ x: 0, y: 15 }, { x: 40, y: 15 }, box)).toBe(true);
    expect(crosses({ x: 0, y: 0 }, { x: 40, y: 5 }, box)).toBe(false);
    expect(crosses({ x: 20, y: 0 }, { x: 20, y: 100 }, box)).toBe(true);
  });

  it('wraps a legend into as many lines as its labels need', () => {
    const labels = ['has your write', 'your reads go to the primary', 'without your write', 'a read here is stale'];
    expect(legendLines(labels, 1000)).toBe(1);
    expect(legendLines(labels, 240)).toBeGreaterThanOrEqual(3);
  });

  const lanes = [
    { id: 'you', label: 'You' },
    { id: 'replica', label: 'Replica' },
  ];
  const geometry = (messages: { from: { lane: string; at: number }; to: { lane: string; at: number } }[], gutter = 0) => ({
    lanes,
    x: (at: number) => 16 + gutter + at / 10,
    laneY: (lane: string) => (lane === 'you' ? 36 : 104),
    messages,
    width: 300 + gutter,
    pad: 16,
    row: { label: 13, line: 36, events: 62 },
    gutter,
  });
  const box = (e: { labelX: number; labelY: number; labelWidth: number }) => ({
    x: e.labelX,
    y: e.labelY - 11,
    width: e.labelWidth,
    height: 14,
  });
  const overlap = (a: ReturnType<typeof box>, b: ReturnType<typeof box>) =>
    a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

  it('keeps every event label off every message and every other label, right by its marker', () => {
    const messages = [
      { from: { lane: 'you', at: 0 }, to: { lane: 'replica', at: 800 } },
      { from: { lane: 'you', at: 100 }, to: { lane: 'replica', at: 100 } },
    ];
    const g = geometry(messages);
    const placed = placeEventLabels(
      [
        { lane: 'you', at: 0, label: 'write' },
        { lane: 'you', at: 100, label: 'read, 100 ms' },
        { lane: 'replica', at: 800, label: 'applies it, 800 ms' },
        { lane: 'replica', at: 100, label: 'old value' },
      ],
      g,
    );
    for (const [i, e] of placed.entries()) {
      for (const m of messages)
        expect(crosses({ x: g.x(m.from.at), y: g.laneY(m.from.lane) }, { x: g.x(m.to.at), y: g.laneY(m.to.lane) }, box(e)), e.label).toBe(
          false,
        );
      for (const o of placed.slice(i + 1)) expect(overlap(box(e), box(o)), `${e.label} on ${o.label}`).toBe(false);
      expect(Math.abs(e.labelX + e.labelWidth / 2 - e.x)).toBeLessThanOrEqual(e.labelWidth / 2 + 80);
    }
  });

  it('puts lane labels in the gutter beside their lines, and event labels right of it', () => {
    const placed = placeEventLabels([{ lane: 'you', at: 0, label: 'write' }], geometry([], 60));
    expect(placed[0].labelX).toBeGreaterThanOrEqual(64);
  });

  it('draws markers close in time side by side, around the time they share', () => {
    const g = geometry([]);
    const xs = markerXs(
      [
        { lane: 'replica', at: 800 },
        { lane: 'replica', at: 800 },
        { lane: 'you', at: 800 },
      ],
      g,
    );
    expect(xs[1] - xs[0]).toBeGreaterThanOrEqual(2 * MARK_R);
    expect((xs[0] + xs[1]) / 2).toBeCloseTo(g.x(800));
    expect(xs[2]).toBe(g.x(800));
  });
});
