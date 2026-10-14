import { ChangeDetectionStrategy, Component, computed, signal, viewChild } from '@angular/core';
import { formatNumber } from './number-format';
import { leaseRun } from '@grasp/engine';
import { RovingSelectDirective } from '../../core/roving-select.directive';
import type { ChartAxis } from '../../viz/kit/chart-frame.component';
import { StageComponent } from '../../viz/kit/stage.component';
import {
  TimelineComponent,
  timelineHeight,
  type TimelineEvent,
  type TimelineMessage,
  type TimelineSpan,
} from '../../viz/kit/timeline.component';
import { legendLines } from '../../viz/kit/timeline-layout';

const STOP_AT = 20;
const SPAN = 90;
const AXIS: ChartAxis = { min: 0, max: SPAN, ticks: [0, 30, 60, 90], format: (v) => `${v} s` };
const LANES = [
  { id: 'first', label: 'Client 1' },
  { id: 'second', label: 'Client 2' },
  { id: 'store', label: 'Store' },
];
const LEGEND = ['holds the lock', 'paused', 'crashed'];

/** A lease holder that freezes or crashes at 20 s: when a second client takes the lock, and whether a stale write lands. */
@Component({
  selector: 'app-lease-widget',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RovingSelectDirective, StageComponent, TimelineComponent],
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

    <g-stage [height]="stageHeight()" label="Two clients and a lock over 90 seconds">
      @if (stage().width(); as width) {
        <g-timeline
          class="timeline"
          [width]="width - 16"
          [legendLines]="legendLines(width - 16)"
          [axis]="axis"
          [lanes]="lanes"
          [spans]="spans()"
          [events]="events()"
          [messages]="messages()"
          [summary]="timelineLabel()"
        />
      }
    </g-stage>

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
        <dd class="mono">{{ num(run().renewalsPerMinute, 1, 0) }}</dd>
      </div>
    </dl>
  `,
  styleUrl: './widget.scss',
  styles: `
    .controls .muted {
      font-size: 0.875rem;
    }
    g-stage {
      margin-top: var(--g-space-3);
    }
    .timeline {
      position: absolute;
      left: var(--g-space-2);
      top: var(--g-space-2);
    }
    .readouts {
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    }
  `,
})
export class LeaseWidgetComponent {
  readonly num = formatNumber;
  readonly stage = viewChild.required(StageComponent);
  readonly axis = AXIS;
  readonly lanes = LANES;
  readonly legendLines = (width: number) => legendLines(LEGEND, width - 32);
  readonly stageHeight = computed(() => timelineHeight(LANES.length, this.legendLines(Math.max(256, this.stage().width()) - 16)) + 16);
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
  readonly spans = computed((): TimelineSpan[] => {
    const r = this.run();
    const held = r.lost ? r.expiresAtSec : SPAN;
    return [
      { lane: 'first', from: 0, to: held, tone: 'final', label: LEGEND[0] },
      { lane: 'first', from: STOP_AT, to: this.stoppedUntil(), tone: 'muted', label: this.crash() ? LEGEND[2] : LEGEND[1] },
      ...(r.lost ? [{ lane: 'second', from: r.expiresAtSec, to: SPAN, tone: 'final' as const, label: LEGEND[0] }] : []),
    ];
  });
  readonly events = computed((): TimelineEvent[] => {
    const r = this.run();
    const events: TimelineEvent[] = [
      { lane: 'first', at: 0, n: 1, tone: 'current', label: 'takes the lock' },
      { lane: 'first', at: STOP_AT, n: 2, tone: 'considering', label: this.crash() ? `crashes, ${STOP_AT} s` : `pauses, ${STOP_AT} s` },
    ];
    if (r.lost) {
      events.push({ lane: 'second', at: r.expiresAtSec, n: 3, tone: 'current', label: `takes the lock, ${r.expiresAtSec} s` });
    }
    if (r.wakesAtSec !== null && r.wakesAtSec <= SPAN) {
      const verdict = r.staleWrite === 'accepted' ? 'two holders wrote' : r.staleWrite === 'rejected' ? 'rejected, stale token' : 'written';
      events.push({
        lane: 'store',
        at: r.wakesAtSec,
        n: events.length + 1,
        tone: r.staleWrite === 'accepted' ? 'critical' : 'final',
        label: verdict,
      });
    }
    return events;
  });
  readonly messages = computed((): TimelineMessage[] => {
    const r = this.run();
    if (r.wakesAtSec === null || r.wakesAtSec > SPAN) return [];
    return [
      {
        id: 'write',
        from: { lane: 'first', at: r.wakesAtSec },
        to: { lane: 'store', at: r.wakesAtSec },
        tone: r.staleWrite === 'accepted' ? 'critical' : 'current',
        rejected: r.staleWrite === 'rejected',
      },
    ];
  });
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

  setTtl(ttl: number) {
    this.ttl.set(ttl);
    if (this.renew() >= ttl) this.renew.set(ttl - 1);
  }
}
