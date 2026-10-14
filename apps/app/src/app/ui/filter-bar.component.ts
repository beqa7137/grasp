import { ChangeDetectionStrategy, booleanAttribute, Component, computed, input, model, output } from '@angular/core';
import { SheetComponent } from './sheet.component';

/** The filters of a list in a sheet, with Reset and a button that shows the results it leaves (REDESIGN.md 2.9, 3.2). */
@Component({
  selector: 'g-filter-sheet',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SheetComponent],
  template: `
    <g-sheet heading="Filters" [(open)]="open">
      <ng-content />
      <div actions>
        <button type="button" class="g-btn ghost" [disabled]="!active()" (click)="reset.emit()">Reset</button>
        <button type="button" class="g-btn primary" (click)="open.set(false)">{{ show() }}</button>
      </div>
    </g-sheet>
  `,
  styles: `
    [actions] {
      display: contents;
    }
  `,
})
export class FilterSheetComponent {
  readonly open = model(false);
  /** The button that closes the sheet: "Show 31 results". */
  readonly show = input.required<string>();
  readonly active = input(0);
  readonly reset = output<void>();
}

/**
 * A list's filter row: a Filters button with how many filters are on, the chips of the ones that are, and the result count,
 * which screen readers hear whenever it changes. The filter controls go inside it and show in its sheet. With `inline`, the
 * page shows its controls itself from container `medium` up (REDESIGN.md 2.9), so the button shows only at `narrow`.
 */
@Component({
  selector: 'g-filter-bar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FilterSheetComponent],
  host: { '[class.inline]': 'inline()' },
  template: `
    <button type="button" class="g-btn open" aria-haspopup="dialog" [attr.aria-label]="buttonLabel()" (click)="open.set(true)">
      Filters
      @if (active()) {
        <span class="count" aria-hidden="true">{{ active() }}</span>
      }
    </button>
    <div class="chips"><ng-content select="[chips]" /></div>
    <p class="results" role="status">{{ results() }}</p>
    <g-filter-sheet [(open)]="open" [show]="show() ?? 'Show ' + results()" [active]="active()" (reset)="reset.emit()">
      <ng-content />
    </g-filter-sheet>
  `,
  styles: `
    @use '../../breakpoints' as *;

    :host {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--g-space-2);
    }
    .chips {
      display: contents;
    }
    .count {
      min-width: 1.5em;
      padding: 0 var(--g-space-1);
      border-radius: var(--g-radius-pill);
      background: var(--g-accent-soft);
      font-variant-numeric: tabular-nums;
    }
    @include container-medium {
      :host(.inline) .open {
        display: none;
      }
    }
    @include container-wide {
      :host(.inline) .open {
        display: none;
      }
    }
    /* Its own line at the end of the bar, so the count never moves as chips come and go. */
    .results {
      flex-basis: 100%;
      margin: 0;
      font-size: var(--g-text-body-s);
      color: var(--g-muted);
    }
  `,
})
export class FilterBarComponent {
  readonly results = input.required<string>();
  /** The sheet's button, when "Show" and the results line would not read well. */
  readonly show = input<string>();
  readonly inline = input(false, { transform: booleanAttribute });
  readonly active = input(0);
  readonly reset = output<void>();
  readonly open = model(false);
  readonly buttonLabel = computed(() => (this.active() ? `Filters, ${this.active()} on` : 'Filters'));
}
