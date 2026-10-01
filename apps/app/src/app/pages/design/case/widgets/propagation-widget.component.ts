import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal } from '@angular/core';
import {
  PROPAGATION,
  PROPAGATION_LIMITS,
  bytesRate,
  num,
  propagation,
  propagationCheckpoint,
  secondsText,
  type FlagDelivery,
  type PollPayload,
  type PropagationSettings,
} from '@grasp/engine';
import { RovingSelectDirective } from '../../../../core/roving-select.directive';
import { WidgetCheckComponent } from './widget-check.component';

type Slider = 'instances' | 'intervalS' | 'changesPerMin';

const SLIDERS: { key: Slider; label: string; unit: string; spoken: (v: number) => string; poll?: true }[] = [
  { key: 'instances', label: 'SDK instances', unit: '', spoken: (v) => `${num(v)} instances` },
  { key: 'intervalS', label: 'Polling interval', unit: ' s', spoken: (v) => `${v} seconds`, poll: true },
  { key: 'changesPerMin', label: 'Flag changes', unit: ' a minute', spoken: (v) => `${v} change${v === 1 ? '' : 's'} a minute` },
];

const DELIVERIES: { delivery: FlagDelivery; label: string }[] = [
  { delivery: 'stream', label: 'Stream (server-sent events)' },
  { delivery: 'poll', label: 'Poll' },
];

const PAYLOADS: { payload: PollPayload; label: string }[] = [
  { payload: 'full', label: 'Whole ruleset' },
  { payload: 'etag', label: 'Whole ruleset if changed (ETag)' },
  { payload: 'delta', label: 'Changes since its version' },
];

/** How long input must rest before the summary is announced, so dragging a slider does not queue an announcement per step. */
const SETTLE_MS = 600;

/** Getting flag changes to every SDK: streaming or polling, with a CDN, ETags or deltas, and what each costs in time and bytes. */
@Component({
  selector: 'app-propagation-widget',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RovingSelectDirective, WidgetCheckComponent],
  template: `
    <div class="controls" role="radiogroup" aria-label="Delivery">
      @for (d of deliveries; track d.delivery) {
        <button
          class="g-btn"
          role="radio"
          [attr.aria-checked]="settings().delivery === d.delivery"
          [class.primary]="settings().delivery === d.delivery"
          (click)="set({ delivery: d.delivery })"
        >
          {{ d.label }}
        </button>
      }
    </div>
    @if (polling()) {
      <div class="controls" role="radiogroup" aria-label="Each poll downloads">
        @for (p of payloads; track p.payload) {
          <button
            class="g-btn"
            role="radio"
            [attr.aria-checked]="settings().payload === p.payload"
            [class.primary]="settings().payload === p.payload"
            (click)="set({ payload: p.payload })"
          >
            {{ p.label }}
          </button>
        }
      </div>
      <label class="check-row">
        <input type="checkbox" [checked]="settings().cdn" (change)="set({ cdn: $any($event.target).checked })" />
        Through a CDN that caches the ruleset for one interval
      </label>
    }
    @for (s of sliders; track s.key) {
      @if (!s.poll || polling()) {
        <label class="slider">
          <span
            >{{ s.label }} <strong class="mono">{{ format(settings()[s.key]) }}{{ s.unit }}</strong></span
          >
          <input
            type="range"
            [min]="limits[s.key].min"
            [max]="limits[s.key].max"
            [step]="limits[s.key].step"
            [value]="settings()[s.key]"
            [attr.aria-valuetext]="s.spoken(settings()[s.key])"
            (input)="slide(s.key, +$any($event.target).value)"
          />
        </label>
      }
    }

    @if (chosen() !== null) {
      <dl class="readouts">
        <div [class.bad]="run().worstS > 10">
          <dt>Last instance has it</dt>
          <dd class="mono">{{ seconds(run().worstS) }}</dd>
        </div>
        <div>
          <dt>Typical instance</dt>
          <dd class="mono">{{ seconds(run().typicalS) }}</dd>
        </div>
        @if (polling()) {
          <div>
            <dt>Requests to the service</dt>
            <dd class="mono">{{ requests(run().originRps) }}</dd>
          </div>
        } @else {
          <div>
            <dt>Stream servers</dt>
            <dd class="mono">{{ run().streamServers }}</dd>
          </div>
        }
        <div [class.bad]="run().originBytesS > 1e8">
          <dt>Leaving the service</dt>
          <dd class="mono">{{ bytes(run().originBytesS) }}</dd>
        </div>
        <div>
          <dt>Reaching all SDKs</dt>
          <dd class="mono">{{ bytes(run().sdkBytesS) }}</dd>
        </div>
      </dl>
    } @else {
      <p class="muted hidden-note">Time to converge, requests and bytes show once you answer the prediction below.</p>
    }
    <p class="visually-hidden" role="status">{{ announcement() }}</p>
    <p class="muted note">
      Assumed: a {{ model.rulesetKb / 1000 }} MB ruleset, {{ model.changeKb }} KB a changed flag, {{ model.headerKb }} KB of headers a poll,
      {{ seconds(model.publishS) }} to publish a change, {{ model.cdnEdges }} CDN edges, and stream servers holding
      {{ format(model.connectionsPerServer) }} connections and writing {{ format(model.sendsPerServerS) }} messages a second each. Changes
      arrive at random; streams send only the changes (heartbeats and reconnects are left out).
    </p>

    <app-widget-check [check]="check()" [chosen]="chosen()" (chosenChange)="answer($event)" />
  `,
  styleUrl: '../../../design-lesson/widget.scss',
  styles: `
    .check-row {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 12px;
      font-size: 0.875rem;
      input {
        width: 18px;
        height: 18px;
        accent-color: var(--g-accent);
      }
    }
    .readouts {
      grid-template-columns: repeat(auto-fit, minmax(128px, 1fr));
    }
    .hidden-note {
      font-size: 0.8125rem;
      margin: 0;
    }
    .note {
      font-size: 0.8125rem;
      margin: 10px 0 16px;
      line-height: 1.5;
    }
  `,
})
export class PropagationWidgetComponent {
  readonly sliders = SLIDERS;
  readonly deliveries = DELIVERIES;
  readonly payloads = PAYLOADS;
  readonly limits = PROPAGATION_LIMITS;
  readonly format = num;
  readonly seconds = secondsText;
  readonly bytes = bytesRate;
  readonly settings = signal<PropagationSettings>({
    instances: 20_000,
    delivery: 'poll',
    intervalS: 30,
    payload: 'full',
    cdn: false,
    changesPerMin: 2,
  });
  readonly polling = computed(() => this.settings().delivery === 'poll');
  readonly run = computed(() => propagation(this.settings()));
  readonly check = computed(() => propagationCheckpoint(this.settings()));
  private readonly answers = signal<{ asked: PropagationSettings; chosen: number } | null>(null);
  readonly chosen = computed(() => {
    const a = this.answers();
    return a?.asked === this.settings() ? a.chosen : null;
  });
  readonly announcement = signal('');
  readonly model = PROPAGATION;

  constructor() {
    let timer: ReturnType<typeof setTimeout> | undefined;
    inject(DestroyRef).onDestroy(() => clearTimeout(timer));
    effect(() => {
      const summary = this.summary();
      clearTimeout(timer);
      timer = setTimeout(() => this.announcement.set(summary), SETTLE_MS);
    });
  }

  requests(v: number) {
    return `${v < 10 ? Number(v.toFixed(1)) : num(v)}/s`;
  }

  private summary(): string {
    const s = this.settings();
    const how = s.delivery === 'stream' ? 'Streaming' : `Polling every ${s.intervalS} seconds`;
    const head = `${how} to ${num(s.instances)} instances, ${s.changesPerMin} changes a minute.`;
    if (this.chosen() === null) return `${head} Answer the prediction to see the results.`;
    const run = this.run();
    return `${head} Last instance has a change after ${secondsText(run.worstS)}, ${bytesRate(run.originBytesS)} leaving the service.`;
  }

  set(change: Partial<PropagationSettings>) {
    const s = this.settings();
    if ((Object.keys(change) as (keyof PropagationSettings)[]).every((k) => change[k] === s[k])) return;
    this.settings.set({ ...s, ...change });
  }

  slide(key: Slider, value: number) {
    this.set({ [key]: value });
  }

  answer(chosen: number | null) {
    if (chosen !== null) this.answers.set({ asked: this.settings(), chosen });
  }
}
