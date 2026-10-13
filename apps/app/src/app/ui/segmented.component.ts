import { ChangeDetectionStrategy, Component, input, model } from '@angular/core';
import { RovingSelectDirective } from '../core/roving-select.directive';

export interface SegmentOption<T> {
  value: T;
  label: string;
}

/**
 * The one "selected option" control (REDESIGN.md 3.2): a radio group of options with the arrow-key pattern and one Tab
 * stop. The selected option is an accent wash with an accent line, never a filled button that reads as the page's main
 * action, and no colour transition runs on selection, so a check of its contrast never reads a colour mid-change.
 */
@Component({
  selector: 'g-segmented',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RovingSelectDirective],
  template: `
    <div
      role="radiogroup"
      [attr.aria-label]="label() ?? null"
      [attr.aria-labelledby]="labelledby() ?? null"
      [attr.aria-describedby]="describedby() ?? null"
    >
      @for (o of options(); track o.value) {
        <button type="button" role="radio" [attr.aria-checked]="o.value === value()" (click)="value.set(o.value)">
          {{ o.label }}
        </button>
      }
    </div>
  `,
  styles: `
    :host {
      display: block;
    }
    div {
      display: flex;
      flex-wrap: wrap;
      gap: var(--g-space-1);
    }
    button {
      min-width: 48px;
      min-height: 40px;
      padding: 0 var(--g-space-3);
      border-radius: var(--g-radius-sm);
      border: 1px solid var(--g-line-strong);
      background: var(--g-raised);
      box-shadow: var(--g-shadow-raised);
      color: var(--g-text);
      font: 500 var(--g-text-body) var(--ion-font-family);
      font-variant-numeric: tabular-nums;
      cursor: pointer;
    }
    @media (hover: hover) {
      button:hover:not([aria-checked='true']) {
        border-color: var(--g-faint);
      }
    }
    button[aria-checked='true'] {
      background: var(--g-accent-soft);
      border-color: var(--g-accent);
      box-shadow: inset 0 0 0 1px var(--g-accent);
      font-weight: 600;
    }
  `,
})
export class SegmentedComponent<T> {
  readonly options = input.required<readonly SegmentOption<T>[]>();
  readonly value = model<T>();
  readonly label = input<string>();
  readonly labelledby = input<string>();
  readonly describedby = input<string>();
}
