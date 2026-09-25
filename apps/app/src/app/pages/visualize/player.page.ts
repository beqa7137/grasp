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
import { RouterLink } from '@angular/router';
import { IonBackButton, IonButtons, IonContent, IonHeader, IonIcon, IonTitle, IonToolbar } from '@ionic/angular';
import {
  CODING_CATALOG,
  InputError,
  formatField,
  getAlgorithm,
  getPattern,
  parseField,
  type AlgorithmDef,
  type ArrayView,
  type Frame,
} from '@grasp/engine';
import { addIcons } from 'ionicons';
import {
  checkmarkCircle,
  closeCircle,
  codeSlashOutline,
  diceOutline,
  helpCircleOutline,
  pause,
  play,
  playSkipBack,
  playSkipForward,
  refresh,
  sparkles,
} from 'ionicons/icons';
import { refocus } from '../../core/focus';
import { haptic } from '../../core/haptics';
import { onPageKey } from '../../core/on-page-key';
import { ProgressService } from '../../core/progress.service';
import { ShortcutsService } from '../../core/shortcuts.service';
import { answerMark } from '../../review/answer-mark';
import { ArrayViewComponent } from '../../viz/array-view.component';
import { CodePanelComponent } from '../../viz/code-panel.component';
import { CodeTextComponent } from '../../viz/code-text.component';
import { GraphViewComponent } from '../../viz/graph-view.component';
import { GridViewComponent } from '../../viz/grid-view.component';
import { ListViewComponent } from '../../viz/list-view.component';
import { TableViewComponent } from '../../viz/table-view.component';
import { TreeViewComponent } from '../../viz/tree-view.component';

type PredictState = { frame: number; choice: number | null };

const SPEEDS = [0.5, 1, 2, 4];

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
})
export class PlayerPage {
  readonly id = input.required<string>();
  private readonly progress = inject(ProgressService);
  readonly shortcuts = inject(ShortcutsService);
  protected readonly answerMark = answerMark;
  private readonly predictPanel = viewChild<ElementRef<HTMLElement>>('predictPanel');
  private readonly predictPrompt = viewChild<ElementRef<HTMLElement>>('predictPrompt');
  private readonly verdict = viewChild<ElementRef<HTMLElement>>('verdict');
  private readonly narration = viewChild<ElementRef<HTMLElement>>('narration');
  private readonly controls = viewChild<ElementRef<HTMLElement>>('controls');

  readonly algo = computed(() => getAlgorithm(this.id()) as AlgorithmDef | undefined);
  readonly problem = computed(() => CODING_CATALOG.find((p) => p.algorithmId === this.id()));
  readonly pattern = computed(() => (this.algo() ? getPattern(this.algo()!.patternId) : undefined));

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

  readonly predictMode = signal(true);
  readonly pending = signal<PredictState | null>(null);
  readonly answered = signal(new Map<number, boolean>());
  readonly score = computed(() => {
    const values = [...this.answered().values()];
    return { correct: values.filter(Boolean).length, total: values.length };
  });

  readonly alignedOutput = computed<ArrayView | null>(() => {
    const f = this.frame();
    // Structural views carry their own layout; an output list that happens to match the array's length is not per-index there.
    if (!f?.output || !f.array || f.tree || f.graph || f.table || f.output.items.length !== f.array.values.length) return null;
    return { values: f.output.items, pointers: {}, found: f.array.settled ?? [], active: [] };
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
      codeSlashOutline,
    });

    effect(() => {
      const algo = this.algo();
      if (!algo) return;
      untracked(() => this.load(algo.defaultInput));
    });

    effect(() => {
      clearInterval(this.timer);
      if (!this.playing()) return;
      this.timer = setInterval(() => this.next(), 1100 / this.speed());
    });

    // A checkpoint takes over the playback controls, answering disables its choices and continuing removes it, so focus
    // follows each change instead of falling back to the top of the page or staying on a control that no longer plays.
    afterRenderEffect(() => {
      const p = this.pending();
      const before = this.shownPending;
      this.shownPending = p;
      if (p === before) return;
      if (!p) refocus(this.narration()?.nativeElement);
      else if (p.choice === null) refocus(this.predictPrompt()?.nativeElement, this.controls()?.nativeElement);
      else refocus(this.verdict()?.nativeElement, this.predictPanel()?.nativeElement);
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
    this.playing.set(false);
    this.pending.set(null);
    this.answered.set(new Map());
    this.index.set(0);
  }

  next() {
    if (this.pending()) return;
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
    this.pending.set(null);
    this.index.update((i) => Math.max(0, i - 1));
  }

  seek(value: number) {
    this.pending.set(null);
    this.index.set(Math.round(value));
  }

  togglePlay() {
    if (this.pending()) return;
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
    this.pending.set(null);
    this.index.set(Math.min(this.last(), p.frame + 1));
  }

  private onKey(e: KeyboardEvent) {
    const p = this.pending();
    if (p && p.choice === null && /^[1-4]$/.test(e.key)) {
      this.choose(Number(e.key) - 1);
      return;
    }
    const revealed = p !== null && p.choice !== null;
    if (e.key === 'ArrowRight') {
      if (revealed) this.continueAfterPredict();
      else this.next();
    } else if (e.key === 'ArrowLeft') {
      this.prev();
    } else if (e.key === ' ') {
      e.preventDefault();
      if (revealed) this.continueAfterPredict();
      else this.togglePlay();
    }
  }
}
