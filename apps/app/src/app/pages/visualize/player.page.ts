import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
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
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { IonBackButton, IonButtons, IonContent, IonHeader, IonIcon, IonTitle, IonToolbar, PopoverController } from '@ionic/angular';
import {
  CODING_CATALOG,
  InputError,
  codeSpans,
  formatField,
  getAlgorithm,
  getPatternSummary,
  parseField,
  type AlgorithmDef,
  type Frame,
} from '@grasp/engine';
import { addIcons } from 'ionicons';
import { checkmarkCircle, closeCircle, diceOutline, helpCircleOutline, informationCircleOutline, sparkles } from 'ionicons/icons';
import { AnnouncerService } from '../../core/announcer.service';
import { refocus, type FocusPlaces } from '../../core/focus';
import { haptic } from '../../core/haptics';
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
import { TransportComponent, stepInterval, type Band, type Speed, type Tick } from '../../viz/kit/transport.component';
import { TreeViewComponent, sideRoomFor } from '../../viz/tree-view.component';
import { firstSentence } from './first-sentence';
import { PlayerIntroComponent, type PlayerIntroChoice } from './player-intro.component';

type PredictState = { frame: number; choice: number | null };

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
    FormsModule,
    RouterLink,
    IonHeader,
    IonToolbar,
    IonButtons,
    IonBackButton,
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
  ],
  templateUrl: './player.page.html',
  styleUrl: './player.page.scss',
  providers: [AnnouncerService],
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

  readonly algo = computed(() => getAlgorithm(this.id()) as AlgorithmDef | undefined);
  readonly problem = computed(() => CODING_CATALOG.find((p) => p.algorithmId === this.id()));
  readonly pattern = computed(() => (this.algo() ? getPatternSummary(this.algo()!.patternId) : undefined));

  /** ⋯ is open, so the caption keeps to two lines and region R keeps room for the panel. */
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

  readonly alignedOutput = computed(() => alignedRow(this.frame()));
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
  readonly arrayBand = computed(() => (this.column() ? Math.max(0, ...this.frames().map((f) => pointerRowsOf(f.array?.pointers))) : 0));
  /** Whether any frame shows lists under the drawing, so the drawing keeps one size for the whole run. */
  readonly listed = computed(() => this.frames().some((f) => f.stack || f.queue || f.set || (f.output && !alignedRow(f))));
  /** Beside a checkpoint the caption is the note's first sentence, so the dock keeps R's height. */
  readonly caption = computed(() => {
    const note = this.frame()?.note ?? '';
    return this.pending() ? firstSentence(note) : note;
  });

  readonly varEntries = computed(() => Object.entries(this.frame()?.vars ?? {}).filter(([k]) => k !== 'result'));
  readonly result = computed(() => (this.index() === this.last() ? this.frame()?.vars['result'] : undefined));

  private timer: ReturnType<typeof setInterval> | undefined;
  private shownPending: PredictState | null = null;

  constructor() {
    addIcons({ diceOutline, sparkles, checkmarkCircle, closeCircle, helpCircleOutline, informationCircleOutline });

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
      if (!panel) return;
      // Written here rather than through a signal, so ⋯'s cap changes in the frame R does, before it is painted.
      const observer = new ResizeObserver(() => panel.parentElement!.style.setProperty('--g-room', `${panel.offsetHeight}px`));
      observer.observe(panel);
      onCleanup(() => observer.disconnect());
    });

    effect(() => {
      clearInterval(this.timer);
      if (!this.playing()) return;
      this.timer = setInterval(() => this.next(), stepInterval(this.speed()));
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

    inject(DestroyRef).onDestroy(() => clearInterval(this.timer));
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
  seek(value: number) {
    this.quietNarration.set(false);
    this.pending.set(null);
    this.index.set(Math.max(0, Math.min(this.last(), Math.round(value))));
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
    this.seek(at.at);
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
    if (data === 'pattern') void this.router.navigate(['/learn/pattern', algo.patternId]);
    else if (data === 'code') void this.router.navigate(['/code', this.problem()!.id]);
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
            ? () => this.seek(0)
            : e.key === 'End'
              ? () => this.seek(this.last())
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
