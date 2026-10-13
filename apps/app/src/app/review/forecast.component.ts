import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

@Component({
  selector: 'g-forecast',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="bars" role="img" [class.empty]="empty()" [attr.aria-label]="summary()">
      @for (d of bars(); track d.day) {
        <div class="col">
          <span class="n mono">{{ d.count || '' }}</span>
          <i [style.height.%]="d.pct" [class.today]="$first"></i>
          <span class="label">{{ d.label }}</span>
        </div>
      }
    </div>
  `,
  styles: `
    :host {
      display: block;
    }
    .bars {
      display: grid;
      grid-template-columns: repeat(7, 1fr);
      gap: 6px;
      height: 104px;
    }
    /* With nothing due all week the bars are flat, so the chart keeps only their row. */
    .bars.empty {
      height: auto;
    }
    .col {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: flex-end;
      gap: 4px;
    }
    i {
      width: 100%;
      max-width: 28px;
      min-height: 3px;
      border-radius: 5px 5px 2px 2px;
      background: var(--g-stroke);
      transition: height 0.4s ease;
    }
    i.today {
      background: var(--g-accent);
    }
    .n {
      font-size: 11px;
      color: var(--g-muted);
      height: 13px;
    }
    .label {
      font-size: 11px;
      color: var(--g-faint);
    }
  `,
})
export class ForecastComponent {
  readonly days = input.required<{ day: string; count: number }[]>();

  readonly bars = computed(() => {
    const max = Math.max(1, ...this.days().map((d) => d.count));
    return this.days().map((d, i) => ({
      ...d,
      pct: (d.count / max) * 72,
      label: i === 0 ? 'Today' : new Date(`${d.day}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short' }),
    }));
  });

  readonly empty = computed(() => this.days().every((d) => d.count === 0));

  readonly summary = computed(() =>
    this.days()
      .map((d) => `${d.day}: ${d.count}`)
      .join(', '),
  );
}
