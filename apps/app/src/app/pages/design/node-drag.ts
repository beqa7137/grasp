import { signal } from '@angular/core';
import { BOARD, NODE_SIZE, type DesignNode } from '@grasp/engine';
import type { Point } from './viewport';

type Drag =
  | { kind: 'move'; id: string; dx: number; dy: number; startX: number; startY: number; moved: boolean }
  | { kind: 'link'; from: string; x: number; y: number };

/** What a drag on the canvas reads from and asks of the Lab page. */
export interface DragHost {
  nodes(): readonly DesignNode[];
  /** Board point under a pointer. */
  toBoard(e: PointerEvent): Point;
  moveNode(id: string, x: number, y: number): void;
  connect(from: string, to: string): void;
  /** A press on a node that did not move: a tap. */
  tap(node: DesignNode): void;
}

/** Board units a press must travel before it moves the node instead of counting as a tap. */
const MOVE_SLOP = 4;

/**
 * Dragging on the Lab canvas: a node by its body (a press without moving is a tap), or a new link from its port, dropped
 * on the node that should receive the traffic.
 */
export class NodeDrag {
  readonly state = signal<Drag | null>(null);

  constructor(private readonly host: DragHost) {}

  nodeDown(e: PointerEvent, node: DesignNode) {
    const p = this.host.toBoard(e);
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    this.state.set({ kind: 'move', id: node.id, dx: p.x - node.x, dy: p.y - node.y, startX: p.x, startY: p.y, moved: false });
  }

  portDown(e: PointerEvent, node: DesignNode) {
    e.stopPropagation();
    const p = this.host.toBoard(e);
    this.state.set({ kind: 'link', from: node.id, x: p.x, y: p.y });
  }

  move(e: PointerEvent) {
    const d = this.state();
    if (!d) return;
    const p = this.host.toBoard(e);
    if (d.kind === 'link') {
      this.state.set({ ...d, x: p.x, y: p.y });
      return;
    }
    const moved = d.moved || Math.hypot(p.x - d.startX, p.y - d.startY) > MOVE_SLOP;
    if (moved !== d.moved) this.state.set({ ...d, moved });
    if (!moved) return;
    const x = clamp(p.x - d.dx, NODE_SIZE.w / 2, BOARD.w - NODE_SIZE.w / 2);
    const y = clamp(p.y - d.dy, NODE_SIZE.h / 2, BOARD.h - NODE_SIZE.h / 2);
    this.host.moveNode(d.id, Math.round(x), Math.round(y));
  }

  up(e: PointerEvent) {
    const d = this.state();
    this.state.set(null);
    if (!d) return;
    if (d.kind === 'move' && !d.moved) {
      const node = this.host.nodes().find((n) => n.id === d.id);
      if (node) this.host.tap(node);
      return;
    }
    if (d.kind === 'link') {
      const p = this.host.toBoard(e);
      const target = this.host.nodes().find((n) => Math.abs(n.x - p.x) <= NODE_SIZE.w / 2 && Math.abs(n.y - p.y) <= NODE_SIZE.h / 2);
      if (target) this.host.connect(d.from, target.id);
    }
  }

  cancel() {
    this.state.set(null);
  }
}

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}
