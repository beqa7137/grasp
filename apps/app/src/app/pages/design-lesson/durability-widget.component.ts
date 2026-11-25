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
  DURABILITY_AFRS,
  DURABILITY_BASELINE,
  DURABILITY_REPAIRS,
  DURABILITY_SCHEMES,
  durabilityPlan,
  durabilityPlayState,
  durabilityScenario,
  goalKept,
  goalMet,
  renderExperiment,
  type DurabilityPlayKind,
  type DurabilitySettings,
  type ExperimentSpec,
  type SdExperiment,
} from '@grasp/engine';
import { motionAllowed, motionScroll } from '../../core/motion';
import { CODE_TEXT_KEEP, CodeTextComponent } from '../../viz/code-text.component';
import { DataTableComponent } from '../../viz/kit/data-table.component';
import { watchMotion, watchVisibility } from '../../viz/kit/particles';
import { StageComponent } from '../../viz/kit/stage.component';
import type { Hit } from './durability-draw';
import { buildStage } from './durability-layout';
import { liveMarks, momentOf, stepTau } from './durability-motion';
import { DurabilityPrimsComponent } from './durability-prims.component';
import { DURABILITY_KEEP } from './durability-text';
import {
  NOTHING_HIDDEN,
  WAIT_NOTICE,
  describeTable,
  exactWords,
  factsSentence,
  goalChecks,
  hiding,
  momentsOf,
  noteText,
  pieceWord,
  playLabel,
  raceSentence,
  readoutText,
  settingSentence,
  stageLabel,
  summary,
  type QuestionPhase,
} from './durability-words';
import { ExperimentDockComponent } from './experiment-dock.component';
import { ExperimentSession } from './experiment-session';
import { FocusBoxComponent } from './focus-box.component';
import { WidgetPlay } from './widget-play';

const KEYS = ['scheme', 'afr', 'repair', 'rack'] as const;
const actOf = (e: SdExperiment): DurabilitySettings =>
  ({ ...DURABILITY_BASELINE, ...e.setup, ...(e.act && 'set' in e.act ? e.act.set : {}) }) as DurabilitySettings;
const same = (a: DurabilitySettings, b: DurabilitySettings) => KEYS.every((k) => a[k] === b[k]);
const runOf = (e: SdExperiment): DurabilityPlayKind => (e.act && 'run' in e.act && e.act.run === 'staged' ? 'staged' : 'repair');

/**
 * Durability (REDESIGN.md 5.2, R42): one object cut into pieces (or copied) on their disks, the stored bytes to scale
 * against the object's; one repair after a disk fails, its window on a fixed week racing the other pieces' failures, the
 * rebuild's reads into a free disk; and the model's yearly chance of a loss as a walk along one nines scale, read on the
 * same axis as objects lost a year among a billion. Every number is the engine's `durabilityScenario`. A play draws one
 * repair, typical or staged as a loss and said to be staged; experiment cards set the widget up, ask, play the answer
 * and reveal, hiding until then what would give it away.
 */
@Component({
  selector: 'app-durability-widget',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [StageComponent, DataTableComponent, FocusBoxComponent, ExperimentDockComponent, DurabilityPrimsComponent, CodeTextComponent],
  providers: [{ provide: CODE_TEXT_KEEP, useValue: DURABILITY_KEEP }],
  templateUrl: './durability-widget.component.html',
  styleUrl: './durability-widget.component.scss',
})
export class DurabilityWidgetComponent {
  readonly experimentSpecs = input<readonly ExperimentSpec[]>([], { alias: 'experiments' });
  readonly experiments = computed(() => this.experimentSpecs().map(renderExperiment));
  readonly schemes = DURABILITY_SCHEMES.map((sc, i) => ({
    value: i,
    label: sc.short,
    name: sc.kind === 'replicas' ? sc.short : `${sc.short} erasure coding`,
  }));
  readonly afrs = DURABILITY_AFRS.map((v) => ({ value: v, label: `${v}%`, name: `${v}% of disks fail a year` }));
  readonly repairs = DURABILITY_REPAIRS.map((v) => ({ value: v, label: `${v} h`, name: v === 168 ? '168 h, a week' : `${v} h` }));

  readonly settings = signal<DurabilitySettings>({ ...DURABILITY_BASELINE });
  readonly model = computed(() => durabilityScenario(this.settings()));
  /** Each radio's accessible name starts with its visible label. */
  readonly racks = computed(() => {
    const piece = pieceWord(this.model(), 1);
    return [
      { value: 0, label: 'A rack each', name: `A rack each: every ${piece} in its own rack` },
      { value: 1, label: 'One rack', name: `One rack: every ${piece} in one rack` },
    ];
  });

  readonly motion = signal(false);
  readonly describe = signal(false);
  readonly notice = signal(settingSentence(durabilityScenario(DURABILITY_BASELINE)));
  private readonly ghost = signal<DurabilitySettings | null>(null);
  /** The play the stage shows, running or at its end: a typical repair, or the staged loss Stage a loss toggles. */
  readonly kind = signal<DurabilityPlayKind>('repair');
  /** Under Reduced motion, the moment Play last stepped to; null at rest. */
  readonly step = signal<number | null>(null);
  /** The running play's clock in seconds, read each frame by the continuous marks alone. */
  private readonly clock = signal(0);

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
  private readonly challenge = computed(() => {
    const e = this.exp.active();
    return e?.goal ? e : null;
  });
  readonly phase = computed((): QuestionPhase => (this.question() ? this.exp.phase() : 'rest'));
  readonly hid = computed(() => hiding(this.question()?.hide ?? [], this.phase()));
  readonly locked = computed(() => this.hid().waits);
  readonly afrKept = computed(() => this.challenge()?.goal?.keep?.['afr'] !== undefined);
  readonly met = computed(() => {
    const goal = this.challenge()?.goal;
    return !!goal && goalMet(goal, this.model().metrics, this.settings());
  });
  /** At a reveal whose act changed a setting, its setup is the ghost; in a challenge, its setup; else the last setting. */
  private readonly ghostShown = computed(() => {
    const e = this.question();
    if (e && this.exp.phase() === 'revealed' && same(actOf(e), this.settings()))
      return e.act && 'set' in e.act ? ({ ...DURABILITY_BASELINE, ...e.setup } as DurabilitySettings) : null;
    return this.ghost();
  });

  readonly width = computed(() => Math.max(248, this.stageRef().width()));
  private readonly plan = computed(() => durabilityPlan(this.settings(), this.kind()));
  /** The play at its last moment: the stage redraws only when the clock passes one. */
  private readonly tau = computed((): number | null => {
    if (this.playing()) return momentOf(this.plan(), this.clock());
    const k = this.step();
    return k === null ? null : stepTau(this.plan(), k);
  });
  readonly stage = computed(() =>
    buildStage(this.width(), this.model(), {
      hid: this.hid(),
      kind: this.kind(),
      tau: this.tau(),
      live: this.playing(),
      step: this.step(),
      ghost: this.ghostShown(),
      challenge: !!this.challenge(),
      met: this.met(),
      focus: this.exp.active()?.focus ?? [],
    }),
  );
  readonly under = computed(() => this.stage().D.prims(['back', 'grid', 'links']));
  readonly over = computed(() => this.stage().D.prims(['marks', 'dots', 'text', 'top']));
  /** The running play's continuous marks, moved by transform every frame. */
  readonly live = computed(() => {
    if (!this.playing()) return null;
    const ps = durabilityPlayState(this.settings(), this.kind(), this.clock());
    return liveMarks(this.stage().meta.live, ps.lost ? 0 : ps.progress, this.clock());
  });
  hitOf(kind: Hit['kind']): Hit {
    return this.stage().hits.find((h) => h.kind === kind)!;
  }

  readonly note = computed(() => noteText(this.model()));
  readonly readout = computed(() => readoutText(this.model(), this.hid()));
  readonly describeWaits = computed(() => (!!this.exp.active() && this.exp.phase() === 'asking') || this.hid().waits);
  readonly describeWaitsWhy = computed(() =>
    this.exp.active()?.goal ? 'Describe waits until you meet the goal.' : 'Describe waits for your answer.',
  );
  /** Describe's box is the stage's well, borders included. */
  readonly describeTable = computed(() => describeTable(this.model(), this.width() + 2));
  readonly describeSaid = computed(() => {
    const m = this.model();
    const rest = durabilityPlayState(m.settings, 'repair', null);
    return [
      summary(m, NOTHING_HIDDEN),
      `${raceSentence(m, rest, 'repair', NOTHING_HIDDEN)} ${factsSentence(m, NOTHING_HIDDEN, null)} ${exactWords(m)}`,
    ];
  });
  readonly goalChecks = computed(() => (this.challenge() ? goalChecks(this.model()) : []));
  readonly goalStatus = computed(() => {
    const goal = this.challenge()?.goal;
    if (!goal) return '';
    if (this.exp.phase() === 'revealed') return this.met() ? 'Goal met:' : 'You met it; now:';
    return goalKept(goal, this.settings()) ? '' : 'The goal keeps disks failing at 5% a year.';
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
  private readonly controlState = computed(() => ({
    locked: this.locked(),
    running: this.playing() && this.step() === null,
    step: this.step(),
    kind: this.kind(),
    moments: momentsOf(this.model(), this.kind()),
  }));
  /** Each control's name is its visible words and then what they leave unsaid. */
  readonly playName = computed(() => `${this.hitOf('play').text}${playLabel(this.controlState()).more}`);
  readonly stageName = computed(() => `${this.hitOf('stage').text}${stageLabel(this.controlState()).more}`);
  /** An outline may hold several adjacent regions, named together. */
  focused(region: string) {
    return region.split(' ').some((r) => this.exp.focusOn().includes(r));
  }
  hitStyle(h: Hit) {
    return { left: `${h.x}px`, top: `${h.y}px`, width: `${h.w}px`, height: `${h.h}px` };
  }

  set(name: keyof DurabilitySettings, value: number) {
    if (this.locked() || this.settings()[name] === value) return;
    const was = this.settings();
    this.settle();
    this.kind.set('repair');
    this.settings.set({ ...was, [name]: value });
    const c = this.challenge();
    this.ghost.set(c ? ({ ...DURABILITY_BASELINE, ...c.setup } as DurabilitySettings) : was);
    this.notice.set(settingSentence(this.model()));
  }

  togglePlay() {
    if (this.locked()) return;
    if (this.stopping()) return this.player.stop();
    this.run(this.kind() === 'staged' && this.step() !== null ? 'staged' : 'repair');
  }

  toggleStaged() {
    if (this.locked()) return;
    if (this.kind() === 'staged' && this.playing()) return this.player.stop();
    if (this.kind() === 'staged' && this.step() === null) {
      this.settle();
      this.kind.set('repair');
      this.notice.set(this.restSentence('repair'));
      return;
    }
    this.run('staged');
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

  private restSentence(kind: DurabilityPlayKind, tau: number | null = null) {
    return raceSentence(this.model(), durabilityPlayState(this.settings(), kind, tau), kind, this.hid());
  }

  /** Ends a running play: the stage draws the rest state at once. */
  private settle() {
    this.player.stop();
    this.exp.clearFocus();
    this.step.set(null);
  }

  /** A card's setup, or an answer's act: a new start, with no ghost of what came before. */
  private applySettings(s: Readonly<Record<string, number>>) {
    this.settle();
    this.describe.set(false);
    this.ghost.set(null);
    this.kind.set('repair');
    this.settings.update((was) => ({ ...was, ...s }));
  }

  /** A free play: with motion on one clock; under Reduced motion one moment a press, its sentence read out. */
  private run(kind: DurabilityPlayKind) {
    this.exp.clearFocus();
    const changed = kind !== this.kind();
    this.kind.set(kind);
    if (!this.motion() || !this.ready()) {
      const was = changed ? null : this.step();
      const next = was === null ? 0 : was + 1;
      const step = next >= momentsOf(this.model(), kind) - 1 ? null : next;
      this.step.set(step);
      this.notice.set(this.restSentence(kind, step === null ? null : stepTau(this.plan(), step)));
      return;
    }
    this.step.set(null);
    this.play(() => this.notice.set(this.restSentence(kind)));
  }

  /** An answer plays its act on the picture; in the one-column layout the disks' row comes to the top first. */
  private playAnswer(e: SdExperiment, done: () => void) {
    this.kind.set(runOf(e));
    this.step.set(null);
    this.notice.set(WAIT_NOTICE);
    afterNextRender({ read: () => this.bringPiecesIntoView() }, { injector: this.injector });
    this.play(
      () => undefined,
      () => {
        done();
        if (this.exp.active() !== e || this.exp.phase() !== 'revealed') return;
        this.notice.set(settingSentence(this.model()));
        if (this.motion()) afterNextRender({ write: () => this.land() }, { injector: this.injector });
      },
    );
  }

  /** On a phone the stage is taller than the screen: the disks' row, where the answer plays, goes to the top. */
  private bringPiecesIntoView() {
    const stage = this.stageEl().nativeElement as HTMLElement;
    if (stage.getBoundingClientRect().height <= window.innerHeight) return;
    const target = this.host.querySelector<SVGElement>('svg.draw [data-id="disks-title"]');
    if (!target) return;
    const header = stage.closest('ion-content')?.previousElementSibling?.getBoundingClientRect().bottom ?? 0;
    const top = target.getBoundingClientRect().top - 30;
    if (top >= header && top <= window.innerHeight / 3) return;
    target.style.scrollMarginTop = `${header + 30}px`;
    target.scrollIntoView({ block: 'start', behavior: motionScroll() });
  }

  /** Runs the play of `kind()` on one clock: `ended` only when it plays to its end, `done` however it stops. */
  private play(ended: () => void, done: () => void = () => undefined) {
    if (!this.motion() || !this.ready()) {
      ended();
      done();
      return;
    }
    // The play this one replaces finishes first, so its `done` cannot clear this one's clock.
    this.player.stop();
    this.clock.set(0);
    const total = this.plan().total;
    this.player.play(total * 1000, (p) => this.clock.set(p * total), done, ended);
  }

  /** At the reveal the walk and the last row settle. */
  private land() {
    for (const el of this.host.querySelectorAll<SVGElement>('svg.draw :is([data-id^="row-"], [data-id^="final-"], [data-id^="head-val-"])'))
      el.animate(
        [
          { opacity: 0, transform: 'translateY(-4px)' },
          { opacity: 1, transform: 'none' },
        ],
        { duration: 400, easing: 'ease-out' },
      );
  }
}
