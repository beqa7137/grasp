import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { pageCost } from '@grasp/engine';
import { RovingSelectDirective } from '../../core/roving-select.directive';

const MODES = [
  { mode: 'offset', label: 'Offset' },
  { mode: 'cursor', label: 'Cursor' },
] as const;
const SIZES = [20, 50, 100];

/** A client paging through a newest-first list while new rows arrive: what each page costs the database, and what repeats. */
@Component({
  selector: 'app-pagination-widget',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DecimalPipe, RovingSelectDirective],
  template: `
    <div class="controls" role="radiogroup" aria-label="Pagination">
      @for (m of modes; track m.mode) {
        <button
          class="g-btn"
          role="radio"
          [attr.aria-checked]="mode() === m.mode"
          [class.primary]="mode() === m.mode"
          (click)="mode.set(m.mode)"
        >
          {{ m.label }}
        </button>
      }
    </div>
    <div class="controls" role="radiogroup" aria-label="Page size">
      <span class="muted">Page size</span>
      @for (s of sizes; track s) {
        <button class="g-btn" role="radio" [attr.aria-checked]="size() === s" [class.primary]="size() === s" (click)="size.set(s)">
          {{ s }}
        </button>
      }
    </div>
    <label class="slider">
      <span
        >Page <strong class="mono">{{ page() | number }}</strong></span
      >
      <input type="range" min="1" max="1000" step="1" [value]="page()" (input)="page.set(+$any($event.target).value)" />
    </label>
    <label class="slider">
      <span
        >New rows between requests <strong class="mono">{{ inserts() }}</strong></span
      >
      <input type="range" min="0" max="20" step="1" [value]="inserts()" (input)="inserts.set(+$any($event.target).value)" />
    </label>
    <p class="query mono">{{ query() }}</p>

    <dl class="readouts" aria-live="polite">
      <div [class.bad]="cost().rowsRead > 10 * size()">
        <dt>Rows read for this page</dt>
        <dd class="mono">{{ cost().rowsRead | number }}</dd>
      </div>
      <div>
        <dt>Rows read to get here</dt>
        <dd class="mono">{{ cost().walkRows | number }}</dd>
      </div>
      <div [class.bad]="cost().repeats > 0">
        <dt>Items shown twice</dt>
        <dd class="mono">{{ cost().repeats | number }}</dd>
      </div>
    </dl>
  `,
  styleUrl: './widget.scss',
  styles: `
    .controls .muted {
      font-size: 0.875rem;
    }
    .query {
      font-size: 0.8125rem;
      padding: 8px 10px;
      border-radius: 8px;
      background: var(--g-raised);
      overflow-wrap: anywhere;
      margin: 4px 0 12px;
    }
  `,
})
export class PaginationWidgetComponent {
  readonly modes = MODES;
  readonly sizes = SIZES;
  readonly mode = signal<'offset' | 'cursor'>('offset');
  readonly size = signal(50);
  readonly page = signal(10);
  readonly inserts = signal(3);
  readonly cost = computed(() => pageCost(this.mode(), { size: this.size(), page: this.page(), insertsPerPage: this.inserts() }));
  readonly query = computed(() =>
    this.mode() === 'offset'
      ? `ORDER BY created_at DESC, id DESC LIMIT ${this.size()} OFFSET ${(this.page() - 1) * this.size()}`
      : `WHERE (created_at, id) < (:last_at, :last_id) ORDER BY created_at DESC, id DESC LIMIT ${this.size()}`,
  );
}
