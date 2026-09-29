import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { regionOutcome, type RegionMode } from '@grasp/engine';
import { RovingSelectDirective } from '../../core/roving-select.directive';

const MODES: { mode: RegionMode; label: string }[] = [
  { mode: 'single', label: 'One region' },
  { mode: 'replicas', label: 'Read replicas' },
  { mode: 'quorum', label: 'Quorum' },
  { mode: 'active-active', label: 'Active-active' },
];
const REGIONS = ['US East', 'EU West', 'Asia'];
const RTT = [
  [0, 80, 220],
  [80, 0, 160],
  [220, 160, 0],
];

/** Three regions of users and one database layout: what reads and writes cost, and what losing the primary region costs. */
@Component({
  selector: 'app-region-widget',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DecimalPipe, RovingSelectDirective],
  template: `
    <div class="controls" role="radiogroup" aria-label="Database layout">
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
    @if (mode() !== 'active-active') {
      <div class="controls" role="radiogroup" [attr.aria-label]="mode() === 'quorum' ? 'Leader region' : 'Primary region'">
        <span class="muted">{{ mode() === 'quorum' ? 'Leader' : 'Primary' }}</span>
        @for (r of regions; track r; let i = $index) {
          <button
            class="g-btn"
            role="radio"
            [attr.aria-checked]="primary() === i"
            [class.primary]="primary() === i"
            (click)="primary.set(i)"
          >
            {{ r }}
          </button>
        }
      </div>
    }
    <label class="slider">
      <span
        >Reads <strong class="mono">{{ readShare() }}%</strong> of requests</span
      >
      <input type="range" min="50" max="99" step="1" [value]="readShare()" (input)="readShare.set(+$any($event.target).value)" />
    </label>

    <dl class="readouts" aria-live="polite">
      <div>
        <dt>Read</dt>
        <dd class="mono">{{ outcome().readMs | number: '1.0-0' }} ms</dd>
      </div>
      <div>
        <dt>Write</dt>
        <dd class="mono">{{ outcome().writeMs | number: '1.0-0' }} ms</dd>
      </div>
      <div>
        <dt>Mean request</dt>
        <dd class="mono">{{ outcome().meanMs | number: '1.0-0' }} ms</dd>
      </div>
      <div [class.bad]="outcome().rpoMs > 0">
        <dt>Lost if the primary region dies</dt>
        <dd class="word">{{ rpo() }}</dd>
      </div>
      <div [class.bad]="outcome().rtoSec > 600">
        <dt>Writes resume after</dt>
        <dd class="word">{{ rto() }}</dd>
      </div>
      <div [class.bad]="outcome().conflicts">
        <dt>Write conflicts</dt>
        <dd class="word">{{ outcome().conflicts ? 'possible' : 'none' }}</dd>
      </div>
    </dl>
    <p class="muted note">
      Users: 50% near US East, 30% near EU West, 20% near Asia, each 20 ms from their region. Round trips: US to EU 80 ms, US to Asia 220
      ms, EU to Asia 160 ms. Replication lags 500 ms; recovery times are typical figures, not guarantees.
    </p>
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
export class RegionWidgetComponent {
  readonly modes = MODES;
  readonly regions = REGIONS;
  readonly mode = signal<RegionMode>('single');
  readonly primary = signal(0);
  readonly readShare = signal(90);
  readonly outcome = computed(() =>
    regionOutcome(this.mode(), {
      users: [0.5, 0.3, 0.2],
      rtt: RTT,
      primary: this.primary(),
      accessMs: 20,
      readShare: this.readShare() / 100,
      lagMs: 500,
    }),
  );
  readonly rpo = computed(() => {
    const ms = this.outcome().rpoMs;
    if (ms >= 3_600_000) return 'up to 1 h (last backup)';
    return ms ? `about ${ms} ms of writes` : 'nothing';
  });
  readonly rto = computed(() => {
    const s = this.outcome().rtoSec;
    return s >= 3600 ? `${s / 3600} h (restore)` : `${s} s`;
  });
}
