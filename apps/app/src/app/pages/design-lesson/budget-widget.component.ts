import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { errorBudget } from '@grasp/engine';
import { RovingSelectDirective } from '../../core/roving-select.directive';

const SLOS = [
  { slo: 0.99, label: '99%' },
  { slo: 0.999, label: '99.9%' },
  { slo: 0.9999, label: '99.99%' },
];

/** An availability SLO over 30 days at 1,000 requests a second: the budget it leaves, how fast errors burn it, and which alerts fire. */
@Component({
  selector: 'app-budget-widget',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DecimalPipe, RovingSelectDirective],
  template: `
    <div class="controls" role="radiogroup" aria-label="Availability SLO">
      <span class="muted">SLO</span>
      @for (s of slos; track s.slo) {
        <button class="g-btn" role="radio" [attr.aria-checked]="slo() === s.slo" [class.primary]="slo() === s.slo" (click)="slo.set(s.slo)">
          {{ s.label }}
        </button>
      }
    </div>
    <label class="slider">
      <span
        >Requests failing now <strong class="mono">{{ errorBasis() / 100 | number: '1.2-2' }}%</strong></span
      >
      <input type="range" min="0" max="300" step="1" [value]="errorBasis()" (input)="errorBasis.set(+$any($event.target).value)" />
    </label>

    <dl class="readouts" aria-live="polite">
      <div>
        <dt>Budget</dt>
        <dd class="mono">{{ budget().budgetMinutes | number: '1.0-2' }} min</dd>
      </div>
      <div>
        <dt>Failures allowed</dt>
        <dd class="mono">{{ budget().allowedFailures | number }}</dd>
      </div>
      <div [class.bad]="budget().burnRate > 1">
        <dt>Burn rate</dt>
        <dd class="mono">{{ budget().burnRate | number: '1.0-2' }}×</dd>
      </div>
      <div [class.bad]="budget().daysToExhaust < 30">
        <dt>Budget lasts</dt>
        <dd class="word">{{ lasts() }}</dd>
      </div>
    </dl>
    <ul class="alerts" aria-label="Burn-rate alerts">
      @for (a of budget().alerts; track a.label) {
        <li [class.fires]="a.fires">
          <span class="state">{{ a.fires ? (a.action === 'page' ? 'Pages' : 'Tickets') : 'Quiet' }}</span>
          <span
            >{{ a.label }} (burn {{ a.burnRate }}× over
            {{ a.longWindowHours < 24 ? a.longWindowHours + ' h' : a.longWindowHours / 24 + ' days' }})</span
          >
        </li>
      }
    </ul>
    <p class="muted note">
      1,000 requests a second over a rolling 30 days. Real alerts also require a short window to agree, so they stop soon after a fix.
    </p>
  `,
  styleUrl: './widget.scss',
  styles: `
    .controls .muted {
      font-size: 0.875rem;
    }
    .alerts {
      list-style: none;
      padding: 0;
      margin: 12px 0 0;
      display: grid;
      gap: 6px;
      font-size: 0.875rem;
      li {
        display: flex;
        gap: 10px;
        align-items: baseline;
      }
      .state {
        min-width: 64px;
        font-weight: 600;
        color: var(--g-muted);
      }
      .fires .state {
        color: var(--g-danger);
      }
    }
    .note {
      font-size: 0.8125rem;
      margin: 10px 0 0;
    }
  `,
})
export class BudgetWidgetComponent {
  readonly slos = SLOS;
  readonly slo = signal(0.999);
  // Hundredths of a percent, so the slider steps stay exact.
  readonly errorBasis = signal(10);
  readonly budget = computed(() => errorBudget({ slo: this.slo(), windowDays: 30, rps: 1000, errorRate: this.errorBasis() / 10_000 }));
  readonly lasts = computed(() => {
    const days = this.budget().daysToExhaust;
    if (days === Infinity) return 'forever';
    return days < 1 ? `${Math.round(days * 24 * 10) / 10} hours` : `${Math.round(days * 10) / 10} days`;
  });
}
