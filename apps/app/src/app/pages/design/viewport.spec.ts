import { BOARD, MIN_VIEW_W, clampView, fitView, freeSpot, initialView, panBy, toBoard, zoomAt } from './viewport';

const WIDE = BOARD.h / BOARD.w;
const TALL = 1.3;

describe('design board viewport', () => {
  it('fits the whole board, padding whichever axis the canvas is longer in', () => {
    expect(fitView(WIDE)).toEqual({ x: 0, y: 0, w: 900, h: 480 });
    const tall = fitView(TALL);
    expect(tall.w).toBe(900);
    expect(tall.h).toBeCloseTo(1170);
    expect(tall.y).toBeCloseTo((480 - 1170) / 2);
    const letterbox = fitView(0.4);
    expect(letterbox.h).toBeCloseTo(480);
    expect(letterbox.x).toBeLessThan(0);
  });

  it('zooms around the anchor, keeping the point under the fingers in place', () => {
    const start = fitView(WIDE);
    const anchor = { x: 600, y: 300 };
    const zoomed = zoomAt(start, anchor, 0.5, WIDE);
    expect(zoomed.w).toBe(450);
    expect(zoomed.h).toBeCloseTo(240);
    const before = (anchor.x - start.x) / start.w;
    const after = (anchor.x - zoomed.x) / zoomed.w;
    expect(after).toBeCloseTo(before);
  });

  it('never zooms in past the minimum width or out past the fitted board', () => {
    const view = fitView(WIDE);
    expect(zoomAt(view, { x: 450, y: 240 }, 0.01, WIDE).w).toBe(MIN_VIEW_W);
    expect(zoomAt(view, { x: 450, y: 240 }, 10, WIDE)).toEqual(view);
  });

  it('pans a zoomed view but keeps some of the board on screen', () => {
    const zoomed = zoomAt(fitView(WIDE), { x: 450, y: 240 }, 0.5, WIDE);
    const moved = panBy(zoomed, 100, 0, WIDE);
    expect(moved.x).toBeCloseTo(zoomed.x + 100);
    const far = panBy(zoomed, 5_000, 5_000, WIDE);
    expect(far.x + far.w).toBeLessThanOrEqual(BOARD.w + 80);
    expect(far.y + far.h).toBeLessThanOrEqual(BOARD.h + 80);
    expect(panBy(fitView(WIDE), 300, 0, WIDE)).toEqual(fitView(WIDE));
  });

  it('opens phones at a readable zoom on the left of the design and desktops on the whole board', () => {
    const nodes = [
      { x: 70, y: 240 },
      { x: 360, y: 240 },
      { x: 640, y: 240 },
    ];
    expect(initialView(WIDE, 1000, nodes)).toEqual(fitView(WIDE));
    const phone = initialView(TALL, 358, nodes);
    expect(phone.w).toBeCloseTo(358 * (900 / 760));
    expect(phone.x).toBeLessThanOrEqual(0);
    expect(phone.y + phone.h / 2).toBeCloseTo(240);
    expect(clampView(phone, TALL)).toEqual(phone);
  });

  it('maps screen points to board points', () => {
    const view = { x: 100, y: 50, w: 450, h: 240 };
    const rect = { left: 10, top: 20, width: 900, height: 480 };
    expect(toBoard(view, rect, { x: 10, y: 20 })).toEqual({ x: 100, y: 50 });
    expect(toBoard(view, rect, { x: 460, y: 260 })).toEqual({ x: 325, y: 170 });
  });

  it('drops new components on the nearest free spot, never on top of another one', () => {
    const size = { w: 132, h: 70 };
    const overlaps = (a: { x: number; y: number }, b: { x: number; y: number }) =>
      Math.abs(a.x - b.x) < size.w && Math.abs(a.y - b.y) < size.h;
    expect(freeSpot([], { x: 450, y: 240 }, size)).toEqual({ x: 450, y: 240 });

    const starter = [
      { x: 70, y: 240 },
      { x: 360, y: 240 },
      { x: 640, y: 240 },
    ];
    const placed = [...starter];
    for (let i = 0; i < 12; i++) {
      const spot = freeSpot(placed, { x: 365, y: 240 }, size);
      expect(placed.some((p) => overlaps(p, spot))).toBe(false);
      expect(spot.x).toBeGreaterThanOrEqual(size.w / 2);
      expect(spot.x).toBeLessThanOrEqual(BOARD.w - size.w / 2);
      expect(spot.y).toBeGreaterThanOrEqual(size.h / 2);
      expect(spot.y).toBeLessThanOrEqual(BOARD.h - size.h / 2);
      placed.push(spot);
    }
    expect(Math.hypot(placed[3].x - 365, placed[3].y - 240)).toBeLessThan(size.h + 30);
  });
});
