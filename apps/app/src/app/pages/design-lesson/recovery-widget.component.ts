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
  RECOVERY_BASELINE,
  RECOVERY_DISASTER,
  RECOVERY_SIZES_GB,
  formatDbSize,
  goalMet,
  recoveryScenario,
  renderExperiment,
  type ExperimentSpec,
  type RecoverySettings,
  type SdExperiment,
} from '@grasp/engine';
import { motionAllowed, motionScroll } from '../../core/motion';
import { CODE_TEXT_KEEP, CodeTextComponent } from '../../viz/code-text.component';
import { DataTableComponent } from '../../viz/kit/data-table.component';
import { watchMotion, watchVisibility } from '../../viz/kit/particles';
import { StageComponent } from '../../viz/kit/stage.component';
import { ExperimentDockComponent } from './experiment-dock.component';
import { ExperimentSession } from './experiment-session';
import { FocusBoxComponent } from './focus-box.component';
import type { Hit, StageGroup } from './recovery-draw';
import { buildStage } from './recovery-layout';
import { PLAN, PLAY_SECONDS, momentOf } from './recovery-motion';
import { RecoveryPrimsComponent } from './recovery-prims.component';
import { RECOVERY_KEEP } from './recovery-text';
import {
  ANSWER_NOTICE,
  NOTHING_HIDDEN,
  REST_NOTICE,
  WAIT_NOTICE,
  anyHidden,
  describeTable,
  goalParts,
  hiding,
  noteText,
  playNotice,
  settingSentence,
  stepOf,
  story,
  summary,
  type QuestionPhase,
} from './recovery-words';
import { WidgetPlay } from './widget-play';

const KEYS = ['disaster', 'size', 'restore', 'base', 'archive', 'replay', 'sync'] as const;
const actOf = (e: SdExperiment): RecoverySettings =>
  ({ ...RECOVERY_BASELINE, ...e.setup, ...(e.act && 'set' in e.act ? e.act.set : {}) }) as RecoverySettings;
const same = (a: RecoverySettings, b: RecoverySettings) => KEYS.every((k) => a[k] === b[k]);
/** The block each question's play is about, which the one-column layout brings into view first. */
const BLOCK_OF: Readonly<Record<string, 'a' | 'b'>> = { 'replica-drop': 'a', 'pitr-time': 'b', archive: 'a', growth: 'b', delayed: 'a' };

/**
 * Backups & Recovery (REDESIGN.md 5.2, R42): one disaster in the middle of time. Before it, on a log scale, what each of
 * four plans (full backups, point-in-time recovery, a standby, a delayed replica) can bring back and from when; after
 * it, on a linear scale, how long each takes to serve again, its bar made of the restore, the replay and the promotion
 * or the copy back, with an inset of the first 90 minutes. Every number is the engine's `recoveryScenario`. Play runs
 * the day before, the strike, the recovery points and the recovery on one clock; experiment cards set the widget up,
 * ask, play the answer and reveal, hiding until then what would give it away.
 */
@Component({
  selector: 'app-recovery-widget',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [StageComponent, DataTableComponent, FocusBoxComponent, ExperimentDockComponent, RecoveryPrimsComponent, CodeTextComponent],
  providers: [{ provide: CODE_TEXT_KEEP, useValue: RECOVERY_KEEP }],
  host: { '[class.pinned]': 'pinned()' },
  templateUrl: './recovery-widget.component.html',
  styleUrl: './recovery-widget.component.scss',
})
export class RecoveryWidgetComponent {
  readonly experimentSpecs = input<readonly ExperimentSpec[]>([], { alias: 'experiments' });
  readonly experiments = computed(() => this.experimentSpecs().map(renderExperiment));
  readonly disasters = [
    { value: RECOVERY_DISASTER.disk, label: 'Disks lost' },
    { value: RECOVERY_DISASTER.drop, label: 'Table dropped' },
  ];
  readonly sizes = RECOVERY_SIZES_GB.map((v) => ({ value: v, label: formatDbSize(v) }));

  readonly settings = signal<RecoverySettings>({ ...RECOVERY_BASELINE });
  readonly model = computed(() => recoveryScenario(this.settings()));

  readonly motion = signal(false);
  readonly describe = signal(false);
  readonly notice = signal(REST_NOTICE);
  /** Under Reduced motion, what the last Play did, in words under the stage. */
  readonly caption = signal('');
  private readonly ghost = signal<RecoverySettings | null>(null);
  /** Whether a play is running; its clock, 0 to 1, moves the stage only at the moments `momentOf` names. */
  readonly play = signal(false);
  private readonly clock = signal(0);
  /** From a play's start until the learner's next change: the notice stays in view beside a stage taller than the screen. */
  readonly pinned = signal(false);

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
  /** At a reveal whose act changed a setting, its setup is the ghost; else the learner's last setting. */
  private readonly ghostShown = computed(() => {
    const e = this.question();
    if (e && this.exp.phase() === 'revealed' && same(actOf(e), this.settings()))
      return e.act && 'set' in e.act ? ({ ...RECOVERY_BASELINE, ...e.setup } as RecoverySettings) : null;
    return this.ghost();
  });

  readonly width = computed(() => Math.max(248, this.stageRef().width()));
  private readonly moment = computed(() => (this.play() ? momentOf(this.clock()) : null));
  readonly stage = computed(() => {
    const frac = this.moment();
    return buildStage(this.width(), this.model(), {
      hid: this.hid(),
      play: frac === null ? null : { frac },
      answering: this.phase() === 'playing',
      ghost: this.ghostShown(),
      told: !!this.caption(),
      challenge: !!this.exp.active()?.goal,
      focus: this.exp.active()?.focus ?? [],
    });
  });
  readonly under = computed(() => this.stage().D.prims(['back', 'grid']));
  readonly over = computed(() => this.stage().D.prims(['marks', 'dots', 'text', 'top']));
  readonly playHit = computed(() => this.stage().hits.find((h): h is Extract<Hit, { kind: 'play' }> => h.kind === 'play') ?? null);
  readonly groups = [
    { name: 'base', legend: 'Full backup every' },
    { name: 'archive', legend: 'Log archived every' },
    { name: 'sync', legend: 'Standby' },
    { name: 'restore', legend: 'Restore speed' },
    { name: 'replay', legend: 'Log replay' },
  ] as const;
  segs(group: StageGroup) {
    return this.stage().hits.filter((h): h is Extract<Hit, { kind: 'seg' }> => h.kind === 'seg' && h.group === group);
  }
  /** Each block's span on the stage, which a play or an answer brings into view in the one-column layout. */
  readonly blocks = computed(() => {
    const meta = this.stage().meta;
    return { a: { top: meta.aTop - 40, height: meta.bHeadY - meta.aTop + 40 }, b: { top: meta.bHeadY, height: meta.bEndY - meta.bHeadY } };
  });

  readonly note = computed(() => noteText(this.hid()));
  readonly describeWaits = computed(() => (!!this.exp.active() && this.exp.phase() === 'asking') || anyHidden(this.hid()));
  readonly describeWaitsWhy = computed(() =>
    this.exp.active()?.goal ? 'Describe waits until you meet the goal.' : 'Describe waits for your answer.',
  );
  /** Describe's box is the stage's well, borders included. */
  readonly describeTable = computed(() => describeTable(this.model(), this.width() + 2, this.width()));
  readonly describeSaid = computed(() => summary(this.model(), NOTHING_HIDDEN));
  readonly goalChecks = computed(() => (this.exp.active()?.goal ? goalParts(this.model(), this.exp.kept()) : []));
  readonly goalStatus = computed(() => {
    const goal = this.exp.active()?.goal;
    if (!goal) return '';
    if (this.exp.phase() === 'revealed')
      return this.exp.kept() && goalMet(goal, this.model().metrics, this.settings()) ? 'Goal met:' : 'You met it; now:';
    if (this.exp.kept()) return '';
    const keep = goal.keep ?? {};
    const disaster = this.disasters.find((d) => d.value === keep['disaster'])?.label.toLowerCase();
    return `The goal keeps ${formatDbSize(keep['size'] ?? this.settings().size)}${disaster ? ` and the ${disaster}` : ''}.`;
  });

  constructor() {
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      const stopMotion = watchMotion(motionAllowed, (allowed) => this.motion.set(allowed));
      // The widget host, not the stage: on a phone the stage scrolls away while the dock under it is read.
      const stopVisibility = watchVisibility(this.host, (visible) => this.player.setVisible(visible));
      destroyRef.onDestroy(() => {
        stopMotion();
        stopVisibility();
        this.player.stop(false);
      });
    });
  }

  /** Whether Play is now its Stop: during a free play. */
  readonly stopping = computed(() => this.playing() && !this.exp.locked());
  readonly playName = computed(() => {
    const what = 'the disaster and the recovery';
    if (this.locked()) return `Play ${what}, after your answer`;
    return `${this.stopping() ? 'Stop' : 'Play'} ${what}`;
  });
  hitStyle(h: Hit) {
    return { left: `${h.x}px`, top: `${h.y}px`, width: `${h.w}px`, height: `${h.h}px` };
  }

  set(name: keyof RecoverySettings, value: number) {
    if (this.locked() || this.settings()[name] === value) return;
    const was = this.settings();
    this.settle();
    this.settings.set({ ...was, [name]: value });
    this.ghost.set(was);
    this.caption.set('');
    this.notice.set(settingSentence(this.model()));
  }

  togglePlay() {
    if (this.locked()) return;
    if (this.stopping()) return this.player.stop();
    this.exp.clearFocus();
    if (!this.motion() || !this.ready()) {
      const said = story(this.model());
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
    this.run(() => this.notice.set(stepOf(this.model(), 1, NOTHING_HIDDEN)));
  }

  start(e: SdExperiment) {
    this.player.stop(false);
    this.describe.set(false);
    this.exp.start(e);
    this.notice.set(e.goal ? settingSentence(this.model()) : WAIT_NOTICE);
  }

  toggleDescribe() {
    this.describe.update((d) => !d);
  }

  /** Ends a running play: the stage draws the rest state at once. */
  private settle() {
    this.pinned.set(false);
    this.player.stop();
    this.exp.clearFocus();
    this.play.set(false);
  }

  /** A card's setup, or an answer's act: a new start, with no ghost of what came before. */
  private applySettings(s: Readonly<Record<string, number>>) {
    this.settle();
    this.describe.set(false);
    this.caption.set('');
    this.ghost.set(null);
    this.settings.update((was) => ({ ...was, ...s }));
  }

  /**
   * An answer plays the disaster; in the one-column layout the block it is about comes into view first, and in either
   * layout at the recovery. At the reveal the notice lets go, so the dock's reveal is not under it.
   */
  private playAnswer(e: SdExperiment, done: () => void) {
    const block = BLOCK_OF[e.id] ?? 'b';
    afterNextRender({ read: () => this.bringBlockIntoView(block) }, { injector: this.injector });
    this.notice.set(ANSWER_NOTICE);
    this.run(
      () => undefined,
      () => {
        this.pinned.set(false);
        done();
        if (this.exp.active() !== e || this.exp.phase() !== 'revealed') return;
        this.notice.set(settingSentence(this.model()));
        if (this.motion()) afterNextRender({ write: () => this.land() }, { injector: this.injector });
      },
      block,
    );
  }

  /** Whether the widget lays out in one column: there the experiments' wrapper steps aside. */
  private oneColumn(): boolean {
    const exps = this.host.querySelector('.experiments');
    return !!exps && getComputedStyle(exps).display === 'contents';
  }

  /** In one column the block comes into view; with `anyLayout`, in two columns too, which a tall stage needs on a laptop. */
  private bringBlockIntoView(block: 'a' | 'b', anyLayout = false) {
    if (!anyLayout && !this.oneColumn()) return;
    const el = this.host.querySelector<HTMLElement>(`.block-${block}`);
    if (!el) return;
    const header = el.closest('ion-content')?.previousElementSibling?.getBoundingClientRect().bottom ?? 0;
    el.style.scrollMarginTop = `${header + 8}px`;
    el.scrollIntoView({ block: 'nearest', behavior: motionScroll() });
  }

  /**
   * Runs the play on one clock: `ended` only when it plays to its end, `done` however it stops. As the recovery starts,
   * `block` comes into view in any layout: the stage is taller than a laptop's screen.
   */
  private run(ended: () => void, done: () => void = () => undefined, block: 'a' | 'b' = 'b') {
    if (!this.motion() || !this.ready()) {
      ended();
      done();
      return;
    }
    // The play this one replaces finishes first, so its `done`, which clears `play`, cannot clear this one's.
    this.player.stop();
    this.clock.set(0);
    this.play.set(true);
    this.pinned.set(true);
    let said = '';
    let scrolled = false;
    this.player.play(
      PLAY_SECONDS * 1000,
      (p) => {
        this.clock.set(p);
        // The notice says each step once as the play reaches it; the counting clock stays on the stage.
        const step = playNotice(this.model(), p, this.hid());
        if (step !== said) this.notice.set((said = step));
        if (!scrolled && p >= PLAN.recoverStart) {
          scrolled = true;
          this.bringBlockIntoView(block, true);
        }
      },
      () => {
        this.play.set(false);
        done();
      },
      ended,
    );
  }

  /** At the reveal the values settle. */
  private land() {
    for (const el of this.host.querySelectorAll<SVGElement>(
      'svg.draw :is([data-id$="-value"], [data-id^="ring-"], [data-id^="lost-"], [data-id^="serve-"], [data-id^="iserve-"], [data-id^="never-"], [data-id="standby-x"])',
    ))
      el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 400, easing: 'ease-out' });
  }
}
