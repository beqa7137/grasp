import { describe, expect, it } from 'vitest';
import { crosses, curveBetween, roundedPath, routeEdges, type RouteBox } from './route.js';

const box = (id: string, x: number, y: number, w = 148, h = 64): RouteBox => ({ id, x, y, w, h });

describe('routeEdges', () => {
  it('runs straight between two boxes on one row', () => {
    const [r] = routeEdges([box('a', 100, 240), box('b', 400, 240)], [{ from: 'a', to: 'b' }]);
    expect(r.kind).toBe('elbow');
    expect(r.points).toEqual([
      [174, 240],
      [326, 240],
    ]);
    expect(r.d).toBe('M 174 240 L 326 240');
  });

  it('takes an elbow with its lane in the middle of the gap', () => {
    const [r] = routeEdges([box('a', 100, 240), box('b', 400, 100)], [{ from: 'a', to: 'b' }]);
    expect(r.points).toEqual([
      [174, 240],
      [250, 240],
      [250, 100],
      [326, 100],
    ]);
    expect(r.d).toMatch(/^M 174 240 L 240 240 Q 250 240 250 230 L 250 110 Q 250 100 260 100 L 326 100$/);
    expect(r.mid).toEqual([250, 170]);
  });

  it('moves a lane off one another edge already runs along', () => {
    const boxes = [box('a', 100, 240), box('b', 400, 100), box('c', 100, 60), box('d', 400, 380)];
    const [first, second] = routeEdges(boxes, [
      { from: 'a', to: 'b' },
      { from: 'c', to: 'd' },
    ]);
    expect(first.points[1][0]).toBe(250);
    expect(second.kind).toBe('elbow');
    expect(second.points[1][0]).not.toBe(250);
  });

  it('steps around a box in the way, and never through one', () => {
    const boxes = [box('a', 100, 240), box('b', 700, 100), box('mid', 400, 170, 148, 64)];
    const [r] = routeEdges(boxes, [{ from: 'a', to: 'b' }]);
    expect(r.kind).toBe('elbow');
    const segs = r.points.slice(1).map((b, i) => ({ a: r.points[i], b }));
    expect(segs.some((s) => crosses(s, boxes[2], 10))).toBe(false);
  });

  it('falls back to the curve when no clear lane exists', () => {
    const wall = Array.from({ length: 9 }, (_, i) => box(`w${i}`, 250, 20 + i * 60, 140, 60));
    const [r] = routeEdges([box('a', 60, 240, 100, 64), box('b', 440, 100, 100, 64), ...wall], [{ from: 'a', to: 'b' }]);
    expect(r.kind).toBe('curve');
    expect(r.d).toMatch(/^M 110 240 C /);
    expect(r.points[0]).toEqual([110, 240]);
    expect(r.points.at(-1)).toEqual([390, 100]);
  });

  it('joins a box below in the same column top to bottom', () => {
    const [r] = routeEdges([box('a', 760, 240), box('b', 760, 380)], [{ from: 'a', to: 'b' }]);
    expect(r.points).toEqual([
      [760, 272],
      [760, 348],
    ]);
  });

  it('loops a backward edge under both boxes', () => {
    const [r] = routeEdges([box('a', 700, 240), box('b', 300, 240)], [{ from: 'a', to: 'b' }]);
    expect(r.kind).toBe('elbow');
    expect(r.points).toEqual([
      [700, 272],
      [700, 292],
      [300, 292],
      [300, 272],
    ]);
  });

  it('enters a target close beside it from its top, never through its own side', () => {
    const [up] = routeEdges([box('app', 620, 240), box('cache', 770, 100)], [{ from: 'app', to: 'cache' }]);
    expect(up.points).toEqual([
      [694, 240],
      [770, 240],
      [770, 132],
    ]);
    for (const dy of [0, 20, 41]) {
      const [r] = routeEdges([box('a', 620, 240), box('b', 770, 240 - dy)], [{ from: 'a', to: 'b' }], {
        bounds: { x0: 0, y0: 0, x1: 1060, y1: 480 },
      });
      const through = r.points
        .slice(1)
        .some((p, i) => crosses({ a: r.points[i], b: p }, { id: 'b', x: 770 + 0, y: 240 - dy, w: 140, h: 56 }, 0));
      expect(through, `dy ${dy}`).toBe(false);
    }
  });

  it('keeps every elbow inside the bounds, and never enters where another edge leaves', () => {
    const boxes = [box('a', 700, 440), box('b', 300, 440), box('c', 700, 300)];
    const [r] = routeEdges(boxes.slice(0, 2), [{ from: 'a', to: 'b' }], { bounds: { x0: 0, y0: 0, x1: 1060, y1: 480 } });
    for (const [, y] of r.points) expect(y).toBeLessThanOrEqual(480);
    const [out, into] = routeEdges(
      [box('db', 700, 240), box('rep', 700, 400), box('cache', 560, 100)],
      [
        { from: 'db', to: 'rep' },
        { from: 'cache', to: 'db' },
      ],
    );
    expect(into.points.at(-1)).not.toEqual(out.points[0]);
  });

  it('skips edges to boxes that are not on the board', () => {
    expect(routeEdges([box('a', 0, 0)], [{ from: 'a', to: 'gone' }])).toEqual([]);
  });
});

describe('curveBetween, the fallback the board drew before routing', () => {
  const SIZE = { w: 132, h: 70 };
  const b = (x: number, y: number): RouteBox => ({ id: `${x},${y}`, x, y, ...SIZE });
  const d = (c: ReturnType<typeof curveBetween>) => `M ${c[0].join(' ')} C ${c[1].join(' ')}, ${c[2].join(' ')}, ${c[3].join(' ')}`;

  it('curves from the right side to the left side when the target is to the right', () => {
    expect(d(curveBetween(b(100, 240), b(300, 240), 480))).toBe('M 166 240 C 206 240, 194 240, 234 240');
  });

  it('joins facing top and bottom when the target is in the same column', () => {
    expect(d(curveBetween(b(790, 240), b(790, 100), 480))).toBe('M 790 205 C 790 170, 790 170, 790 135');
    expect(d(curveBetween(b(790, 100), b(800, 240), 480))).toBe('M 790 135 C 790 170, 800 170, 800 205');
  });

  it('loops under both nodes when the target is to the left, staying on the board', () => {
    expect(d(curveBetween(b(790, 240), b(370, 240), 480))).toBe('M 790 275 C 790 325, 370 325, 370 275');
    expect(d(curveBetween(b(790, 380), b(370, 400), 480))).toBe('M 790 415 C 790 480, 370 480, 370 435');
  });
});

describe('roundedPath', () => {
  it('never rounds a corner by more than half of a run beside it', () => {
    expect(
      roundedPath(
        [
          [0, 0],
          [8, 0],
          [8, 40],
        ],
        10,
      ),
    ).toBe('M 0 0 L 4 0 Q 8 0 8 4 L 8 40');
  });
});
