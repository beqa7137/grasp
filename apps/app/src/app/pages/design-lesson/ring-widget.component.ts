import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { hash32, hashRing, moduloOwner, movedKeys, place, ringOwner } from '@grasp/engine';
import { RovingSelectDirective } from '../../core/roving-select.directive';

const KEYS = Array.from({ length: 200 }, (_, i) => `user:${i}`);
const NAMES = ['A', 'B', 'C', 'D', 'E', 'F'];
const COLORS = ['--g-accent', '--g-kind-cache', '--g-kind-lb', '--g-kind-replica', '--g-kind-worker', '--g-predict'];
const R = 110;
const TURN = 2 ** 32;

type Mode = 'ring' | 'modulo';

const angle = (at: number) => (at / TURN) * 2 * Math.PI - Math.PI / 2;

/** 200 keys on four to six nodes: add or remove a node and count the keys that move, by consistent hashing or hash mod N. */
@Component({
  selector: 'app-ring-widget',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RovingSelectDirective],
  template: `
    <div class="controls" role="radiogroup" aria-label="How keys are assigned">
      <button
        class="g-btn"
        role="radio"
        [attr.aria-checked]="mode() === 'ring'"
        [class.primary]="mode() === 'ring'"
        (click)="setMode('ring')"
      >
        Consistent hashing
      </button>
      <button
        class="g-btn"
        role="radio"
        [attr.aria-checked]="mode() === 'modulo'"
        [class.primary]="mode() === 'modulo'"
        (click)="setMode('modulo')"
      >
        hash mod N
      </button>
    </div>

    <svg viewBox="-130 -130 260 260" role="img" [attr.aria-label]="summary()">
      @if (mode() === 'ring') {
        @for (a of arcs(); track $index) {
          <path class="arc" [attr.d]="a.d" [style.stroke]="color(a.node)" />
        }
      } @else {
        <circle class="track" r="110" />
      }
      @for (k of keyDots(); track k.key) {
        <circle class="key" [class.moved]="k.moved" [attr.cx]="k.x" [attr.cy]="k.y" r="3.6" [style.fill]="color(k.owner)" />
      }
    </svg>

    <div class="controls">
      <button class="g-btn" [disabled]="nodes().length <= 2" (click)="resize(-1)">Remove node {{ nodes().at(-1) }}</button>
      <button class="g-btn" [disabled]="nodes().length >= names.length" (click)="resize(1)">Add node {{ names[nodes().length] }}</button>
      @if (mode() === 'ring') {
        <label class="toggle"
          ><input type="checkbox" [checked]="virtualNodes() > 1" (change)="setVirtualNodes($any($event.target).checked ? 100 : 1)" /> 100
          virtual nodes each</label
        >
      }
    </div>

    <dl class="readouts" aria-live="polite">
      <div [class.bad]="moved() !== null && moved()! > keys.length / 2">
        <dt>Last change moved</dt>
        <dd class="mono">{{ moved() === null ? 'nothing yet' : moved() + ' of ' + keys.length }}</dd>
      </div>
      @for (n of nodes(); track n; let i = $index) {
        <div>
          <dt><span class="swatch" [style.background]="color(n)"></span>Node {{ n }}</dt>
          <dd class="mono">{{ placement().load[i] }} keys</dd>
        </div>
      }
    </dl>
  `,
  styleUrl: './widget.scss',
  styles: `
    .track {
      fill: none;
      stroke: var(--g-line-strong);
      stroke-width: 1.5;
    }
    .arc {
      fill: none;
      stroke-width: 14;
      opacity: 0.75;
    }
    circle.key {
      stroke: var(--g-surface);
      stroke-width: 1;
      transition: fill 0.3s;
    }
    circle.key.moved {
      stroke: var(--g-text);
      stroke-width: 2;
    }
    svg {
      max-width: 340px;
      margin-bottom: 12px;
    }
    .toggle {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 0.875rem;
    }
    .readouts div:first-child {
      grid-column: span 2;
    }
    .swatch {
      display: inline-block;
      width: 8px;
      height: 8px;
      border-radius: 50%;
      margin-right: 5px;
    }
  `,
})
export class RingWidgetComponent {
  readonly keys = KEYS;
  readonly names = NAMES;
  readonly mode = signal<Mode>('ring');
  readonly nodes = signal(NAMES.slice(0, 4));
  readonly virtualNodes = signal(100);
  /** Owners before the last node change, to count and mark the keys that moved. */
  private readonly before = signal<string[] | null>(null);

  private readonly ring = computed(() => hashRing(this.nodes(), this.virtualNodes()));
  readonly placement = computed(() => {
    const nodes = this.nodes();
    const ring = this.ring();
    return place(KEYS, nodes, this.mode() === 'ring' ? (k) => ringOwner(ring, k) : (k) => moduloOwner(nodes, k));
  });
  readonly moved = computed(() => {
    const before = this.before();
    return before ? movedKeys(before, this.placement().owners) : null;
  });
  readonly keyDots = computed(() => {
    const before = this.before();
    return KEYS.map((key, i) => {
      const a = angle(hash32(key));
      const owner = this.placement().owners[i];
      return { key, owner, moved: !!before && before[i] !== owner, x: Math.cos(a) * R, y: Math.sin(a) * R };
    });
  });
  /** The stretch of ring each node owns: a key belongs to the first point clockwise of it, so each arc ends at a point. */
  readonly arcs = computed(() => {
    const ring = this.ring();
    return ring.map((p, i) => {
      const from = angle(ring[(i - 1 + ring.length) % ring.length].at);
      let to = angle(p.at);
      if (to <= from) to += 2 * Math.PI;
      const large = to - from > Math.PI ? 1 : 0;
      const [x1, y1, x2, y2] = [Math.cos(from) * R, Math.sin(from) * R, Math.cos(to) * R, Math.sin(to) * R];
      return { node: p.node, d: `M${x1.toFixed(2)},${y1.toFixed(2)}A${R},${R} 0 ${large} 1 ${x2.toFixed(2)},${y2.toFixed(2)}` };
    });
  });
  readonly summary = computed(() => {
    const moved = this.moved();
    const loads = this.nodes()
      .map((n, i) => `${n} ${this.placement().load[i]}`)
      .join(', ');
    return `${this.mode() === 'ring' ? 'Consistent hashing' : 'hash mod N'} over ${this.nodes().length} nodes: ${loads}.${
      moved === null ? '' : ` The last change moved ${moved} of ${KEYS.length} keys.`
    }`;
  });

  color(node: string) {
    return `var(${COLORS[NAMES.indexOf(node)]})`;
  }

  setMode(mode: Mode) {
    this.mode.set(mode);
    this.before.set(null);
  }

  setVirtualNodes(count: number) {
    this.virtualNodes.set(count);
    this.before.set(null);
  }

  resize(delta: 1 | -1) {
    this.before.set(this.placement().owners);
    this.nodes.set(NAMES.slice(0, this.nodes().length + delta));
  }
}
