import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { discoveryRun, type DiscoveryMode } from '@grasp/engine';
import { RovingSelectDirective } from '../../core/roving-select.directive';

const MODES: { mode: DiscoveryMode; label: string }[] = [
  { mode: 'dns', label: 'DNS' },
  { mode: 'registry', label: 'Registry' },
  { mode: 'health-check', label: 'Load balancer checks' },
];

/** One of 20 instances dies: how long each way of finding instances keeps sending it traffic, and what the checking costs. */
@Component({
  selector: 'app-discovery-widget',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DecimalPipe, RovingSelectDirective],
  template: `
    <div class="controls" role="radiogroup" aria-label="Discovery">
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
    @switch (mode()) {
      @case ('dns') {
        <label class="slider">
          <span
            >DNS TTL <strong class="mono">{{ ttl() }} s</strong></span
          >
          <input type="range" min="5" max="300" step="5" [value]="ttl()" (input)="ttl.set(+$any($event.target).value)" />
        </label>
      }
      @case ('registry') {
        <label class="slider">
          <span
            >Heartbeat every <strong class="mono">{{ heartbeat() }} s</strong></span
          >
          <input type="range" min="1" max="30" step="1" [value]="heartbeat()" (input)="heartbeat.set(+$any($event.target).value)" />
        </label>
        <label class="slider">
          <span
            >Missed beats before removal <strong class="mono">{{ missed() }}</strong></span
          >
          <input type="range" min="1" max="5" step="1" [value]="missed()" (input)="missed.set(+$any($event.target).value)" />
        </label>
        <label class="slider">
          <span
            >Client cache refresh <strong class="mono">{{ cache() }} s</strong></span
          >
          <input type="range" min="0" max="60" step="5" [value]="cache()" (input)="cache.set(+$any($event.target).value)" />
        </label>
      }
      @case ('health-check') {
        <label class="slider">
          <span
            >Health check every <strong class="mono">{{ check() }} s</strong></span
          >
          <input type="range" min="1" max="30" step="1" [value]="check()" (input)="check.set(+$any($event.target).value)" />
        </label>
        <label class="slider">
          <span
            >Failures in a row <strong class="mono">{{ failures() }}</strong></span
          >
          <input type="range" min="1" max="5" step="1" [value]="failures()" (input)="failures.set(+$any($event.target).value)" />
        </label>
      }
    }

    <dl class="readouts" aria-live="polite">
      <div [class.bad]="run().staleSec > 30">
        <dt>Traffic still sent to it for</dt>
        <dd class="mono">{{ run().staleSec }} s</dd>
      </div>
      <div>
        <dt>Requests sent to the dead instance</dt>
        <dd class="mono">{{ run().failedRequests | number: '1.0-0' }}</dd>
      </div>
      <div>
        <dt>Checks a second</dt>
        <dd class="mono">{{ run().checksPerSecond | number: '1.0-1' }}</dd>
      </div>
    </dl>
    <p class="muted note">20 instances share 10,000 requests a second, 500 each; the numbers are the worst case.</p>
  `,
  styleUrl: './widget.scss',
  styles: `
    .readouts {
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    }
    .note {
      font-size: 0.8125rem;
      margin: 10px 0 0;
    }
  `,
})
export class DiscoveryWidgetComponent {
  readonly modes = MODES;
  readonly mode = signal<DiscoveryMode>('dns');
  readonly ttl = signal(60);
  readonly heartbeat = signal(10);
  readonly missed = signal(3);
  readonly cache = signal(30);
  readonly check = signal(5);
  readonly failures = signal(3);
  readonly run = computed(() =>
    discoveryRun(this.mode(), {
      instances: 20,
      rps: 10_000,
      ttlSec: this.ttl(),
      heartbeatSec: this.heartbeat(),
      missedBeats: this.missed(),
      cacheSec: this.cache(),
      checkSec: this.check(),
      failures: this.failures(),
    }),
  );
}
