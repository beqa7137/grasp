import { calloutSize, placeCallouts, type PxBox } from './callouts';

const nodes = (entries: [string, PxBox][]) => new Map(entries);

describe('placeCallouts', () => {
  it('pins a callout under its node, centered and inside the canvas', () => {
    const [c] = placeCallouts([{ nodeId: 'app', text: 'Overloaded' }], nodes([['app', { x: 100, y: 100, w: 148, h: 64 }]]), {
      w: 800,
      h: 400,
    });
    expect(c.side).toBe('below');
    expect(c.y).toBe(172);
    expect(c.x + c.w / 2).toBeCloseTo(174);
  });

  it('goes over the node when the space under it is taken, and is left out when neither side is free', () => {
    const map = nodes([
      ['app', { x: 100, y: 100, w: 148, h: 64 }],
      ['db', { x: 100, y: 180, w: 148, h: 64 }],
      ['cache', { x: 100, y: 10, w: 148, h: 64 }],
    ]);
    const [over] = placeCallouts([{ nodeId: 'db', text: 'Hot' }], map, { w: 800, h: 260 });
    expect(over).toBeUndefined();
    const placed = placeCallouts([{ nodeId: 'cache', text: 'Hot' }], map, { w: 800, h: 400 });
    expect(placed).toEqual([]);
  });

  it('keeps one callout per node, the first given, and never lets two overlap', () => {
    const map = nodes([
      ['a', { x: 0, y: 0, w: 148, h: 64 }],
      ['b', { x: 60, y: 0, w: 148, h: 64 }],
    ]);
    const placed = placeCallouts(
      [
        { nodeId: 'a', text: 'First' },
        { nodeId: 'a', text: 'Second' },
        { nodeId: 'b', text: 'Other' },
      ],
      map,
      { w: 400, h: 400 },
    );
    expect(placed.map((p) => p.text)).toEqual(['First']);
  });

  it('wraps long text at the widest a callout grows', () => {
    expect(calloutSize('x'.repeat(80))).toEqual({ w: 220, h: 66 });
  });
});
