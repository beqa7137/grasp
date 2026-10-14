import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  computed,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import {
  REPLICA_PIN_SNAPS,
  REPLICA_SPAN_MS,
  REPLICA_TIMES,
  formatDuration,
  renderExperiment,
  replicaOutcome,
  replicaReads,
  type ExperimentSpec,
  type SdExperiment,
} from '@grasp/engine';
import { motionAllowed } from '../../core/motion';
import type { ChartAxis } from '../../viz/kit/chart-frame.component';
import { watchMotion, watchVisibility } from '../../viz/kit/particles';
import { linear } from '../../viz/kit/sparkline.component';
import { StageComponent } from '../../viz/kit/stage.component';
import {
  TIMELINE,
  TimelineComponent,
  type TimelineEvent,
  type TimelineHandle,
  type TimelineMark,
  type TimelineMessage,
  type TimelineSpan,
} from '../../viz/kit/timeline.component';
import { ExperimentDockComponent } from './experiment-dock.component';
import { ExperimentSession } from './experiment-session';
import { FocusBoxComponent } from './focus-box.component';
import { REPLICA_LANES, REPLICA_LEGEND, replicaGutter, replicaLayout } from './replica-layout';
import { WidgetPlay, bringStageIntoView } from './widget-play';

const AXIS: ChartAxis = { min: 0, max: REPLICA_SPAN_MS, ticks: [0, 1_000, 2_000, 3_000], format: (v) => (v ? `${v / 1_000} s` : '0') };
const OLD = 'the old value';
const NEW = 'the new value';

/**
 * Replication (REDESIGN.md 4.7): one timeline of the 3 s after you write. Your write reaches the primary at once and the
 * replica after the lag; your read goes to the replica, or to the primary while read-your-writes pins you there, and
 * returns the old value or the new one. The lag, the read and the pin's end are handles on the timeline, every read
 * time at which you would see the old value is shaded, and a stream of your reads, one every 250 ms, lands on the lane
 * that serves each, stale or fresh. A play sends the messages along their arrows in real time. Experiment cards set it
 * up and ask, with the replica's side hidden until the play shows it, then reveal the model's answer.
 */
@Component({
  selector: 'app-replica-widget',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [StageComponent, TimelineComponent, ExperimentDockComponent, FocusBoxComponent],
  template: `
    <g-stage [height]="layout().height" label="Replication: a write, the replica applying it, and your read">
      @if (ready()) {
        @let L = layout();
        <g-timeline
          class="timeline"
          [style.left.px]="L.timeline.x"
          [style.top.px]="L.timeline.y"
          [width]="L.timeline.width"
          [gutter]="L.gutter"
          [large]="L.large"
          [legendLines]="L.legendLines"
          [axis]="axis"
          [lanes]="lanes"
          [spans]="spans()"
          [events]="events()"
          [messages]="messages()"
          [handles]="handles()"
          [marks]="marks()"
          [now]="now()"
          [disabled]="locked()"
          [summary]="summary()"
          (moved)="move($event.id, $event.value)"
        />
        <svg
          class="over"
          [class.large]="L.large"
          [attr.viewBox]="'0 0 ' + L.width + ' ' + L.height"
          [attr.width]="L.width"
          [attr.height]="L.height"
          aria-hidden="true"
        >
          <text class="label" [attr.x]="L.readout.x" [attr.y]="L.readout.y + 10">{{ readoutLines()[0] }}</text>
          <text
            class="value"
            [class.bad]="answered() && outcome().stale"
            [class.good]="answered() && !outcome().stale"
            [attr.x]="L.readout.x"
            [attr.y]="L.readout.y + 34"
          >
            {{ readoutLines()[1] }}
          </text>
          <text class="caption" [attr.x]="L.readout.x" [attr.y]="L.readout.y + 52">{{ readoutLines()[2] }}</text>
          <text class="caption" [attr.x]="L.readout.x" [attr.y]="L.readout.y + 70">{{ readoutLines()[3] }}</text>
          @for (f of L.focus; track f.id) {
            <g app-focus [box]="f" [on]="exp.focusOn().includes(f.id)" />
          }
        </svg>
      }
    </g-stage>
    <p class="visually-hidden" aria-live="polite">{{ verdictText() }}</p>

    <div class="controls">
      <label class="toggle">
        <input type="checkbox" [checked]="ryw()" [disabled]="locked()" (change)="setRyw($any($event.target).checked)" />
        Pin to the primary (read your own writes): your reads go to the primary for {{ format(pinMs()) }} after you write
      </label>
      <button type="button" class="g-btn" [disabled]="locked()" (click)="replay()">Play it</button>
    </div>
    <p class="notice" aria-live="polite">{{ notice() }}</p>

    @if (experiments().length) {
      <app-experiment-dock
        [experiments]="experiments()"
        [active]="exp.active()"
        [phase]="exp.phase()"
        [done]="exp.done()"
        [goalStatus]="goalStatus()"
        [chosen]="exp.chosen()"
        (chosenChange)="exp.answer($event)"
        (start)="start($event)"
      />
    }
  `,
  styles: `
    @use '../../../type' as *;

    :host {
      display: block;
    }
    .timeline {
      position: absolute;
    }
    .over {
      position: absolute;
      left: 0;
      top: 0;
      pointer-events: none;
    }
    text {
      paint-order: stroke;
      stroke: var(--g-viz-stage);
      stroke-width: 3px;
      stroke-linejoin: round;
    }
    .label {
      @include label;
      fill: var(--g-muted);
    }
    .value {
      font: 600 var(--g-text-title-m) var(--g-font-mono);
      fill: var(--g-text);
      &.bad {
        fill: var(--g-danger-ink);
      }
      &.good {
        fill: var(--g-viz-final-ink);
      }
    }
    .caption {
      font: 500 var(--g-text-label) var(--ion-font-family);
      fill: var(--g-muted);
    }
    .large {
      .caption {
        font-size: var(--g-text-body-s);
      }
    }
    .controls {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: var(--g-space-3);
      margin-top: var(--g-space-3);
    }
    .toggle {
      display: flex;
      gap: var(--g-space-2);
      align-items: flex-start;
      flex: 1 1 240px;
      font-size: var(--g-text-body);
      line-height: 1.45;
      input {
        margin-top: var(--g-space-1);
        accent-color: var(--g-accent);
      }
    }
    .notice {
      margin: var(--g-space-2) 0 0;
      min-height: 1lh;
      font-size: var(--g-text-body-s);
      color: var(--g-muted);
    }
  `,
})
export class ReplicaWidgetComponent {
  readonly experimentSpecs = input<readonly ExperimentSpec[]>([], { alias: 'experiments' });
  readonly experiments = computed(() => this.experimentSpecs().map(renderExperiment));

  readonly axis = AXIS;
  readonly lanes = REPLICA_LANES;
  readonly format = formatDuration;
  readonly old = OLD;
  readonly fresh = NEW;

  readonly lagMs = signal(800);
  readonly readMs = signal(300);
  readonly ryw = signal(false);
  readonly pinMs = signal(1_000);
  /** The play's clock in ms after the write; with no play running everything is drawn. */
  readonly now = signal(Infinity);
  readonly motion = signal(false);
  readonly notice = signal('');

  readonly stage = viewChild.required(StageComponent);
  private readonly stageEl = viewChild.required(StageComponent, { read: ElementRef });
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  readonly ready = computed(() => this.stage().width() > 0);
  private readonly player = new WidgetPlay(() => this.motion() && this.ready());
  readonly exp = new ExperimentSession({
    apply: (s) => this.applySettings(s),
    settings: () => this.settingsNow(),
    metrics: () => this.metrics(),
    play: (_, done) => this.playScene(done),
    stage: () => this.stageEl().nativeElement,
    root: this.host,
    motion: () => this.motion(),
  });
  readonly locked = this.exp.locked;

  readonly outcome = computed(() =>
    replicaOutcome({ lagMs: this.lagMs(), readMs: this.readMs(), readYourWrites: this.ryw(), pinMs: this.pinMs() }),
  );
  /** While an experiment waits for your guess, the replica's side stays hidden: the play shows it. */
  readonly hidden = computed(() => !!this.exp.active() && this.exp.phase() === 'asking' && !this.exp.active()!.goal);
  /** What the read returns shows once the read has happened, and never while an experiment waits for your guess. */
  readonly answered = computed(() => !(this.exp.active() && this.exp.phase() === 'asking') && this.now() >= this.readMs());
  readonly reads = computed(() => replicaReads({ lagMs: this.lagMs(), readYourWrites: this.ryw(), pinMs: this.pinMs() }));
  readonly staleReads = computed(() => this.reads().filter((r) => r.stale).length);
  readonly marks = computed((): TimelineMark[] =>
    this.hidden()
      ? []
      : this.reads().map((r) => ({
          lane: r.servedBy,
          at: r.at,
          tone: r.stale ? ('critical' as const) : r.servedBy === 'primary' ? ('current' as const) : ('final' as const),
        })),
  );
  readonly readoutLines = computed(() => {
    const shown = this.answered();
    return [
      `Your read at ${formatDuration(this.readMs())} returns`,
      shown ? (this.outcome().stale ? OLD : NEW) : '?',
      shown ? this.servedText() : '',
      this.hidden() ? '' : `Your reads every 250 ms (dots): ${this.staleReads()} of ${this.reads().length} stale`,
    ];
  });
  readonly layout = computed(() => {
    const width = Math.max(256, this.stage().width());
    const o = this.outcome();
    return replicaLayout(width, {
      x: linear(0, REPLICA_SPAN_MS, TIMELINE.pad + replicaGutter(width), width - 16 - TIMELINE.pad),
      events: this.events(),
      messages: this.messages(),
      spans: this.spans(),
      pin: this.ryw() ? this.pinMs() : 0,
      staleFrom: o.staleFrom,
      staleTo: o.staleTo,
      readout: this.readoutLines(),
    });
  });

  readonly spans = computed((): TimelineSpan[] => {
    const o = this.outcome();
    return [
      { lane: 'primary', from: 0, to: REPLICA_SPAN_MS, tone: 'final', label: REPLICA_LEGEND[0] },
      ...(this.ryw() ? [{ lane: 'primary', from: 0, to: this.pinMs(), tone: 'current' as const, label: REPLICA_LEGEND[1] }] : []),
      ...(this.hidden()
        ? []
        : [
            { lane: 'replica', from: 0, to: this.lagMs(), tone: 'muted' as const, label: REPLICA_LEGEND[2] },
            { lane: 'replica', from: this.lagMs(), to: REPLICA_SPAN_MS, tone: 'final' as const, label: REPLICA_LEGEND[0] },
          ]),
      ...(o.staleMs > 0 && this.answered()
        ? [{ lane: 'you', from: o.staleFrom, to: o.staleTo, tone: 'critical' as const, label: REPLICA_LEGEND[3] }]
        : []),
    ];
  });
  readonly events = computed((): TimelineEvent[] => {
    const o = this.outcome();
    return [
      { lane: 'you', at: 0, n: 1, tone: 'current', label: 'write' },
      ...(this.hidden()
        ? []
        : [{ lane: 'replica', at: this.lagMs(), n: 2, tone: 'final' as const, label: `applies it, ${formatDuration(this.lagMs())}` }]),
      { lane: 'you', at: this.readMs(), n: 3, tone: 'current', label: `read, ${formatDuration(this.readMs())}` },
      ...(this.answered()
        ? [
            {
              lane: o.servedBy,
              at: this.readMs(),
              n: 4,
              tone: o.stale ? ('critical' as const) : ('final' as const),
              label: o.stale ? 'old value' : 'new value',
            },
          ]
        : []),
    ];
  });
  readonly messages = computed((): TimelineMessage[] => [
    { id: 'write', from: { lane: 'you', at: 0, n: 1 }, to: { lane: 'primary', at: 0 }, tone: 'current' },
    ...(this.hidden()
      ? []
      : [
          {
            id: 'replicate',
            from: { lane: 'primary', at: 0 },
            to: { lane: 'replica', at: this.lagMs(), n: 2 },
            tone: 'considering' as const,
          },
        ]),
    {
      id: 'read',
      from: { lane: 'you', at: this.readMs(), n: 3 },
      to: { lane: this.outcome().servedBy, at: this.readMs(), n: 4 },
      tone: 'current',
    },
  ]);
  readonly handles = computed((): TimelineHandle[] => [
    ...(this.hidden()
      ? []
      : [
          {
            id: 'lag',
            lane: 'replica',
            at: this.lagMs(),
            n: 2,
            values: REPLICA_TIMES,
            label: 'Replica applies the write',
            valuetext: `The replica applies your write ${formatDuration(this.lagMs())} after you write`,
          },
        ]),
    {
      id: 'read',
      lane: 'you',
      at: this.readMs(),
      n: 3,
      values: REPLICA_TIMES,
      label: 'Your read',
      valuetext: `You read ${formatDuration(this.readMs())} after writing`,
    },
    ...(this.ryw()
      ? [
          {
            id: 'pin',
            lane: 'primary',
            at: this.pinMs(),
            values: REPLICA_PIN_SNAPS,
            label: 'End of the pin to the primary',
            valuetext: `Your reads go to the primary for ${formatDuration(this.pinMs())} after you write`,
          },
        ]
      : []),
  ]);
  readonly servedText = computed(() => {
    const o = this.outcome();
    if (o.servedBy === 'primary') return 'from the primary, which has every write';
    return `from the replica, which ${o.stale ? 'applies' : 'applied'} it at ${formatDuration(this.lagMs())}`;
  });
  readonly verdictText = computed(() =>
    this.answered()
      ? `Your read at ${formatDuration(this.readMs())} returns ${this.outcome().stale ? OLD : NEW}, ${this.servedText()}.`
      : '',
  );
  readonly summary = computed(() => {
    const o = this.outcome();
    const pin = this.ryw() ? ` Read your own writes sends your reads to the primary for ${formatDuration(this.pinMs())}.` : '';
    const read = this.answered()
      ? ` Your read at ${formatDuration(this.readMs())} goes to the ${o.servedBy} and returns ${o.stale ? OLD : NEW}.`
      : ` You read at ${formatDuration(this.readMs())}.`;
    const stale = !this.answered()
      ? ''
      : o.staleMs > 0
        ? ` Your reads between ${formatDuration(o.staleFrom)} and ${formatDuration(o.staleTo)} are stale: ${this.staleReads()} of ${this.reads().length} reads, one every 250 ms.`
        : ' None of your reads is stale.';
    return `You write at 0; the replica applies it at ${formatDuration(this.lagMs())}.${pin}${read}${stale}`;
  });

  readonly settingsNow = computed((): Record<string, number> => ({
    lag: this.lagMs(),
    read: this.readMs(),
    ryw: this.ryw() ? 1 : 0,
    pin: this.pinMs(),
  }));
  readonly metrics = computed((): Record<string, number> => ({ staleMs: this.outcome().staleMs }));
  readonly goalStatus = computed(() => {
    const goal = this.exp.active()?.goal;
    if (!goal) return '';
    const stale = this.outcome().staleMs;
    const met = this.exp.metWith();
    if (this.exp.phase() === 'revealed' && met) {
      const pin = formatDuration(met.settings['pin']);
      return this.exp.kept() && stale === 0
        ? `Goal met: none of your reads can be stale, with a pin of ${formatDuration(this.pinMs())}.`
        : `You met it with a pin of ${pin}; now your reads are stale for ${formatDuration(stale)}.`;
    }
    if (!this.exp.kept()) return `The goal keeps ${formatDuration(goal.keep?.['lag'] ?? 0)} of lag, with the pin to the primary on.`;
    return `Your reads are stale for ${formatDuration(stale)} after the pin; the goal is never.`;
  });

  constructor() {
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      const stopMotion = watchMotion(motionAllowed, (allowed) => this.motion.set(allowed));
      const stopVisibility = watchVisibility(this.stageEl().nativeElement, (visible) => this.player.setVisible(visible));
      destroyRef.onDestroy(() => {
        stopMotion();
        stopVisibility();
        this.player.stop(false);
      });
    });
  }

  move(id: string, value: number) {
    this.player.stop();
    this.notice.set('');
    this.exp.clearFocus();
    if (id === 'lag') this.lagMs.set(value);
    else if (id === 'read') this.readMs.set(value);
    else if (id === 'pin') this.pinMs.set(value);
  }

  setRyw(on: boolean) {
    this.player.stop();
    this.exp.clearFocus();
    this.ryw.set(on);
  }

  replay() {
    bringStageIntoView(this.stageEl().nativeElement);
    this.exp.clearFocus();
    this.playScene(() => undefined);
    this.notice.set(this.motion() ? '' : 'With motion off the picture already shows the whole 3 s after the write.');
  }

  start(e: SdExperiment) {
    // A play this replaces does not reveal its experiment, but the whole picture shows again.
    this.player.stop(false);
    this.now.set(Infinity);
    this.notice.set('');
    this.exp.start(e);
  }

  /** Plays the 3 s after the write in real time; however it stops, the whole picture shows again and `done` runs. */
  private playScene(done: () => void) {
    this.player.play(
      REPLICA_SPAN_MS,
      (p) => this.now.set(p * REPLICA_SPAN_MS),
      () => {
        this.now.set(Infinity);
        done();
      },
    );
  }

  private applySettings(s: Readonly<Record<string, number>>) {
    if (s['lag'] !== undefined) this.lagMs.set(s['lag']);
    if (s['read'] !== undefined) this.readMs.set(s['read']);
    if (s['ryw'] !== undefined) this.ryw.set(s['ryw'] === 1);
    if (s['pin'] !== undefined) this.pinMs.set(s['pin']);
  }
}
