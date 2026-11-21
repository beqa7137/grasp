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
  CAPACITY_APP_MAX,
  CAPACITY_BASELINE,
  CAPACITY_LB_MAX,
  CAPACITY_REPLICAS_MAX,
  CAPACITY_SIZES,
  CAPACITY_TRAFFIC,
  capacityActOf,
  capacityMetrics,
  capacityRun,
  goalMet,
  renderExperiment,
  type CapacitySettings,
  type ExperimentSpec,
  type SdExperiment,
} from '@grasp/engine';
import { motionAllowed } from '../../core/motion';
import { CODE_TEXT_KEEP, CodeTextComponent } from '../../viz/code-text.component';
import { DataTableComponent } from '../../viz/kit/data-table.component';
import { HandleComponent } from '../../viz/kit/handle.component';
import { ParticlePool, watchMotion, watchVisibility } from '../../viz/kit/particles';
import { StageComponent } from '../../viz/kit/stage.component';
import { REST_VIEW, buildStage, type Stage, type Step } from './capacity-layout';
import {
  EASE_MS,
  GROW_MS,
  LANDING,
  LAND_MS,
  PARTICLE_R,
  REFLOW_MS,
  Stream,
  clockAt,
  eases,
  flowClock,
  playAnchor,
  rampClock,
  restRing,
  type PlayClock,
} from './capacity-motion';
import { GAP, MIN_WIDTH } from './capacity-plan';
import { CapacityPrimsComponent } from './capacity-prims.component';
import {
  CAPACITY_KEEP,
  DESCRIBE_WIDE_FROM,
  FOOTNOTE,
  GOAL_KEEPS,
  HINTS,
  NOTHING_HIDDEN,
  STAGE_LABEL,
  TIERS,
  WAIT_NOTICE,
  actChange,
  changeNotice,
  describeTable,
  fn,
  goalParts,
  hiding,
  rampNotice,
  rampStory,
  summary,
  tierLine,
  type Phase,
} from './capacity-words';
import { ExperimentDockComponent } from './experiment-dock.component';
import { ExperimentSession } from './experiment-session';
import { FocusBoxComponent } from './focus-box.component';
import { WidgetPlay, bringStageIntoView, pulseFocus } from './widget-play';

/** The reveal's words land this long before the page moves on to them from the picture. */
const REVEAL_READ_MS = 1200;
const same = (a: CapacitySettings, b: CapacitySettings) => (Object.keys(a) as (keyof CapacitySettings)[]).every((k) => a[k] === b[k]);

/**
 * Capacity & Scaling (REDESIGN.md 5.2, R41): a request stream drawn through load balancers, app servers and a database
 * on one axis in requests a second, where each tier's limit is a lane as long as what it can take and the stream
 * narrows wherever a lane is shorter than what arrives. Every number comes from the engine's `capacityRun`; a play's
 * particles are a picture of the stream and no number is read from them. Play ramps the traffic up to its setting on
 * one clock; experiment cards set the widget up, ask, play the answer's stream and reveal, hiding until then what would
 * give it away.
 */
@Component({
  selector: 'app-capacity-widget',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    StageComponent,
    HandleComponent,
    DataTableComponent,
    FocusBoxComponent,
    ExperimentDockComponent,
    CapacityPrimsComponent,
    CodeTextComponent,
  ],
  templateUrl: './capacity-widget.component.html',
  styleUrl: './capacity-widget.component.scss',
  providers: [{ provide: CODE_TEXT_KEEP, useValue: CAPACITY_KEEP }],
})
export class CapacityWidgetComponent {
  readonly experimentSpecs = input<readonly ExperimentSpec[]>([], { alias: 'experiments' });
  readonly experiments = computed(() => this.experimentSpecs().map(renderExperiment));
  readonly stops = CAPACITY_TRAFFIC;
  readonly tiers = TIERS;
  readonly hints = HINTS;
  readonly footnote = FOOTNOTE;
  readonly stageLabel = STAGE_LABEL;

  readonly settings = signal<CapacitySettings>({ ...CAPACITY_BASELINE });
  readonly model = computed(() => capacityRun(this.settings()));
  /** The play's clock and where it stands; null at rest. */
  private readonly clock = signal<PlayClock | null>(null);
  private readonly at = signal({ index: 0, ring: false });
  readonly ramping = computed(() => !!this.clock());
  /** What the stage draws: the setting, or in a play the stop its clock has reached. */
  readonly shown = computed(() => {
    const c = this.clock();
    return c ? c.ramp.runs[this.at().index] : this.model();
  });

  readonly motion = signal(false);
  readonly describe = signal(false);
  readonly notice = signal(summary(this.model()));
  /** Under Reduced motion, what the ramp did, in words under the stage after Play, with its ring on the stage. */
  readonly caption = signal('');
  /** The setting before the learner's last change. */
  private readonly ghost = signal<CapacitySettings | null>(null);

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly injector = inject(Injector);
  readonly stageRef = viewChild.required(StageComponent);
  private readonly stageEl = viewChild.required(StageComponent, { read: ElementRef });
  private readonly dotLayer = viewChild<ElementRef<SVGGElement>>('dots');
  private readonly anchorEl = viewChild<ElementRef<HTMLElement>>('anchor');
  private pool: ParticlePool | null = null;
  private visible = true;
  private running: Animation[] = [];
  private readTimer: ReturnType<typeof setTimeout> | null = null;
  readonly ready = computed(() => this.stageRef().width() > 0);
  private readonly player = new WidgetPlay(() => this.motion() && this.ready());
  readonly playing = this.player.playing;

  readonly exp: ExperimentSession = new ExperimentSession({
    apply: (s) => this.applySettings(s),
    settings: () => ({ ...this.model().settings }),
    metrics: () => capacityMetrics(this.model()),
    play: (e, done) => this.playAnswer(e, done),
    stage: (): HTMLElement => this.anchorEl()?.nativeElement ?? this.stageEl().nativeElement,
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
  /** Whether the settings are the open question's act: its play, its reveal, before the learner moves on. */
  private readonly atAct = computed(() => {
    const e = this.question();
    return !!e && this.exp.phase() !== 'asking' && same(capacityActOf(e), this.model().settings);
  });
  readonly phase = computed((): Phase => {
    const e = this.exp.active();
    if (!e) return 'rest';
    if (e.goal) return 'challenge';
    const phase = this.exp.phase();
    return phase === 'revealed' && !this.atAct() ? 'rest' : phase;
  });
  /** What the open question's act changes, between its setup and its act. */
  private readonly change = computed(() => {
    const e = this.question();
    return e ? actChange(capacityRun(e.setup), capacityRun(capacityActOf(e))) : null;
  });
  readonly hid = computed(() => {
    const e = this.question();
    return e ? hiding(e.hide, this.phase(), this.change()) : hiding([], this.phase());
  });
  /** The ghost: the setup an act moved away from at its reveal, else the learner's last setting; none in a play. */
  private readonly ghostShown = computed(() => {
    const e = this.question();
    if (e && this.atAct()) return this.exp.phase() === 'revealed' ? capacityRun(e.setup).settings : null;
    return this.clock() ? null : this.ghost();
  });
  /** The tier the ring points at: a play's climax, or under Reduced motion the one Play found. */
  private readonly restRing = signal<ReturnType<typeof restRing>>(null);
  private readonly ring = computed(() => {
    const c = this.clock();
    return c ? (this.at().ring ? c.ring : null) : this.restRing();
  });

  readonly width = computed(() => Math.max(MIN_WIDTH, this.stageRef().width()));
  readonly stage = computed(() =>
    buildStage(this.width(), this.shown(), {
      hid: this.hid(),
      ghost: this.ghostShown(),
      locked: this.locked(),
      playMarks: !!this.clock() || !!this.restRing(),
      ring: this.ring(),
      focus: this.exp.active()?.focus ?? [],
    }),
  );
  readonly under = computed(() => this.stage().D.prims(['band']));
  readonly boxes = computed(() => this.stage().D.prims(['boxes', 'lanes']));
  readonly over = computed(() => this.stage().D.prims(['marks', 'text', 'top']));
  readonly tierLines = computed(() => TIERS.map((id) => ({ id, text: tierLine(this.shown(), id, this.hid()) })));
  readonly trafficText = computed(() => `${fn(this.shown().offered)} requests a second`);
  readonly playName = computed(() =>
    this.locked()
      ? 'Ramp the traffic, after your answer'
      : this.playing()
        ? 'Stop the ramp'
        : `Ramp the traffic up to ${fn(this.settings().traffic)} requests a second`,
  );
  /** Where a play or a reveal brings the page on a tall stage: a box with the stream gap above it, or a focus region. */
  readonly anchor = computed(() => {
    const st = this.stage();
    const change = this.change();
    if (this.exp.phase() === 'playing' && change) {
      const box = st.boxes.find((b) => b.id === playAnchor(change))!;
      return { top: box.top - GAP, height: box.bottom - box.top + GAP };
    }
    const lit = st.focus.filter((f) => this.exp.focusOn().includes(f.region));
    if (!lit.length) return null;
    const top = lit.reduce((a, f) => (f.y < a.y ? f : a));
    return { top: top.y, height: top.height };
  });

  /** Describe waits while a question asks and through its answer's play: it would show what the stage still hides. */
  readonly describeWaits = computed(() => this.askingAny() || this.hid().any || this.exp.locked());
  readonly describeWaitsWhy = computed(() =>
    this.exp.active()?.goal ? 'Describe waits until you meet the goal.' : 'Describe waits for your answer.',
  );
  readonly compact = computed(() => this.width() < DESCRIBE_WIDE_FROM);
  readonly describeTable = computed(() => describeTable(this.model(), this.compact()));
  readonly describeSaid = computed(() => summary(this.model()));
  readonly goalChecks = computed(() => (this.exp.active()?.goal ? goalParts(this.model()) : []));
  /** The line over the challenge's checklist: whether the goal still holds once met, or what it keeps. */
  readonly goalStatus = computed(() => {
    const goal = this.exp.active()?.goal;
    if (!goal) return '';
    if (this.exp.phase() === 'revealed')
      return this.exp.kept() && goalMet(goal, capacityMetrics(this.model()), this.model().settings) ? 'Goal met:' : 'You met it; now:';
    return this.exp.kept() ? '' : GOAL_KEEPS;
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
        this.stopReading();
      });
    });
  }

  setTraffic(v: number) {
    if (this.locked()) return;
    // A drag back to the setting during a ramp changes nothing but still ends the ramp.
    if (v === this.settings().traffic) this.settle();
    else this.changeTo({ traffic: v });
  }

  step(st: Step) {
    if (st.disabled) return;
    const s = this.settings();
    if (st.tier === 'lb') this.changeTo({ lb: Math.min(CAPACITY_LB_MAX, Math.max(1, s.lb + st.dir)) });
    else if (st.tier === 'app') this.changeTo({ app: Math.min(CAPACITY_APP_MAX, Math.max(1, s.app + st.dir)) });
    else if (st.tier === 'replicas') this.changeTo({ replicas: Math.min(CAPACITY_REPLICAS_MAX, Math.max(0, s.replicas + st.dir)) });
    else this.changeTo({ size: CAPACITY_SIZES[st.dir > 0 ? CAPACITY_SIZES.length - 1 : 0] });
  }

  setCondition(name: 'cache' | 'zone' | 'slow', on: boolean) {
    if (this.locked()) return;
    this.changeTo({ [name]: on ? 1 : 0 });
  }

  togglePlay() {
    if (this.locked()) return;
    if (this.playing()) {
      // A ramp stopped early: the stage draws the setting again, so the notice says it.
      this.settle();
      this.notice.set(summary(this.model()));
      return;
    }
    this.settle();
    const s = this.model().settings;
    if (!this.motion() || !this.ready()) {
      const story = rampStory(s);
      this.restRing.set(restRing(s));
      this.caption.set(story);
      this.notice.set(story);
      return;
    }
    // While the ramp steps, the stage shows stops the setting's sentence would contradict: the notice says only what
    // plays, and the story lands at its end.
    this.notice.set(rampNotice(s));
    this.run(
      rampClock(s),
      this.stage(),
      () => undefined,
      () => this.notice.set(rampStory(s)),
    );
  }

  start(e: SdExperiment) {
    this.stopReading();
    this.exp.start(e);
    this.notice.set(e.goal ? summary(this.model()) : WAIT_NOTICE);
  }

  toggleDescribe() {
    this.describe.update((d) => !d);
  }

  /** Brings the regions a reveal points at back into view, from the reveal's last line. */
  seePicture() {
    this.stopReading();
    const anchor = this.anchorEl()?.nativeElement;
    if (!anchor) return;
    bringStageIntoView(anchor);
    if (this.motion()) pulseFocus(this.host);
  }

  /** A learner's change: a play ends, the old setting stays as a ghost, and the notice says what changed and the new setting. */
  private changeTo(patch: Partial<CapacitySettings>) {
    const was = this.model().settings;
    const next = { ...was, ...patch };
    if (same(was, next)) return;
    this.settle();
    this.eased(() => {
      this.settings.set(next);
      this.ghost.set(was);
    });
    this.notice.set(changeNotice(was, this.model()));
  }

  /** Ends a running play: its clock, ring and particles go, and the stage draws the setting at rest at once. */
  private settle() {
    this.player.stop();
    this.pool?.clear();
    this.finishEases();
    this.stopReading();
    this.exp.clearFocus();
    this.clock.set(null);
    this.restRing.set(null);
    this.caption.set('');
  }

  /** A card's setup, or an answer's act: a new start, with no ghost of what came before. */
  private applySettings(s: Readonly<Record<string, number>>) {
    this.settle();
    this.describe.set(false);
    this.ghost.set(null);
    this.settings.set(capacityRun({ ...this.settings(), ...s }).settings);
  }

  /**
   * An answer plays the stream at its act: a ramp steps the traffic up from the setup's, any other act flows at its new
   * setting, and what the question hides stays hidden until the reveal. Without motion it reveals at once.
   */
  private playAnswer(e: SdExperiment, done: () => void) {
    this.notice.set(WAIT_NOTICE);
    const setup = capacityRun(e.setup).settings;
    const act = capacityActOf(e);
    const ramp = !!e.act && 'run' in e.act && e.act.run === 'ramp';
    // The stream re-flows from where the question showed it: the setup, with what it hid.
    const asked = buildStage(this.width(), capacityRun(setup), {
      ...REST_VIEW,
      hid: hiding(e.hide, 'asking', this.change()),
      locked: true,
    });
    const clock = ramp ? rampClock(act, setup.traffic) : flowClock(setup, act);
    this.run(clock, asked, () => {
      const hidden = this.motion() && this.ready() ? this.stage() : null;
      done();
      if (this.exp.active() !== e || this.exp.phase() !== 'revealed') return;
      this.notice.set(summary(this.model()));
      afterNextRender(
        {
          write: () => {
            if (hidden) this.land(hidden, setup);
          },
          read: () => this.readReveal(),
        },
        { injector: this.injector },
      );
    });
  }

  /** Runs a play on one clock: the stage shows the stop the clock has reached, and the stream's particles fall on it. */
  private run(clock: PlayClock, before: Stage, done: () => void, ended: () => void = () => undefined) {
    if (!this.motion() || !this.ready()) return done();
    const stream = new Stream();
    let last = 0;
    this.at.set(clockAt(clock, 0));
    this.clock.set(clock);
    this.ease(before, clock.ramp.stops.length > 1 ? EASE_MS : REFLOW_MS);
    this.player.play(
      clock.length,
      (p) => {
        const now = p * clock.length;
        const at = clockAt(clock, now);
        const was = this.at();
        if (at.index !== was.index || at.ring !== was.ring) {
          const from = this.stage();
          this.at.set(at);
          if (at.index !== was.index) this.ease(from, EASE_MS);
        }
        const pool = this.dots();
        if (pool)
          for (const d of stream.step(this.stage().gaps, now - last))
            pool.emit(d.path, d.doomed ? 'doomed' : 'req', d.duration, { breaks: d.doomed, radius: PARTICLE_R });
        last = now;
      },
      () => {
        this.clock.set(null);
        this.pool?.clear();
        done();
      },
      ended,
    );
  }

  /** Applies a change and eases the stream and the loads from where they were. */
  private eased(change: () => void) {
    const before = this.motion() && this.ready() ? this.stage() : null;
    change();
    if (before) this.ease(before, EASE_MS);
  }

  /** Once the new stage is drawn, moves its bands and loads from where `before` had them; a newer change replaces it. */
  private ease(before: Stage, ms: number, grow = false) {
    if (!this.motion()) return;
    afterNextRender(
      {
        write: () => {
          this.finishEases();
          const svg = this.host.querySelector('svg.draw');
          for (const e of eases(before, this.stage(), ms, grow))
            for (const el of svg?.querySelectorAll(e.selector) ?? [])
              this.running.push(el.animate(e.frames, { duration: e.ms, easing: 'cubic-bezier(0.2, 0, 0, 1)' }));
        },
      },
      { injector: this.injector },
    );
  }

  private finishEases() {
    for (const a of this.running) a.cancel();
    this.running = [];
  }

  /** At the reveal the hidden lanes draw on: their loads grow from the setup's level, and the held-back words land. */
  private land(hidden: Stage, setup: CapacitySettings) {
    const from = buildStage(this.width(), capacityRun(setup), { ...REST_VIEW, hid: NOTHING_HIDDEN });
    const now = this.stage();
    this.finishEases();
    const svg = this.host.querySelector('svg.draw');
    if (!svg) return;
    const revealed = TIERS.filter((id) => hidden.lanes[id].kind === 'hidden' && now.lanes[id].kind === 'normal');
    for (const e of eases(from, now, GROW_MS, true))
      if (revealed.some((id) => e.selector.includes(`"${id}"`)))
        for (const el of svg.querySelectorAll(e.selector))
          this.running.push(el.animate(e.frames, { duration: e.ms, easing: 'cubic-bezier(0.2, 0, 0, 1)' }));
    for (const el of svg.querySelectorAll(LANDING))
      this.running.push(
        el.animate(
          [
            { opacity: 0, transform: 'translateY(-4px)' },
            { opacity: 1, transform: 'none' },
          ],
          { duration: LAND_MS, easing: 'ease-out' },
        ),
      );
  }

  /**
   * At a reveal the page shows the region it points at, then moves on to the reveal's words once they have landed; its
   * last line brings the region back.
   */
  private readReveal() {
    const anchor = this.anchorEl()?.nativeElement;
    if (anchor) bringStageIntoView(anchor);
    this.stopReading();
    this.readTimer = setTimeout(() => {
      this.readTimer = null;
      const reveal = this.host.querySelector<HTMLElement>('app-experiment-dock .explain:not(.muted)');
      if (reveal) bringStageIntoView(reveal);
    }, REVEAL_READ_MS);
  }

  private stopReading() {
    if (this.readTimer !== null) clearTimeout(this.readTimer);
    this.readTimer = null;
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
