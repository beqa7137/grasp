import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { ArrayView } from '@grasp/engine';

interface PointerTag {
  name: string;
  index: number;
  row: number;
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
  template: `
    @let v = view();
    <div class="track" [style.--n]="v.values.length">
      <div class="pointers" [style.height.px]="pointers().length ? pointerRows() * 22 + 6 : 0">
        @for (p of pointers(); track p.name) {
          <div class="ptr" [style.--i]="p.index" [style.--row]="p.row" [style.--c]="color(p.name)">
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
    </div>
  `,
  styles: `
    :host {
      display: block;
      width: 100%;
    }
    .track {
      --cell: calc(100% / var(--n));
      position: relative;
      width: 100%;
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
    .ptr span {
      font: 600 11px/1 var(--g-font-mono);
      white-space: nowrap;
      color: var(--g-on-fill);
      background: var(--c);
      padding: 4px 6px 3px;
      border-radius: 6px;
      position: relative;
    }
    .ptr span::after {
      content: '';
      position: absolute;
      left: 50%;
      bottom: -4px;
      transform: translateX(-50%);
      border: 4px solid transparent;
      border-top-color: var(--c);
      border-bottom: 0;
    }
    /* Columns share the track exactly, so a long array on a narrow phone never widens the page. */
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
    .cell {
      position: relative;
      aspect-ratio: 1;
      margin: clamp(1px, 0.5vw, 3px);
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
      font: 600 clamp(11px, 2.6vw, 16px) / 1 var(--g-font-mono);
      color: var(--g-text);
    }
    .cell.settled {
      background: transparent;
      border-color: var(--g-line);
    }
    .cell.settled .val {
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
  `,
})
export class ArrayViewComponent {
  readonly view = input.required<ArrayView>();

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

  readonly pointerRows = computed(() => Math.max(1, ...this.pointers().map((p) => p.row + 1)));

  color(name: string) {
    return POINTER_COLORS[name] ?? 'var(--g-accent)';
  }
}
