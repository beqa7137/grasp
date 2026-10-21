import { DestroyRef, computed, inject, signal, type Signal } from '@angular/core';
import {
  choiceForCells,
  choiceForValue,
  isValueEntry,
  pickCheckpoints,
  pickLabel,
  sameLocator,
  type AlgorithmDef,
  type Frame,
  type Locator,
  type Prediction,
} from '@grasp/engine';
import { CheckpointPrefService } from '../../core/checkpoint-pref.service';
import { haptic } from '../../core/haptics';
import { ProgressService } from '../../core/progress.service';
import { uniqueId } from '../../core/unique-id';
import type { PickAsk, PickGhost } from '../../viz/kit/pick';

/**
 * An open checkpoint: unanswered while `choice` is null; once answered, the choice the learner made, or -1 for an answer no
 * choice names (a cell or number of their own), which `text` then reads out.
 */
export interface PredictState {
  frame: number;
  choice: number | null;
  text?: string;
  cells?: readonly Locator[];
}

/** How an open checkpoint takes its answer: tapping the drawing, typing or tapping a number, or from the list. */
export type AnswerMode = 'picture' | 'value' | 'list';

/** Pick targets smaller than this, on a coarse pointer and on a fine one, open the list instead (REDESIGN.md 3.8). */
export const TARGET_MIN = { coarse: 44, fine: 24 } as const;

/**
 * A run's checkpoints (REDESIGN.md 3.8): which frames ask (`pickCheckpoints`), the open one and how it takes its answer,
 * the learner's pick on the drawing, what was answered or skipped, and the score. The player decides when they open and
 * close. Built in the player's injection context.
 */
export class CheckpointRun {
  private readonly prefs = inject(CheckpointPrefService);
  private readonly progress = inject(ProgressService);
  /** The run's asking frames: at most five, spaced out, each skill first. */
  readonly asking: Signal<number[]>;
  readonly askingSet: Signal<Set<number>>;

  readonly pending = signal<PredictState | null>(null);
  readonly answered = signal(new Map<number, 'right' | 'missed'>());
  /** Checkpoints a drag or Skip went past. Stepping onto one with Predict mode on asks it again; an answer outranks a skip. */
  readonly skipped = signal(new Set<number>());
  /** The smallest pick target on the stage, in px, and whether the pointer is coarse (`measure`). */
  readonly targets = signal({ size: Infinity, coarse: false });
  /** This ask's own choice of list or picture, which the dock's switch sets; null follows the preference and the targets. */
  readonly override = signal<boolean | null>(null);
  /** Cells picked toward a two-cell answer, and a number being typed. */
  readonly selection = signal<Locator[]>([]);
  readonly typed = signal('');
  readonly promptId = uniqueId('player-prompt');
  readonly askId = uniqueId('player-pick-ask');
  readonly fieldId = uniqueId('player-value');
  /** Bumped when a checkpoint opens on the picture, or switches to it, so focus moves to the drawing's first cell. */
  private readonly pickFocus = signal<number | undefined>(undefined);
  /** Set when an ask switches to the list, whose first choice then takes focus once drawn. */
  listFocus = false;
  /** Set when an ask switches between the list and the picture, so the dock shows its prompt again from the top. */
  switched = false;
  /** Whether the payoff's step has played, after which the learner's ghost turns right or wrong. */
  private readonly settled = signal(false);
  private settleTimer: ReturnType<typeof setTimeout> | undefined;

  readonly question = computed<Prediction | undefined>(() => {
    const p = this.pending();
    return p ? this.frames()[p.frame]?.predict : undefined;
  });
  /** Whether the stage's pick targets are big enough to tap (44px on a coarse pointer, 24px on a fine one). */
  readonly targetsFit = computed(() => {
    const { size, coarse } = this.targets();
    return size >= (coarse ? TARGET_MIN.coarse : TARGET_MIN.fine);
  });
  readonly mode = computed<AnswerMode>(() => {
    const pick = this.question()?.pick;
    if (pick?.on === 'value') return 'value';
    if (!pick) return 'list';
    const preference = this.prefs.preference();
    const list = this.override() ?? (preference === 'auto' ? !this.targetsFit() : preference === 'list');
    return list ? 'list' : 'picture';
  });
  /** The open pick ask, which makes the stage's cells a radio group. */
  readonly pickAsk = computed<PickAsk | null>(() => {
    const p = this.pending();
    const pick = this.question()?.pick;
    if (!p || p.choice !== null || pick?.on !== 'cell' || this.mode() !== 'picture') return null;
    return {
      labelledBy: this.promptId,
      describedBy: this.askId,
      count: pick.count ?? 1,
      picked: this.selection(),
      focusAt: this.pickFocus(),
    };
  });

  /** Right answers out of the checkpoints answered or skipped, which the end card's summary counts the same way. */
  readonly score = computed(() => {
    const values = [...this.answered().values()];
    const skipped = [...this.skipped()].filter((at) => !this.answered().has(at)).length;
    return { correct: values.filter((v) => v === 'right').length, total: values.length + skipped };
  });
  /** The end card's "4 of 5 predicted", with each checkpoint not predicted right; null when none was answered. */
  readonly summary = computed(() => {
    if (!this.answered().size) return null;
    const asking = this.asking();
    const missed = asking.flatMap((at) => {
      const state = this.answered().get(at);
      return state === 'right' ? [] : [{ at, state: state === 'missed' ? ('missed' as const) : ('skipped' as const) }];
    });
    return { correct: asking.length - missed.length, total: asking.length, missed };
  });

  /** The answered checkpoint's guess, for the stage's "you" tag while its payoff plays. */
  readonly guess = computed(() => {
    const p = this.pending();
    const q = this.question();
    if (!p || p.choice === null || !q) return null;
    return { choice: p.text ?? q.choices[p.choice], answer: q.choices[q.answer], right: p.choice === q.answer };
  });
  /** The learner's picked cells on the payoff frame. */
  readonly ghost = computed<PickGhost | null>(() => {
    const p = this.pending();
    const guess = this.guess();
    if (!p?.cells || !guess) return null;
    return { cells: p.cells, verdict: this.settled() ? (guess.right ? 'right' : 'wrong') : 'pending' };
  });

  constructor(
    private readonly frames: Signal<Frame[]>,
    private readonly algo: Signal<AlgorithmDef | undefined>,
  ) {
    this.asking = computed(() => pickCheckpoints(this.frames()));
    this.askingSet = computed(() => new Set(this.asking()));
    inject(DestroyRef).onDestroy(() => clearTimeout(this.settleTimer));
  }

  reset() {
    this.pending.set(null);
    this.answered.set(new Map());
    this.skipped.set(new Set());
  }

  /** Opens frame `frame`'s checkpoint; on the picture, focus moves to the drawing unless `keepFocus`. */
  open(frame: number, keepFocus: boolean) {
    this.override.set(null);
    this.selection.set([]);
    this.typed.set('');
    this.pending.set({ frame, choice: null });
    if (this.mode() === 'picture' && !keepFocus) this.pickFocus.update((n) => (n ?? 0) + 1);
    else this.pickFocus.set(undefined);
  }

  /** Switches this ask between the list and the picture, and remembers it on the device. */
  answerFrom(mode: 'list' | 'picture') {
    this.override.set(mode === 'list');
    void this.prefs.setPreference(mode);
    this.switched = true;
    if (mode === 'picture') this.pickFocus.update((n) => (n ?? 0) + 1);
    else this.listFocus = true;
  }

  choose(choice: number) {
    this.record(this.commit(choice));
  }

  /** A tapped cell: a single pick commits; toward a two-cell answer it is selected, or unselected when already picked. */
  pick(cell: Locator) {
    const pick = this.question()?.pick;
    if (pick?.on !== 'cell') return;
    if ((pick.count ?? 1) === 1) return this.record(this.commitCells([cell]));
    const same = (c: Locator) => sameLocator(c, cell);
    this.selection.update((s) => (s.some(same) ? s.filter((c) => !same(c)) : s.length < pick.count! ? [...s, cell] : s));
  }

  /** Locks in a two-cell answer or a typed number, once it is complete. */
  lock() {
    const q = this.question();
    if (q?.pick?.on === 'cell') {
      if (this.selection().length === q.pick.count) this.record(this.commitCells(this.selection()));
      return;
    }
    const typed = this.typed().trim();
    if (q?.pick?.on !== 'value' || !isValueEntry(typed)) return;
    const choice = choiceForValue(q, typed);
    this.record(choice === null ? this.commit(-1, typed) : this.commit(choice));
  }

  /** Turns the learner's ghost right or wrong once the payoff's step has played, `after` ms from now. */
  settleAfter(after: number) {
    if (!this.guess() || this.settled()) return;
    clearTimeout(this.settleTimer);
    this.settleTimer = setTimeout(() => this.settled.set(true), after);
  }

  /** Measures the stage's pick targets as drawn, so cells too small to tap open the list instead. */
  measure(scene: HTMLElement | undefined, coarse: boolean) {
    const boxes = [...(scene?.querySelectorAll('[data-pick]') ?? [])].map((el) => el.getBoundingClientRect());
    const size = boxes.length ? Math.min(...boxes.map((r) => Math.min(r.width, r.height))) : Infinity;
    const now = this.targets();
    if (now.size !== size || now.coarse !== coarse) this.targets.set({ size, coarse });
  }

  /** Commits an answer and says whether it was right, or null when nothing is open. */
  private commit(choice: number, text?: string, cells?: readonly Locator[]): boolean | null {
    const p = this.pending();
    const q = this.question();
    if (!p || p.choice !== null || !q) return null;
    const right = choice === q.answer;
    this.settled.set(false);
    this.pending.set({ ...p, choice, ...(text === undefined ? {} : { text }), ...(cells ? { cells } : {}) });
    this.answered.update((m) => new Map(m).set(p.frame, right ? 'right' : 'missed'));
    return right;
  }

  private commitCells(cells: readonly Locator[]): boolean | null {
    const pick = this.question()?.pick;
    if (pick?.on !== 'cell') return null;
    const choice = choiceForCells(pick, cells);
    return choice === null ? this.commit(-1, pickLabel(cells), cells) : this.commit(choice, undefined, cells);
  }

  private record(correct: boolean | null) {
    const algo = this.algo();
    if (correct === null || !algo) return;
    void (correct ? haptic.success() : haptic.error());
    void this.progress.record({ type: 'predict.answered', algorithmId: algo.id, patternId: algo.patternId, correct });
  }
}
