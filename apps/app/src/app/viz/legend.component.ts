import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/** Graph and tree legends use node-state swatches; table legends use cell-role swatches. */
export type LegendSwatch = 'state' | 'role';

@Component({
  selector: 'g-legend',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (entries().length) {
      <div class="legend">
        @for (entry of entries(); track entry.key) {
          <span><i [attr.data-state]="entry.state" [attr.data-role]="entry.role"></i>{{ entry.label }}</span>
        }
      </div>
    }
  `,
  styles: `
    :host {
      display: block;
    }
    .legend {
      display: flex;
      flex-wrap: wrap;
      gap: 14px;
      justify-content: center;
      margin-top: var(--g-legend-gap, 10px);
      font-size: 12px;
      color: var(--g-muted);
    }
    span {
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    i {
      width: 12px;
      height: 12px;
      border-radius: 50%;
      border: 1.5px solid;
    }
    i[data-state='idle'] {
      background: var(--g-raised);
      border-color: var(--g-line-strong);
    }
    i[data-state='active'] {
      background: var(--g-active);
      border-color: var(--g-active);
    }
    i[data-state='frontier'] {
      background: rgba(255, 181, 71, 0.16);
      border-color: var(--g-warn);
    }
    i[data-state='done'] {
      background: rgba(61, 220, 151, 0.16);
      border-color: var(--g-found);
    }
    i[data-state='marked'] {
      border-color: var(--g-found);
      box-shadow:
        0 0 0 2px var(--g-surface),
        0 0 0 3.5px var(--g-found);
    }
    i[data-role] {
      border-radius: 3px;
      border-width: 1px;
    }
    i[data-role='active'] {
      background: var(--g-active);
      border-color: var(--g-active);
    }
    i[data-role='deps'] {
      border-color: var(--g-pointer);
    }
    i[data-role='path'] {
      background: rgba(61, 220, 151, 0.22);
      border-color: var(--g-found);
    }
  `,
})
export class LegendComponent {
  readonly legend = input<Partial<Record<string, string>>>();
  readonly swatch = input.required<LegendSwatch>();

  readonly entries = computed(() => {
    const byRole = this.swatch() === 'role';
    return Object.entries(this.legend() ?? {}).map(([key, label]) => ({
      key,
      label,
      state: byRole ? null : key,
      role: byRole ? key : null,
    }));
  });
}
