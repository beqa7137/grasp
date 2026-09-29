import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { balanceRun, type Balancer } from '@grasp/engine';
import { RovingSelectDirective } from '../../core/roving-select.directive';

const BALANCERS: { balancer: Balancer; label: string }[] = [
  { balancer: 'round-robin', label: 'Round-robin' },
  { balancer: 'random', label: 'Random' },
  { balancer: 'least-connections', label: 'Least connections' },
  { balancer: 'two-choices', label: 'Two random choices' },
];
const SERVERS = [4, 10, 20];
const SLOWDOWNS = [1, 2, 5, 10];

const ms = (v: number) => (v < 1000 ? `${Math.round(v)} ms` : `${(v / 1000).toFixed(1)} s`);

/** Twenty thousand requests across a fleet with one slow server: what each balancing policy does to latency. */
@Component({
  selector: 'app-balancer-widget',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DecimalPipe, RovingSelectDirective],
  template: `
    <div class="controls" role="radiogroup" aria-label="Balancer">
      @for (b of balancers; track b.balancer) {
        <button
          class="g-btn"
          role="radio"
          [attr.aria-checked]="balancer() === b.balancer"
          [class.primary]="balancer() === b.balancer"
          (click)="balancer.set(b.balancer)"
        >
          {{ b.label }}
        </button>
      }
    </div>
    <div class="controls" role="radiogroup" aria-label="Servers">
      <span class="muted">Servers</span>
      @for (n of serverOptions; track n) {
        <button class="g-btn" role="radio" [attr.aria-checked]="servers() === n" [class.primary]="servers() === n" (click)="servers.set(n)">
          {{ n }}
        </button>
      }
    </div>
    <div class="controls" role="radiogroup" aria-label="One server slower by">
      <span class="muted">One server slower by</span>
      @for (k of slowOptions; track k) {
        <button
          class="g-btn"
          role="radio"
          [attr.aria-checked]="slowdown() === k"
          [class.primary]="slowdown() === k"
          (click)="slowdown.set(k)"
        >
          {{ k === 1 ? 'None' : k + '×' }}
        </button>
      }
    </div>
    <label class="slider">
      <span
        >Load <strong class="mono">{{ load() }}%</strong></span
      >
      <input type="range" min="50" max="95" step="5" [value]="load()" (input)="load.set(+$any($event.target).value)" />
    </label>

    <dl class="readouts" aria-live="polite">
      <div>
        <dt>Mean latency</dt>
        <dd class="mono">{{ mean() }}</dd>
      </div>
      <div [class.bad]="run().p99Ms > 500">
        <dt>p99 latency</dt>
        <dd class="mono">{{ p99() }}</dd>
      </div>
      @if (slowdown() > 1) {
        <div>
          <dt>Sent to the slow server</dt>
          <dd class="mono">{{ run().slowShare * 100 | number: '1.1-1' }}%</dd>
        </div>
      }
      <div [class.bad]="run().maxQueue > 50">
        <dt>Longest queue on one server</dt>
        <dd class="mono">{{ run().maxQueue | number }}</dd>
      </div>
    </dl>
    <p class="muted note">
      A server answers a request in 10 ms on average; load is a share of what the whole fleet, slow server included, can answer.
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
export class BalancerWidgetComponent {
  readonly balancers = BALANCERS;
  readonly serverOptions = SERVERS;
  readonly slowOptions = SLOWDOWNS;
  readonly balancer = signal<Balancer>('round-robin');
  readonly servers = signal(10);
  readonly slowdown = signal(1);
  readonly load = signal(70);
  readonly run = computed(() =>
    balanceRun(this.balancer(), { servers: this.servers(), load: this.load() / 100, slowdown: this.slowdown() }),
  );
  readonly mean = computed(() => ms(this.run().meanMs));
  readonly p99 = computed(() => ms(this.run().p99Ms));
}
