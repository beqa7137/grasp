import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { txnOutcome } from '@grasp/engine';
import { RovingSelectDirective } from '../../core/roving-select.directive';

const MODES = [
  { mode: '2pc', label: 'Two-phase commit' },
  { mode: 'saga', label: 'Saga' },
] as const;

/** One order across several services, committed with two-phase commit or a saga: what the client waits and others see. */
@Component({
  selector: 'app-txn-widget',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RovingSelectDirective],
  template: `
    <div class="controls" role="radiogroup" aria-label="Protocol">
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
    <label class="slider">
      <span
        >Services <strong class="mono">{{ services() }}</strong></span
      >
      <input type="range" min="2" max="8" step="1" [value]="services()" (input)="setServices(+$any($event.target).value)" />
    </label>
    <div class="controls" role="radiogroup" aria-label="Failing step">
      <span class="muted">Fails at</span>
      @for (s of steps(); track s) {
        <button class="g-btn" role="radio" [attr.aria-checked]="failAt() === s" [class.primary]="failAt() === s" (click)="failAt.set(s)">
          {{ s === 0 ? 'None' : 'Step ' + s }}
        </button>
      }
    </div>
    @if (mode() === '2pc') {
      <label class="toggle">
        <input type="checkbox" [checked]="crash()" (change)="crash.set($any($event.target).checked)" />
        Coordinator crashes after every service prepared
      </label>
    }

    <dl class="readouts" aria-live="polite">
      <div [class.bad]="run().outcome !== 'committed'">
        <dt>Outcome</dt>
        <dd class="word">{{ run().outcome }}</dd>
      </div>
      <div>
        <dt>Client waits</dt>
        <dd class="word">{{ ms(run().latencyMs) }}</dd>
      </div>
      <div [class.bad]="run().lockMs > 100">
        <dt>Row locks held</dt>
        <dd class="word">{{ ms(run().lockMs) }}</dd>
      </div>
      <div [class.bad]="run().partialMs > 0">
        <dt>Half-done state visible</dt>
        <dd class="word">{{ ms(run().partialMs) }}</dd>
      </div>
      <div>
        <dt>Compensations</dt>
        <dd class="mono">{{ run().compensations }}</dd>
      </div>
    </dl>
    <p class="muted note">
      Each service does 20 ms of local work, 5 ms of network apart. Two-phase commit prepares every service at once; a saga runs them in
      order.
    </p>
  `,
  styleUrl: './widget.scss',
  styles: `
    .controls .muted {
      font-size: 0.875rem;
    }
    .toggle {
      display: flex;
      gap: 8px;
      align-items: center;
      font-size: 0.875rem;
      margin-bottom: 12px;
    }
    .readouts {
      grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
    }
    .note {
      font-size: 0.8125rem;
      margin: 10px 0 0;
    }
  `,
})
export class TxnWidgetComponent {
  readonly modes = MODES;
  readonly mode = signal<'2pc' | 'saga'>('2pc');
  readonly services = signal(4);
  readonly failAt = signal(0);
  readonly crash = signal(false);
  readonly steps = computed(() => Array.from({ length: this.services() + 1 }, (_, i) => i));
  readonly run = computed(() =>
    txnOutcome(this.mode(), {
      services: this.services(),
      stepMs: 20,
      rttMs: 5,
      failAt: this.failAt(),
      coordinatorCrash: this.mode() === '2pc' && this.crash(),
    }),
  );

  setServices(n: number) {
    this.services.set(n);
    if (this.failAt() > n) this.failAt.set(0);
  }

  ms(v: number) {
    return v === Infinity ? 'until the coordinator returns' : `${v} ms`;
  }
}
