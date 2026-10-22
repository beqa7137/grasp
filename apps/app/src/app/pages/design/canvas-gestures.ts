import type { WritableSignal } from '@angular/core';
import { type Point, type ViewBox, panBy, toBoard, zoomAt } from './viewport';

/** Screen pixels a background drag must travel before it pans instead of counting as a tap. */
const PAN_SLOP_PX = 6;

type Gesture =
  | { kind: 'pan'; id: number; start: Point; view: ViewBox; moved: boolean }
  | { kind: 'pinch'; ids: [number, number]; distance: number; mid: Point; view: ViewBox };

/**
 * Panning and pinching the Lab canvas by its background: one pointer pans once it moves past the slop (a tap without
 * moving reaches `onTap`), two pinch about their midpoint, and Ctrl or ⌘ with the wheel zooms where the pointer is.
 */
export class CanvasGestures {
  private readonly pointers = new Map<number, Point>();
  private gesture: Gesture | null = null;

  constructor(
    private readonly view: WritableSignal<ViewBox>,
    private readonly aspect: () => number,
    private readonly rect: () => DOMRect,
    private readonly onTap: () => void,
  ) {}

  has(id: number): boolean {
    return this.pointers.has(id);
  }

  down(e: PointerEvent): void {
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    this.start();
  }

  move(e: PointerEvent): void {
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = this.gesture;
    if (!g) return;
    const rect = this.rect();
    if (g.kind === 'pan') {
      const p = this.pointers.get(g.id);
      if (!p) return;
      g.moved ||= Math.hypot(p.x - g.start.x, p.y - g.start.y) > PAN_SLOP_PX;
      if (!g.moved) return;
      const scale = g.view.w / rect.width;
      this.view.set(panBy(g.view, (g.start.x - p.x) * scale, (g.start.y - p.y) * scale, this.aspect()));
      return;
    }
    const a = this.pointers.get(g.ids[0]);
    const b = this.pointers.get(g.ids[1]);
    if (!a || !b) return;
    const distance = Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const zoomed = zoomAt(g.view, toBoard(g.view, rect, g.mid), g.distance / distance, this.aspect());
    const scale = zoomed.w / rect.width;
    this.view.set(panBy(zoomed, (g.mid.x - mid.x) * scale, (g.mid.y - mid.y) * scale, this.aspect()));
  }

  end(e: PointerEvent, cancelled: boolean): void {
    this.pointers.delete(e.pointerId);
    const g = this.gesture;
    if (!cancelled && g?.kind === 'pan' && !g.moved && this.pointers.size === 0) this.onTap();
    // Lifting one finger of a pinch continues as a pan with the other.
    this.start();
    if (this.gesture?.kind === 'pan') this.gesture.moved = true;
  }

  wheel(e: WheelEvent): void {
    // Trackpad pinches arrive as ctrl+wheel; a plain wheel keeps scrolling the page.
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    const factor = Math.min(1.25, Math.max(0.8, Math.exp(e.deltaY * 0.005)));
    this.view.set(zoomAt(this.view(), toBoard(this.view(), this.rect(), { x: e.clientX, y: e.clientY }), factor, this.aspect()));
  }

  private start(): void {
    const [a, b] = [...this.pointers.entries()];
    if (a && b) {
      this.gesture = {
        kind: 'pinch',
        ids: [a[0], b[0]],
        distance: Math.max(1, Math.hypot(a[1].x - b[1].x, a[1].y - b[1].y)),
        mid: { x: (a[1].x + b[1].x) / 2, y: (a[1].y + b[1].y) / 2 },
        view: this.view(),
      };
    } else if (a) {
      this.gesture = { kind: 'pan', id: a[0], start: a[1], view: this.view(), moved: false };
    } else {
      this.gesture = null;
    }
  }
}
