import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { tenancyRun, type TenancyPolicy } from '@grasp/engine';
import { RovingSelectDirective } from '../../core/roving-select.directive';

const POLICIES: { policy: TenancyPolicy; label: string }[] = [
  { policy: 'shared', label: 'First come, first served' },
  { policy: 'quota', label: 'Per-tenant quota' },
  { policy: 'fair', label: 'Fair sharing' },
];
const TENANTS = [5, 10, 20, 50];
const BURSTS = [1, 2, 5, 10, 20, 50];

const pct = (v: number) => (v < 10 ? `${v.toFixed(1)}%` : `${Math.round(v)}%`);

/** A pool shared by tenants while one bursts: how each policy splits it between the quiet ones and the noisy one. */
@Component({
  selector: 'app-tenancy-widget',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RovingSelectDirective],
  template: `
    <div class="controls" role="radiogroup" aria-label="Policy">
      @for (p of policies; track p.policy) {
        <button
          class="g-btn"
          role="radio"
          [attr.aria-checked]="policy() === p.policy"
          [class.primary]="policy() === p.policy"
          (click)="policy.set(p.policy)"
        >
          {{ p.label }}
        </button>
      }
    </div>
    <div class="controls" role="radiogroup" aria-label="Tenants">
      <span class="muted">Tenants</span>
      @for (n of tenantOptions; track n) {
        <button class="g-btn" role="radio" [attr.aria-checked]="tenants() === n" [class.primary]="tenants() === n" (click)="tenants.set(n)">
          {{ n }}
        </button>
      }
    </div>
    <label class="slider">
      <span
        >Quiet tenants' load <strong class="mono">{{ load() }}%</strong> of the pool</span
      >
      <input type="range" min="20" max="90" step="10" [value]="load()" (input)="load.set(+$any($event.target).value)" />
    </label>
    <div class="controls" role="radiogroup" aria-label="Noisy tenant's burst">
      <span class="muted">Noisy tenant asks</span>
      @for (b of burstOptions; track b) {
        <button class="g-btn" role="radio" [attr.aria-checked]="burst() === b" [class.primary]="burst() === b" (click)="burst.set(b)">
          {{ b }}×
        </button>
      }
    </div>
    @if (policy() === 'quota') {
      <label class="slider">
        <span
          >Quota per tenant <strong class="mono">{{ quota() }}%</strong> of the pool</span
        >
        <input type="range" min="5" max="50" step="5" [value]="quota()" (input)="quota.set(+$any($event.target).value)" />
      </label>
    }

    <dl class="readouts" aria-live="polite">
      <div [class.bad]="run().quietServedPct < 99.5">
        <dt>Each quiet tenant served</dt>
        <dd class="mono">{{ show(run().quietServedPct) }}</dd>
      </div>
      <div>
        <dt>Noisy tenant served</dt>
        <dd class="mono">{{ show(run().noisyServedPct) }}</dd>
      </div>
      <div [class.bad]="run().utilizationPct < 90 && run().noisyServedPct < 99.5">
        <dt>Pool in use</dt>
        <dd class="mono">{{ show(run().utilizationPct) }}</dd>
      </div>
    </dl>
    <p class="muted note">The noisy tenant asks that many times what one quiet tenant does.</p>
  `,
  styleUrl: './widget.scss',
  styles: `
    .controls .muted {
      font-size: 0.875rem;
    }
    .readouts {
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    }
    .note {
      font-size: 0.8125rem;
      margin: 10px 0 0;
    }
  `,
})
export class TenancyWidgetComponent {
  readonly policies = POLICIES;
  readonly tenantOptions = TENANTS;
  readonly burstOptions = BURSTS;
  readonly show = pct;
  readonly policy = signal<TenancyPolicy>('shared');
  readonly tenants = signal(10);
  readonly load = signal(60);
  readonly burst = signal(20);
  readonly quota = signal(20);
  readonly run = computed(() =>
    tenancyRun(this.policy(), { tenants: this.tenants(), quietLoadPct: this.load(), burst: this.burst(), quotaPct: this.quota() }),
  );
}
