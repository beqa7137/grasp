import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  afterRenderEffect,
  computed,
  inject,
  input,
  signal,
  viewChild,
  viewChildren,
} from '@angular/core';
import type { ArrayView, Scalar } from '@grasp/engine';

interface PointerTag {
  name: string;
  index: number;
  row: number;
}

/** An output built index by index under the array, each value lit once the array's cell above it is settled. */
export interface AlignedRow {
  label: string;
  values: Scalar[];
}

/** How many rows a frame's pointer labels take: those on one cell stack. */
export function pointerRowsOf(pointers: Record<string, number> = {}): number {
  const onCell = new Map<number, number>();
  for (const index of Object.values(pointers)) onCell.set(index, (onCell.get(index) ?? 0) + 1);
  return Math.max(0, ...onCell.values());
}

/** The longest of these values in characters, which every cell of a view showing any of them is wide enough to hold. */
export function longestValue(values: Iterable<Scalar>): number {
  let longest = 1;
  for (const value of values) longest = Math.max(longest, String(value).length);
  return longest;
}

const POINTER_COLORS: Record<string, string> = {
  lo: 'var(--g-pointer)',
  hi: 'var(--g-pointer-alt)',
  mid: 'var(--g-active)',
  l: 'var(--g-pointer)',
  r: 'var(--g-pointer-alt)',
  left: 'var(--g-pointer)',
  right: 'var(--g-active)',
  i: 'var(--g-active)',
  top: 'var(--g-accent)',
};

@Component({
  selector: 'g-array-view',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[attr.tabindex]': 'scrolls() ? 0 : null',
    '[attr.role]': "scrolls() ? 'region' : null",
    '[attr.aria-label]': "scrolls() ? 'Array' : null",
  },
  template: `
    @let v = view();
    <div class="track" #track [style.--n]="v.values.length" [style.--chars]="chars()">
      <div class="pointers" [style.height.px]="pointerRows() ? pointerRows() * 22 + 6 : 0">
        @for (p of pointers(); track p.name) {
          <div
            class="ptr"
            [class.first]="p.index === 0"
            [class.last]="p.index === v.values.length - 1"
            [style.--i]="p.index"
            [style.--row]="p.row"
            [style.--c]="color(p.name)"
          >
            <span>{{ p.name }}</span>
          </div>
        }
      </div>
      <div class="cells">
        @if (v.window; as w) {
          <div class="window" [style.--from]="w[0]" [style.--to]="w[1]"></div>
        }
        @for (value of v.values; track $index) {
          <div
            #cell
            class="cell"
            [class.settled]="settled().has($index)"
            [class.active]="active().has($index)"
            [class.found]="found().has($index)"
          >
            <span class="val">{{ value }}</span>
          </div>
        }
      </div>
      <div class="indices">
        @for (value of v.values; track $index) {
          <span>{{ $index }}</span>
        }
      </div>
      @if (aligned(); as row) {
        <span class="eyebrow row-label">{{ row.label }}</span>
        <div class="cells">
          @for (value of row.values; track $index) {
            <div class="cell" [class.found]="settled().has($index)">
              <span class="val">{{ value }}</span>
            </div>
          }
        </div>
        <div class="indices">
          @for (value of row.values; track $index) {
            <span>{{ $index }}</span>
          }
        </div>
      }
    </div>
  `,
  styles: `
    /*
     * The array scrolls sideways here rather than cut a value short or widen the page. The block padding keeps the active cell's
     * lift and glow and the window's rim inside the scroller; the margin gives it back.
     */
    :host {
      display: block;
      width: 100%;
      container-type: inline-size;
      overflow-x: auto;
      overflow-y: hidden;
      padding-block: 6px;
      margin-block: -6px;
    }
    @media (prefers-reduced-motion: no-preference) {
      :host {
        scroll-behavior: smooth;
      }
    }
    /* Inside, since a parent that scrolls would cut off a ring drawn around it. */
    :host(:focus-visible) {
      outline-offset: -2px;
    }
    /*
     * 0.62em is a monospace character with a little to spare; --chrome is a cell's two margins, two 1px borders and 2px
     * either side.
     */
    .track {
      --cell: calc(100% / var(--n));
      --gap: clamp(1px, 0.5vw, 3px);
      --chrome: calc(2 * var(--gap) + 6px);
      --fit: calc((100cqi / var(--n) - var(--chrome)) / (var(--chars) * 0.62));
      --val-size: clamp(11px, min(2.6vw, var(--fit)), 16px);
      --col-min: calc(var(--chars) * 0.62 * var(--val-size) + var(--chrome));
      position: relative;
      width: 100%;
      min-width: calc(var(--n) * var(--col-min));
      max-width: calc(var(--n) * 60px);
      margin: 0 auto;
    }
    .pointers {
      position: relative;
    }
    .ptr {
      position: absolute;
      bottom: calc(var(--row) * 22px + 4px);
      left: calc(var(--i) * var(--cell));
      width: var(--cell);
      display: flex;
      justify-content: center;
      transition:
        left 0.35s cubic-bezier(0.2, 0.8, 0.2, 1),
        bottom 0.2s;
    }
    /*
     * Auto margins centre a tag that fits its cell. One wider than its cell drops them and falls back on justify-content,
     * which at either end of the array lines it up with that end, so the scroller never cuts it off.
     */
    .ptr.first {
      justify-content: flex-start;
    }
    .ptr.last {
      justify-content: flex-end;
    }
    .ptr span {
      margin-inline: auto;
      font: 600 11px/1 var(--g-font-mono);
      white-space: nowrap;
      color: var(--g-on-fill);
      background: var(--c);
      padding: 4px 6px 3px;
      border-radius: 6px;
    }
    .ptr::after {
      content: '';
      position: absolute;
      left: 50%;
      bottom: -4px;
      transform: translateX(-50%);
      border: 4px solid transparent;
      border-top-color: var(--c);
      border-bottom: 0;
    }
    /* Columns share the track exactly; its min-width makes room for the longest value. */
    .cells {
      position: relative;
      display: grid;
      grid-template-columns: repeat(var(--n), minmax(0, 1fr));
      gap: 0;
    }
    .window {
      position: absolute;
      top: -6px;
      bottom: -6px;
      left: calc(var(--from) * var(--cell));
      width: calc((var(--to) - var(--from) + 1) * var(--cell));
      background: var(--g-window);
      border: 1px solid var(--g-window-line);
      border-radius: 12px;
      transition:
        left 0.35s cubic-bezier(0.2, 0.8, 0.2, 1),
        width 0.35s cubic-bezier(0.2, 0.8, 0.2, 1);
    }
    /*
     * The width is set, not automatic: an automatic width takes the 54px height cap through the aspect ratio, so a long
     * value would spill out.
     */
    .cell {
      position: relative;
      width: calc(100% - 2 * var(--gap));
      max-width: max(54px, var(--col-min) - 2 * var(--gap));
      justify-self: center;
      aspect-ratio: 1;
      margin: var(--gap);
      max-height: 54px;
      border-radius: 10px;
      background: var(--g-raised);
      border: 1px solid var(--g-line-strong);
      display: grid;
      place-items: center;
      transition:
        background 0.25s,
        border-color 0.25s,
        opacity 0.25s,
        transform 0.25s,
        box-shadow 0.25s;
    }
    .val {
      white-space: nowrap;
      font: 600 var(--val-size) / 1 var(--g-font-mono);
      color: var(--g-text);
    }
    .cell.settled {
      background: transparent;
      border-color: var(--g-line);
    }
    .cell.settled:not(.found) .val {
      color: var(--g-muted);
    }
    .cell.active {
      border-color: var(--g-state-current);
      box-shadow: 0 0 0 3px rgba(var(--g-active-rgb), 0.18);
      transform: translateY(-2px);
    }
    .cell.found {
      background: var(--g-state-done-fill);
      border-color: var(--g-state-done-line);
      opacity: 1;
    }
    .cell.found .val {
      color: var(--g-found-ink);
    }
    .indices {
      display: grid;
      grid-template-columns: repeat(var(--n), minmax(0, 1fr));
      margin-top: 6px;
    }
    .indices span {
      white-space: nowrap;
      text-align: center;
      font: 11px/1 var(--g-font-mono);
      color: var(--g-faint);
    }
    /* Centred in the part of the track in view, however far it is scrolled. */
    .row-label {
      position: sticky;
      left: 0;
      display: block;
      width: min(100%, 100cqi);
      margin: 14px 0 8px;
      text-align: center;
    }
  `,
})
export class ArrayViewComponent {
  readonly view = input.required<ArrayView>();
  readonly aligned = input<AlignedRow | null>(null);
  /** The longest value in any frame the page will show here, so that cells keep one width from frame to frame. */
  readonly longest = input(1);
  /** Pointer rows to keep room for when a frame has fewer, so that the array keeps one height from frame to frame. */
  readonly band = input(0);
  private readonly host: HTMLElement = inject(ElementRef).nativeElement;
  private readonly track = viewChild.required<ElementRef<HTMLElement>>('track');
  private readonly cells = viewChildren<ElementRef<HTMLElement>>('cell');
  /** Whether the array is wider than its view, which then scrolls, so a keyboard can scroll it too. */
  readonly scrolls = signal(false);

  readonly settled = computed(() => new Set(this.view().settled ?? []));
  readonly active = computed(() => new Set(this.view().active ?? []));
  readonly found = computed(() => new Set(this.view().found ?? []));

  readonly pointers = computed<PointerTag[]>(() => {
    const seen = new Map<number, number>();
    return Object.entries(this.view().pointers).map(([name, index]) => {
      const row = seen.get(index) ?? 0;
      seen.set(index, row + 1);
      return { name, index, row };
    });
  });

  readonly chars = computed(() => Math.max(this.longest(), longestValue([...this.view().values, ...(this.aligned()?.values ?? [])])));

  readonly pointerRows = computed(() => Math.max(this.band(), pointerRowsOf(this.view().pointers)));

  /** The cells a step works on, which a scrolled array keeps in view: its active cells, pointers and window. */
  private readonly followed = computed(() => {
    const v = this.view();
    const cell = (i: number) => i >= 0 && i < v.values.length;
    const at = [...(v.active ?? []), ...Object.values(v.pointers), ...(v.window ?? [])].filter(cell);
    return at.length ? { from: Math.min(...at), to: Math.max(...at), active: v.active?.find(cell) } : null;
  });

  constructor() {
    const overflow = new ResizeObserver(() => this.scrolls.set(this.host.scrollWidth > this.host.clientWidth));
    afterNextRender(() => {
      overflow.observe(this.host);
      overflow.observe(this.track().nativeElement);
    });
    inject(DestroyRef).onDestroy(() => overflow.disconnect());

    // Scrolls as little as shows them all, or, when they are wider than the view, the active cell or else the first of them.
    afterRenderEffect(() => {
      const followed = this.followed();
      if (!followed) return;
      const cells = this.cells();
      const edges = (i: number) => {
        const cell = cells[i].nativeElement;
        return [cell.offsetLeft, cell.offsetLeft + cell.offsetWidth];
      };
      let [left, right] = [edges(followed.from)[0], edges(followed.to)[1]];
      const { scrollLeft, clientWidth } = this.host;
      if (right - left > clientWidth && followed.active !== undefined) [left, right] = edges(followed.active);
      if (left < scrollLeft) this.host.scrollLeft = left;
      else if (right > scrollLeft + clientWidth) this.host.scrollLeft = Math.min(left, right - clientWidth);
    });
  }

  color(name: string) {
    return POINTER_COLORS[name] ?? 'var(--g-accent)';
  }
}
