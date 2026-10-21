import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  afterRenderEffect,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
  viewChild,
  viewChildren,
} from '@angular/core';
import type { ArrayView, Scalar } from '@grasp/engine';
import { DIM_CELL, dims, type Focus } from './dim';
import { LANDING, enter, flip, land, leave, placeKeyed, type Placed } from './kit/flip';
import { MotionService, type StageStep } from './kit/motion.service';

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

/** Pointer tags in rows: those on one cell stack, in the order the frame names them. */
function tagsOf(pointers: Record<string, number>): PointerTag[] {
  const seen = new Map<number, number>();
  return Object.entries(pointers).map(([name, index]) => {
    const row = seen.get(index) ?? 0;
    seen.set(index, row + 1);
    return { name, index, row };
  });
}

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
      <div
        class="pointers"
        [class.keep-band]="keepBand()"
        [style.--band-h.px]="rowsHeight(pointerRows())"
        [style.--rows-h.px]="rowsHeight(ownRows())"
      >
        @for (t of trails().pointers; track t.name) {
          <div class="ptr trail" aria-hidden="true" [style.--i]="t.index" [style.--row]="t.row">
            <span
              ><s>{{ t.name }}</s> {{ t.arrow }}</span
            >
          </div>
        }
        @for (p of pointers(); track p.name) {
          <div
            class="ptr"
            [attr.data-key]="'p:' + p.name"
            [class.first]="p.index === 0"
            [class.last]="p.index === v.values.length - 1"
            [class.current]="active().has(p.index)"
            [style.--i]="p.index"
            [style.--row]="p.row"
          >
            <span>{{ p.name }}</span>
          </div>
        }
      </div>
      <div class="cells">
        @if (v.window; as w) {
          <div class="window" data-key="window" [style.--from]="w[0]" [style.--to]="w[1]"></div>
        }
        @for (value of v.values; track cellKey($index)) {
          <div
            #cell
            class="cell"
            [attr.data-key]="'c:' + cellKey($index)"
            [class.settled]="settled().has($index)"
            [class.active]="active().has($index)"
            [class.found]="found().has($index)"
            [class.dim]="dimmed().has($index)"
            [class.considering]="compared().has($index)"
            [class.moved]="trails().moved.has($index)"
          >
            <span class="val">{{ value }}</span>
            @if (trails().was.get($index); as was) {
              <s class="was" aria-hidden="true">{{ was }}</s>
            }
          </div>
        }
      </div>
      <div class="indices">
        @for (value of v.values; track $index) {
          <span>{{ $index }}</span>
        }
      </div>
      @if (comparing()) {
        <div class="compare-row" [class.tight]="!!aligned()" aria-hidden="true">
          @if (comparison(); as c) {
            <span class="compare" [style.--at]="c.at">{{ c.text }}</span>
          }
        </div>
      }
      @if (aligned(); as row) {
        <span class="eyebrow row-label" [class.after-compare]="comparing()">{{ row.label }}</span>
        <div class="cells">
          @for (value of row.values; track $index) {
            <div class="cell" #outCell [class.found]="settled().has($index)">
              <span class="val">{{ value }}</span>
              @if (trails().wasOut.get($index); as was) {
                <s class="was" aria-hidden="true">{{ was }}</s>
              }
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
  styles: [
    DIM_CELL,
    LANDING,
    `
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
        scroll-behavior: smooth;
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
        height: var(--band-h);
      }
      /*
       * On a short stage (a 320px phone, an iPhone in Safari) the run's extra pin rows would push the lists under the array
       * below the fold, so only a column, whose drawing must keep one size, keeps them there; elsewhere cells shift instead.
       */
      @container stage (max-height: 359.98px) {
        .pointers:not(.keep-band) {
          height: var(--rows-h);
        }
      }
      /* Pins are labels, not colors (REDESIGN.md 3.3): neutral, and only the pin on the current cell takes the current hue. */
      .ptr {
        position: absolute;
        bottom: calc(var(--row) * 22px + 4px);
        left: calc(var(--i) * var(--cell));
        width: var(--cell);
        display: flex;
        justify-content: center;
        --c: var(--g-raised);
        --c-line: var(--g-stroke);
        --c-ink: var(--g-text);
      }
      .ptr.current {
        --c: var(--g-state-current);
        --c-line: var(--g-state-current);
        --c-ink: var(--g-state-current-ink);
      }
      /* Where a pin was before an unanimated step, kept for one frame with an arrow toward where it went. */
      .ptr.trail {
        --c: transparent;
        --c-line: var(--g-faint);
        --c-ink: var(--g-faint);
      }
      .ptr.trail span {
        border-style: dashed;
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
        color: var(--c-ink);
        background: var(--c);
        border: 1px solid var(--c-line);
        padding: 3px 5px 2px;
        border-radius: 6px;
      }
      .ptr::after {
        content: '';
        position: absolute;
        left: 50%;
        bottom: -4px;
        transform: translateX(-50%);
        border: 4px solid transparent;
        border-top-color: var(--c-line);
        border-bottom: 0;
      }
      .ptr.trail::after {
        display: none;
      }
      /* Columns share the track exactly; its min-width makes room for the longest value. */
      .cells {
        position: relative;
        display: grid;
        grid-template-columns: repeat(var(--n), minmax(0, 1fr));
        gap: 0;
      }
      /* The window is a neutral bracket under its cells (REDESIGN.md 3.3), not a purple wash. */
      .window {
        position: absolute;
        bottom: -5px;
        height: var(--g-space-2);
        left: calc(var(--from) * var(--cell) + var(--gap));
        width: calc((var(--to) - var(--from) + 1) * var(--cell) - 2 * var(--gap));
        border: 2px solid var(--g-muted);
        border-top: 0;
        border-radius: 0 0 var(--g-radius-xs) var(--g-radius-xs);
        pointer-events: none;
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
          background var(--g-motion-step),
          border-color var(--g-motion-step),
          opacity var(--g-motion-step),
          transform var(--g-motion-step),
          box-shadow var(--g-motion-step);
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
      .cell.settled:not(.found, .dim) .val {
        color: var(--g-muted);
      }
      .cell.active {
        border-color: var(--g-state-current);
        box-shadow: 0 0 0 3px var(--g-viz-current-soft);
        transform: translateY(-2px);
      }
      .cell.found {
        background: var(--g-state-done-fill);
        border-color: var(--g-state-done-line);
        opacity: 1;
      }
      .cell.found .val {
        color: var(--g-viz-final-ink);
      }
      .cell.dim .val {
        color: var(--g-viz-discarded-ink);
      }
      /* The operands of the comparison a step decides on (REDESIGN.md 3.5's cause). */
      .cell.considering {
        outline: 2px dashed var(--g-viz-considering);
        outline-offset: -1px;
      }
      /* A cell that changed place in a step with no motion, for one frame. */
      .cell.moved {
        border-style: dashed;
      }
      /* A written value's old value, struck through beside the new one when the write does not animate (3.5). */
      .was {
        position: absolute;
        top: 1px;
        right: 3px;
        font: 500 var(--g-text-label) / 1 var(--g-font-mono);
        color: var(--g-muted);
      }
      .cell.found .was {
        color: var(--g-viz-final-ink);
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
      /* A row kept for the run's comparisons, so the array keeps one height; the label floats over the cells it reads. */
      .compare-row {
        position: relative;
        height: var(--g-space-6);
        margin-top: var(--g-space-1);
      }
      /* Over an aligned output the label floats in the room above that row's label, so a phone keeps the lists below in view. */
      .compare-row.tight {
        height: 0;
      }
      .compare {
        position: absolute;
        top: 0;
        left: calc(var(--at) * var(--cell));
        transform: translateX(-50%);
        white-space: nowrap;
        font: 600 var(--g-text-label) / 1.5 var(--g-font-mono);
        color: var(--g-text);
        background: var(--g-viz-stage);
        border: 1px dashed var(--g-viz-considering);
        border-radius: var(--g-radius-xs);
        padding: 0 var(--g-space-2);
      }
      .row-label.after-compare {
        margin-top: var(--g-space-6);
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
  ],
})
export class ArrayViewComponent {
  readonly view = input.required<ArrayView>();
  readonly aligned = input<AlignedRow | null>(null);
  /** The longest value in any frame the page will show here, so that cells keep one width from frame to frame. */
  readonly longest = input(1);
  /** Pointer rows to keep room for when a frame has fewer, so that the array keeps one height from frame to frame. */
  readonly band = input(0);
  /** A checkpoint's focus, which dims the other cells. */
  readonly focus = input<Focus>(null);
  /** Stable cell keys (`traceKeys`), so a cell that moves keeps its element; without them cells are keyed by index. */
  readonly keys = input<readonly string[] | null>(null);
  /** The step into this frame, which the view plays (or, when nothing animates, leaves trails for). */
  readonly step = input<StageStep | null>(null);
  /** Whether the run compares anything here, which keeps a row for the comparator label on every frame. */
  readonly comparing = input(false);
  private readonly motion = inject(MotionService, { optional: true });
  private readonly host: HTMLElement = inject(ElementRef).nativeElement;
  private readonly track = viewChild<ElementRef<HTMLElement>>('track');
  private readonly cells = viewChildren<ElementRef<HTMLElement>>('cell');
  private readonly outCells = viewChildren<ElementRef<HTMLElement>>('outCell');
  /** Whether the array is wider than its view, which then scrolls, so a keyboard can scroll it too. */
  readonly scrolls = signal(false);

  readonly settled = computed(() => new Set(this.view().settled ?? []));
  readonly active = computed(() => new Set(this.view().active ?? []));
  readonly found = computed(() => new Set(this.view().found ?? []));
  readonly dimmed = computed(() => {
    const focus = this.focus();
    return new Set(this.view().values.flatMap((_, i) => (dims(focus, { view: 'array', at: i }, this.active().has(i)) ? [i] : [])));
  });

  readonly pointers = computed(() => tagsOf(this.view().pointers));

  readonly chars = computed(() => Math.max(this.longest(), longestValue([...this.view().values, ...(this.aligned()?.values ?? [])])));

  /** On a stage too short for the run's pin rows, whether to keep them anyway: a column's drawing must keep one size. */
  readonly keepBand = input(false);
  readonly ownRows = computed(() => pointerRowsOf(this.view().pointers));
  readonly pointerRows = computed(() => Math.max(this.band(), this.ownRows()));

  private readonly events = computed(() => this.step()?.events.filter((e) => e.view === 'array' || e.view === 'output') ?? []);

  /** The comparison this step decides on, centred over the cells it reads (or the array when it reads none). */
  readonly comparison = computed(() => {
    const compare = this.events().find((e) => e.kind === 'compare');
    if (!compare) return null;
    const at = compare.at.length ? (Math.min(...compare.at) + Math.max(...compare.at) + 1) / 2 : this.view().values.length / 2;
    return { text: compare.text, at };
  });
  readonly compared = computed(() => new Set(this.events().flatMap((e) => (e.kind === 'compare' ? e.at : []))));

  /**
   * What a step that does not animate leaves for one frame (REDESIGN.md 3.5): a dashed pin where each pointer was, with an
   * arrow toward where it went, dashed cells that changed place, and written values' old values struck through.
   */
  readonly trails = computed(() => {
    const step = this.step();
    const trail = {
      pointers: [] as { name: string; index: number; row: number; arrow: string }[],
      moved: new Set<number>(),
      was: new Map<number, string>(),
      wasOut: new Map<number, string>(),
    };
    if (!step?.adjacent || step.scale > 0) return trail;
    const now = this.view().pointers;
    const before = { ...now };
    for (const e of this.events()) {
      if (e.kind !== 'move') continue;
      if (e.from === null) delete before[e.pointer];
      else before[e.pointer] = e.from;
    }
    const rows = Math.max(1, pointerRowsOf(now));
    const oldTags = new Map(tagsOf(before).map((t) => [t.name, t]));
    for (const e of this.events()) {
      if (e.kind === 'move' && e.from !== null && e.to !== null)
        trail.pointers.push({
          name: e.pointer,
          index: e.from,
          row: Math.min(oldTags.get(e.pointer)!.row, rows - 1),
          arrow: e.to > e.from ? '→' : '←',
        });
      else if (e.kind === 'swap' && e.view === 'array') trail.moved.add(e.a).add(e.b);
      else if (e.kind === 'shift' && e.view === 'array') trail.moved.add(e.to);
      else if (e.kind === 'write' && typeof e.at === 'number' && e.from !== undefined)
        (e.view === 'array' ? trail.was : trail.wasOut).set(e.at, String(e.from));
    }
    return trail;
  });

  /** The cells a step works on, which a scrolled array keeps in view: its active cells, pointers and window. */
  private readonly followed = computed(() => {
    const v = this.view();
    const cell = (i: number) => i >= 0 && i < v.values.length;
    const at = [...(v.active ?? []), ...Object.values(v.pointers), ...(v.window ?? [])].filter(cell);
    return at.length ? { from: Math.min(...at), to: Math.max(...at), active: v.active?.find(cell) } : null;
  });

  /** Boxes of the keyed elements before this step's DOM update, read by a component effect, which runs before the template. */
  private before: Map<string, Placed> | null = null;

  constructor() {
    const overflow = new ResizeObserver(() => this.scrolls.set(this.host.scrollWidth > this.host.clientWidth));
    afterNextRender(() => {
      overflow.observe(this.host);
      const track = this.track()?.nativeElement;
      if (track) overflow.observe(track);
    });
    inject(DestroyRef).onDestroy(() => overflow.disconnect());

    effect(() => {
      this.view();
      const step = this.step();
      untracked(() => (this.before = this.animates(step) ? placeKeyed(this.track()?.nativeElement) : null));
    });
    afterRenderEffect(() => {
      const step = this.step();
      untracked(() => this.play(step));
    });

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

  rowsHeight(rows: number): number {
    return rows ? rows * 22 + 6 : 0;
  }

  cellKey(i: number): string | number {
    return this.keys()?.[i] ?? i;
  }

  private animates(step: StageStep | null): step is StageStep {
    return !!this.motion && !!step?.adjacent && step.scale > 0;
  }

  /** Plays the step: pins slide, cells that changed place move, the window follows, then written values land. */
  private play(step: StageStep | null) {
    const before = this.before;
    this.before = null;
    const motion = this.motion;
    if (!motion || !before || !this.animates(step)) return;
    const after = placeKeyed(this.track()?.nativeElement);
    const s = step.scale;
    const easing = motion.ease('standard');
    const part = (prefix: string, map: Map<string, Placed>) => new Map([...map].filter(([key]) => key.startsWith(prefix)));
    const change = { delay: motion.at('change', s), easing };
    flip(motion, part('c:', before), part('c:', after), { ...change, duration: motion.ms('layout', s) });
    flip(motion, part('p:', before), part('p:', after), { ...change, duration: motion.ms('step', s) });
    enter(motion, part('p:', before), part('p:', after), { ...change, duration: motion.ms('quick', s), easing: motion.ease('enter') });
    const track = this.track()?.nativeElement;
    if (track)
      leave(
        motion,
        part('p:', before),
        part('p:', after),
        track,
        { duration: motion.ms('quick', s), delay: 0, easing: motion.ease('exit') },
        { x: 0, y: -4 },
      );
    flip(motion, part('window', before), part('window', after), { ...change, duration: motion.ms('step', s) }, true);
    const landing = { duration: motion.ms('land', s), delay: motion.at('consequence', s) - motion.ms('quick', s), easing };
    for (const e of this.events()) {
      if (e.kind !== 'write' || typeof e.at !== 'number' || e.from === undefined) continue;
      const cell = (e.view === 'array' ? this.cells() : this.outCells())[e.at]?.nativeElement;
      const value = cell?.querySelector<HTMLElement>('.val');
      if (cell && value) land(motion, cell, value, String(e.from), landing);
    }
    const label = this.track()?.nativeElement.querySelector('.compare');
    if (label)
      motion.animate(
        label,
        [
          { opacity: 0, transform: 'translate(-50%, 4px)' },
          { opacity: 1, transform: 'translateX(-50%)' },
        ],
        { duration: motion.ms('quick', s), easing },
      );
  }
}
