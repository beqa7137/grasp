import { ChangeDetectionStrategy, Component, computed, input, model, output } from '@angular/core';
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
        <button type="button" class="g-btn primary" (click)="open.set(false)">Show {{ results() }}</button>
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
  readonly results = input.required<string>();
  readonly active = input(0);
  readonly reset = output<void>();
}

/**
 * A list's filter row: a Filters button with how many filters are on, the chips of the ones that are, and the result count,
 * which screen readers hear whenever it changes. The filter controls go inside it and show in its sheet.
 */
@Component({
  selector: 'g-filter-bar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FilterSheetComponent],
  template: `
    <button type="button" class="g-btn" aria-haspopup="dialog" [attr.aria-label]="buttonLabel()" (click)="open.set(true)">
      Filters
      @if (active()) {
        <span class="count" aria-hidden="true">{{ active() }}</span>
      }
    </button>
    <div class="chips"><ng-content select="[chips]" /></div>
    <p class="results" role="status">{{ results() }}</p>
    <g-filter-sheet [(open)]="open" [results]="results()" [active]="active()" (reset)="reset.emit()">
      <ng-content />
    </g-filter-sheet>
  `,
  styles: `
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
    .results {
      margin: 0 0 0 auto;
      font-size: var(--g-text-body-s);
      color: var(--g-muted);
    }
  `,
})
export class FilterBarComponent {
  readonly results = input.required<string>();
  readonly active = input(0);
  readonly reset = output<void>();
  readonly open = model(false);
  readonly buttonLabel = computed(() => (this.active() ? `Filters, ${this.active()} on` : 'Filters'));
}
