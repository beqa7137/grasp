import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { recovery, type Disaster, type RecoveryPlan } from '@grasp/engine';
import { RovingSelectDirective } from '../../core/roving-select.directive';

const PLANS: { plan: RecoveryPlan; label: string }[] = [
  { plan: 'nightly', label: 'Nightly backup' },
  { plan: 'pitr', label: 'Point-in-time recovery' },
  { plan: 'standby', label: 'Async standby' },
];
const SIZES = [100, 500, 2000, 10_000];
const SPEEDS = [1, 5, 10, 50];

const duration = (sec: number) =>
  sec === 0 ? 'Nothing' : sec < 60 ? `${sec} s` : sec < 3600 ? `${Math.round(sec / 60)} min` : `${Math.round((sec / 3600) * 10) / 10} h`;

/** A database lost to failed disks or a bad delete: how much each recovery plan loses and how long it takes. */
@Component({
  selector: 'app-recovery-widget',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RovingSelectDirective],
  template: `
    <div class="controls" role="radiogroup" aria-label="Plan">
      @for (p of plans; track p.plan) {
        <button
          class="g-btn"
          role="radio"
          [attr.aria-checked]="plan() === p.plan"
          [class.primary]="plan() === p.plan"
          (click)="plan.set(p.plan)"
        >
          {{ p.label }}
        </button>
      }
    </div>
    <div class="controls" role="radiogroup" aria-label="Disaster">
      <span class="muted">Disaster</span>
      <button
        class="g-btn"
        role="radio"
        [attr.aria-checked]="disaster() === 'hardware'"
        [class.primary]="disaster() === 'hardware'"
        (click)="disaster.set('hardware')"
      >
        Disks lost
      </button>
      <button
        class="g-btn"
        role="radio"
        [attr.aria-checked]="disaster() === 'delete'"
        [class.primary]="disaster() === 'delete'"
        (click)="disaster.set('delete')"
      >
        A bad delete
      </button>
    </div>
    <div class="controls" role="radiogroup" aria-label="Database size">
      <span class="muted">Size</span>
      @for (g of sizes; track g) {
        <button class="g-btn" role="radio" [attr.aria-checked]="size() === g" [class.primary]="size() === g" (click)="size.set(g)">
          {{ g >= 1000 ? g / 1000 + ' TB' : g + ' GB' }}
        </button>
      }
    </div>
    <div class="controls" role="radiogroup" aria-label="Restore speed">
      <span class="muted">Restore speed</span>
      @for (r of speeds; track r) {
        <button class="g-btn" role="radio" [attr.aria-checked]="speed() === r" [class.primary]="speed() === r" (click)="speed.set(r)">
          {{ r }} GB/min
        </button>
      }
    </div>
    @if (plan() === 'pitr') {
      <label class="slider">
        <span
          >Archive the log every <strong class="mono">{{ archive() }} s</strong></span
        >
        <input type="range" min="10" max="300" step="10" [value]="archive()" (input)="archive.set(+$any($event.target).value)" />
      </label>
    }
    @if (plan() === 'standby') {
      <label class="slider">
        <span
          >Replication lag <strong class="mono">{{ lag() }} s</strong></span
        >
        <input type="range" min="1" max="60" step="1" [value]="lag()" (input)="lag.set(+$any($event.target).value)" />
      </label>
    }

    <dl class="readouts" aria-live="polite">
      <div [class.bad]="!run().recovers">
        <dt>Data comes back</dt>
        <dd>{{ run().recovers ? 'Yes' : 'No: the delete reached the standby too' }}</dd>
      </div>
      @if (run().recovers) {
        <div [class.bad]="run().rpoSec >= 3600">
          <dt>Writes lost (RPO)</dt>
          <dd class="mono">{{ rpo() }}</dd>
        </div>
        <div [class.bad]="run().rtoMin >= 60">
          <dt>Back in service (RTO)</dt>
          <dd class="mono">{{ rto() }}</dd>
        </div>
      }
    </dl>
    <p class="muted note">Log replay runs 10 times faster than the writes happened, up to a day of them since the nightly base backup.</p>
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
export class RecoveryWidgetComponent {
  readonly plans = PLANS;
  readonly sizes = SIZES;
  readonly speeds = SPEEDS;
  readonly plan = signal<RecoveryPlan>('nightly');
  readonly disaster = signal<Disaster>('hardware');
  readonly size = signal(2000);
  readonly speed = signal(10);
  readonly archive = signal(60);
  readonly lag = signal(5);
  readonly run = computed(() =>
    recovery(this.plan(), this.disaster(), {
      sizeGB: this.size(),
      restoreGBPerMin: this.speed(),
      archiveEverySec: this.archive(),
      replaySpeed: 10,
      lagSec: this.lag(),
    }),
  );
  readonly rpo = computed(() => duration(this.run().rpoSec));
  readonly rto = computed(() => duration(Math.round(this.run().rtoMin * 60)));
}
