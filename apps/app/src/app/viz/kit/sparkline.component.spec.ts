import { linear, sparkPath } from './sparkline.component';

describe('sparkline geometry', () => {
  it('maps linearly and clamps to the range, either way up', () => {
    const y = linear(0, 100, 200, 0);
    expect([y(0), y(50), y(100), y(150), y(-5)]).toEqual([200, 100, 0, 0, 200]);
  });

  it('draws the points up to a cut-off', () => {
    const x = linear(0, 10, 0, 100);
    const y = linear(0, 10, 100, 0);
    const points = [
      [0, 10],
      [5, 5],
      [10, 0],
    ] as const;
    expect(sparkPath(points, x, y)).toBe('M0 0L50 50L100 100');
    expect(sparkPath(points, x, y, 5)).toBe('M0 0L50 50');
  });
});
