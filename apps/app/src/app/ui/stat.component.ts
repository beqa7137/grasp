import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** A figure with its label and an optional hint (REDESIGN.md 3.2), in Inter's tabular figures so values line up. */
@Component({
  selector: 'g-stat',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="label">{{ label() }}</span>
    <strong class="value">{{ value() }}</strong>
    @if (hint(); as hint) {
      <span class="hint">{{ hint }}</span>
    }
  `,
  styles: `
    @use '../../type' as *;

    :host {
      display: flex;
      flex-direction: column;
      gap: var(--g-space-1);
      padding: var(--g-space-3);
      border-radius: var(--g-radius-sm);
      background: var(--g-sunken);
    }
    .label {
      @include label;
      color: var(--g-muted);
    }
    .value {
      font: 600 var(--g-text-title-l) / 1.2 var(--ion-font-family);
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
      color: var(--g-text);
    }
    .hint {
      font-size: var(--g-text-body-s);
      color: var(--g-muted);
    }
  `,
})
export class StatComponent {
  readonly label = input.required<string>();
  readonly value = input.required<string | number>();
  readonly hint = input<string>();
}
