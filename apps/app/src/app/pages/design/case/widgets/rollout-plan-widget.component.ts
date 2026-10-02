import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import {
  BAKE_STOPS,
  CANARY_STOPS,
  DETECT_STOPS,
  FLEET_STOPS,
  HOST_TIME_STOPS,
  UNAVAILABLE_STOPS,
  WAVE_SHAPES,
  WAVE_STOPS,
  durationSpoken,
  durationText,
  hostsText,
  num,
  rollout,
  rolloutCheckpoint,
  shareText,
  waveSizes,
  type RolloutSettings,
  type WaveShape,
  type WidgetCheckpoint,
} from '@grasp/engine';
import { RovingSelectDirective } from '../../../../core/roving-select.directive';
import { settledAnnouncement } from './settled-announcement';
import { WidgetCheckComponent } from './widget-check.component';

type Slider = Exclude<keyof RolloutSettings, 'shape'>;

const minutes = (v: number) => (v === 0 ? 'none' : durationText(v));
const minutesSpoken = (v: number) => (v === 0 ? 'no bake' : durationSpoken(v));

const SLIDERS: { key: Slider; label: string; stops: readonly number[]; shown: (v: number) => string; spoken: (v: number) => string }[] = [
  { key: 'fleet', label: 'Hosts in the fleet', stops: FLEET_STOPS, shown: num, spoken: hostsText },
  { key: 'canaryPct', label: 'Canary', stops: CANARY_STOPS, shown: (v) => `${v}%`, spoken: (v) => `${v} percent of hosts` },
  { key: 'waves', label: 'Waves after the canary', stops: WAVE_STOPS, shown: num, spoken: (v) => `${v} wave${v === 1 ? '' : 's'}` },
  { key: 'bakeMin', label: 'Bake after each wave', stops: BAKE_STOPS, shown: minutes, spoken: minutesSpoken },
  {
    key: 'maxUnavailablePct',
    label: 'Most hosts out at once',
    stops: UNAVAILABLE_STOPS,
    shown: (v) => `${v}%`,
    spoken: (v) => `${v} percent of hosts`,
  },
  { key: 'hostMin', label: 'Time per batch', stops: HOST_TIME_STOPS, shown: durationText, spoken: durationSpoken },
  { key: 'detectMin', label: 'Analysis flags a bad build after', stops: DETECT_STOPS, shown: durationText, spoken: durationSpoken },
];

const SHAPES: Record<WaveShape, string> = { equal: 'Equal waves', doubling: 'Each wave doubles' };

/** Chart drawing, in viewBox units. */
const LEFT = 8;
const WIDTH = 284;
const TOP = 8;
const BOTTOM = 92;

/** A staged rollout of a bad build: how long the plan takes, the capacity it costs, and how far the build gets before the alarm. */
@Component({
  selector: 'app-rollout-plan-widget',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RovingSelectDirective, WidgetCheckComponent],
  template: `
    <div class="controls" role="radiogroup" aria-label="How the hosts after the canary are split">
      @for (shape of shapes; track shape) {
        <button
          class="g-btn"
          role="radio"
          [attr.aria-checked]="settings().shape === shape"
          [class.primary]="settings().shape === shape"
          (click)="set({ shape })"
        >
          {{ shapeText[shape] }}
        </button>
      }
    </div>
    @for (s of sliders; track s.key) {
      <label class="slider">
        <span
          >{{ s.label }} <strong class="mono">{{ s.shown(settings()[s.key]) }}</strong></span
        >
        <input
          type="range"
          min="0"
          [max]="s.stops.length - 1"
          step="1"
          [value]="s.stops.indexOf(settings()[s.key])"
          [attr.aria-valuetext]="s.spoken(settings()[s.key])"
          (input)="slide(s.key, s.stops[+$any($event.target).value])"
        />
      </label>
    }
    <p class="plan mono">{{ planText() }}</p>

    @if (answered()) {
      <svg class="chart" viewBox="0 0 300 100" role="img" [attr.aria-label]="chartLabel()">
        <path class="axis" [attr.d]="axis" />
        <path class="alarm" [attr.d]="drawing().alarm" />
        <path class="hosts" [attr.d]="drawing().hosts" />
        <circle class="exposed" [attr.cx]="drawing().alarmX" [attr.cy]="drawing().exposedY" r="4" />
      </svg>
      <div class="axis-labels" aria-hidden="true">
        <span>0</span>
        <span>{{ duration(drawing().endMin) }}</span>
      </div>
      <ul class="legend-list" aria-hidden="true">
        <li><span class="swatch hosts"></span>Hosts on the new build as planned, up to {{ format(settings().fleet) }} (solid line)</li>
        <li><span class="swatch alarm"></span>Alarm (dashed line)</li>
        <li><span class="swatch exposed"></span>Reached by the bad build (circle)</li>
      </ul>
      <dl class="readouts">
        <div>
          <dt>Rollout takes</dt>
          <dd class="mono">{{ duration(run().totalMin) }}</dd>
        </div>
        <div>
          <dt>Most capacity out</dt>
          <dd class="mono">{{ share(run().peakDown) }}</dd>
        </div>
        <div>
          <dt>Alarm at</dt>
          <dd class="mono">{{ duration(run().detectAtMin) }}</dd>
        </div>
        <div [class.bad]="run().exposed > run().canary">
          <dt>Bad build reached</dt>
          <dd class="mono">{{ hosts(run().exposed) }}, {{ share(run().exposed) }}</dd>
        </div>
      </dl>
    } @else {
      <p class="muted hidden-note">The timeline, the time, the capacity and the blast radius show once you answer the prediction below.</p>
    }
    <p class="visually-hidden" role="status">{{ announcement() }}</p>
    <p class="muted note">
      Hosts update one batch at a time: a batch is the most hosts allowed out at once, and it drains, swaps the build, restarts and passes
      readiness in the time per batch, serving nothing meanwhile. A host has the build from the moment its batch starts. The alarm fires the
      set time after the first canary batch serves; the rollout then stops, and no new batch starts.
    </p>

    <app-widget-check [check]="shownCheck()" [chosen]="chosen()" (chosenChange)="answer($event)" />
  `,
  styleUrl: '../../../design-lesson/widget.scss',
  styles: `
    .plan {
      margin: 0 0 12px;
      font-size: 0.8125rem;
      line-height: 1.5;
      overflow-wrap: anywhere;
    }
    .chart {
      max-width: 520px;
      margin: 4px auto 0;
      border-radius: var(--g-radius-sm);
      background: var(--g-raised);
    }
    .axis {
      stroke: var(--g-text);
      stroke-width: 0.8;
    }
    .hosts {
      stroke: var(--g-accent);
      stroke-width: 1.6;
      stroke-linejoin: round;
    }
    .alarm {
      stroke: var(--g-text);
      stroke-width: 1;
      stroke-dasharray: 3 2;
    }
    .exposed {
      fill: var(--g-danger-ink);
      stroke: var(--g-raised);
      stroke-width: 1;
    }
    .axis-labels {
      display: flex;
      justify-content: space-between;
      max-width: 520px;
      margin: 2px auto 6px;
      font: 0.75rem var(--g-font-mono);
      color: var(--g-muted);
    }
    .legend-list {
      list-style: none;
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      gap: 4px 14px;
      margin: 0 0 12px;
      padding: 0;
      font-size: 0.8125rem;
    }
    .legend-list li {
      display: flex;
      align-items: center;
      gap: 6px;
      min-width: 0;
    }
    .swatch {
      display: inline-block;
      flex: none;
      width: 14px;
      height: 12px;
      &.hosts {
        height: 2px;
        background: var(--g-accent);
      }
      &.alarm {
        width: 2px;
        border-left: 2px dashed var(--g-text);
      }
      &.exposed {
        width: 10px;
        height: 10px;
        border-radius: 50%;
        background: var(--g-danger-ink);
      }
    }
    .readouts {
      grid-template-columns: repeat(auto-fit, minmax(min(132px, 100%), 1fr));
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
export class RolloutPlanWidgetComponent {
  readonly sliders = SLIDERS;
  readonly shapes = WAVE_SHAPES;
  readonly shapeText = SHAPES;
  readonly format = num;
  readonly duration = durationText;
  readonly hosts = hostsText;
  readonly axis = `M${LEFT} ${BOTTOM}H${LEFT + WIDTH}`;
  readonly settings = signal<RolloutSettings>({
    fleet: 2_000,
    canaryPct: 1,
    waves: 4,
    shape: 'equal',
    bakeMin: 30,
    maxUnavailablePct: 5,
    hostMin: 5,
    detectMin: 20,
  });
  readonly run = computed(() => rollout(this.settings()));
  readonly check = computed(() => rolloutCheckpoint(this.settings(), this.run()));
  /** A new wave shape asks again; the sliders only move the readouts under an answered question. */
  private readonly asked = computed(() => this.settings().shape);
  private readonly answers = signal<{ asked: string; chosen: number; check: WidgetCheckpoint } | null>(null);
  private readonly current = computed(() => {
    const a = this.answers();
    return a?.asked === this.asked() ? a : null;
  });
  readonly chosen = computed(() => this.current()?.chosen ?? null);
  readonly answered = computed(() => this.chosen() !== null);
  readonly shownCheck = computed(() => this.current()?.check ?? this.check());
  /** The plan as the settings make it, before anything runs: wave sizes and the batch. */
  readonly planText = computed(() => {
    const [canary, ...waves] = waveSizes(this.settings());
    const run = this.run();
    return `Canary ${num(canary)}, then ${waves.map(num).join(', ')} hosts; ${num(run.batch)} at a time.`;
  });
  readonly drawing = computed(() => this.draw());
  readonly chartLabel = computed(() => {
    const run = this.run();
    return `Hosts on the new build over ${durationText(this.drawing().endMin)}: the alarm at ${durationText(run.detectAtMin)}, when the bad build has reached ${hostsText(run.exposed)}`;
  });
  readonly announcement = settledAnnouncement(() => this.summary());

  share(hosts: number) {
    return shareText(hosts, this.settings().fleet);
  }

  /** Hosts on the new build climb a step at each batch start; the chart runs to the alarm or the end, whichever is later. */
  private draw() {
    const s = this.settings();
    const run = this.run();
    const endMin = Math.max(run.totalMin, run.detectAtMin);
    const x = (t: number) => LEFT + (t / endMin) * WIDTH;
    const y = (h: number) => BOTTOM - (h / s.fleet) * (BOTTOM - TOP);
    const steps = [`M${LEFT} ${BOTTOM}`];
    let started = 0;
    for (const w of run.waves)
      for (let left = w.hosts, t = w.startMin; left > 0; left -= run.batch, t += s.hostMin) {
        started += Math.min(run.batch, left);
        steps.push(`H${x(t).toFixed(2)}V${y(started).toFixed(2)}`);
      }
    steps.push(`H${x(endMin).toFixed(2)}`);
    const alarmX = Number(x(run.detectAtMin).toFixed(2));
    return {
      endMin,
      hosts: steps.join(''),
      alarm: `M${alarmX} ${TOP - 4}V${BOTTOM}`,
      alarmX,
      exposedY: Number(y(run.exposed).toFixed(2)),
    };
  }

  private summary(): string {
    const s = this.settings();
    const head = `${num(s.fleet)} hosts, a ${s.canaryPct}% canary, ${s.waves} ${s.shape === 'equal' ? 'equal' : 'doubling'} wave${s.waves === 1 ? '' : 's'}, ${s.bakeMin ? `bakes of ${durationSpoken(s.bakeMin)}` : 'no bakes'}, ${s.maxUnavailablePct}% at a time, ${durationSpoken(s.hostMin)} a batch, alarm after ${durationSpoken(s.detectMin)}.`;
    if (!this.answered()) return `${head} Answer the prediction to see the rollout.`;
    const run = this.run();
    return `${head} Done in ${durationText(run.totalMin)}; the bad build reaches ${hostsText(run.exposed)}, ${this.share(run.exposed)}, before the alarm.`;
  }

  set(change: Partial<RolloutSettings>) {
    const s = this.settings();
    if ((Object.keys(change) as (keyof RolloutSettings)[]).every((k) => change[k] === s[k])) return;
    this.settings.set({ ...s, ...change });
  }

  slide(key: Slider, value: number) {
    this.set({ [key]: value });
  }

  answer(chosen: number | null) {
    if (chosen !== null) this.answers.set({ asked: this.asked(), chosen, check: this.check() });
  }
}
