import { BOARD, MIN_VIEW_W, clampView, fitContent, fitView, freeSpot, initialView, panBy, reveal, toBoard, zoomAt } from './viewport';

const WIDE = BOARD.h / BOARD.w;
const TALL = 1.3;

describe('design board viewport', () => {
  it('fits the whole board, padding whichever axis the canvas is longer in', () => {
    expect(fitView(WIDE)).toEqual({ x: 0, y: 0, w: BOARD.w, h: BOARD.h });
    const tall = fitView(TALL);
    expect(tall.w).toBe(BOARD.w);
    expect(tall.h).toBeCloseTo(BOARD.w * TALL);
    expect(tall.y).toBeCloseTo((BOARD.h - BOARD.w * TALL) / 2);
    const letterbox = fitView(0.3);
    expect(letterbox.h).toBeCloseTo(BOARD.h);
    expect(letterbox.x).toBeLessThan(0);
  });

  it('zooms around the anchor, keeping the point under the fingers in place', () => {
    const start = fitView(WIDE);
    const anchor = { x: 600, y: 300 };
    const zoomed = zoomAt(start, anchor, 0.5, WIDE);
    expect(zoomed.w).toBe(BOARD.w / 2);
    expect(zoomed.h).toBeCloseTo(BOARD.h / 2);
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

  it('pans just enough to reveal a component that takes focus off screen, and leaves a visible one alone', () => {
    const zoomed = zoomAt(fitView(WIDE), { x: 200, y: 240 }, 0.4, WIDE);
    const offRight = { x: zoomed.x + zoomed.w + 100, y: zoomed.y + 20, w: 132, h: 70 };
    const shown = reveal(zoomed, offRight, WIDE);
    expect(shown.w).toBe(zoomed.w);
    expect(shown.x + shown.w).toBeCloseTo(offRight.x + offRight.w + 12);
    expect(shown.y).toBe(zoomed.y);
    const inside = { x: zoomed.x + 30, y: zoomed.y + 30, w: 50, h: 20 };
    expect(reveal(zoomed, inside, WIDE)).toBe(zoomed);
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

  it('fits desktops to the design, never past one unit a pixel, with every node inside', () => {
    const size = { w: 148, h: 64 };
    const nodes = [
      { x: 90, y: 240 },
      { x: 990, y: 100 },
      { x: 990, y: 390 },
    ];
    const view = fitContent(WIDE, 600, nodes, size);
    for (const n of nodes) {
      expect(n.x - size.w / 2).toBeGreaterThanOrEqual(view.x);
      expect(n.x + size.w / 2).toBeLessThanOrEqual(view.x + view.w);
      expect(n.y - size.h / 2).toBeGreaterThanOrEqual(view.y);
      expect(n.y + size.h / 2).toBeLessThanOrEqual(view.y + view.h);
    }
    expect(view.h / view.w).toBeCloseTo(WIDE);
    const small = fitContent(WIDE, 1000, nodes.slice(0, 1), size);
    expect(small.w).toBe(1000);
    expect(small.x + small.w / 2).toBe(90);
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
