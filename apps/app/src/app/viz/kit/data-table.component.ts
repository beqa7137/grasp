import { ChangeDetectionStrategy, Component, ElementRef, afterRenderEffect, inject, input } from '@angular/core';

/**
 * A drawing's numbers as a table (REDESIGN.md 3.3, "Describe"), scrolling inside the box the drawing had, with the
 * `active` row highlighted and kept in view, and a fade at the bottom edge when more rows wait below.
 */
@Component({
  selector: 'g-data-table',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { tabindex: '0', role: 'region', '[attr.aria-label]': 'label()', '[style.height.px]': 'height()', '[class.compact]': 'compact()' },
  template: `
    <table>
      <thead>
        <tr>
          @for (h of head(); track $index) {
            <th scope="col">{{ h }}</th>
          }
        </tr>
      </thead>
      <tbody>
        @for (row of rows(); track $index) {
          <tr [class.active]="$index === active()" [attr.aria-current]="$index === active() ? 'true' : null">
            @for (cell of row; track $index) {
              <td>{{ cell }}</td>
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
    .active td {
      background: var(--g-accent-soft);
      font-weight: 700;
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
