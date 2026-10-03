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
  formatField,
  getAlgorithm,
  getPatternSummary,
  parseField,
  type AlgorithmDef,
  type Frame,
} from '@grasp/engine';
import { addIcons } from 'ionicons';
import {
  checkmarkCircle,
  closeCircle,
  diceOutline,
  helpCircleOutline,
  informationCircleOutline,
  pause,
  play,
  playSkipBack,
  playSkipForward,
  refresh,
  sparkles,
} from 'ionicons/icons';
import { AnnouncerService } from '../../core/announcer.service';
import { refocus } from '../../core/focus';
import { haptic } from '../../core/haptics';
import { onPageKey } from '../../core/on-page-key';
import { ProgressService } from '../../core/progress.service';
import { ShortcutsService } from '../../core/shortcuts.service';
import { answerMark } from '../../review/answer-mark';
import { ArrayViewComponent, longestValue, type AlignedRow } from '../../viz/array-view.component';
import { CodePanelComponent } from '../../viz/code-panel.component';
import { CodeTextComponent } from '../../viz/code-text.component';
import { GraphViewComponent } from '../../viz/graph-view.component';
import { GridViewComponent } from '../../viz/grid-view.component';
import { ListViewComponent } from '../../viz/list-view.component';
import { TableViewComponent } from '../../viz/table-view.component';
import { TreeViewComponent, sideRoomFor } from '../../viz/tree-view.component';
import { firstSentence } from './first-sentence';
import { PlayerIntroComponent, type PlayerIntroChoice } from './player-intro.component';

type PredictState = { frame: number; choice: number | null };

function alignedRow(f: Frame | undefined): AlignedRow | null {
  // Structural views carry their own layout; an output list that happens to match the array's length is not per-index there.
  if (!f?.output || !f.array || f.tree || f.graph || f.table || f.output.items.length !== f.array.values.length) return null;
  return { label: f.output.label, values: f.output.items };
}

const SPEEDS = [0.5, 1, 2, 4];
const STEP_KEYS = new Set(['ArrowLeft', 'ArrowRight', ' ']);

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
  private readonly panelCol = viewChild<ElementRef<HTMLElement>>('panelCol');
  private readonly about = viewChild<ElementRef<HTMLElement>>('about');

  readonly algo = computed(() => getAlgorithm(this.id()) as AlgorithmDef | undefined);
  readonly problem = computed(() => CODING_CATALOG.find((p) => p.algorithmId === this.id()));
  readonly pattern = computed(() => (this.algo() ? getPatternSummary(this.algo()!.patternId) : undefined));

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
  readonly predictMarks = computed(() =>
    this.frames()
      .map((f, i) => (f.predict ? i : -1))
      .filter((i) => i >= 0)
      .map((i) => (i / Math.max(1, this.last())) * 100),
  );

  readonly playing = signal(false);
  readonly speedIndex = signal(1);
  readonly speed = computed(() => SPEEDS[this.speedIndex()]);

  readonly introOpen = signal(false);
  /** Off for the render after Continue moves focus to the narration, which then reads it, so it is not read twice. */
  readonly quietNarration = signal(false);

  readonly predictMode = signal(true);
  readonly pending = signal<PredictState | null>(null);
  readonly answered = signal(new Map<number, boolean>());
  readonly score = computed(() => {
    const values = [...this.answered().values()];
    return { correct: values.filter(Boolean).length, total: values.length };
  });

  readonly alignedOutput = computed(() => alignedRow(this.frame()));
  readonly longestArrayValue = computed(() =>
    longestValue(this.frames().flatMap((f) => [...(f.array?.values ?? []), ...(alignedRow(f)?.values ?? [])])),
  );
  readonly treeRoom = computed(() => sideRoomFor(this.frames().map((f) => f.tree)));
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
    addIcons({
      play,
      pause,
      playSkipBack,
      playSkipForward,
      refresh,
      diceOutline,
      sparkles,
      checkmarkCircle,
      closeCircle,
      helpCircleOutline,
      informationCircleOutline,
    });

    effect(() => {
      const algo = this.algo();
      const given = this.given();
      if (!algo) return;
      untracked(() => {
        this.load(given ?? algo.defaultInput);
        if (given && this.inputError()) this.load(algo.defaultInput);
      });
    });

    effect(() => {
      clearInterval(this.timer);
      if (!this.playing()) return;
      this.timer = setInterval(() => this.next(), 1100 / this.speed());
    });

    // A checkpoint opens in the dock, answering disables its choices and continuing removes it, so focus follows each change
    // instead of falling back to the top of the page. Only the dock scrolls, so the stage and the transport never move.
    afterRenderEffect(() => {
      const p = this.pending();
      const before = this.shownPending;
      this.shownPending = p;
      if (p === before) return;
      if (!p) refocus(this.narration()?.nativeElement);
      else if (p.choice === null) {
        this.panelCol()?.nativeElement.scrollTo({ top: 0 });
        refocus(this.predictPrompt()?.nativeElement, this.layout()?.nativeElement);
      } else {
        // Shown after a tap as well as a key press, clear of the sticky Continue; a verdict taller than R's view keeps its
        // first line in view.
        const verdict = this.verdict()?.nativeElement;
        const panel = this.panelCol()?.nativeElement;
        verdict?.scrollIntoView({ block: 'nearest' });
        if (verdict && panel && verdict.getBoundingClientRect().top < panel.getBoundingClientRect().top)
          verdict.scrollIntoView({ block: 'start' });
        refocus(verdict, this.predictPanel()?.nativeElement, () => undefined);
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
    const f = this.frames()[i];
    if (this.predictMode() && f?.predict && !this.answered().has(i)) {
      this.playing.set(false);
      this.pending.set({ frame: i, choice: null });
      return;
    }
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

  seek(value: number) {
    this.quietNarration.set(false);
    this.pending.set(null);
    this.index.set(Math.round(value));
  }

  togglePlay() {
    const open = this.pending();
    if (open?.choice === null) {
      this.predictPrompt()?.nativeElement.focus();
      this.announcer.announce('Answer the question to continue.');
      return;
    }
    if (open) {
      this.continueAfterPredict();
      return;
    }
    if (this.index() >= this.last()) this.reset();
    this.playing.update((p) => !p);
  }

  cycleSpeed() {
    this.speedIndex.update((i) => (i + 1) % SPEEDS.length);
  }

  choose(choice: number) {
    const p = this.pending();
    const predict = this.frames()[p?.frame ?? -1]?.predict;
    if (!p || p.choice !== null || !predict) return;
    const correct = choice === predict.answer;
    this.pending.set({ ...p, choice });
    this.answered.update((m) => new Map(m).set(p.frame, correct));
    void (correct ? haptic.success() : haptic.error());
    const algo = this.algo()!;
    void this.progress.record({ type: 'predict.answered', algorithmId: algo.id, patternId: algo.patternId, correct });
  }

  continueAfterPredict() {
    const p = this.pending();
    if (!p || p.choice === null) return;
    const active = document.activeElement;
    this.quietNarration.set(!active || active === document.body || !!this.predictPanel()?.nativeElement.contains(active));
    this.leaveCheckpoint(p);
  }

  private leaveCheckpoint(p: PredictState) {
    this.pending.set(null);
    this.index.set(Math.min(this.last(), p.frame + 1));
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
    if (STEP_KEYS.has(e.key)) e.preventDefault();
    if (e.key === 'ArrowRight') {
      if (revealed) this.continueAfterPredict();
      else this.next();
    } else if (e.key === 'ArrowLeft') {
      this.prev();
    } else if (e.key === ' ') {
      this.togglePlay();
    }
  }
}
