import { BOARD } from '@grasp/engine';

export { BOARD };

/** The visible part of the design board, in board units (an SVG viewBox). */
export interface ViewBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Point {
  x: number;
  y: number;
}

/** Narrowest view: about 3.5× the fitted zoom on a desktop canvas. */
export const MIN_VIEW_W = 260;
/** How far past the board edge a zoomed-in view may be dragged. */
const MARGIN = 80;
/** Board units per screen pixel on phones: the density of the old fixed-width canvas. */
const PHONE_UNITS_PER_PX = 900 / 760;
const PHONE_MAX_WIDTH_PX = 700;

/** Height ÷ width of the canvas element; the view keeps it so nothing stretches. */
export type Aspect = number;

/** The whole board, centered, with extra space on whichever axis the element is longer in. */
export function fitView(aspect: Aspect): ViewBox {
  const w = Math.max(BOARD.w, BOARD.h / aspect);
  const h = w * aspect;
  return { x: (BOARD.w - w) / 2, y: (BOARD.h - h) / 2, w, h };
}

export function clampView(view: ViewBox, aspect: Aspect): ViewBox {
  const maxW = fitView(aspect).w;
  const w = Math.min(maxW, Math.max(MIN_VIEW_W, view.w));
  const h = w * aspect;
  const axis = (start: number, size: number, board: number) =>
    size >= board ? (board - size) / 2 : Math.min(board + MARGIN - size, Math.max(-MARGIN, start));
  return { x: axis(view.x, w, BOARD.w), y: axis(view.y, h, BOARD.h), w, h };
}

/** Zooms by `factor` (< 1 zooms in) keeping the board point under `anchor` where it is. */
export function zoomAt(view: ViewBox, anchor: Point, factor: number, aspect: Aspect): ViewBox {
  const w = Math.min(fitView(aspect).w, Math.max(MIN_VIEW_W, view.w * factor));
  const scale = w / view.w;
  return clampView({ x: anchor.x - (anchor.x - view.x) * scale, y: anchor.y - (anchor.y - view.y) * scale, w, h: w * aspect }, aspect);
}

export function panBy(view: ViewBox, dx: number, dy: number, aspect: Aspect): ViewBox {
  return clampView({ ...view, x: view.x + dx, y: view.y + dy }, aspect);
}

/** How far to pan, as little as possible, to bring a box into view with `pad` around it. */
export function revealShift(view: ViewBox, box: ViewBox, pad = 12): Point {
  const shift = (start: number, size: number, from: number, to: number) =>
    Math.min(0, from - pad - start) || Math.max(0, to + pad - (start + size));
  return { x: shift(view.x, view.w, box.x, box.x + box.w), y: shift(view.y, view.h, box.y, box.y + box.h) };
}

/** Pans as little as possible to bring a box, such as a component taking keyboard focus, into view. */
export function reveal(view: ViewBox, box: ViewBox, aspect: Aspect, pad = 12): ViewBox {
  const { x: dx, y: dy } = revealShift(view, box, pad);
  return dx || dy ? panBy(view, dx, dy, aspect) : view;
}

/**
 * Where a canvas opens. Wide screens see the whole board; phones start at a readable zoom on the
 * left end of the design (where traffic enters) and pinch out for the rest.
 */
export function initialView(aspect: Aspect, widthPx: number, nodes: Point[]): ViewBox {
  const fit = fitView(aspect);
  if (widthPx >= PHONE_MAX_WIDTH_PX || !nodes.length) return fit;
  const w = Math.min(fit.w, Math.max(MIN_VIEW_W, widthPx * PHONE_UNITS_PER_PX));
  const h = w * aspect;
  const left = Math.min(...nodes.map((n) => n.x)) - 90;
  const middle = nodes.reduce((sum, n) => sum + n.y, 0) / nodes.length;
  return clampView({ x: left, y: middle - h / 2, w, h }, aspect);
}

/**
 * Where a desktop canvas opens (REDESIGN.md 4.6): every node, and every `extra` box drawn around them, in view with `pad`
 * board units of margin, centered, and
 * never magnified past one board unit per screen pixel, so a three-node mission does not open at giant size.
 */
export function fitContent(
  aspect: Aspect,
  widthPx: number,
  nodes: Point[],
  size: { w: number; h: number },
  pad = 40,
  extra: readonly ViewBox[] = [],
): ViewBox {
  if (!nodes.length) return fitView(aspect);
  const boxes = [...nodes.map((n) => ({ x: n.x - size.w / 2, y: n.y - size.h / 2, w: size.w, h: size.h })), ...extra];
  const x0 = Math.min(...boxes.map((b) => b.x)) - pad;
  const x1 = Math.max(...boxes.map((b) => b.x + b.w)) + pad;
  const y0 = Math.min(...boxes.map((b) => b.y)) - pad;
  const y1 = Math.max(...boxes.map((b) => b.y + b.h)) + pad;
  const w = Math.max(x1 - x0, (y1 - y0) / aspect, widthPx, MIN_VIEW_W);
  const h = w * aspect;
  return { x: (x0 + x1) / 2 - w / 2, y: (y0 + y1) / 2 - h / 2, w, h };
}

/** Board point under a screen point, given the canvas element's box. */
export function toBoard(view: ViewBox, rect: { left: number; top: number; width: number; height: number }, client: Point): Point {
  return { x: view.x + ((client.x - rect.left) / rect.width) * view.w, y: view.y + ((client.y - rect.top) / rect.height) * view.h };
}

export const sameView = (a: ViewBox, b: ViewBox) =>
  Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) < 0.5 && Math.abs(a.w - b.w) < 0.5 && Math.abs(a.h - b.h) < 0.5;

/**
 * Where to drop a new component: the free grid spot closest to `near`, so it never lands on top of
 * another one. Candidates sit one component (plus a gap) apart, in growing rings around `near`.
 */
export function freeSpot(taken: readonly Point[], near: Point, size: { w: number; h: number }, gap = 24): Point {
  const within = (p: Point): Point => ({
    x: Math.min(Math.max(p.x, size.w / 2), BOARD.w - size.w / 2),
    y: Math.min(Math.max(p.y, size.h / 2), BOARD.h - size.h / 2),
  });
  const isFree = (p: Point) => taken.every((t) => Math.abs(t.x - p.x) >= size.w + gap || Math.abs(t.y - p.y) >= size.h + gap);
  const step = { x: size.w + gap, y: size.h + gap };
  const rings = Math.ceil(Math.max(BOARD.w / step.x, BOARD.h / step.y));
  for (let ring = 0; ring <= rings; ring++) {
    const candidates: Point[] = [];
    for (let dy = -ring; dy <= ring; dy++) {
      for (let dx = -ring; dx <= ring; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) === ring) candidates.push(within({ x: near.x + dx * step.x, y: near.y + dy * step.y }));
      }
    }
    candidates.sort((a, b) => Math.hypot(a.x - near.x, a.y - near.y) - Math.hypot(b.x - near.x, b.y - near.y));
    const spot = candidates.find(isFree);
    if (spot) return { x: Math.round(spot.x), y: Math.round(spot.y) };
  }
  return within(near);
}
