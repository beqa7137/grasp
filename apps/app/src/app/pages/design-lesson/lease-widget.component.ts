import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { leaseRun } from '@grasp/engine';
import { RovingSelectDirective } from '../../core/roving-select.directive';

const STOP_AT = 20;
const SPAN = 90;
const CHART = { width: 300, height: 56, row: 18 };

/** A lease holder that freezes or crashes at 20 s: when a second client takes the lock, and whether a stale write lands. */
@Component({
  selector: 'app-lease-widget',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DecimalPipe, RovingSelectDirective],
  template: `
    <label class="slider">
      <span
        >Lease TTL <strong class="mono">{{ ttl() }} s</strong></span
      >
      <input type="range" min="2" max="60" step="1" [value]="ttl()" (input)="setTtl(+$any($event.target).value)" />
    </label>
    <label class="slider">
      <span
        >Renew every <strong class="mono">{{ renew() }} s</strong></span
      >
      <input type="range" min="1" [max]="ttl() - 1" step="1" [value]="renew()" (input)="renew.set(+$any($event.target).value)" />
    </label>
    <div class="controls" role="radiogroup" aria-label="At 20 s the holder">
      <span class="muted">At 20 s the holder</span>
      <button class="g-btn" role="radio" [attr.aria-checked]="!crash()" [class.primary]="!crash()" (click)="crash.set(false)">
        Pauses
      </button>
      <button class="g-btn" role="radio" [attr.aria-checked]="crash()" [class.primary]="crash()" (click)="crash.set(true)">Crashes</button>
    </div>
    @if (!crash()) {
      <label class="slider">
        <span
          >Pause <strong class="mono">{{ pause() }} s</strong></span
        >
        <input type="range" min="0" max="60" step="1" [value]="pause()" (input)="pause.set(+$any($event.target).value)" />
      </label>
    }
    <label class="toggle">
      <input type="checkbox" [checked]="fencing()" (change)="fencing.set($any($event.target).checked)" />
      Fencing tokens
    </label>

    <svg class="chart" [attr.viewBox]="'0 0 ' + chart.width + ' ' + chart.height" role="img" [attr.aria-label]="timelineLabel()">
      <rect class="held" x="0" y="2" [attr.width]="x(run().expiresAtSec)" [attr.height]="chart.row" />
      <rect class="stopped" [attr.x]="x(stopAt)" y="2" [attr.width]="x(stoppedUntil()) - x(stopAt)" [attr.height]="chart.row" />
      @if (run().lost) {
        <rect
          class="other"
          [attr.x]="x(run().expiresAtSec)"
          [attr.y]="chart.row + 8"
          [attr.width]="chart.width - x(run().expiresAtSec)"
          [attr.height]="chart.row"
        />
      }
      @if (run().wakesAtSec !== null && run().lost) {
        <line
          class="write"
          [class.bad]="run().staleWrite === 'accepted'"
          [attr.x1]="x(run().wakesAtSec!)"
          [attr.x2]="x(run().wakesAtSec!)"
          y1="0"
          [attr.y2]="chart.height"
        />
      }
    </svg>
    <p class="muted caption">
      Top: the first client's lease, and its pause or crash. Below: the second client's lease. The line marks the woken client's write.
    </p>

    <dl class="readouts" aria-live="polite">
      <div>
        <dt>Lease runs out at</dt>
        <dd class="mono">{{ run().expiresAtSec }} s</dd>
      </div>
      <div [class.bad]="run().lost">
        <dt>Lock</dt>
        <dd>{{ run().lost ? 'Lost, and taken by the other client' : 'Kept' }}</dd>
      </div>
      @if (crash()) {
        <div [class.bad]="(run().failoverSec ?? 0) > 10">
          <dt>No one holds it for</dt>
          <dd class="mono">{{ run().failoverSec }} s</dd>
        </div>
      } @else {
        <div [class.bad]="run().staleWrite === 'accepted'">
          <dt>Its write at {{ run().wakesAtSec }} s</dt>
          <dd>{{ writeVerdict() }}</dd>
        </div>
      }
      <div>
        <dt>Renewals a minute</dt>
        <dd class="mono">{{ run().renewalsPerMinute | number: '1.0-1' }}</dd>
      </div>
    </dl>
  `,
  styleUrl: './widget.scss',
  styles: `
    .controls .muted {
      font-size: 0.875rem;
    }
    .chart {
      display: block;
      width: 100%;
      height: auto;
      margin-top: 12px;
      .held {
        fill: var(--g-accent);
      }
      .stopped {
        fill: var(--g-muted);
        opacity: 0.6;
      }
      .other {
        fill: var(--g-found-ink);
      }
      .write {
        stroke: var(--g-found-ink);
        stroke-width: 2;
        &.bad {
          stroke: var(--g-warn-ink);
        }
      }
    }
    .caption {
      font-size: 0.8125rem;
      margin: 4px 0 0;
    }
    .readouts {
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    }
  `,
})
export class LeaseWidgetComponent {
  readonly chart = CHART;
  readonly stopAt = STOP_AT;
  readonly ttl = signal(10);
  readonly renew = signal(3);
  readonly pause = signal(15);
  readonly crash = signal(false);
  readonly fencing = signal(false);
  readonly run = computed(() =>
    leaseRun({
      ttlSec: this.ttl(),
      renewSec: this.renew(),
      stopAtSec: STOP_AT,
      pauseSec: this.pause(),
      crash: this.crash(),
      fencing: this.fencing(),
    }),
  );
  readonly stoppedUntil = computed(() => (this.crash() ? SPAN : Math.min(SPAN, STOP_AT + this.pause())));
  readonly writeVerdict = computed(() => {
    const verdict = this.run().staleWrite;
    return verdict === 'none'
      ? 'Fine: it still holds the lock'
      : verdict === 'accepted'
        ? 'Accepted: two holders wrote'
        : 'Rejected: its token is stale';
  });
  readonly timelineLabel = computed(() => {
    const r = this.run();
    const second = r.lost ? `, and the other client takes the lock at ${r.expiresAtSec} s` : '';
    return `The first client's lease runs out at ${r.expiresAtSec} s${second}`;
  });

  x(sec: number) {
    return (Math.min(sec, SPAN) / SPAN) * CHART.width;
  }

  setTtl(ttl: number) {
    this.ttl.set(ttl);
    if (this.renew() >= ttl) this.renew.set(ttl - 1);
  }
}
