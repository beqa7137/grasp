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
  type WritableSignal,
} from '@angular/core';
import { IonContent } from '@ionic/angular';
import {
  SHARD_BASELINE,
  SHARD_HOT_PCT,
  SHARD_NAMES,
  SHARD_NODE_COUNTS,
  SHARD_POINTS,
  SHARD_SALTS,
  goalMet,
  renderExperiment,
  shardBusiest,
  shardNum,
  shardPlayMs,
  shardScenario,
  type ExperimentSpec,
  type SdExperiment,
  type ShardSettings,
} from '@grasp/engine';
import { motionAllowed, motionScroll } from '../../core/motion';
import { CODE_TEXT_KEEP, CodeTextComponent } from '../../viz/code-text.component';
import { DataTableComponent } from '../../viz/kit/data-table.component';
import { watchMotion, watchVisibility } from '../../viz/kit/particles';
import { StageComponent } from '../../viz/kit/stage.component';
import { ExperimentDockComponent } from './experiment-dock.component';
import { ExperimentSession } from './experiment-session';
import { FocusBoxComponent } from './focus-box.component';
import { buildStage, playMarks, replayOf, type RingView } from './ring-layout';
import { RingPrimsComponent } from './ring-prims.component';
import { scrollKeeping } from './scroll-keeping';
import { proseLines } from './stage-text';
import {
  DESCRIBE_WIDE_FROM,
  NOTHING_HIDDEN,
  NOTICE,
  SHARDING_KEEP,
  SIMPLIFIED,
  describeSaid,
  describeTable,
  downCaption,
  goalChecks,
  goalMini,
  hiding,
  story,
  summary,
  swapStory,
  type QuestionPhase,
} from './ring-words';
import { WidgetPlay } from './widget-play';

const STAGE_EVERY_MS = 50;
/** The table box shows its head and this many rows, so a row is always cut through and the box reads as one that scrolls. */
const TABLE_ROWS = 6.5;
type SettingName = keyof ShardSettings;
const SETTING_NAMES: readonly SettingName[] = ['scheme', 'points', 'nodes', 'hot', 'split', 'down'];

/**
 * Sharding (REDESIGN.md 5.2, R41): 200 keys placed on nodes by a consistent-hash ring or by hash mod N, drawn as dots
 * on the ring at their hashes and as piles on the nodes that hold them, with the last change of the node set, a closer
 * look at one key's rule, and a hot key that no hash can spread. Every count comes from the engine's `shardScenario`.
 * A change of the node set plays its keys moving on one clock; experiment cards set the widget up, ask, play the
 * answer with its numbers hidden, and reveal them.
 */
@Component({
  selector: 'app-ring-widget',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [StageComponent, DataTableComponent, FocusBoxComponent, ExperimentDockComponent, RingPrimsComponent, CodeTextComponent],
  providers: [{ provide: CODE_TEXT_KEEP, useValue: SHARDING_KEEP }],
  templateUrl: './ring-widget.component.html',
  styleUrl: './ring-widget.component.scss',
})
export class RingWidgetComponent {
  readonly experimentSpecs = input<readonly ExperimentSpec[]>([], { alias: 'experiments' });
  readonly experiments = computed(() => this.experimentSpecs().map(renderExperiment));
  readonly pointStops = SHARD_POINTS;
  readonly nodeStops = SHARD_NODE_COUNTS.map((n) => ({
    n,
    range: `${SHARD_NAMES[0]}–${SHARD_NAMES[n - 1]}`,
    said: `${SHARD_NAMES[0]} to ${SHARD_NAMES[n - 1]}`,
  }));
  readonly hotPct = `${SHARD_HOT_PCT}%`;
  readonly salts = shardNum(SHARD_SALTS);
  /** The simplifications' box: its width and font size, once laid out. */
  readonly simplifyBox = signal<{ width: number; size: number } | null>(null);
  readonly simplified = computed(() => {
    const box = this.simplifyBox();
    return box ? proseLines(SIMPLIFIED, box.size, box.width, [SHARDING_KEEP]) : [SIMPLIFIED];
  });

  private readonly values: Record<SettingName, WritableSignal<number>> = {
    scheme: signal(SHARD_BASELINE.scheme),
    points: signal(SHARD_BASELINE.points),
    nodes: signal(SHARD_BASELINE.nodes),
    hot: signal(SHARD_BASELINE.hot),
    split: signal(SHARD_BASELINE.split),
    down: signal(SHARD_BASELINE.down),
  };
  /**
   * The node set before the last change of it, and whether that change was a down node coming back; null for a new
   * start. With a node down the change is the failure.
   */
  private readonly from = signal<{ nodes: readonly string[]; back: boolean } | null>(null);
  readonly settings = computed((): ShardSettings => {
    const v = this.values;
    return { scheme: v.scheme(), points: v.points(), nodes: v.nodes(), hot: v.hot(), split: v.hot() ? v.split() : 0, down: v.down() };
  });
  readonly model = computed(() => shardScenario(this.settings(), this.from()?.nodes ?? null, this.from()?.back));
  readonly mod = computed(() => this.settings().scheme === 1);

  readonly motion = signal(false);
  readonly describe = signal(false);
  readonly notice = signal(NOTICE.rest);
  /** A play's clock from 0 to 1, and the points before a change of points that plays once; null at rest. */
  readonly frac = signal<number | null>(null);
  /** The clock on every frame: the stage follows `frac` a few times a second, the keys in flight every frame. */
  private readonly playFrac = signal<number | null>(null);
  private readonly replace = signal<number | null>(null);
  /** The piles that gained keys, ringed for a moment when a play lands. */
  private readonly landing = signal<readonly string[]>([]);
  private readonly tableRow = signal<{ head: number; row: number } | null>(null);

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly injector = inject(Injector);
  private readonly content = inject(IonContent, { optional: true });
  readonly stageRef = viewChild.required(StageComponent);
  private readonly simplifyEl = viewChild.required<ElementRef<HTMLElement>>('simplify');
  private readonly stageEl = viewChild.required(StageComponent, { read: ElementRef });
  readonly ready = computed(() => this.stageRef().width() > 0);
  private readonly player = new WidgetPlay(() => this.motion() && this.ready());
  readonly playing = this.player.playing;
  private landTimer: ReturnType<typeof setTimeout> | null = null;
  /**
   * The widget was last used from the keyboard, so the control in focus shows its ring. WebKit does not report
   * `:focus-visible` once an arrow key has moved a radio group's focus.
   */
  private keyed = false;

  readonly exp: ExperimentSession = new ExperimentSession({
    apply: (s) => this.applySettings(s),
    settings: () => ({ ...this.model().settings }),
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
  /** A question is open and unanswered: Replay and the settings wait, as they do while its answer plays. */
  readonly asking = computed(() => !!this.question() && this.exp.phase() === 'asking');
  readonly locked = computed(() => this.exp.locked() || this.asking());
  readonly askingAny = computed(() => !!this.exp.active() && this.exp.phase() === 'asking');
  readonly phase = computed((): QuestionPhase => (this.question() ? this.exp.phase() : 'rest'));
  readonly hid = computed(() => {
    const e = this.question();
    return e ? hiding(e.hide, this.phase()) : NOTHING_HIDDEN;
  });
  private readonly setup = computed(() => {
    const e = this.question();
    return e ? shardScenario({ ...SHARD_BASELINE, ...e.setup }) : null;
  });
  readonly met = computed(() => {
    const goal = this.exp.active()?.goal;
    return !!goal && goalMet(goal, this.model().metrics, { ...this.model().settings });
  });
  readonly view = computed((): RingView => ({
    hid: this.hid(),
    phase: this.exp.active()?.goal ? 'challenge' : this.phase(),
    frac: this.frac(),
    replace: this.replace(),
    met: this.met(),
    focus: this.exp.focusOn(),
    setup: this.setup(),
    landing: this.landing(),
    flightsApart: true,
  }));

  readonly width = computed(() => Math.max(248, this.stageRef().width()));
  readonly stage = computed(() => buildStage(this.width(), this.model(), this.view()));
  readonly under = computed(() => this.stage().D.prims(['back', 'grid', 'links']));
  readonly over = computed(() => this.stage().D.prims(['marks', 'dots', 'text', 'top']));
  readonly moving = computed(() => {
    const f = this.playFrac();
    return f === null || this.frac() === null ? [] : playMarks(this.stage(), f);
  });
  /** Where the piles' letters sit in the stage: on a phone an answer's play brings them to the foot of the view. */
  readonly lettersY = computed(() => this.stage().meta.pile.by + 26);

  private readonly hasChange = computed(() => !!this.model().change && !this.hid().ghost);
  readonly replayName = computed(() =>
    this.locked()
      ? 'Replay the last change, after your answer'
      : this.playing()
        ? 'Stop the replay'
        : this.hasChange()
          ? 'Replay the last change'
          : 'Replay the last change: none yet',
  );
  readonly replayOff = computed(() => this.locked() || (!this.hasChange() && !this.playing()));
  readonly caption = computed(() => {
    const sc = this.model();
    return downCaption(sc, this.locked(), sc.downNode ?? shardBusiest(sc.up, sc.settings.hot, sc.settings.split));
  });

  readonly describeWaits = computed(() => this.askingAny() || this.hid().any);
  readonly describeWaitsWhy = computed(() =>
    this.exp.active()?.goal ? 'Describe waits until you meet the goal.' : 'Describe waits for your answer.',
  );
  readonly compact = computed(() => this.width() < DESCRIBE_WIDE_FROM);
  readonly describeTable = computed(() => describeTable(this.model(), this.compact()));
  readonly describeSaid = computed(() => describeSaid(this.model()));
  readonly tableHeight = computed(() => {
    const m = this.tableRow();
    return m ? Math.round(m.head + TABLE_ROWS * m.row) : null;
  });
  readonly goalChecks = computed(() => (this.exp.active()?.goal ? goalChecks(this.model()) : []));
  readonly goalMini = computed(() => (this.exp.active()?.goal ? goalMini(this.model()) : ''));
  readonly goalStatus = computed(() => {
    const goal = this.exp.active()?.goal;
    if (!goal) return '';
    if (this.exp.phase() === 'revealed') return this.exp.kept() && this.met() ? 'Goal met:' : 'You met it; now:';
    return this.exp.kept() ? '' : 'The goal keeps the hot key and the node down.';
  });

  constructor() {
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      const stopMotion = watchMotion(motionAllowed, (allowed) => this.motion.set(allowed));
      // The widget host, not one stage: on a phone the stage scrolls away while the dock under it is read.
      const stopVisibility = watchVisibility(this.host, (visible) => this.player.setVisible(visible));
      // Plain listeners: with a bound one, which runs change detection on a touch, WebKit dropped the tap's click.
      const key = () => (this.keyed = true);
      const point = () => (this.keyed = false);
      this.host.addEventListener('keydown', key);
      this.host.addEventListener('pointerdown', point);
      const simplify = this.simplifyEl().nativeElement;
      // A hidden page lays the box out at no width: keep the last lines.
      const sizer = new ResizeObserver(([entry]) => {
        const width = entry.contentRect.width;
        if (width > 0) this.simplifyBox.set({ width, size: parseFloat(getComputedStyle(simplify).fontSize) });
      });
      sizer.observe(simplify);
      destroyRef.onDestroy(() => {
        sizer.disconnect();
        stopMotion();
        stopVisibility();
        this.host.removeEventListener('keydown', key);
        this.host.removeEventListener('pointerdown', point);
        this.player.stop(false);
        if (this.landTimer) clearTimeout(this.landTimer);
      });
    });
  }

  value(name: SettingName): number {
    return this.values[name]();
  }

  setScheme(v: number) {
    if (this.locked() || v === this.value('scheme')) return;
    this.change(() => {
      this.values.scheme.set(v);
      this.from.set(null);
    });
  }

  setPoints(v: number) {
    if (this.locked() || this.mod() || v === this.value('points')) return;
    const was = this.value('points');
    this.change(() => {
      this.values.points.set(v);
      this.from.set(null);
    });
    this.playReplace(was);
  }

  setNodes(n: number) {
    if (this.locked() || n === this.value('nodes')) return;
    const was = this.model().now.members;
    this.change(() => {
      this.values.nodes.set(n);
      this.from.set({ nodes: was, back: false });
    }, true);
    this.playChange();
  }

  setHot(on: boolean) {
    if (this.locked()) return;
    this.changeTraffic(() => this.values.hot.set(on ? 1 : 0));
  }

  setSplit(on: boolean) {
    if (this.locked() || !this.value('hot')) return;
    this.changeTraffic(() => this.values.split.set(on ? 1 : 0));
  }

  setDown(on: boolean) {
    if (this.locked()) return;
    const was = this.model().now.members;
    this.change(() => {
      this.values.down.set(on ? 1 : 0);
      // A node that comes back is a change of the node set, from the nodes that were left.
      this.from.set(on ? null : { nodes: was, back: true });
    }, true);
    this.playChange();
  }

  /** Replay plays the last change again; during a free play it stops it. */
  toggleReplay() {
    if (this.locked()) return;
    if (this.playing()) return this.settle();
    this.followPlay();
    this.playChange();
  }

  start(e: SdExperiment) {
    this.player.stop(false);
    this.describe.set(false);
    this.exp.start(e);
    this.notice.set(e.goal ? summary(this.model()) : NOTICE.asking);
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

  /**
   * A learner's change: a play ends, the setting changes, the piles come into view, and the notice says the new picture
   * in a sentence, the change's story when the node set changed and the setting's summary after any other change.
   */
  private change(apply: () => void, nodeSet = false) {
    this.settle();
    apply();
    this.followPlay();
    const sc = this.model();
    this.notice.set(nodeSet && sc.change ? story(sc) : summary(sc));
  }

  /**
   * A change of the hot key or its split. With the busiest node down it can make another node the busiest, and so the
   * one down: that is a new failure, which plays and says why the failed node changed.
   */
  private changeTraffic(apply: () => void) {
    const was = this.model().downNode;
    this.change(apply);
    const sc = this.model();
    if (!was || !sc.downNode || sc.downNode === was) return;
    const said = swapStory(sc, was);
    this.notice.set(said);
    this.playChange(said);
  }

  /** Ends a running play: the stage draws the rest state at once. */
  private settle() {
    this.player.stop();
    this.exp.clearFocus();
    this.frac.set(null);
    this.playFrac.set(null);
    this.replace.set(null);
    this.landing.set([]);
  }

  /** A card's setup, or an answer's act. A setup is a new start; an act's change of nodes or points is what it plays. */
  private applySettings(s: Readonly<Record<string, number>>) {
    const act = this.exp.phase() === 'playing';
    const was = this.model();
    this.settle();
    this.describe.set(false);
    if (!act) this.from.set(null);
    for (const name of SETTING_NAMES) {
      const v = s[name];
      if (v === undefined) continue;
      if (act && name === 'nodes' && v !== this.value('nodes')) this.from.set({ nodes: was.now.members, back: false });
      if (act && name === 'points' && v !== this.value('points')) this.replace.set(this.value('points'));
      this.values[name].set(v);
    }
  }

  /**
   * A change of the node set plays its keys moving, ending on `said` (the change's story); without motion the end state
   * is drawn at once.
   */
  private playChange(said?: string) {
    const c = this.model().change;
    if (!c?.moved || !this.motion() || !this.ready()) return;
    this.notice.set(NOTICE.moving);
    this.run(c.moved, () => {
      this.notice.set(said ?? story(this.model()));
      this.land(c.into);
    });
  }

  /** A change of points places the keys afresh and plays once: each key whose owner differs flies to its new pile. */
  private playReplace(was: number) {
    if (!this.motion() || !this.ready() || this.mod()) return;
    const moved = replayOf(this.model(), was)?.moved ?? 0;
    if (!moved) return;
    this.replace.set(was);
    this.notice.set(NOTICE.moving);
    this.run(moved, () => this.notice.set(summary(this.model())));
  }

  /** An answer plays its act with the numbers hidden, then reveals; without motion it reveals at once. */
  private playAnswer(e: SdExperiment, done: () => void) {
    this.notice.set(NOTICE.playing);
    const sc = this.model();
    const was = this.replace();
    const moved = sc.change?.moved ?? (was !== null ? (replayOf(sc, was)?.moved ?? 0) : 0);
    const reveal = () => {
      done();
      if (this.exp.active() !== e || this.exp.phase() !== 'revealed') return;
      const now = this.model();
      this.notice.set(now.change ? story(now) : summary(now));
      if (now.change && this.motion()) this.land(now.change.into);
    };
    if (!this.motion() || !this.ready() || !moved) {
      this.replace.set(null);
      return reveal();
    }
    this.followPlay();
    this.run(moved, () => undefined, reveal);
  }

  /** Runs a play on one clock: every frame draws each key where the clock has it. */
  private run(moved: number, ended: () => void, done: () => void = () => undefined) {
    this.landing.set([]);
    this.frac.set(0);
    this.playFrac.set(0);
    const length = shardPlayMs(moved);
    let drawn = 0;
    this.player.play(
      length,
      (p) => {
        this.playFrac.set(p);
        // Rebuilding the whole stage is the costly part of a frame, so it follows the clock 20 times a second; the
        // keys in flight and the hand follow every frame. A mark lags its moment by at most 50 ms, never leads it.
        if (p >= 1 || (p - drawn) * length >= STAGE_EVERY_MS) {
          drawn = p;
          this.frac.set(p);
        }
      },
      () => {
        this.frac.set(null);
        this.playFrac.set(null);
        this.replace.set(null);
        done();
      },
      ended,
    );
  }

  /** The climax: the piles that gained keys get the landing ring for a moment. */
  private land(into: Readonly<Record<string, number>>) {
    this.landing.set(Object.keys(into).filter((m) => into[m] > 0));
    if (this.landTimer) clearTimeout(this.landTimer);
    this.landTimer = setTimeout(() => this.landing.set([]), 700);
  }

  /**
   * Every change from the controls, played or not and with or without motion, and every replay and answer, brings the
   * piles into view once the stage has drawn it.
   */
  private followPlay() {
    afterNextRender({ read: () => void this.bringPilesIntoView() }, { injector: this.injector });
  }

  /**
   * On the one-column layout the piles' letters are scrolled toward the foot of the view, only as far as keeps in view
   * the challenge's goal line (on a phone the one line of progress in view) and a control focused from the keyboard.
   */
  private async bringPilesIntoView() {
    const scroller = await this.content?.getScrollElement();
    const anchor = this.host.querySelector<HTMLElement>('.piles-anchor');
    if (
      !anchor ||
      this.host.querySelector('.controls')?.getBoundingClientRect().left !== this.stageEl().nativeElement.getBoundingClientRect().left
    )
      return;
    const bar = document.querySelector('ion-tab-bar')?.getBoundingClientRect();
    const foot = bar?.height ? bar.top : window.innerHeight;
    const head = this.host.closest('.ion-page')?.querySelector('ion-header')?.getBoundingClientRect().bottom ?? 0;
    const box = anchor.getBoundingClientRect();
    if (box.bottom <= foot && box.bottom >= foot - 120) return;
    const active = document.activeElement;
    const focused = this.keyed && active && this.host.contains(active) ? (active.closest('label') ?? active) : null;
    const keep = [this.host.querySelector('.goal-mini'), focused].flatMap((el) => (el ? [el.getBoundingClientRect()] : []));
    const by = scrollKeeping(box.bottom - foot + 8, { top: head + 4, bottom: foot - 4 }, keep);
    if (Math.abs(by) < 1) return;
    // WebKit drops a smooth scrollIntoView begun while a tapped label is focusing its radio; scrolling the content by
    // hand survives it.
    if (scroller) {
      scroller.scrollBy({ top: by, behavior: motionScroll() });
      return;
    }
    anchor.style.scrollMarginBottom = `${window.innerHeight - box.bottom + by}px`;
    anchor.scrollIntoView({ block: 'end', behavior: motionScroll() });
  }
}
