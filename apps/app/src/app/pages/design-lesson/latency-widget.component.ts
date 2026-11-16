import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import {
  LATENCY_BASELINE,
  LATENCY_LOADS,
  LATENCY_SERVERS,
  LATENCY_SERVICE_MS,
  formatMs,
  goalMet,
  latencySample,
  latencyScenario,
  playPlan,
  renderExperiment,
  type ExperimentSpec,
  type LatencySettings,
  type PlayPlan,
  type SdExperiment,
} from '@grasp/engine';
import { motionAllowed } from '../../core/motion';
import { CodeTextComponent } from '../../viz/code-text.component';
import { DataTableComponent } from '../../viz/kit/data-table.component';
import { HandleComponent } from '../../viz/kit/handle.component';
import { ParticlePool, watchMotion, watchVisibility } from '../../viz/kit/particles';
import { StageComponent } from '../../viz/kit/stage.component';
import { ExperimentDockComponent } from './experiment-dock.component';
import { ExperimentSession } from './experiment-session';
import { FocusBoxComponent } from './focus-box.component';
import type { Prim } from './latency-draw';
import { bandAt, buildStage, scaleOf } from './latency-layout';
import { playLength, slideAt, trips, windowAt, type Trip } from './latency-motion';
import { LatencyPrimsComponent } from './latency-prims.component';
import {
  DESCRIBE_WIDE_FROM,
  NOTHING_HIDDEN,
  changeNotice,
  describeTable,
  goalParts,
  hiding,
  loadValueText,
  sameConfig,
  sampleStory,
  summary,
  type QuestionPhase,
} from './latency-words';
import { WidgetPlay, bringStageIntoView } from './widget-play';

const REST_NOTICE = 'Drag the load, or change the servers, the queue and the conditions; Play runs the sample.';
/** The table box shows its head and this many rows, so a row is always cut through and the box reads as one that scrolls. */
const TABLE_ROWS = 10.5;
const actOf = (e: SdExperiment): LatencySettings =>
  latencyScenario({ ...LATENCY_BASELINE, ...e.setup, ...(e.act && 'set' in e.act ? e.act.set : {}) }).settings;

/**
 * Latency & Queueing (REDESIGN.md 5.2, R41): a sample of random arrivals drawn as a queue in front of busy servers and
 * its window as a timeline, over the exact model's numbers, where the time goes, the curve against utilization and 100
 * requests at its quantiles. Every number comes from the engine's `latencyScenario`, and the sample (`latencySample`) is
 * only ever labeled as one. A play runs the window on one clock; experiment cards set the widget up, ask, play the
 * answer's sample and reveal the model, hiding until then what would give it away.
 */
@Component({
  selector: 'app-latency-widget',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    StageComponent,
    HandleComponent,
    DataTableComponent,
    FocusBoxComponent,
    ExperimentDockComponent,
    LatencyPrimsComponent,
    CodeTextComponent,
  ],
  templateUrl: './latency-widget.component.html',
  styleUrl: './latency-widget.component.scss',
})
export class LatencyWidgetComponent {
  readonly experimentSpecs = input<readonly ExperimentSpec[]>([], { alias: 'experiments' });
  readonly experiments = computed(() => this.experimentSpecs().map(renderExperiment));
  readonly serverCounts = LATENCY_SERVERS;
  readonly loads = LATENCY_LOADS;
  readonly serviceMs = formatMs(LATENCY_SERVICE_MS);

  readonly load = signal<number>(LATENCY_BASELINE.load);
  readonly servers = signal<number>(LATENCY_BASELINE.servers);
  readonly queue = signal<number>(LATENCY_BASELINE.queue);
  readonly service = signal<number>(LATENCY_BASELINE.service);
  readonly down = signal<number>(LATENCY_BASELINE.down);
  readonly model = computed(() =>
    latencyScenario({ load: this.load(), servers: this.servers(), queue: this.queue(), service: this.service(), down: this.down() }),
  );
  readonly sample = computed(() => latencySample(this.model().settings));
  readonly one = computed(() => this.servers() === 1);

  readonly motion = signal(false);
  readonly describe = signal(false);
  readonly notice = signal(REST_NOTICE);
  /** Under Reduced motion, what the sample did, in words under the stage after Play. */
  readonly caption = signal('');
  /** The setting before the learner's last change. */
  private readonly ghost = signal<LatencySettings | null>(null);
  /** The running play's clock and its window time; null at rest. */
  readonly plan = signal<PlayPlan | null>(null);
  readonly tau = signal<number | null>(null);
  private readonly tableRow = signal<{ head: number; row: number } | null>(null);

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly injector = inject(Injector);
  readonly stageRef = viewChild.required(StageComponent);
  private readonly stageEl = viewChild.required(StageComponent, { read: ElementRef });
  private readonly dotLayer = viewChild<ElementRef<SVGGElement>>('dots');
  private pool: ParticlePool | null = null;
  private visible = true;
  readonly ready = computed(() => this.stageRef().width() > 0);
  private readonly player = new WidgetPlay(() => this.motion() && this.ready());
  readonly playing = this.player.playing;

  readonly exp: ExperimentSession = new ExperimentSession({
    apply: (s) => this.applySettings(s),
    settings: () => ({ ...this.model().settings }),
    metrics: () => this.model().metrics,
    play: (e, done) => this.playAnswer(e, done),
    stage: (): HTMLElement => this.stageEl().nativeElement,
    root: this.host,
    motion: () => this.motion(),
  });
  /** A question (not the challenge) is open and unanswered: Play and the settings wait. */
  readonly asking = computed(() => {
    const e = this.exp.active();
    return !!e && !e.goal && this.exp.phase() === 'asking';
  });
  /** Any question open, the challenge included: Describe would answer it, so it waits. */
  readonly askingAny = computed(() => !!this.exp.active() && this.exp.phase() === 'asking');
  readonly locked = computed(() => this.exp.locked() || this.asking());
  private readonly question = computed(() => {
    const e = this.exp.active();
    return e && !e.goal ? e : null;
  });
  readonly phase = computed((): QuestionPhase => (this.question() ? this.exp.phase() : 'rest'));
  /** Whether the settings are the open question's act: its play, its reveal, before the learner moves on. */
  private readonly atAct = computed(() => {
    const e = this.question();
    return (
      !!e && this.exp.phase() !== 'asking' && actOf(e).load === this.model().settings.load && sameConfig(actOf(e), this.model().settings)
    );
  });
  readonly hid = computed(() => {
    const e = this.question();
    if (!e) return NOTHING_HIDDEN;
    const setup = latencyScenario(e.setup);
    return hiding(e.hide, this.phase(), setup.rho, !sameConfig(setup.settings, actOf(e)));
  });
  /** The ghost: the setup an act moved away from while it plays and reveals, else the learner's last setting. */
  private readonly ghostShown = computed(() => {
    const e = this.question();
    if (e && this.atAct()) {
      const a = latencyScenario(e.setup);
      const moved = !sameConfig(a.settings, this.model().settings) || Math.abs(a.rho - this.model().rho) > 1e-9;
      return moved ? a.settings : null;
    }
    return this.ghost();
  });
  /** An answer's play and its reveal keep the setup's waiting scale, rising only if the new sample overflows it. */
  private readonly qFloor = computed(() => {
    const e = this.question();
    if (!e || !this.atAct() || e.hide.includes('sample')) return 0;
    return scaleOf(latencySample(e.setup), latencyScenario(e.setup), true);
  });

  readonly width = computed(() => Math.max(248, this.stageRef().width()));
  readonly stage = computed(() => {
    const plan = this.plan();
    return buildStage(this.width(), this.model(), this.sample(), {
      hid: this.hid(),
      tau: plan ? plan.from : null,
      plan,
      ghost: this.ghostShown(),
      qFloor: this.qFloor(),
      focus: this.exp.active()?.focus ?? [],
    });
  });
  readonly under = computed(() => this.stage().D.prims(['back', 'grid', 'links']));
  readonly clipped = computed(() => this.stage().D.prims(['clip']));
  readonly over = computed(() => this.stage().D.prims(['marks', 'dots', 'text', 'top']));
  /** The band at the play's moment, drawn over the stage the play keeps. */
  readonly bandPrims = computed((): Prim[] => {
    const plan = this.plan();
    const t = this.tau();
    return plan && t !== null ? bandAt(this.stage(), this.model(), this.sample(), this.hid(), t, plan.rate) : [];
  });
  /** The playhead, and the landing ring on the window's climax once the clock reaches it. */
  readonly playMarks = computed((): Prim[] => {
    const t = this.tau();
    if (t === null || !this.plan()) return [];
    const tl = this.stage().timeline;
    const x = Math.round(tl.X(t) * 10) / 10;
    const out: Prim[] = [{ k: 'line', id: 'playhead', cls: 'playhead', x1: x, y1: tl.top, x2: x, y2: tl.bottom }];
    const rest = this.sample().rest;
    if (rest.kind !== 'none' && t >= rest.t)
      out.push({
        k: 'circle',
        id: 'climax',
        cls: 'peak land',
        cx: Math.round(tl.X(rest.t) * 10) / 10,
        cy: Math.round(tl.Yq(rest.total) * 10) / 10,
        r: 3.5,
      });
    return out;
  });
  readonly clipWidth = computed(() => {
    const t = this.tau();
    return t === null ? 0 : Math.max(0, this.stage().timeline.X(t));
  });
  readonly slide = computed(() => {
    const plan = this.plan();
    const t = this.tau();
    return plan && t !== null ? slideAt(this.sample(), plan, t) : 0;
  });

  readonly loadText = computed(() => loadValueText(this.model()));
  readonly playName = computed(() =>
    this.asking()
      ? 'Play the sample, after your answer'
      : this.locked()
        ? 'Play the sample, after the reveal'
        : this.playing()
          ? 'Stop the sample'
          : 'Play the sample',
  );

  /** Describe waits while a question asks and through its answer's play: it would show what the stage still hides. */
  readonly describeWaits = computed(() => this.askingAny() || this.hid().any);
  readonly describeWaitsWhy = computed(() =>
    this.exp.active()?.goal
      ? 'Describe waits until you meet the goal.'
      : this.askingAny()
        ? 'Describe waits for your answer.'
        : 'Describe waits for the reveal.',
  );
  readonly compact = computed(() => this.width() < DESCRIBE_WIDE_FROM);
  readonly describeTable = computed(() => describeTable(this.model(), this.compact()));
  readonly describeSaid = computed(
    () =>
      `${summary(this.model(), NOTHING_HIDDEN)} This sample: ${sampleStory(this.sample(), this.model()).replace(/^In this sample, /, '')}`,
  );
  readonly tableHeight = computed(() => {
    const m = this.tableRow();
    return m ? Math.round(m.head + TABLE_ROWS * m.row) : null;
  });
  readonly goalChecks = computed(() => (this.exp.active()?.goal ? goalParts(this.model()) : []));
  /** The line over the challenge's checklist: whether the goal still holds once met, or what it keeps. */
  readonly goalStatus = computed(() => {
    const goal = this.exp.active()?.goal;
    if (!goal) return '';
    if (this.exp.phase() === 'revealed')
      return this.exp.kept() && goalMet(goal, this.model().metrics, this.model().settings) ? 'Goal met:' : 'You met it; now:';
    return this.exp.kept() ? '' : 'The goal keeps a server down and random work.';
  });

  constructor() {
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      const stopMotion = watchMotion(motionAllowed, (allowed) => this.motion.set(allowed));
      // The widget host, not one stage: on a phone the stage scrolls away while the dock under it is read.
      const stopVisibility = watchVisibility(this.host, (visible) => {
        this.visible = visible;
        this.player.setVisible(visible);
        if (visible) this.pool?.resume();
        else this.pool?.pause();
      });
      destroyRef.onDestroy(() => {
        stopMotion();
        stopVisibility();
        this.player.stop(false);
        this.pool?.clear();
      });
    });
  }

  setLoad(v: number) {
    if (this.locked() || v === this.load()) return;
    this.change(() => this.load.set(v));
  }

  /** A fleet of `k` at the same load: one server has one queue and none to lose. */
  setServers(k: number) {
    if (this.locked() || k === this.servers()) return;
    this.change(() => {
      this.servers.set(k);
      if (k === 1) {
        this.queue.set(0);
        this.down.set(0);
      }
    });
  }

  setQueue(q: number) {
    if (this.locked() || this.one() || q === this.queue()) return;
    this.change(() => this.queue.set(q));
  }

  setService(steady: boolean) {
    if (this.locked()) return;
    this.change(() => this.service.set(steady ? 1 : 0));
  }

  setDown(down: boolean) {
    if (this.locked() || this.one()) return;
    this.change(() => this.down.set(down ? 1 : 0));
  }

  togglePlay() {
    if (this.locked()) return;
    if (this.playing()) return this.player.stop();
    this.exp.clearFocus();
    this.pool?.clear();
    const smp = this.sample();
    if (!this.motion() || !this.ready()) {
      const story = sampleStory(smp, this.model());
      this.caption.set(story);
      this.notice.set(story);
      return;
    }
    this.run(
      playPlan(smp, false),
      () => undefined,
      () => this.notice.set(sampleStory(this.sample(), this.model())),
    );
  }

  start(e: SdExperiment) {
    this.player.stop(false);
    this.pool?.clear();
    this.describe.set(false);
    this.exp.start(e);
    this.notice.set(e.goal ? changeNotice(this.model(), this.hid()) : 'Play and the settings wait for your answer.');
  }

  toggleDescribe() {
    this.describe.update((d) => !d);
    if (this.describe())
      afterNextRender(
        {
          read: () => {
            const table = this.host.querySelector('g-data-table');
            const head = table?.querySelector('thead')?.getBoundingClientRect().height ?? 0;
            const row = table?.querySelector('tbody tr')?.getBoundingClientRect().height ?? 0;
            if (head && row) this.tableRow.set({ head, row });
          },
        },
        { injector: this.injector },
      );
  }

  /** A learner's change: a play ends, the old setting stays as a ghost, and the notice says the new one in a sentence. */
  private change(apply: () => void) {
    const was = this.model().settings;
    const scale = this.stage().meta.scale;
    this.settle();
    apply();
    this.ghost.set(was);
    this.caption.set('');
    this.notice.set(changeNotice(this.model(), this.hid()));
    // The waiting row's scale is an axis: a change that moves it says so on its number.
    if (this.motion() && this.stage().meta.scale !== scale)
      afterNextRender(
        {
          write: () =>
            this.host.querySelector('svg.draw [data-id="tl-scale"]')?.animate(
              [
                { opacity: 0, transform: 'translateY(-4px)' },
                { opacity: 1, transform: 'none' },
              ],
              { duration: 240, easing: 'ease-out' },
            ),
        },
        { injector: this.injector },
      );
  }

  /** Ends a running play: its band and clock go, and the stage draws the rest state at once. */
  private settle() {
    this.player.stop();
    this.pool?.clear();
    this.exp.clearFocus();
    this.plan.set(null);
    this.tau.set(null);
  }

  /** A card's setup, or an answer's act: a new start, with no ghost of what came before. */
  private applySettings(s: Readonly<Record<string, number>>) {
    this.settle();
    this.describe.set(false);
    this.caption.set('');
    this.ghost.set(null);
    for (const [name, value] of Object.entries(s)) {
      if (name === 'load') this.load.set(value);
      else if (name === 'servers') this.servers.set(value);
      else if (name === 'queue') this.queue.set(value);
      else if (name === 'service') this.service.set(value);
      else if (name === 'down') this.down.set(value);
    }
  }

  /** An answer plays the slice of its new sample that ends at the rest moment; without motion it reveals at once. */
  private playAnswer(e: SdExperiment, done: () => void) {
    this.notice.set('');
    const from = latencyScenario(e.setup);
    this.run(playPlan(this.sample(), true), () => {
      done();
      // The play ends while the question still hides its answer, so the notice it leaves is blank; the reveal fills it.
      if (this.exp.active() === e && this.exp.phase() === 'revealed') this.notice.set(changeNotice(this.model(), this.hid()));
      if (this.motion()) afterNextRender({ write: () => this.land(from.rho) }, { injector: this.injector });
    });
  }

  /** Runs a play on one clock: the band follows it, the timeline shows up to it, and particles travel on it. */
  private run(plan: PlayPlan, done: () => void, ended: () => void = () => undefined) {
    if (!this.motion() || !this.ready()) return done();
    bringStageIntoView(this.stageEl().nativeElement);
    const list: Trip[] = trips(this.sample(), this.stage().band, plan);
    const length = playLength(plan);
    this.plan.set(plan);
    this.tau.set(plan.from);
    let emitted = 0;
    this.player.play(
      length,
      (p) => {
        const now = p * length;
        this.tau.set(windowAt(plan, now));
        while (emitted < list.length && list[emitted].start <= now) {
          const trip = list[emitted++];
          const r = this.stage().band.dotR;
          // A hollow arrival's stroke reaches as far as the filled dot it lands as.
          this.dots()?.emit(trip.path, trip.tone, trip.duration, { radius: trip.tone === 'arrive' ? r - 0.75 : r });
        }
      },
      () => {
        this.plan.set(null);
        this.tau.set(null);
        this.pool?.clear();
        done();
      },
      () => {
        ended();
        afterNextRender({ write: () => this.fadeBand() }, { injector: this.injector });
      },
    );
  }

  /** When a free play ends, the band crossfades to the rest moment, now marked. */
  private fadeBand() {
    for (const el of this.host.querySelectorAll<SVGElement>(
      'svg.draw [data-id^="req-"], svg.draw [data-id^="arc-"], svg.draw [data-id="queue-label"]',
    ))
      el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 160, easing: 'ease-out' });
  }

  /** At the reveal the model lands: its values settle, and the cursor slides from the setup's utilization to the act's. */
  private land(fromRho: number) {
    const svg = this.host.querySelector('svg.draw');
    if (!svg) return;
    for (const el of svg.querySelectorAll<SVGElement>(
      '[data-id^="stat-"]:not([data-id$="-name"]), [data-id^="leader"], [data-id^="tick-p"], [data-id$="-value"]',
    ))
      el.animate(
        [
          { opacity: 0, transform: 'translateY(-4px)' },
          { opacity: 1, transform: 'none' },
        ],
        { duration: 400, easing: 'ease-out' },
      );
    const { plot } = this.stage().meta;
    const dx = (fromRho - this.model().rho) * (plot.px1 - plot.px0);
    if (Math.abs(dx) > 1)
      for (const el of svg.querySelectorAll<SVGElement>('[data-id="cursor"], [data-id^="cur-p"], [data-id="cur-ring"]'))
        el.animate([{ transform: `translateX(${dx}px)` }, { transform: 'none' }], { duration: 520, easing: 'ease-in-out' });
    const cut = this.question()?.hide.includes('ahead') ? plot.px0 + fromRho * (plot.px1 - plot.px0) : null;
    const curves = this.stage().meta.curves;
    if (cut !== null)
      for (const [cls, pts] of [
        ['p50', curves.p50],
        ['p99', curves.p99],
      ] as const) {
        const el = svg.querySelector(`.curve.${cls}`);
        if (!el || pts.length < 2) continue;
        const [x0, x1] = [pts[0][0], pts[pts.length - 1][0]];
        const share = Math.max(0, Math.min(100, ((x1 - cut) / (x1 - x0)) * 100));
        el.animate([{ clipPath: `inset(-20px ${share}% -20px 0)` }, { clipPath: 'inset(-20px 0% -20px 0)' }], {
          duration: 520,
          easing: 'ease-in-out',
        });
      }
  }

  private dots(): ParticlePool | null {
    const layer = this.dotLayer()?.nativeElement;
    if (!layer || !this.motion()) return null;
    if (this.pool?.layer !== layer) {
      this.pool?.clear();
      this.pool = new ParticlePool(layer);
      if (!this.visible) this.pool.pause();
    }
    return this.pool;
  }
}
