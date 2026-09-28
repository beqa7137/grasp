import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { streamWindows, type StreamEvent, type WindowKind } from '@grasp/engine';
import { RovingSelectDirective } from '../../core/roving-select.directive';

const EVENTS: StreamEvent[] = [
  { at: 1, arrives: 1 },
  { at: 3, arrives: 4 },
  { at: 6, arrives: 6 },
  { at: 8, arrives: 15 },
  { at: 12, arrives: 12 },
  { at: 14, arrives: 14 },
  { at: 17, arrives: 18 },
  { at: 21, arrives: 21 },
  { at: 23, arrives: 31 },
  { at: 27, arrives: 27 },
  { at: 33, arrives: 33 },
  { at: 36, arrives: 37 },
];
const SPAN = 40;
const W = 320;
const KINDS: { kind: WindowKind; label: string }[] = [
  { kind: 'tumbling', label: 'Tumbling' },
  { kind: 'sliding', label: 'Sliding' },
  { kind: 'session', label: 'Session' },
];

const x = (s: number) => (Math.min(Math.max(s, 0), SPAN) / SPAN) * W;

/** Twelve events on an event-time line: pick a window kind, its size and the watermark delay, and see what is counted. */
@Component({
  selector: 'app-stream-widget',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RovingSelectDirective],
  template: `
    <div class="controls" role="radiogroup" aria-label="Window kind">
      @for (k of kinds; track k.kind) {
        <button
          class="g-btn"
          role="radio"
          [attr.aria-checked]="kind() === k.kind"
          [class.primary]="kind() === k.kind"
          (click)="kind.set(k.kind)"
        >
          {{ k.label }}
        </button>
      }
    </div>
    <label class="slider">
      <span
        >{{ kind() === 'session' ? 'Session gap' : 'Window size' }} <strong class="mono">{{ size() }} s</strong
        >{{ kind() === 'sliding' ? ', sliding every ' + size() / 2 + ' s' : '' }}</span
      >
      <input type="range" min="5" max="20" step="5" [value]="size()" (input)="size.set(+$any($event.target).value)" />
    </label>
    <label class="slider">
      <span
        >Watermark delay <strong class="mono">{{ delay() }} s</strong></span
      >
      <input type="range" min="0" max="10" step="1" [value]="delay()" (input)="delay.set(+$any($event.target).value)" />
    </label>

    <svg [attr.viewBox]="'-6 -14 ' + (w + 12) + ' ' + (height() + 24)" role="img" [attr.aria-label]="summary()">
      <line class="axis" x1="0" y1="0" [attr.x2]="w" y2="0" />
      @for (t of ticks; track t) {
        <text class="tick" [attr.x]="t.x" y="-5" text-anchor="middle">{{ t.label }}</text>
      }
      @for (e of dots(); track e.n) {
        <circle [attr.cx]="e.x" cy="10" r="4.5" [class.late]="e.late" [class.delayed]="e.delayed" />
      }
      @for (win of bands(); track $index) {
        <rect class="band" [attr.x]="win.x" [attr.y]="win.y" [attr.width]="win.width" height="16" rx="4" />
        <text class="count" [attr.x]="win.x + win.width / 2" [attr.y]="win.y + 12" text-anchor="middle">{{ win.count }}</text>
      }
    </svg>
    <p class="legend muted">
      <span class="item"><span class="dot"></span>on time</span>
      <span class="item"><span class="dot delayed"></span>arrived late, still counted</span>
      <span class="item"><span class="dot late"></span>dropped</span>
    </p>

    <dl class="readouts" aria-live="polite">
      <div>
        <dt>Windows</dt>
        <dd class="mono">{{ run().windows.length }}</dd>
      </div>
      <div [class.bad]="run().late.length > 0">
        <dt>Dropped</dt>
        <dd class="word">{{ dropped() }}</dd>
      </div>
    </dl>
  `,
  styleUrl: './widget.scss',
  styles: `
    svg {
      margin-bottom: 4px;
    }
    circle {
      fill: var(--g-found);
      stroke: none;
      &.delayed {
        fill: var(--g-warn);
      }
      &.late {
        fill: var(--g-danger);
      }
    }
    .band {
      fill: var(--g-accent-soft);
      stroke: var(--g-accent);
      stroke-width: 1;
    }
    .count {
      fill: var(--g-text);
      font: 600 10px var(--g-font-mono);
    }
    .legend .item {
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    .dot {
      display: inline-block;
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--g-found);
      &.delayed {
        background: var(--g-warn);
      }
      &.late {
        background: var(--g-danger);
      }
    }
  `,
})
export class StreamWidgetComponent {
  readonly w = W;
  readonly kinds = KINDS;
  readonly ticks = [0, 10, 20, 30, 40].map((s) => ({ x: x(s), label: `${s}s` }));
  readonly kind = signal<WindowKind>('tumbling');
  readonly size = signal(10);
  readonly delay = signal(2);
  readonly run = computed(() => streamWindows(EVENTS, this.kind(), this.size(), this.delay(), this.size() / 2));
  readonly dots = computed(() => {
    const late = new Set(this.run().late);
    return EVENTS.map((e, n) => ({ n, x: x(e.at), late: late.has(n), delayed: !late.has(n) && e.arrives > e.at + 1 }));
  });
  // Overlapping sliding windows alternate between two rows so each stays readable.
  readonly bands = computed(() =>
    this.run().windows.map((win, i) => ({
      x: x(win.start),
      width: x(win.end) - x(win.start),
      y: 24 + (this.kind() === 'sliding' ? (i % 2) * 20 : 0),
      count: win.events.length,
    })),
  );
  readonly height = computed(() => (this.kind() === 'sliding' ? 64 : 44));
  readonly dropped = computed(() => {
    const late = this.run().late;
    return late.length ? late.map((i) => `event at ${EVENTS[i].at} s`).join(', ') : 'none';
  });
  readonly summary = computed(
    () =>
      `${this.run().windows.length} windows with ${this.run()
        .windows.map((w) => w.events.length)
        .join(', ')} events; ${this.run().late.length} dropped.`,
  );
}
