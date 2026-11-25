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
  CDN_BASELINE,
  CDN_POPS,
  CDN_RPS,
  CDN_TTLS,
  CDN_VARIANTS,
  cdnGroup,
  cdnSample,
  cdnScenario,
  goalMet,
  renderExperiment,
  ttlShort,
  type CdnScenario,
  type CdnSettings,
  type ExperimentSpec,
  type SdExperiment,
} from '@grasp/engine';
import { motionAllowed, motionScroll } from '../../core/motion';
import { CODE_TEXT_KEEP, CodeTextComponent } from '../../viz/code-text.component';
import { DataTableComponent } from '../../viz/kit/data-table.component';
import { watchMotion, watchVisibility } from '../../viz/kit/particles';
import { StageComponent } from '../../viz/kit/stage.component';
import type { Hit } from './cdn-draw';
import { buildStage, stepPrims } from './cdn-layout';
import { PLAY_SECONDS, litAt, particleAt, playheadX } from './cdn-motion';
import { CdnPrimsComponent } from './cdn-prims.component';
import { CDN_KEEP } from './cdn-text';
import {
  ANSWER_NOTICE,
  NOTHING_HIDDEN,
  REDUCED_STEP,
  WAIT_NOTICE,
  anyHidden,
  describeTable,
  goalParts,
  guideText,
  hiding,
  noteText,
  playingNotice,
  restStep,
  settingSentence,
  stepWords,
  story,
  summary,
  windowWords,
  type QuestionPhase,
} from './cdn-words';
import { ExperimentDockComponent } from './experiment-dock.component';
import { ExperimentSession } from './experiment-session';
import { FocusBoxComponent } from './focus-box.component';
import { proseLines } from './stage-text';
import { WidgetPlay } from './widget-play';

type Name = keyof CdnSettings;
const NAMES: readonly Name[] = ['rps', 'pops', 'ttl', 'shield', 'variants'];
const SHIELD_CARD = 'origin-shield';

/**
 * CDNs & Edge (REDESIGN.md 5.2, R42): where a CDN's requests are answered, by the model (users, every location as its own
 * cell, the fan-in of their misses to the shield and the origin, each path's latency and their mean), one location's
 * copies over five TTLs as a random sample, and every request by popularity (a Zipf curve whose bands are each tier's
 * share). Every number is the engine's `cdnScenario`. Play runs the timeline on one clock; experiment cards set the
 * widget up, ask, play the answer and reveal, hiding until then what would give it away.
 */
@Component({
  selector: 'app-cdn-widget',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [StageComponent, DataTableComponent, FocusBoxComponent, ExperimentDockComponent, CdnPrimsComponent, CodeTextComponent],
  providers: [{ provide: CODE_TEXT_KEEP, useValue: CDN_KEEP }],
  templateUrl: './cdn-widget.component.html',
  styleUrl: './cdn-widget.component.scss',
})
export class CdnWidgetComponent {
  readonly experimentSpecs = input<readonly ExperimentSpec[]>([], { alias: 'experiments' });
  readonly experiments = computed(() => this.experimentSpecs().map(renderExperiment));
  readonly groups: readonly { name: Name; legend: string; options: { value: number; label: string }[] }[] = [
    { name: 'rps', legend: 'Traffic', options: CDN_RPS.map((v) => ({ value: v, label: `${cdnGroup(v)}/s` })) },
    { name: 'pops', legend: 'Edge locations', options: CDN_POPS.map((v) => ({ value: v, label: String(v) })) },
    { name: 'ttl', legend: 'TTL', options: CDN_TTLS.map((v) => ({ value: v, label: ttlShort(v) })) },
    {
      name: 'variants',
      legend: 'Cache key',
      options: CDN_VARIANTS.map((v) => ({ value: v, label: v === 1 ? 'Path only' : '+ utm_source' })),
    },
  ];

  readonly settings = signal<CdnSettings>({ ...CDN_BASELINE });
  readonly model = computed(() => cdnScenario(this.settings()));

  readonly motion = signal(false);
  readonly describe = signal(false);
  readonly notice = signal(settingSentence(cdnScenario(CDN_BASELINE)));
  /** Under Reduced motion, what the last Play showed, in words under the stage. */
  readonly caption = signal('');
  private readonly ghost = signal<CdnScenario | null>(null);
  /** Whether the learner has changed a setting since the challenge opened. */
  private readonly moved = signal(false);
  /** The running play's clock, 0 to 1, or null at rest. */
  readonly clock = signal<number | null>(null);

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly injector = inject(Injector);
  readonly stageRef = viewChild.required(StageComponent);
  private readonly stageEl = viewChild.required(StageComponent, { read: ElementRef });
  readonly ready = computed(() => this.stageRef().width() > 0);
  private readonly player = new WidgetPlay(() => this.motion() && this.ready());
  readonly playing = this.player.playing;

  readonly exp: ExperimentSession = new ExperimentSession({
    apply: (s) => this.applySettings(s),
    settings: () => ({ ...this.settings() }),
    metrics: () => this.model().metrics,
    play: (e, done) => this.playAnswer(e, done),
    stage: (): HTMLElement => this.stageEl().nativeElement,
    root: this.host,
    motion: () => this.motion(),
  });
  private readonly question = computed(() => {
    const e = this.exp.active();
    return e && !e.goal ? e : null;
  });
  readonly phase = computed((): QuestionPhase => (this.question() ? this.exp.phase() : 'rest'));
  readonly hid = computed(() => hiding(this.question()?.hide ?? [], this.phase()));
  readonly locked = computed(() => this.hid().locked);

  readonly width = computed(() => Math.max(248, this.stageRef().width()));
  readonly stage = computed(() =>
    buildStage(this.width(), this.model(), {
      hid: this.hid(),
      ghost: this.ghost(),
      told: !!this.caption(),
      focus: this.exp.active()?.focus ?? [],
    }),
  );
  readonly under = computed(() => this.stage().D.prims(['back', 'grid', 'links']));
  readonly marks = computed(() => this.stage().D.prims(['clip']));
  readonly over = computed(() => this.stage().D.prims(['marks', 'dots', 'text', 'top']));
  /** The step line: the play's moment in words while it runs, Play's speed at rest. */
  readonly step = computed(() => {
    const t = this.clock();
    const m = this.stage().meta;
    if (t !== null) return stepWords(this.model(), m.events, t * m.timeline.window, m.timeline.window);
    return this.caption() ? REDUCED_STEP : restStep(this.settings());
  });
  readonly stepMarks = computed(() => stepPrims(this.stage().meta, this.stage().D.W, this.step(), this.clock() !== null));
  /** The playhead's x, up to which the sample shows while a play runs; read every frame. */
  readonly head = computed(() => {
    const t = this.clock();
    return t === null ? null : playheadX(this.stage().meta, t);
  });
  readonly particle = computed(() => {
    const t = this.clock();
    return t === null ? null : particleAt(this.stage().meta, t);
  });
  readonly lit = computed(() => {
    const t = this.clock();
    return t === null ? null : litAt(this.stage().meta, t);
  });
  readonly playHit = computed(() => this.stage().hits.find((h) => h.kind === 'play') ?? null);
  readonly shieldHit = computed(() => this.stage().hits.find((h) => h.kind === 'shield') ?? null);

  /** The notes' box under the stage: its width and font size, once laid out. */
  readonly proseBox = signal<{ width: number; size: number } | null>(null);
  private readonly proseEl = viewChild.required<ElementRef<HTMLElement>>('prose');
  /** The notes broken by measure, each line set whole, so the browser's own glyph widths never change their height. */
  private lines(text: string) {
    const box = this.proseBox();
    return box ? proseLines(text, box.size, box.width, [CDN_KEEP]) : [text];
  }
  readonly guide = computed(() => this.lines(guideText(this.settings(), this.hid())));
  readonly note = computed(() => this.lines(noteText(this.hid())));
  private readonly challengeWaits = computed(() => {
    const goal = this.exp.active()?.goal;
    return !!goal && !goalMet(goal, this.model().metrics, this.settings());
  });
  readonly describeWaits = computed(
    () => (!!this.question() && this.exp.phase() === 'asking') || anyHidden(this.hid()) || this.challengeWaits(),
  );
  readonly describeWaitsWhy = computed(() =>
    this.exp.active()?.goal ? 'Describe waits until you meet the goal.' : 'Describe waits for your answer.',
  );
  /** Describe's shield columns wait for "An origin shield", whose answer they hold, unless the shield is on. */
  private readonly shieldShown = computed(
    () => !this.experiments().some((e) => e.id === SHIELD_CARD) || !!this.settings().shield || this.exp.done().has(SHIELD_CARD),
  );
  readonly describeTable = computed(() => describeTable(this.model(), this.width() < 560, this.shieldShown()));
  readonly describeSaid = computed(() => summary(this.model(), NOTHING_HIDDEN));
  readonly goalChecks = computed(() => (this.exp.active()?.goal ? goalParts(this.model()) : []));
  readonly goalStatus = computed(() => {
    const goal = this.exp.active()?.goal;
    if (!goal) return '';
    if (goalMet(goal, this.model().metrics, this.settings())) return 'Goal met:';
    return this.moved() ? 'Not yet:' : 'Your goal:';
  });

  /** Whether Play is now its Stop: during a free play. */
  readonly stopping = computed(() => this.playing() && !this.exp.locked());
  readonly playName = computed(() => {
    if (this.locked()) return this.phase() === 'playing' ? 'The timeline plays your answer' : 'Play the timeline, after your answer';
    return this.stopping() ? 'Stop the timeline' : `Play ${windowWords(this.settings())} at the outlined location`;
  });

  constructor() {
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      const stopMotion = watchMotion(motionAllowed, (allowed) => this.motion.set(allowed));
      // The widget host, not the stage: on a phone the timeline scrolls away while the dock under it is read.
      const stopVisibility = watchVisibility(this.host, (visible) => this.player.setVisible(visible));
      const prose = this.proseEl().nativeElement;
      // A hidden page lays the box out at no width: keep the last lines.
      const sizer = new ResizeObserver(([entry]) => {
        const width = entry.contentRect.width;
        if (width > 0) this.proseBox.set({ width, size: parseFloat(getComputedStyle(prose).fontSize) });
      });
      sizer.observe(prose);
      destroyRef.onDestroy(() => {
        sizer.disconnect();
        stopMotion();
        stopVisibility();
        this.player.stop(false);
      });
    });
  }

  hitStyle(h: Hit) {
    return { left: `${h.x}px`, top: `${h.y}px`, width: `${h.w}px`, height: `${h.h}px` };
  }

  set(name: Name, value: number) {
    if (this.locked() || this.settings()[name] === value) return;
    const was = this.model();
    this.settle();
    this.settings.set({ ...this.settings(), [name]: value });
    this.ghost.set(was);
    this.caption.set('');
    this.moved.set(true);
    this.notice.set(settingSentence(this.model()));
  }

  togglePlay() {
    if (this.locked()) return;
    if (this.stopping()) return this.settle();
    this.exp.clearFocus();
    if (!this.motion() || !this.ready()) {
      const sc = this.model();
      const said = story(sc, cdnSample(sc), this.stage().meta.events, this.hid());
      this.caption.set(said);
      this.notice.set(said);
      // The story is written under the stage, and brought into view only when it is off screen.
      afterNextRender(
        { read: () => this.host.querySelector('.caption')?.scrollIntoView({ block: 'nearest' }) },
        { injector: this.injector },
      );
      return;
    }
    this.caption.set('');
    this.notice.set(playingNotice(this.settings()));
    this.run(() => {
      const sc = this.model();
      this.notice.set(this.clock() === null ? story(sc, cdnSample(sc), this.stage().meta.events, this.hid()) : settingSentence(sc));
    });
  }

  start(e: SdExperiment) {
    this.settle();
    this.describe.set(false);
    this.exp.start(e);
    this.moved.set(false);
    this.notice.set(e.goal ? settingSentence(this.model()) : WAIT_NOTICE);
  }

  toggleDescribe() {
    this.describe.update((d) => !d);
  }

  /** Ends a running play: the stage draws the rest state at once. */
  private settle() {
    this.player.stop();
    this.exp.clearFocus();
    this.clock.set(null);
  }

  /** A card's setup, or an answer's act: a new start, with no ghost of what came before. */
  private applySettings(s: Readonly<Record<string, number>>) {
    this.player.stop();
    this.clock.set(null);
    this.describe.set(false);
    this.caption.set('');
    this.ghost.set(null);
    const next = { ...this.settings() };
    for (const n of NAMES) if (s[n] !== undefined) next[n] = s[n];
    this.settings.set(next);
  }

  /** An answer plays the timeline at its act's setting; in the one-column layout the timeline comes into view first. */
  private playAnswer(e: SdExperiment, done: () => void) {
    afterNextRender({ read: () => this.bringTimelineIntoView() }, { injector: this.injector });
    if (this.motion() && this.ready()) this.notice.set(ANSWER_NOTICE);
    this.run(() => {
      done();
      if (this.exp.active() !== e || this.exp.phase() !== 'revealed') return;
      this.notice.set(settingSentence(this.model()));
      if (this.motion()) afterNextRender({ write: () => this.land() }, { injector: this.injector });
    });
  }

  /** In the one-column layout (the controls above the stage), the timeline's Play row comes into view. */
  private bringTimelineIntoView() {
    const play = this.host.querySelector<HTMLElement>('.play');
    const controls = this.host.querySelector<HTMLElement>('.controls');
    if (!play || !controls || controls.getBoundingClientRect().left > this.stageEl().nativeElement.getBoundingClientRect().left + 1) return;
    const header = play.closest('ion-content')?.previousElementSibling?.getBoundingClientRect().bottom ?? 0;
    const box = play.getBoundingClientRect();
    if (box.top >= header && box.top <= window.innerHeight / 2) return;
    play.style.scrollMarginTop = `${header + 8}px`;
    play.scrollIntoView({ block: 'start', behavior: motionScroll() });
  }

  /**
   * Runs the timeline on one clock; `done` runs however the play stops, with the clock at null when the play reached
   * its end. The step line moves on the stage only: the notice is set when a play starts and when it stops.
   */
  private run(done: () => void) {
    if (!this.motion() || !this.ready()) return done();
    this.player.stop();
    this.clock.set(0);
    this.player.play(
      PLAY_SECONDS * 1000,
      (p) => this.clock.set(p),
      () => {
        done();
        this.clock.set(null);
      },
      () => this.clock.set(null),
    );
  }

  /** At the reveal the flows and the square's bands settle in. */
  private land() {
    for (const el of this.host.querySelectorAll<SVGElement>(
      'svg.draw :is([data-id^="fill-"], [data-id^="stream-"], [data-id="trunk"], [data-id^="band-"], [data-id^="knee-"])',
    ))
      el.animate(
        [
          { opacity: 0, transform: 'translateY(-4px)' },
          { opacity: 1, transform: 'none' },
        ],
        { duration: 400, easing: 'ease-out' },
      );
  }
}
