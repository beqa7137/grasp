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
  STORAGE_BASELINE,
  STORAGE_DATA_GB,
  STORAGE_OP,
  STORAGE_RECORD_B,
  formatB,
  formatGb,
  goalMet,
  renderExperiment,
  storageScenario,
  type ExperimentSpec,
  type SdExperiment,
  type StorageSettings,
} from '@grasp/engine';
import { motionAllowed, motionScroll } from '../../core/motion';
import { CODE_TEXT_KEEP, CodeTextComponent } from '../../viz/code-text.component';
import { DataTableComponent } from '../../viz/kit/data-table.component';
import { watchMotion, watchVisibility } from '../../viz/kit/particles';
import { StageComponent } from '../../viz/kit/stage.component';
import { ExperimentDockComponent } from './experiment-dock.component';
import { ExperimentSession } from './experiment-session';
import { FocusBoxComponent } from './focus-box.component';
import type { Hit } from './storage-draw';
import { buildStage } from './storage-layout';
import { keyPosition, momentOf, planOf, type Engine, type StoragePlay } from './storage-motion';
import { StoragePrimsComponent } from './storage-prims.component';
import { STORAGE_KEEP } from './storage-text';
import {
  ENGINE,
  NOTHING_HIDDEN,
  REST_NOTICE,
  WAIT_NOTICE,
  answerNotice,
  anyHidden,
  describeTable,
  goalParts,
  hiding,
  noteText,
  opWord,
  settingSentence,
  story,
  summary,
  type QuestionPhase,
} from './storage-words';
import { WidgetPlay } from './widget-play';

const KEYS = ['data', 'record', 'page', 'ratio', 'bloom', 'op'] as const;
const actOf = (e: SdExperiment): StorageSettings =>
  ({ ...STORAGE_BASELINE, ...e.setup, ...(e.act && 'set' in e.act ? e.act.set : {}) }) as StorageSettings;
const same = (a: StorageSettings, b: StorageSettings) => KEYS.every((k) => a[k] === b[k]);

/**
 * Storage Engines (REDESIGN.md 5.2, R41): one write or one lookup through a B-tree and an LSM tree, side by side. The
 * B-tree's levels of pages with the walk to a leaf and the leaf page to scale against what one update writes; the LSM
 * tree's memtable, log and sorted runs with the record's way down them, one level's merges as a staircase, the bloom
 * filters a lookup asks; under them what each pays on fixed scales. Every number is the engine's `storageScenario`.
 * Each engine's Play runs its operation on one clock; experiment cards set the widget up, ask, play the answer on the
 * engine it names and reveal, hiding until then what would give it away.
 */
@Component({
  selector: 'app-storage-widget',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [StageComponent, DataTableComponent, FocusBoxComponent, ExperimentDockComponent, StoragePrimsComponent, CodeTextComponent],
  providers: [{ provide: CODE_TEXT_KEEP, useValue: STORAGE_KEEP }],
  templateUrl: './storage-widget.component.html',
  styleUrl: './storage-widget.component.scss',
})
export class StorageWidgetComponent {
  readonly experimentSpecs = input<readonly ExperimentSpec[]>([], { alias: 'experiments' });
  readonly experiments = computed(() => this.experimentSpecs().map(renderExperiment));
  readonly follows = [
    { value: STORAGE_OP.write, label: 'A write' },
    { value: STORAGE_OP.read, label: 'A lookup' },
  ];
  readonly readOp = STORAGE_OP.read;
  readonly dataSizes = STORAGE_DATA_GB.map((v) => ({ value: v, label: formatGb(v) }));
  readonly records = STORAGE_RECORD_B.map((v) => ({ value: v, label: formatB(v) }));

  readonly settings = signal<StorageSettings>({ ...STORAGE_BASELINE });
  readonly model = computed(() => storageScenario(this.settings()));

  readonly motion = signal(false);
  readonly describe = signal(false);
  readonly notice = signal(REST_NOTICE);
  /** Under Reduced motion, what the last Play did, in words under the stage, and which engine it followed. */
  readonly caption = signal('');
  private readonly told = signal<Engine | null>(null);
  private readonly ghost = signal<StorageSettings | null>(null);
  /** The running play's engine; null at rest. */
  readonly play = signal<Engine | null>(null);
  /** The play's clock, 0 to 1, read each frame by the key alone; the stage redraws only at the play's moments. */
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
  readonly phase = computed((): QuestionPhase => (this.question() ? this.exp.phase() : 'rest'));
  readonly hid = computed(() => hiding(this.question()?.hide ?? [], this.phase()));
  readonly locked = computed(() => this.hid().locked);
  /** At a reveal whose act changed a setting, its setup is the ghost; else the learner's last setting. */
  private readonly ghostShown = computed(() => {
    const e = this.question();
    if (e && this.exp.phase() === 'revealed' && same(actOf(e), this.settings()))
      return e.act && 'set' in e.act ? ({ ...STORAGE_BASELINE, ...e.setup } as StorageSettings) : null;
    return this.ghost();
  });

  readonly width = computed(() => Math.max(248, this.stageRef().width()));
  /** The play at its last moment: the stage changes only when the clock passes one. */
  private readonly moment = computed((): StoragePlay | null => {
    const engine = this.play();
    return engine ? { engine, frac: momentOf(engine, this.model(), this.clock()) } : null;
  });
  readonly stage = computed(() =>
    buildStage(this.width(), this.model(), {
      hid: this.hid(),
      play: this.moment(),
      ghost: this.ghostShown(),
      told: this.told(),
      focus: this.exp.active()?.focus ?? [],
    }),
  );
  readonly under = computed(() => this.stage().D.prims(['back', 'grid', 'links']));
  readonly over = computed(() => this.stage().D.prims(['marks', 'dots', 'text', 'top']));
  /** The key in flight: the play's one moving mark. */
  readonly key = computed(() => (this.play() ? keyPosition(this.stage().meta.keys, this.clock()) : null));
  /** The on-stage controls, placed by the layout. */
  playOf(engine: Engine) {
    return this.stage().hits.find((h): h is Extract<Hit, { kind: 'play' }> => h.kind === 'play' && h.engine === engine) ?? null;
  }
  readonly toggle = computed(() => this.stage().hits.find((h): h is Extract<Hit, { kind: 'toggle' }> => h.kind === 'toggle') ?? null);
  readonly groups = [
    { name: 'page', legend: 'Page size', engine: 'btree' },
    { name: 'ratio', legend: 'Size ratio', engine: 'lsm' },
  ] as const;
  segs(group: 'page' | 'ratio') {
    return this.stage().hits.filter((h): h is Extract<Hit, { kind: 'seg' }> => h.kind === 'seg' && h.group === group);
  }

  readonly note = computed(() => noteText(this.hid()));
  readonly describeWaits = computed(() => (!!this.exp.active() && this.exp.phase() === 'asking') || anyHidden(this.hid()));
  readonly describeWaitsWhy = computed(() =>
    this.exp.active()?.goal ? 'Describe waits until you meet the goal.' : 'Describe waits for your answer.',
  );
  /** Describe's box is the stage's well, borders included. */
  readonly describeTable = computed(() => describeTable(this.model(), this.width() + 2));
  readonly describeSaid = computed(() => summary(this.model(), NOTHING_HIDDEN));
  readonly goalChecks = computed(() => (this.exp.active()?.goal ? goalParts(this.model()) : []));
  readonly goalStatus = computed(() => {
    const goal = this.exp.active()?.goal;
    if (!goal) return '';
    if (this.exp.phase() === 'revealed')
      return this.exp.kept() && goalMet(goal, this.model().metrics, this.settings()) ? 'Goal met:' : 'You met it; now:';
    return this.exp.kept() ? '' : 'The goal keeps bloom filters off.';
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

  /** Whether `engine`'s Play is now its Stop: during a free play of it. */
  stopping(engine: Engine): boolean {
    return this.playing() && this.play() === engine && !this.exp.locked();
  }
  playName(engine: Engine): string {
    const what = `the ${opWord(this.settings())} through the ${ENGINE[engine]}`;
    if (this.locked()) return `Play ${what}, after your answer`;
    return `${this.stopping(engine) ? 'Stop' : 'Play'} ${what}`;
  }
  hitStyle(h: Hit) {
    return { left: `${h.x}px`, top: `${h.y}px`, width: `${h.w}px`, height: `${h.h}px` };
  }

  set(name: keyof StorageSettings, value: number) {
    if (this.locked() || this.settings()[name] === value) return;
    const was = this.settings();
    this.settle();
    this.settings.set({ ...was, [name]: value });
    this.ghost.set(was);
    this.caption.set('');
    this.told.set(null);
    this.notice.set(settingSentence(this.model(), this.hid()));
  }

  togglePlay(engine: Engine) {
    if (this.locked()) return;
    if (this.stopping(engine)) return this.player.stop();
    this.exp.clearFocus();
    if (!this.motion() || !this.ready()) {
      const said = story(engine, this.model());
      this.caption.set(said);
      this.told.set(engine);
      this.notice.set(said);
      // The story is written under the stage, and brought into view only when it is off screen.
      afterNextRender(
        { read: () => this.host.querySelector('.caption')?.scrollIntoView({ block: 'nearest' }) },
        { injector: this.injector },
      );
      return;
    }
    this.caption.set('');
    this.told.set(null);
    this.run(engine, () => this.notice.set(story(engine, this.model())));
  }

  start(e: SdExperiment) {
    this.player.stop(false);
    this.describe.set(false);
    this.exp.start(e);
    this.notice.set(e.goal ? settingSentence(this.model(), this.hid()) : WAIT_NOTICE);
  }

  toggleDescribe() {
    this.describe.update((d) => !d);
  }

  /** Ends a running play: the stage draws the rest state at once. */
  private settle() {
    this.player.stop();
    this.exp.clearFocus();
    this.play.set(null);
  }

  /** A card's setup, or an answer's act: a new start, with no ghost of what came before. */
  private applySettings(s: Readonly<Record<string, number>>) {
    this.settle();
    this.describe.set(false);
    this.caption.set('');
    this.told.set(null);
    this.ghost.set(null);
    this.settings.update((was) => ({ ...was, ...s }));
  }

  /** An answer plays its act's engine; in the one-column layout that engine's panel comes into view first. */
  private playAnswer(e: SdExperiment, done: () => void) {
    const engine: Engine = e.act && 'run' in e.act && e.act.run === 'lsm' ? 'lsm' : 'btree';
    afterNextRender({ read: () => this.bringPanelIntoView(engine) }, { injector: this.injector });
    this.notice.set(answerNotice(engine));
    this.run(
      engine,
      () => undefined,
      () => {
        done();
        if (this.exp.active() !== e || this.exp.phase() !== 'revealed') return;
        this.notice.set(settingSentence(this.model(), this.hid()));
        if (this.motion()) afterNextRender({ write: () => this.land() }, { injector: this.injector });
      },
    );
  }

  private bringPanelIntoView(engine: Engine) {
    if (this.stage().meta.panels.two) return;
    const play = this.host.querySelector<HTMLElement>(`.play[data-engine="${engine}"]`);
    if (!play) return;
    const header = play.closest('ion-content')?.previousElementSibling?.getBoundingClientRect().bottom ?? 0;
    const box = play.getBoundingClientRect();
    if (box.top >= header && box.top <= window.innerHeight / 2) return;
    play.style.scrollMarginTop = `${header + 8}px`;
    play.scrollIntoView({ block: 'start', behavior: motionScroll() });
  }

  /** Runs `engine`'s play on one clock: `ended` only when it plays to its end, `done` however it stops. */
  private run(engine: Engine, ended: () => void, done: () => void = () => undefined) {
    if (!this.motion() || !this.ready()) {
      ended();
      done();
      return;
    }
    // The play this one replaces finishes first, so its `done`, which clears `play`, cannot clear this one's.
    this.player.stop();
    this.clock.set(0);
    this.play.set(engine);
    this.player.play(
      planOf(engine, this.model()).seconds * 1000,
      (p) => this.clock.set(p),
      () => {
        this.play.set(null);
        done();
      },
      ended,
    );
  }

  /** At the reveal the values settle. */
  private land() {
    for (const el of this.host.querySelectorAll<SVGElement>(
      'svg.draw :is([data-id="write-btree"], [data-id="write-lsm"], [data-id^="reads-"], [data-id$="-total"], [data-id$="-ledger"])',
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
