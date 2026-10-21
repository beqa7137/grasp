import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  type Type,
  ElementRef,
  afterRenderEffect,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { NgComponentOutlet } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { IonButtons, IonContent, IonHeader, IonIcon, IonTitle, IonToolbar, PopoverController } from '@ionic/angular';
import {
  CODING_CATALOG,
  InputError,
  PAYOFF_SPEED,
  codeSpans,
  diffFrames,
  formatField,
  getAlgorithm,
  getPatternSummary,
  lensComparison,
  nextVisualizer,
  pace,
  parseField,
  traceKeys,
  type AlgorithmDef,
  type Frame,
} from '@grasp/engine';
import { addIcons } from 'ionicons';
import {
  checkmarkCircle,
  closeCircle,
  diceOutline,
  documentTextOutline,
  helpCircleOutline,
  informationCircleOutline,
  sparkles,
} from 'ionicons/icons';
import { AnnouncerService } from '../../core/announcer.service';
import { refocus, type FocusPlaces } from '../../core/focus';
import { haptic } from '../../core/haptics';
import { motionAllowed } from '../../core/motion';
import { uniqueId } from '../../core/unique-id';
import { onPageKey } from '../../core/on-page-key';
import { ProgressService } from '../../core/progress.service';
import { ShortcutsService } from '../../core/shortcuts.service';
import { answerMark } from '../../review/answer-mark';
import { ArrayViewComponent, longestValue, pointerRowsOf, type AlignedRow } from '../../viz/array-view.component';
import { CodePanelComponent } from '../../viz/code-panel.component';
import { CodeTextComponent } from '../../viz/code-text.component';
import { GraphViewComponent } from '../../viz/graph-view.component';
import { GridViewComponent } from '../../viz/grid-view.component';
import { ListViewComponent } from '../../viz/list-view.component';
import { TableViewComponent } from '../../viz/table-view.component';
import { MotionService, type StageStep } from '../../viz/kit/motion.service';
import { TransportComponent, type Band, type Speed, type Tick } from '../../viz/kit/transport.component';
import { WatchComponent } from '../../viz/kit/watch.component';
import { TreeViewComponent, sideRoomFor } from '../../viz/tree-view.component';
import { PlayerIntroComponent, type PlayerIntroChoice } from './player-intro.component';
import { BackComponent } from '../../ui/back.component';

type PredictState = { frame: number; choice: number | null };

/** A jump of more than one step crossfades the stage this long (REDESIGN.md 3.5). */
const CROSSFADE_MS = 160;

function alignedRow(f: Frame | undefined): AlignedRow | null {
  // Structural views carry their own layout; an output list that happens to match the array's length is not per-index there.
  if (!f?.output || !f.array || f.tree || f.graph || f.table || f.output.items.length !== f.array.values.length) return null;
  return { label: f.output.label, values: f.output.items };
}

/** Where the learner types text, which a checkpoint never takes focus from; a slider, a switch or a read-only field is not. */
const TYPING = [
  'input:not([readonly]):is(:not([type]), [type="text"], [type="search"], [type="number"])',
  'textarea:not([readonly])',
  'select:not([disabled])',
  '[contenteditable]:not([contenteditable="false"])',
].join(', ');

@Component({
  selector: 'app-player',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    BackComponent,
    FormsModule,
    RouterLink,
    IonHeader,
    IonToolbar,
    IonButtons,
    IonTitle,
    IonContent,
    IonIcon,
    ArrayViewComponent,
    GridViewComponent,
    TableViewComponent,
    GraphViewComponent,
    TreeViewComponent,
    CodePanelComponent,
    CodeTextComponent,
    ListViewComponent,
    TransportComponent,
    WatchComponent,
    NgComponentOutlet,
  ],
  templateUrl: './player.page.html',
  styleUrl: './player.page.scss',
  providers: [AnnouncerService, MotionService],
})
export class PlayerPage {
  readonly id = input.required<string>();
  /** An input to replay, as JSON in the `input` query parameter, from a lesson's worked example. */
  readonly inputQuery = input<string | undefined>(undefined, { alias: 'input' });
  private readonly given = computed(() => {
    const json = this.inputQuery();
    if (!json) return null;
    try {
      return JSON.parse(json) as unknown;
    } catch {
      return null;
    }
  });
  private readonly progress = inject(ProgressService);
  readonly shortcuts = inject(ShortcutsService);
  readonly announcer = inject(AnnouncerService);
  private readonly popovers = inject(PopoverController);
  private readonly router = inject(Router);
  protected readonly answerMark = answerMark;
  private readonly predictPanel = viewChild<ElementRef<HTMLElement>>('predictPanel');
  private readonly predictPrompt = viewChild<ElementRef<HTMLElement>>('predictPrompt');
  private readonly verdict = viewChild<ElementRef<HTMLElement>>('verdict');
  private readonly narration = viewChild<ElementRef<HTMLElement>>('narration');
  private readonly layout = viewChild<ElementRef<HTMLElement>>('layout');
  private readonly heading = viewChild<ElementRef<HTMLElement>>('heading');
  private readonly panelCol = viewChild<ElementRef<HTMLElement>>('panelCol');
  private readonly about = viewChild<ElementRef<HTMLElement>>('about');
  private readonly scene = viewChild<ElementRef<HTMLElement>>('scene');
  private readonly describePanel = viewChild<ElementRef<HTMLElement>>('describePanel');
  protected readonly describeId = uniqueId('player-describe');
  private readonly motion = inject(MotionService);
  private readonly transport = viewChild(TransportComponent, { read: ElementRef<HTMLElement> });

  readonly algo = computed(() => getAlgorithm(this.id()) as AlgorithmDef | undefined);
  readonly problem = computed(() => CODING_CATALOG.find((p) => p.algorithmId === this.id()));
  readonly pattern = computed(() => (this.algo() ? getPatternSummary(this.algo()!.patternId) : undefined));
  /** The end card's next step after writing the problem: the next visualizer in roadmap order. */
  readonly following = computed(() => nextVisualizer(this.id()));
  /**
   * The last frame's next steps, at the top of R. The result shows there too, so the caption keeps its height and never
   * scrolls; the caption keeps the result for screen readers, as its live region reads it.
   */
  readonly endCard = computed(() => this.index() === this.last() && !this.pending() && Boolean(this.problem() || this.following()));

  /** ⋯ is open, so where region R can be short the caption keeps to two lines and R keeps room for the panel. */
  protected readonly moreOpen = signal(false);

  readonly input = signal<Record<string, unknown> | null>(null);
  readonly drafts = signal<Record<string, string>>({});
  readonly inputError = signal<string | null>(null);
  readonly editing = signal(false);

  readonly frames = computed<Frame[]>(() => {
    const algo = this.algo();
    const current = this.input();
    return algo && current ? algo.trace(current) : [];
  });
  readonly index = signal(0);
  readonly frame = computed(() => this.frames()[this.index()]);
  readonly last = computed(() => Math.max(0, this.frames().length - 1));
  /** Stable keys for the run's cells and list items, so a moved one is drawn as moving (REDESIGN.md 3.4). */
  readonly keys = computed(() => traceKeys(this.frames()));
  /**
   * The frame on the stage: the current one, or, once a checkpoint is answered, the one after it, whose step plays as the
   * payoff while the verdict shows (3.8). Continue moves on to that frame, so nothing plays twice.
   */
  readonly shownIndex = computed(() => {
    const p = this.pending();
    return p && p.choice !== null && p.frame < this.last() ? p.frame + 1 : this.index();
  });
  readonly shown = computed(() => this.frames()[this.shownIndex()]);
  readonly shownKeys = computed(() => this.keys()[this.shownIndex()]);
  /** How the next change of frame plays: a step animates, scrubbing snaps, and a jump crossfades (3.5). */
  private seekKind: 'step' | 'snap' | 'jump' = 'step';
  private steps = 0;
  private lastShown: { frames: Frame[]; at: number } | undefined;
  /**
   * The step into the frame on the stage, which its views play, or leave trails for when nothing animates (3.5). It keeps
   * the frame it came from itself: `linkedSignal` would do the same, but would pull 1.25 kB of Angular into first paint.
   */
  readonly step = computed<StageStep>(() => {
    const now = { frames: this.frames(), at: this.shownIndex() };
    return untracked(() => {
      const step = this.stepTo(now.frames, now.at, this.lastShown);
      this.lastShown = now;
      return step;
    });
  });
  /** Whether any frame's line compares values over the array, which then keeps a row for the comparator label. */
  readonly comparing = computed(() => this.frames().some((f) => f.array && lensComparison(f.lens)));
  /** The stage's motion tokens at the playback speed, for its CSS transitions (state recolors). */
  readonly stageTokens = computed(() => {
    const speed = this.speed();
    return this.motion.tokens(speed === 'instant' ? 0 : pace([], speed).scale);
  });
  /** Variables drawn as pins over their cells, which the watch collapses under "On the stage". */
  readonly onStage = computed(() => {
    const f = this.shown();
    const pointers = f?.array?.pointers ?? {};
    return new Set(Object.keys(f?.vars ?? {}).filter((name) => pointers[name] !== undefined && f!.vars[name] === pointers[name]));
  });
  readonly describing = signal(false);
  /** Describe's panel, loaded the first time it opens, so its tables stay out of the player's first load. */
  readonly describer = signal<Type<unknown> | null>(null);
  readonly describeInputs = computed(() => {
    const step = this.step();
    return {
      frame: this.shown(),
      index: this.shownIndex(),
      events: step.adjacent ? step.events : null,
      asking: this.askingHere(),
      close: () => this.closeDescribe(),
    };
  });
  /** The answered checkpoint's guess, drawn on the stage as a "you" tag while its payoff plays (3.8). */
  readonly guess = computed(() => {
    const p = this.pending();
    const q = p && p.choice !== null ? this.frames()[p.frame]?.predict : undefined;
    return q && p ? { choice: q.choices[p.choice!], answer: q.choices[q.answer], right: p.choice === q.answer } : null;
  });

  readonly playing = signal(false);
  readonly speed = signal<Speed>(1);

  readonly introOpen = signal(false);
  /** Off for the render after Continue moves focus to the narration, which then reads it, so it is not read twice. */
  readonly quietNarration = signal(false);

  readonly predictMode = signal(true);
  readonly pending = signal<PredictState | null>(null);
  readonly answered = signal(new Map<number, 'right' | 'missed'>());
  /** Checkpoints a drag or Skip went past. Stepping onto one with Predict mode on asks it again; an answer outranks a skip. */
  readonly skipped = signal(new Set<number>());
  readonly score = computed(() => {
    const values = [...this.answered().values()];
    return { correct: values.filter((v) => v === 'right').length, total: values.length };
  });
  readonly ticks = computed<Tick[]>(() =>
    this.frames().flatMap((f, at) =>
      f.predict ? [{ at, state: this.answered().get(at) ?? (this.skipped().has(at) ? 'skipped' : 'pending') }] : [],
    ),
  );
  /** Runs of frames that share a chapter. */
  readonly chapters = computed<Band[]>(() => {
    const frames = this.frames();
    const bands: Band[] = [];
    frames.forEach((f, i) => {
      if (!f.chapter) return;
      const band = bands.at(-1);
      if (band && band.end === i - 1 && frames[i - 1].chapter === f.chapter) band.end = i;
      else bands.push({ start: i, end: i });
    });
    return bands;
  });
  /** While a checkpoint is open, what it is about; the rest of the drawing dims. */
  readonly checkpointFocus = computed(() => {
    const p = this.pending();
    const focus = p ? this.frames()[p.frame]?.predict?.focus : undefined;
    return focus?.length ? focus : null;
  });

  readonly alignedOutput = computed(() => alignedRow(this.shown()));
  readonly longestArrayValue = computed(() =>
    longestValue(this.frames().flatMap((f) => [...(f.array?.values ?? []), ...(alignedRow(f)?.values ?? [])])),
  );
  readonly treeRoom = computed(() => sideRoomFor(this.frames().map((f) => f.tree)));
  /**
   * Whether the stage is a column of fixed height, where a drawing takes the room the views above it, its legend and a first
   * row of the lists leave: a table always does, and a graph or tree under an array.
   */
  readonly column = computed(() => this.frames().some((f) => f.table || (f.array && (f.tree || f.graph))));
  /** An array above a drawing in that column keeps room for the run's most pointer rows, so the drawing keeps one size. */
  readonly arrayBand = computed(() => Math.max(0, ...this.frames().map((f) => pointerRowsOf(f.array?.pointers))));
  /** The run's longest stack, whose room the stack keeps on every frame, so a push or pop moves only the top chip. */
  readonly stackRoom = computed(() => Math.max(0, ...this.frames().map((f) => f.stack?.items.length ?? 0)));
  /** Whether any frame shows lists under the drawing, so the drawing keeps one size for the whole run. */
  readonly listed = computed(() => this.frames().some((f) => f.stack || f.queue || f.set || (f.output && !alignedRow(f))));
  /** Beside a checkpoint the caption is the frame's own one line, so the dock keeps R's height; never the note, which can hold the answer. */
  /**
   * The frame on show asks and is not answered: open, or about to open on the next step while Predict mode is on. Its note
   * can hold the answer, so the caption and Describe show the caption instead.
   */
  readonly askingHere = computed(() => {
    if (this.pending()?.choice === null) return true;
    const at = this.shownIndex();
    return !this.pending() && this.predictMode() && !!this.frames()[at]?.predict && !this.answered().has(at);
  });
  readonly caption = computed(() => {
    const frame = this.shown();
    return (this.pending() || this.askingHere() ? frame?.caption : frame?.note) ?? '';
  });

  readonly result = computed(() => (this.index() === this.last() ? this.frame()?.vars['result'] : undefined));

  private timer: ReturnType<typeof setTimeout> | undefined;
  private shownPending: PredictState | null = null;

  constructor() {
    addIcons({ diceOutline, sparkles, checkmarkCircle, closeCircle, documentTextOutline, helpCircleOutline, informationCircleOutline });

    effect(() => {
      const algo = this.algo();
      const given = this.given();
      if (!algo) return;
      untracked(() => {
        this.load(given ?? algo.defaultInput);
        if (given && this.inputError()) this.load(algo.defaultInput);
      });
    });

    effect((onCleanup) => {
      const panel = this.panelCol()?.nativeElement;
      const transport = this.transport()?.nativeElement;
      if (!panel || !transport) return;
      // Written here rather than through a signal, so ⋯'s cap changes in the frame R does, before it is painted.
      const observer = new ResizeObserver(() => transport.style.setProperty('--g-room', `${panel.offsetHeight}px`));
      observer.observe(panel);
      onCleanup(() => observer.disconnect());
    });

    // Each frame dwells as long as its step needs at this speed (3.5's pacing), then playing steps on.
    effect(() => {
      clearTimeout(this.timer);
      if (!this.playing()) return;
      this.timer = setTimeout(() => this.next(), pace(this.step().events, this.speed()).dwell);
    });

    // Before the views update for a new step, every running animation ends where it was going, so a held key never queues
    // motion (3.5's interrupts). A component effect runs before its template, so this precedes the views' own readings.
    effect(() => {
      this.step();
      untracked(() => this.motion.finishAll(this.scene()?.nativeElement));
    });
    afterRenderEffect(() => {
      const step = this.step();
      untracked(() => this.playStage(step));
    });
    // However Describe opens (its button, or D on the stage), focus moves to its heading once it is drawn.
    afterRenderEffect(() => {
      if (this.describing() && this.describer())
        untracked(() => this.describePanel()?.nativeElement.querySelector<HTMLElement>('h2')?.focus());
    });

    // A checkpoint opens in the dock, answering disables its choices and continuing removes it, so focus follows each change
    // instead of falling back to the top of the page. Only the dock scrolls, so the stage and the transport never move. Focus
    // moves from anywhere in the player or its heading (where a tab switch leaves it), but never out of a field the learner
    // is typing in while it plays; a checkpoint that does not get focus is announced instead.
    afterRenderEffect(() => {
      const p = this.pending();
      const before = this.shownPending;
      this.shownPending = p;
      if (p === before) return;
      const active = document.activeElement;
      const typing = active?.matches(TYPING) && active.checkVisibility?.() !== false ? active : null;
      const player = [this.layout()?.nativeElement, this.heading()?.nativeElement];
      if (!p) this.follow(this.narration()?.nativeElement);
      else if (p.choice === null) {
        const prompt = this.predictPrompt()?.nativeElement;
        if (typing) this.revealDockAbove(typing);
        else {
          this.panelCol()?.nativeElement.scrollTo({ top: 0 });
          this.follow(prompt, player);
        }
        if (prompt && document.activeElement !== prompt) {
          const text = codeSpans(this.frames()[p.frame].predict!.prompt).map((part) => part.text);
          this.announcer.announce(`Checkpoint: ${text.join('')}`);
        }
      } else {
        // Shown after a tap as well as a key press, clear of the sticky Continue; a verdict taller than R's view keeps its
        // first line in view.
        const verdict = this.verdict()?.nativeElement;
        const panel = this.panelCol()?.nativeElement;
        verdict?.scrollIntoView({ block: 'nearest' });
        if (verdict && panel && verdict.getBoundingClientRect().top < panel.getBoundingClientRect().top)
          verdict.scrollIntoView({ block: 'start' });
        if (!typing) refocus(verdict, player, () => undefined);
      }
    });

    inject(DestroyRef).onDestroy(() => clearTimeout(this.timer));
    onPageKey((e) => this.onKey(e), { kind: 'shortcuts' });
  }

  load(raw: unknown) {
    const algo = this.algo()!;
    try {
      const valid = algo.validate(raw);
      this.input.set(valid);
      this.drafts.set(Object.fromEntries(algo.fields.map((f) => [f.key, formatField(f.kind, valid[f.key])])));
      this.inputError.set(null);
      this.reset();
    } catch (err) {
      this.inputError.set(err instanceof InputError ? err.message : 'Invalid input');
    }
  }

  applyDrafts() {
    const algo = this.algo()!;
    const raw = Object.fromEntries(algo.fields.map((f) => [f.key, parseField(f.kind, this.drafts()[f.key] ?? '')]));
    this.load(raw);
    if (!this.inputError()) this.editing.set(false);
  }

  randomize() {
    this.load(this.algo()!.randomInput());
  }

  setDraft(key: string, value: string) {
    this.drafts.update((d) => ({ ...d, [key]: value }));
  }

  reset() {
    if (this.shownIndex() !== 0) this.seekKind = 'jump';
    this.quietNarration.set(false);
    this.playing.set(false);
    this.pending.set(null);
    this.answered.set(new Map());
    this.skipped.set(new Set());
    this.index.set(0);
  }

  next() {
    this.quietNarration.set(false);
    const p = this.pending();
    if (p) {
      if (p.choice !== null) this.leaveCheckpoint(p);
      return;
    }
    const i = this.index();
    if (this.ask(i)) return;
    if (i >= this.last()) {
      this.playing.set(false);
      return;
    }
    this.index.set(i + 1);
  }

  prev() {
    this.quietNarration.set(false);
    this.pending.set(null);
    this.index.update((i) => Math.max(0, i - 1));
  }

  /** Every seek closes an open checkpoint and leaves it unanswered; only a held drag's release opens one (`holdRelease`). */
  seek(value: number, kind: 'snap' | 'jump' = 'snap') {
    const to = Math.max(0, Math.min(this.last(), Math.round(value)));
    if (to !== this.shownIndex()) this.seekKind = kind;
    this.quietNarration.set(false);
    this.pending.set(null);
    this.index.set(to);
  }

  holdRelease(at: number) {
    this.seek(at);
    this.ask(at);
  }

  skipTick(at: number) {
    this.skipped.update((s) => new Set(s).add(at));
  }

  /** Seeks to the next checkpoint after this frame, or the one before it, and asks it when it is unanswered. */
  nextCheckpoint(direction: 1 | -1 = 1) {
    const i = this.index();
    const at =
      direction === 1
        ? this.ticks().find((t) => t.at > i)
        : this.ticks()
            .filter((t) => t.at < i)
            .at(-1);
    if (!at) return;
    this.playing.set(false);
    this.seek(at.at, 'jump');
    this.ask(at.at);
  }

  skip() {
    const p = this.pending();
    if (!p || p.choice !== null) return;
    this.skipTick(p.frame);
    this.quietNarration.set(this.focusInDock());
    this.leaveCheckpoint(p);
  }

  togglePlay() {
    const open = this.pending();
    if (open?.choice === null) {
      this.predictPrompt()?.nativeElement.focus();
      this.announcer.announce('Answer or skip to continue.');
      return;
    }
    if (open) {
      this.continueAfterPredict();
      return;
    }
    if (this.index() >= this.last()) this.reset();
    this.playing.update((p) => !p);
  }

  choose(choice: number) {
    const p = this.pending();
    const predict = this.frames()[p?.frame ?? -1]?.predict;
    if (!p || p.choice !== null || !predict) return;
    const correct = choice === predict.answer;
    this.pending.set({ ...p, choice });
    this.answered.update((m) => new Map(m).set(p.frame, correct ? 'right' : 'missed'));
    void (correct ? haptic.success() : haptic.error());
    const algo = this.algo()!;
    void this.progress.record({ type: 'predict.answered', algorithmId: algo.id, patternId: algo.patternId, correct });
  }

  continueAfterPredict() {
    const p = this.pending();
    if (!p || p.choice === null) return;
    this.quietNarration.set(this.focusInDock());
    this.leaveCheckpoint(p);
  }

  private focusInDock() {
    const active = document.activeElement;
    return !active || active === document.body || !!this.predictPanel()?.nativeElement.contains(active);
  }

  /** Opens the checkpoint on frame `i` when Predict mode is on and it is unanswered; says whether it did. */
  private ask(i: number): boolean {
    if (!this.predictMode() || !this.frames()[i]?.predict || this.answered().has(i)) return false;
    this.playing.set(false);
    this.pending.set({ frame: i, choice: null });
    return true;
  }

  private leaveCheckpoint(p: PredictState) {
    this.pending.set(null);
    this.index.set(Math.min(this.last(), p.frame + 1));
  }

  // Scrolls R as far toward the dock at its top as keeps the field the learner is typing in wholly in view, above R's scroll
  // padding, which typing would otherwise scroll it back to.
  private revealDockAbove(field: Element) {
    const panel = this.panelCol()?.nativeElement;
    if (!panel?.contains(field)) return;
    const view = panel.clientHeight - (parseFloat(getComputedStyle(panel).scrollPaddingBottom) || 0);
    const below = field.getBoundingClientRect().bottom - panel.getBoundingClientRect().top - panel.clientTop + panel.scrollTop;
    panel.scrollTop = Math.max(0, below - view);
  }

  // Refocuses, and in the fallback, where the layout itself scrolls, also scrolls the target into view after a tap: the
  // control tapped may sit far below it there.
  private follow(target: HTMLElement | undefined, within?: FocusPlaces) {
    refocus(target, within);
    const layout = this.layout()?.nativeElement;
    if (target && document.activeElement === target && layout && getComputedStyle(layout).overflowY !== 'visible')
      target.scrollIntoView({ block: 'nearest' });
  }

  /** A watch history's seek; its entry for the frame on show goes nowhere, so it never closes an open checkpoint. */
  historySeek(at: number) {
    if (at !== this.shownIndex()) this.seek(at, 'jump');
  }

  async toggleDescribe() {
    if (!this.describer()) this.describer.set((await import('../../viz/kit/describe.component')).DescribeComponent);
    this.describing.update((open) => !open);
  }

  closeDescribe() {
    this.describing.set(false);
    this.scene()?.nativeElement.focus();
  }

  /** D opens Describe only while the stage has focus, so a character key never acts from elsewhere (WCAG 2.1.4). */
  onStageKey(e: KeyboardEvent) {
    if (e.key.toLowerCase() !== 'd' || e.repeat || e.altKey || e.ctrlKey || e.metaKey || !this.shortcuts.characterKeys()) return;
    e.preventDefault();
    void this.toggleDescribe();
  }

  private stepTo(frames: Frame[], at: number, before: { frames: Frame[]; at: number } | undefined): StageStep {
    const kind = this.seekKind;
    this.seekKind = 'step';
    const sameRun = before?.frames === frames;
    const adjacent = kind === 'step' && sameRun && Math.abs(before!.at - at) === 1;
    const keys = this.keys();
    const events = adjacent ? diffFrames(frames[before!.at], frames[at], [keys[before!.at], keys[at]]) : [];
    const p = this.pending();
    const speed = p && p.choice !== null && at === p.frame + 1 ? PAYOFF_SPEED : this.speed();
    const scale = speed === 'instant' || !motionAllowed() ? 0 : pace(events, speed).scale;
    return { id: ++this.steps, events, adjacent, scale, jump: kind === 'jump' && sameRun && before!.at !== at };
  }

  /** A jump crossfades the stage (3.5), and an answer's "you" tag gives way to its verdict once the payoff has played (3.8). */
  private playStage(step: StageStep) {
    const scene = this.scene()?.nativeElement;
    if (!scene || step.scale === 0) return;
    if (step.jump) this.motion.animate(scene.querySelector('.viz')!, [{ opacity: 0 }, { opacity: 1 }], { duration: CROSSFADE_MS });
    const guess = scene.parentElement?.querySelector('.you.guess');
    const verdict = scene.parentElement?.querySelector('.you.verdict');
    if (!guess || !verdict || !step.adjacent) return;
    const timing = { duration: this.motion.ms('quick', step.scale), delay: this.motion.at('end', step.scale) };
    this.motion.animate(guess, [{ opacity: 1 }, { opacity: 0 }], { ...timing, fill: 'forwards' });
    this.motion.animate(verdict, [{ opacity: 0 }, { opacity: 1 }], timing);
  }

  async openIntro(event: MouseEvent): Promise<void> {
    const algo = this.algo();
    // A double tap would otherwise stack a second intro that outlives the first one's choice.
    if (!algo || this.introOpen()) return;
    this.introOpen.set(true);
    const intro = await this.popovers.create({
      component: PlayerIntroComponent,
      componentProps: { algo, pattern: this.pattern(), problem: this.problem() },
      event,
      htmlAttributes: { role: 'dialog', 'aria-label': algo.title },
    });
    await intro.present();
    const { data } = await intro.onDidDismiss<PlayerIntroChoice>();
    this.introOpen.set(false);
    if (data === 'pattern') void this.router.navigate(['/coding/patterns', algo.patternId]);
    else if (data === 'code') void this.router.navigate(['/coding/problems', this.problem()!.id]);
    // WebKit leaves a tapped button unfocused, so focus would otherwise fall to the top of the page.
    else this.about()?.nativeElement.focus();
  }

  private onKey(e: KeyboardEvent) {
    const p = this.pending();
    if (p && p.choice === null && /^[1-4]$/.test(e.key)) {
      this.choose(Number(e.key) - 1);
      return;
    }
    const revealed = p !== null && p.choice !== null;
    const jump =
      e.shiftKey && e.key === 'ArrowRight'
        ? () => this.nextCheckpoint(1)
        : e.shiftKey && e.key === 'ArrowLeft'
          ? () => this.nextCheckpoint(-1)
          : e.key === 'Home'
            ? () => this.seek(0, 'jump')
            : e.key === 'End'
              ? () => this.seek(this.last(), 'jump')
              : null;
    if (jump) {
      // A radio group takes Home and End for itself.
      if (e.defaultPrevented) return;
      e.preventDefault();
      jump();
      return;
    }
    if (e.key === 'ArrowRight') {
      if (revealed) this.continueAfterPredict();
      else this.next();
    } else if (e.key === 'ArrowLeft') {
      this.prev();
    } else if (e.key === ' ') {
      e.preventDefault();
      this.togglePlay();
    }
  }
}
