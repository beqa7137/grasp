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
  ID_BASELINE,
  ID_COUNT_EXP,
  ID_FIELD_MAX,
  ID_ORDER_PAIR,
  ID_WINDOW_US,
  countName,
  formatInt,
  idGoalParts,
  idLayout,
  idMetrics,
  idMint,
  goalMet,
  renderExperiment,
  type ExperimentSpec,
  type IdSettings,
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
import type { Hit, SlotGroup } from './ids-draw';
import { SLOT_STACK, SLOT_WIDE, buildStage } from './ids-layout';
import { laneX, padOf } from './ids-lanes';
import { LAYOUT_PLAY_SECONDS, MINT_SECONDS, momentOf } from './ids-motion';
import { IdsPrimsComponent } from './ids-prims.component';
import {
  ANSWER_NOTICE,
  IDS_KEEP,
  NOTHING_HIDDEN,
  PLAYING_NOTICE,
  REST_NOTICE,
  STOPPED_NOTICE,
  anyHidden,
  askNotice,
  changeSentence,
  describeTable,
  hiding,
  layoutWords,
  mintWords,
  randomWords,
  summary,
  type QuestionPhase,
} from './ids-words';
import { WidgetPlay } from './widget-play';

const KEYS = ['gen', 'seq', 'tick', 'epoch', 'load', 'fault', 'guard', 'bits', 'count'] as const;
const actOf = (e: SdExperiment): IdSettings =>
  ({ ...ID_BASELINE, ...e.setup, ...(e.act && 'set' in e.act ? e.act.set : {}) }) as IdSettings;
const same = (a: IdSettings, b: IdSettings) => KEYS.every((k) => a[k] === b[k]);
/** The settings the mint reads: a change to the random ids alone reuses it. */
const MINT_KEYS = ['gen', 'seq', 'tick', 'epoch', 'load', 'fault', 'guard'] as const;
const isMint = (e: SdExperiment) => !!e.act && 'run' in e.act && e.act.run === 'mint';

/**
 * Unique IDs (REDESIGN.md 5.2, R42): an id made bit by bit. One id's 64 bits as fields with the clock's reading
 * converted into its timestamp; what each field buys, with the lifetime on a ruler a step a bit; three generators minting
 * on their own clocks over 8 ms; every id in id order against the moment it was made; and random ids by the birthday
 * bound beside them. Every number is the engine's `idLayout`, `idMint` and `birthdayChance`. Experiment cards set the
 * widget up, ask, play the answer and reveal, hiding until then what would give it away.
 */
@Component({
  selector: 'app-ids-widget',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [StageComponent, DataTableComponent, FocusBoxComponent, ExperimentDockComponent, IdsPrimsComponent, CodeTextComponent],
  providers: [{ provide: CODE_TEXT_KEEP, useValue: IDS_KEEP }],
  templateUrl: './ids-widget.component.html',
  styleUrl: './ids-widget.component.scss',
})
export class IdsWidgetComponent {
  readonly experimentSpecs = input<readonly ExperimentSpec[]>([], { alias: 'experiments' });
  readonly experiments = computed(() => this.experimentSpecs().map(renderExperiment));
  readonly fieldMax = ID_FIELD_MAX;
  readonly countMin = ID_COUNT_EXP.min;
  readonly countMax = ID_COUNT_EXP.max;
  readonly steppers = [
    { name: 'gen', label: 'Generator bits', one: 'generator bit' },
    { name: 'seq', label: 'Sequence bits', one: 'sequence bit' },
  ] as const;
  readonly ticks = [
    { value: 1, label: '1 ms' },
    { value: 10, label: '10 ms' },
  ];
  readonly epochs = [
    { value: 0, label: '2026' },
    { value: 1, label: '1970' },
  ];
  readonly loads = [
    { value: 0, label: 'A trickle' },
    { value: 1, label: '5,000 at once' },
  ];
  readonly faults = [
    { value: 0, label: 'Nothing' },
    { value: 1, label: "G2's clock ahead" },
    { value: 2, label: "G1's clock steps back" },
    { value: 3, label: 'G2 given number 1' },
  ];
  readonly randomBits = [
    { value: 64, label: '64 random bits' },
    { value: 122, label: '122 (UUIDv4)' },
  ];

  readonly settings = signal<IdSettings>({ ...ID_BASELINE });
  private readonly mintSettings = computed(() => this.settings(), { equal: (a, b) => MINT_KEYS.every((k) => a[k] === b[k]) });
  private readonly mint = computed(() => idMint(this.mintSettings()));
  readonly model = computed(() => ({ ...this.mint(), settings: this.settings() }));
  readonly layout = computed(() => idLayout(this.settings()));

  readonly motion = signal(false);
  readonly describe = signal(false);
  readonly notice = signal(REST_NOTICE);
  /** Under Reduced motion, the mint's sentence under the stage after Play. */
  readonly caption = signal('');
  private readonly ghost = signal<IdSettings | null>(null);
  private readonly inspect = signal<string | null>(null);
  /** The mint's play clock in µs, read every frame by the now line alone; null at rest. */
  readonly clock = signal<number | null>(null);
  /** A play's kind: the mint, or the short hold of an answer that changes only the layout. */
  private readonly playKind = signal<'mint' | 'layout' | null>(null);

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
    metrics: () => idMetrics(this.settings()),
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
  /** E1's answer and reveal draw the setup's lifetime as the ghost; else the learner's last layout. */
  private readonly ghostShown = computed(() => {
    const e = this.question();
    if (e && e.act && 'set' in e.act && !isMint(e) && e.focus.includes('ledgerTime') && same(actOf(e), this.settings()))
      return this.exp.phase() === 'asking' ? null : ({ ...ID_BASELINE, ...e.setup } as IdSettings);
    return this.ghost();
  });
  private readonly pair = computed(() => {
    const e = this.question();
    if (!e || e.id !== 'order' || this.exp.phase() !== 'revealed') return null;
    const m = this.model();
    const g1 = m.lanes[1].ids.find((x) => x.issued === ID_ORDER_PAIR.g1At);
    const g2 = m.lanes[2].ids.find((x) => x.issued === ID_ORDER_PAIR.g2At);
    return g1 && g2 ? [g1.key, g2.key] : null;
  });

  readonly width = computed(() => Math.max(260, this.stageRef().width()));
  /** The mint at its last event: the stage redraws only when an id is made. */
  private readonly moment = computed(() => {
    const t = this.clock();
    return t === null || this.playKind() !== 'mint' ? null : momentOf(this.model(), t);
  });
  readonly stage = computed(() =>
    buildStage(this.width(), this.model(), {
      hid: this.hid(),
      t: this.moment(),
      inspect: this.inspect(),
      ghost: this.ghostShown(),
      focus: this.exp.active()?.focus ?? [],
      pair: this.pair(),
      challenge: !!this.exp.active()?.goal,
    }),
  );
  readonly under = computed(() => this.stage().D.prims(['back', 'grid', 'links']));
  readonly over = computed(() => this.stage().D.prims(['clip', 'marks', 'dots', 'text', 'top']));
  /** The now line's x while the mint plays, and the lanes' extent. */
  readonly now = computed(() => {
    const t = this.clock();
    if (t === null || this.playKind() !== 'mint') return null;
    const lanes = this.stage().D.regions;
    const top = lanes['laneG0']?.[0];
    const bottom = lanes['laneG2']?.[0];
    if (!top || !bottom) return null;
    const { X } = laneX(this.width());
    return { x: Math.round(X(t) * 10) / 10, y1: top.y, y2: bottom.y + bottom.h };
  });
  readonly composing = computed(() => this.playKind() === 'mint' && this.motion());

  hitsOf<K extends Hit['kind']>(kind: K) {
    return this.stage().hits.filter((h): h is Extract<Hit, { kind: K }> => h.kind === kind);
  }
  slot(group: SlotGroup) {
    return this.hitsOf('slot').find((h) => h.group === group)!;
  }
  readonly wideSlots = computed(() => this.width() - 2 * padOf(this.width()) >= SLOT_WIDE);
  readonly stackSlots = computed(() => this.width() - 2 * padOf(this.width()) < SLOT_STACK);

  /** The ids Older and Newer step through: those made and shown, in made order. */
  readonly navIndex = computed(() => {
    const st = this.stage();
    return { list: st.made, at: st.shown ? st.made.findIndex((x) => x.key === st.shown!.key) : -1 };
  });
  navDisabled(dir: 'older' | 'newer') {
    const { list, at } = this.navIndex();
    return this.hid().inspect || this.playing() || (dir === 'older' ? at <= 0 : at < 0 || at >= list.length - 1);
  }

  readonly countLabel = computed(() => {
    const e = this.settings().count;
    return `${countName(e)[0].toUpperCase()}${countName(e).slice(1)} ids${e % 3 === 0 ? ` (${formatInt(10 ** e)})` : ''}`;
  });
  readonly describeWaits = computed(() => (!!this.exp.active() && this.exp.phase() === 'asking') || anyHidden(this.hid()));
  readonly describeWaitsWhy = computed(() =>
    this.exp.active()?.goal ? 'Describe waits until you meet the goal.' : 'Describe waits for your answer.',
  );
  readonly describeTable = computed(() => describeTable(this.model(), this.width() + 2));
  readonly describeSaid = computed(() => summary(this.model(), NOTHING_HIDDEN));
  readonly goalChecks = computed(() => (this.exp.active()?.goal ? idGoalParts(this.settings()) : []));
  readonly goalStatus = computed(() => {
    const goal = this.exp.active()?.goal;
    if (!goal) return '';
    if (this.exp.phase() === 'revealed')
      return goalMet(goal, idMetrics(this.settings()), this.settings()) ? 'Goal met:' : 'You met it; now:';
    return '';
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

  hitStyle(h: { x: number; y: number; w: number; h: number }) {
    return { left: `${h.x}px`, top: `${h.y}px`, width: `${h.w}px`, height: `${h.h}px` };
  }
  playName(): string {
    if (this.locked()) return 'Play the mint, after your answer';
    return this.playing() && this.playKind() === 'mint' ? 'Stop the mint' : 'Play the mint: 8 ms of three generators';
  }

  set(name: keyof IdSettings, value: number) {
    if (this.locked() || this.settings()[name] === value) return;
    const was = this.settings();
    this.settle();
    this.settings.set({ ...was, [name]: value });
    if (name === 'gen' || name === 'seq' || name === 'tick' || name === 'epoch') this.ghost.set(was);
    this.inspect.set(null);
    this.caption.set('');
    this.notice.set(
      this.challengeMet() ? `Goal met. ${changeSentence(name, this.settings())}` : changeSentence(name, this.settings(), this.hid()),
    );
  }
  step(name: 'gen' | 'seq', by: number) {
    const v = this.settings()[name] + by;
    if (v >= 0 && v <= ID_FIELD_MAX) this.set(name, v);
  }
  private challengeMet() {
    const goal = this.exp.active()?.goal;
    return !!goal && goalMet(goal, idMetrics(this.settings()), this.settings());
  }

  nav(dir: 'older' | 'newer') {
    if (this.navDisabled(dir)) return;
    const { list, at } = this.navIndex();
    const x = list[at + (dir === 'older' ? -1 : 1)];
    this.inspect.set(x.key);
    this.notice.set(`${dir === 'older' ? 'Older' : 'Newer'} id: G${x.lane}'s, sequence ${formatInt(x.seq)}.`);
  }

  togglePlay() {
    if (this.locked()) return;
    if (this.playing() && this.playKind() === 'mint') {
      this.player.stop();
      this.notice.set(`${STOPPED_NOTICE} ${mintWords(this.model(), this.hid())}`);
      return;
    }
    this.exp.clearFocus();
    this.inspect.set(null);
    if (!this.motion() || !this.ready()) {
      const said = `Reduced motion: the mint is drawn at its end. ${mintWords(this.model(), this.hid())}`;
      this.caption.set(said);
      this.notice.set(said);
      return;
    }
    this.caption.set('');
    this.notice.set(PLAYING_NOTICE);
    this.run('mint', () => this.notice.set(mintWords(this.model(), this.hid())));
  }

  start(e: SdExperiment) {
    this.player.stop(false);
    this.describe.set(false);
    this.exp.start(e);
    this.notice.set(e.goal ? changeSentence('gen', this.settings()) : askNotice(e.title, this.hid()));
  }

  toggleDescribe() {
    this.describe.update((d) => !d);
  }

  private settle() {
    this.player.stop();
    this.exp.clearFocus();
    this.clock.set(null);
    this.playKind.set(null);
  }

  /** A card's setup, or an answer's act: a new start, with no ghost of what came before. */
  private applySettings(s: Readonly<Record<string, number>>) {
    this.settle();
    this.describe.set(false);
    this.caption.set('');
    this.ghost.set(null);
    this.inspect.set(null);
    this.settings.update((was) => ({ ...was, ...s }));
  }

  /** An answer plays its act: the mint, a short hold for a layout change, or, for the random ids, the reveal at once. */
  private playAnswer(e: SdExperiment, done: () => void) {
    const reveal = () => {
      done();
      if (this.exp.active() !== e || this.exp.phase() !== 'revealed') return;
      this.notice.set(
        e.hide.includes('chance')
          ? randomWords(this.settings(), NOTHING_HIDDEN)
          : isMint(e)
            ? mintWords(this.model(), NOTHING_HIDDEN)
            : layoutWords(this.settings(), NOTHING_HIDDEN),
      );
      if (this.motion()) afterNextRender({ write: () => this.land() }, { injector: this.injector });
    };
    if (e.hide.includes('chance')) return reveal();
    this.notice.set(ANSWER_NOTICE);
    if (isMint(e))
      afterNextRender({ read: () => this.bringIntoView(e.focus[0] === 'sorted' ? 'laneG2' : e.focus[0]) }, { injector: this.injector });
    else afterNextRender({ read: () => this.bringIntoView('ledgerTime') }, { injector: this.injector });
    this.run(isMint(e) ? 'mint' : 'layout', () => undefined, reveal);
  }

  /** In the one-column layout, the band an answer plays on comes into view first. */
  private bringIntoView(region: string) {
    const box = this.stage().D.regions[region]?.[0];
    const stage = this.stageEl().nativeElement as HTMLElement;
    if (!box) return;
    const header = stage.closest('ion-content')?.previousElementSibling?.getBoundingClientRect().bottom ?? 0;
    const top = stage.getBoundingClientRect().top + box.y;
    if (top >= header && top + box.h <= window.innerHeight) return;
    const scroller = stage.closest('ion-content')?.shadowRoot?.querySelector('.inner-scroll') ?? document.scrollingElement;
    scroller?.scrollBy({ top: top - header - 8, behavior: motionScroll() });
  }

  /** At a reveal the marker the answer was about lands. */
  private land() {
    for (const el of this.host.querySelectorAll<SVGElement>('svg.draw :is(.life-marker, .chance-marker, .ghost-arc)'))
      el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 400, easing: 'ease-out' });
  }

  private run(kind: 'mint' | 'layout', ended: () => void, done: () => void = () => undefined) {
    if (!this.motion() || !this.ready()) {
      ended();
      done();
      return;
    }
    this.player.stop();
    this.playKind.set(kind);
    this.clock.set(0);
    this.player.play(
      (kind === 'mint' ? MINT_SECONDS : LAYOUT_PLAY_SECONDS) * 1000,
      (p) => this.clock.set(p * ID_WINDOW_US),
      () => {
        this.clock.set(null);
        this.playKind.set(null);
        done();
      },
      ended,
    );
  }
}
