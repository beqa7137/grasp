import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, input, model } from '@angular/core';
import { haptic } from '../../core/haptics';

/** The snap nearest a pointer at `at` px along the track. */
export function nearestIndex(positions: readonly number[], at: number): number {
  let best = 0;
  for (let i = 1; i < positions.length; i++) if (Math.abs(positions[i] - at) < Math.abs(positions[best] - at)) best = i;
  return best;
}

/** Half the 44px hit area, which is centred on the handle's point. */
const HALF = 22;

const KEY_STEP: Record<string, number> = { ArrowRight: 1, ArrowUp: 1, PageUp: 1, ArrowLeft: -1, ArrowDown: -1, PageDown: -1 };

/**
 * A handle on the drawing (REDESIGN.md 3.3), in place of a range input: a `role="slider"` that snaps to `values`, drawn at
 * `positions` (px along `axis` in its positioned parent, the stage) and at `cross` px on the other axis. It tracks the
 * pointer snap by snap, steps with the arrow keys, and names its value in words through `valuetext`. A `ghost` handle
 * draws dashed: a target the picture has not reached yet. A `disabled` one stays focusable and named but takes no input.
 */
@Component({
  selector: 'g-handle',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    role: 'slider',
    tabindex: '0',
    '[attr.aria-label]': 'label()',
    '[attr.aria-valuemin]': 'values()[0]',
    '[attr.aria-valuemax]': 'values()[values().length - 1]',
    '[attr.aria-valuenow]': 'value()',
    '[attr.aria-valuetext]': 'valuetext()',
    '[attr.aria-orientation]': "axis() === 'x' ? 'horizontal' : 'vertical'",
    '[class.y]': "axis() === 'y'",
    '[class.ghost]': 'ghost()',
    '[class.dot]': "knob() === 'dot'",
    '[class.ring]': "knob() === 'ring'",
    '[class.disabled]': 'disabled()',
    '[attr.aria-disabled]': "disabled() ? 'true' : null",
    '[style.transform]': 'transform()',
    '(keydown)': 'key($event)',
    '(pointerdown)': 'down($event)',
    '(pointermove)': 'move($event)',
    '(pointerup)': 'up($event)',
    '(pointercancel)': 'up($event)',
  },
  template: `<span class="knob" aria-hidden="true"></span>`,
  styles: `
    :host {
      position: absolute;
      left: 0;
      top: 0;
      width: 44px;
      height: 44px;
      display: grid;
      place-items: center;
      cursor: ew-resize;
      touch-action: none;
      outline: none;
      z-index: 1;
    }
    :host(.y) {
      cursor: ns-resize;
    }
    .knob {
      width: 14px;
      height: 30px;
      border-radius: var(--g-radius-pill);
      background: var(--g-raised);
      border: 2px solid var(--g-accent);
      box-shadow: var(--g-shadow-raised);
    }
    :host(.y) .knob {
      width: 30px;
      height: 14px;
    }
    :host(.ghost) .knob {
      border-style: dashed;
      background: var(--g-viz-stage);
    }
    :host(.dot) .knob {
      width: 18px;
      height: 18px;
    }
    :host(.ring) .knob {
      width: 28px;
      height: 28px;
      background: transparent;
      box-shadow: none;
    }
    :host(.disabled) {
      cursor: default;
      opacity: 0.45;
    }
    :host(:focus-visible) .knob {
      outline: var(--g-focus-ring);
      outline-offset: 3px;
    }
  `,
})
export class HandleComponent {
  readonly values = input.required<readonly number[]>();
  readonly value = model.required<number>();
  readonly positions = input.required<readonly number[]>();
  readonly axis = input<'x' | 'y'>('x');
  readonly cross = input.required<number>();
  readonly label = input.required<string>();
  readonly valuetext = input.required<string>();
  readonly ghost = input(false);
  /** A pill along the track, a round knob for a scrubber, or a ring around a mark the drawing already shows. */
  readonly knob = input<'pill' | 'dot' | 'ring'>('pill');
  /** Shown but inert, while the picture plays something these numbers are about. */
  readonly disabled = input(false);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private dragging = false;

  readonly index = computed(() => Math.max(0, this.values().indexOf(this.value())));
  readonly transform = computed(() => {
    const along = this.positions()[this.index()] ?? 0;
    const [x, y] = this.axis() === 'x' ? [along, this.cross()] : [this.cross(), along];
    return `translate(${x - HALF}px, ${y - HALF}px)`;
  });

  key(event: KeyboardEvent) {
    if (this.disabled()) return;
    const last = this.values().length - 1;
    const to = event.key === 'Home' ? 0 : event.key === 'End' ? last : event.key in KEY_STEP ? this.index() + KEY_STEP[event.key] : null;
    if (to === null) return;
    event.preventDefault();
    this.select(Math.min(last, Math.max(0, to)));
  }

  down(event: PointerEvent) {
    if (event.button !== 0 || this.disabled()) return;
    event.preventDefault();
    this.dragging = true;
    this.host.focus();
    this.host.setPointerCapture?.(event.pointerId);
    haptic.selectStart();
  }

  move(event: PointerEvent) {
    if (!this.dragging) return;
    const frame = (this.host.offsetParent ?? this.host.parentElement)!.getBoundingClientRect();
    const at = this.axis() === 'x' ? event.clientX - frame.left : event.clientY - frame.top;
    this.select(nearestIndex(this.positions(), at));
  }

  up(event: PointerEvent) {
    if (!this.dragging) return;
    this.dragging = false;
    this.host.releasePointerCapture?.(event.pointerId);
    haptic.selectEnd();
  }

  private select(index: number) {
    const next = this.values()[index];
    if (next === this.value()) return;
    this.value.set(next);
    haptic.select();
  }
}
