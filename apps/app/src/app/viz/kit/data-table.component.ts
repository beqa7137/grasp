import { ChangeDetectionStrategy, Component, ElementRef, afterRenderEffect, inject, input } from '@angular/core';
import { CodeTextComponent } from '../code-text.component';

/**
 * A drawing's numbers as a table (REDESIGN.md 3.3, "Describe"), scrolling inside the box the drawing had, with the
 * `active` row highlighted and kept in view, and a fade at the bottom edge when more rows wait below.
 */
@Component({
  selector: 'g-data-table',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CodeTextComponent],
  host: { tabindex: '0', role: 'region', '[attr.aria-label]': 'label()', '[style.height.px]': 'height()', '[class.compact]': 'compact()' },
  template: `
    <table>
      <thead>
        <tr>
          @for (h of head(); track $index) {
            <th scope="col" [class.row-head]="$first && rowHeads()">{{ h }}</th>
          }
        </tr>
      </thead>
      <tbody>
        @for (row of rows(); track $index) {
          <tr
            [class.active]="$index === active() || $index === also() || marked().includes($index)"
            [attr.aria-current]="$index === active() || $index === also() || marked().includes($index) ? 'true' : null"
          >
            @for (cell of row; track $index) {
              @if ($first && rowHeads()) {
                <th scope="row" class="row-head"><g-code-text [text]="cell" /></th>
              } @else {
                <td>{{ cell }}</td>
              }
            }
          </tr>
        }
      </tbody>
    </table>
  `,
  styles: `
    @use '../../../type' as *;

    :host {
      display: block;
      overflow: auto;
      border-top: 1px solid var(--g-line);
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font: 500 var(--g-text-body-s) var(--ion-font-family);
      font-variant-numeric: tabular-nums;
    }
    th,
    td {
      text-align: right;
      padding: var(--g-space-1) var(--g-space-2);
      // A value or a short head never breaks; a wide table scrolls sideways instead.
      white-space: nowrap;
    }
    th {
      @include label;
      color: var(--g-muted);
      position: sticky;
      top: 0;
      background: var(--g-viz-stage);
    }
    td {
      border-top: 1px solid var(--g-line);
    }
    :host(.compact) {
      th,
      td {
        padding-inline: var(--g-space-1);
      }
      th {
        letter-spacing: normal;
        white-space: normal;
        vertical-align: bottom;
      }
    }
    .active td,
    .active .row-head {
      background: var(--g-accent-soft);
      font-weight: 700;
    }
    // A row head's column aligns as its names do. In full a name keeps one line; compact, it may wrap between the runs
    // g-code-text keeps whole ("B-tree, / 4 KB"), never inside one.
    th.row-head {
      text-align: left;
    }
    tbody th.row-head {
      position: static;
      font: inherit;
      letter-spacing: normal;
      text-transform: none;
      color: var(--g-text);
      background: none;
      border-top: 1px solid var(--g-line);
    }
    :host(.more) {
      // A mask reads only alpha, so any opaque token works.
      mask-image: linear-gradient(to bottom, var(--g-text) calc(100% - 24px), transparent);
    }
  `,
})
export class DataTableComponent {
  readonly label = input.required<string>();
  readonly head = input.required<readonly string[]>();
  readonly rows = input.required<readonly (readonly string[])[]>();
  /** The box's height; null sizes it to its rows. */
  readonly height = input.required<number | null>();
  /** Tighter cells and plain-spaced heads that may wrap, for a phone's narrow stage. */
  readonly compact = input(false);
  readonly active = input(-1);
  /** A second current row, for a table of two families with one current setting each. */
  readonly also = input(-1);
  /** Current rows beyond those two, for a table whose current setting spans several rows. */
  readonly marked = input<readonly number[]>([]);
  /** The first cell of each row names it: a row header, which may wrap between the runs `g-code-text` keeps whole. */
  readonly rowHeads = input(false);

  constructor() {
    const host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    const fade = () => host.classList.toggle('more', host.scrollTop + host.clientHeight < host.scrollHeight - 1);
    host.addEventListener('scroll', fade, { passive: true });
    afterRenderEffect(() => {
      this.active();
      this.rows();
      const row = host.querySelector<HTMLElement>('tr.active');
      const head = host.querySelector('thead')?.getBoundingClientRect().height ?? 0;
      // Scrolled by hand, not scrollIntoView, which would scroll the page too.
      if (row && (row.offsetTop < host.scrollTop + head || row.offsetTop + row.offsetHeight > host.scrollTop + host.clientHeight))
        host.scrollTop = row.offsetTop - head;
      fade();
    });
  }
}
