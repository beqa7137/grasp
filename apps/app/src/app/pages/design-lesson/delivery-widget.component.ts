import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { delivery, type DeliveryMode } from '@grasp/engine';
import { RovingSelectDirective } from '../../core/roving-select.directive';

const MODES: { mode: DeliveryMode; label: string }[] = [
  { mode: 'polling', label: 'Polling' },
  { mode: 'long-polling', label: 'Long polling' },
  { mode: 'sse', label: 'Server-sent events' },
  { mode: 'websocket', label: 'WebSocket' },
];
const CLIENTS = [
  { n: 10_000, label: '10k' },
  { n: 100_000, label: '100k' },
  { n: 1_000_000, label: '1M' },
  { n: 10_000_000, label: '10M' },
];

/** Clients waiting for events: what each delivery method costs the servers and how late the events arrive. */
@Component({
  selector: 'app-delivery-widget',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DecimalPipe, RovingSelectDirective],
  template: `
    <div class="controls" role="radiogroup" aria-label="Delivery method">
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
    <div class="controls" role="radiogroup" aria-label="Clients">
      <span class="muted">Clients</span>
      @for (c of clientOptions; track c.n) {
        <button
          class="g-btn"
          role="radio"
          [attr.aria-checked]="clients() === c.n"
          [class.primary]="clients() === c.n"
          (click)="clients.set(c.n)"
        >
          {{ c.label }}
        </button>
      }
    </div>
    @if (mode() === 'polling') {
      <label class="slider">
        <span
          >Poll every <strong class="mono">{{ pollSec() }} s</strong></span
        >
        <input type="range" min="1" max="60" step="1" [value]="pollSec()" (input)="pollSec.set(+$any($event.target).value)" />
      </label>
    }
    <label class="slider">
      <span
        >Events per client per minute <strong class="mono">{{ events() }}</strong></span
      >
      <input type="range" min="0" max="60" step="1" [value]="events()" (input)="events.set(+$any($event.target).value)" />
    </label>

    <dl class="readouts" aria-live="polite">
      <div [class.bad]="run().requestsPerSecond > 100_000">
        <dt>Requests a second</dt>
        <dd class="mono">{{ run().requestsPerSecond | number: '1.0-0' }}</dd>
      </div>
      <div [class.bad]="run().delayMs > 1000">
        <dt>Average delay</dt>
        <dd class="mono">{{ delay() }}</dd>
      </div>
      <div>
        <dt>Open connections</dt>
        <dd class="mono">{{ run().openConnections | number: '1.0-0' }}</dd>
      </div>
      <div>
        <dt>Header traffic</dt>
        <dd class="mono">{{ run().headerMBps | number: '1.0-1' }} MB/s</dd>
      </div>
    </dl>
    <p class="muted note">
      A round trip takes 100 ms and every HTTP request carries about 800 bytes of headers; a long poll times out after 30 s.
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
export class DeliveryWidgetComponent {
  readonly modes = MODES;
  readonly clientOptions = CLIENTS;
  readonly mode = signal<DeliveryMode>('polling');
  readonly clients = signal(1_000_000);
  readonly pollSec = signal(5);
  readonly events = signal(1);
  readonly run = computed(() =>
    delivery(this.mode(), { clients: this.clients(), pollSec: this.pollSec(), eventsPerMinute: this.events() }),
  );
  readonly delay = computed(() => {
    const ms = this.run().delayMs;
    return ms < 1000 ? `${Math.round(ms)} ms` : `${Math.round(ms / 100) / 10} s`;
  });
}
