import { computed, signal } from '@angular/core';
import { BOARD, NODE_SIZE } from '@grasp/engine';
import { type ViewBox, clampView, fitContent, fitView, initialView, reveal, revealShift, sameView, zoomAt } from './viewport';

/** Where the desktop Lab starts (REDESIGN.md 4.6): the tool column, the fitted canvas with its floating inspector, and the dock. */
const DESKTOP = '(min-width: 1024px)';
const ZOOM_STEP = 1.35;
/** The floating inspector's width plus its margins, in screen pixels: the canvas keeps a selected node clear of it. */
export const INSPECTOR_PX = 344;
/**
 * The smallest zoom the canvas refits to beside the inspector. Lower keeps more designs whole beside it, so every node
 * stays clickable; higher keeps text larger. At 0.75 secondary text, grown by `textScale`, stays about 10px or more.
 */
const MIN_FIT_SCALE = 0.75;
/** The most secondary text grows, so it still fits the node's fixed box. */
const MAX_TEXT_SCALE = 1.35;

/** What the canvas must show on open: the nodes, and the boxes of what is drawn around them (edges, callouts, the handle). */
export interface LabContent {
  nodes: { x: number; y: number }[];
  /** The routed edges' boxes. */
  extra: ViewBox[];
  /** Room for what is laid over the drawing: callouts and the Traffic handle. */
  labels: ViewBox[];
}

/**
 * The Lab canvas's view of the board: its size, the layout (desktop from 1024px), the view it opens on and returns to
 * with Fit, zooming, and keeping a selection clear of the floating inspector.
 */
export class LabView {
  readonly view = signal<ViewBox>(fitView(BOARD.h / BOARD.w));
  readonly viewBox = computed(() => {
    const v = this.view();
    return `${v.x} ${v.y} ${v.w} ${v.h}`;
  });
  /** The canvas's size in screen pixels, for what is laid over it. */
  readonly size = signal({ w: 0, h: 0 });
  readonly floating = signal(typeof matchMedia === 'function' && matchMedia(DESKTOP).matches);
  /** How much the drawing's secondary text grows so it stays about 11px on screen when the view is zoomed out. */
  readonly textScale = computed(() => {
    const { w } = this.size();
    return w && this.floating() ? Math.min(MAX_TEXT_SCALE, Math.max(1, this.view().w / w)) : 1;
  });
  /** Where the canvas opens and Fit returns: fitted to the design on desktop, as before under 1024px. */
  readonly home = computed(() => {
    const { w, h } = this.size();
    const aspect = w && h ? h / w : this.aspect;
    const { nodes, extra, labels } = this.content();
    return this.floating() ? fitContent(aspect, w, nodes, NODE_SIZE, 16, [...extra, ...labels]) : initialView(aspect, w, nodes);
  });
  readonly zoomedIn = computed(() => !sameView(this.view(), this.floating() ? this.home() : fitView(this.aspect)));
  aspect = BOARD.h / BOARD.w;
  private placed = false;

  constructor(
    private readonly content: () => LabContent,
    private readonly ready: () => boolean,
  ) {}

  /** Follows the desktop breakpoint; the next resize places the view again. Returns the disposer. */
  watchLayout(): () => void {
    const desktop = typeof matchMedia === 'function' ? matchMedia(DESKTOP) : null;
    const change = () => {
      this.floating.set(!!desktop?.matches);
      this.placed = false;
    };
    desktop?.addEventListener('change', change);
    return () => desktop?.removeEventListener('change', change);
  }

  resize(width: number, height: number) {
    if (!width || !height) return;
    this.aspect = height / width;
    this.size.set({ w: width, h: height });
    if (!this.placed) {
      this.place();
      return;
    }
    const v = this.view();
    const h = v.w * this.aspect;
    this.view.set(clampView({ x: v.x, y: v.y + (v.h - h) / 2, w: v.w, h }, this.aspect));
  }

  /** Opens each design at its home view once both the design and the canvas size are known. */
  place() {
    if (this.placed || !this.ready() || !this.size().w) return;
    this.placed = true;
    this.view.set(this.home());
  }

  unplace() {
    this.placed = false;
  }

  zoom(direction: 1 | -1) {
    const v = this.view();
    this.view.set(zoomAt(v, { x: v.x + v.w / 2, y: v.y + v.h / 2 }, direction > 0 ? 1 / ZOOM_STEP : ZOOM_STEP, this.aspect));
  }

  fit() {
    this.view.set(this.floating() ? this.home() : fitView(this.aspect));
  }

  /** Pans as little as possible to bring a box into view. */
  reveal(box: ViewBox) {
    this.view.set(reveal(this.view(), box, this.aspect));
  }

  /**
   * When the floating inspector would cover a node, the design refits into the canvas left of it, so every node stays in
   * reach (the callouts' room is left out here, since a callout that does not fit is simply not pinned); where that would
   * shrink it past `MIN_FIT_SCALE` (a wide design at 1024px), only the selection pans clear. The
   * pan is not clamped to the board, since the board's edge may sit under the inspector.
   */
  keepClear(selection: ViewBox) {
    const v = this.view();
    const { w: width } = this.size();
    const region = width - INSPECTOR_PX;
    const scale = width / v.w;
    if (region < 240) return;
    const { nodes, extra } = this.content();
    if (nodes.every((n) => (n.x + NODE_SIZE.w / 2 - v.x) * scale <= region)) return;
    const fit = fitContent((this.aspect * width) / region, region, nodes, NODE_SIZE, 16, extra);
    if (region / fit.w >= MIN_FIT_SCALE) {
      this.view.set({ x: fit.x, y: fit.y, w: (fit.w * width) / region, h: fit.h });
      return;
    }
    const shift = revealShift({ ...v, w: v.w - INSPECTOR_PX / scale }, selection);
    if (shift.x || shift.y) this.view.set({ ...v, x: v.x + shift.x, y: v.y + shift.y });
  }
}
