import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  model,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { diamondOutline, ellipsisHorizontal, flagOutline, pause, play, playSkipBack, playSkipForward, refresh } from 'ionicons/icons';
import { haptic } from '../../core/haptics';
import { RovingSelectDirective } from '../../core/roving-select.directive';
import { uniqueId } from '../../core/unique-id';
import { dragTo, type Drag } from './scrub';

export type TickState = 'pending' | 'right' | 'missed' | 'skipped';
/** A checkpoint on the timeline and how the learner left it. */
export interface Tick {
  at: number;
  state: TickState;
}
/** A run of frames that share a chapter. */
export interface Band {
  start: number;
  end: number;
}
export type Speed = 0.5 | 1 | 2 | 4 | 'instant';

export const SPEEDS: { value: Speed; label: string }[] = [
  { value: 0.5, label: '0.5×' },
  { value: 1, label: '1×' },
  { value: 2, label: '2×' },
  { value: 4, label: '4×' },
  { value: 'instant', label: 'Instant' },
];

const TICK_WORDS: Record<TickState, string> = { pending: '', right: ', right', missed: ', missed', skipped: ', skipped' };

/** How far apart two ticks' centres must be to draw whole: an 8px diamond turned 45° and its 2px halo. */
const TICK_SPACE_PX = 16;
/**
 * Ticks drawn closer than that merge into one mark, which shows the state that most needs the learner and sits on the tick
 * with that state, so a tap on a pending mark crosses its checkpoint and holds there.
 */
const URGENCY: Record<TickState, number> = { right: 0, skipped: 1, missed: 2, pending: 3 };

/**
 * The player's transport (REDESIGN.md 3.7). On the desktop layout it is one bar; everywhere else a dock of back, play,
 * forward and the count, with ⋯ opening the Timeline, Speed, Restart, Next checkpoint and Jump to result above it. The
 * Timeline stays a native range for the keyboard and assistive tech, under a layer that takes every pointer, so a drag is
 * guarded the same in every engine: it holds on an unanswered checkpoint (`guard`) until 24px more of drag skip it.
 */
@Component({
  selector: 'g-transport',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IonIcon, RovingSelectDirective],
  templateUrl: './transport.component.html',
  styleUrl: './transport.component.scss',
  host: { '(keydown.escape)': 'closeMore()' },
})
export class TransportComponent {
  readonly index = input.required<number>();
  readonly count = input.required<number>();
  readonly ticks = input<Tick[]>([]);
  readonly chapters = input<Band[]>([]);
  readonly playing = input(false);
  readonly speed = input<Speed>(1);
  readonly canBack = input(true);
  readonly canForward = input(true);
  /** Whether unanswered checkpoints hold a drag: Predict mode is on. */
  readonly guard = input(true);
  /** A checkpoint is open, which closes ⋯ so the checkpoint dock shows. */
  readonly asking = input(false);
  /** Whether ⋯ is open, which the player reads to keep the caption brief while it is. */
  readonly moreOpen = model(false);

  readonly seek = output<number>();
  readonly back = output<void>();
  readonly forward = output<void>();
  readonly play = output<void>();
  readonly restart = output<void>();
  readonly nextCheckpoint = output<void>();
  readonly previousCheckpoint = output<void>();
  readonly toResult = output<void>();
  readonly speedChange = output<Speed>();
  /** A drag went on past an unanswered checkpoint. */
  readonly skipTick = output<number>();
  /** A drag let go while holding on an unanswered checkpoint, which opens it. */
  readonly holdRelease = output<number>();

  protected readonly speeds = SPEEDS;
  protected readonly panelId = uniqueId('g-transport-more');
  protected readonly timelineLabel = uniqueId('g-transport-timeline');
  protected readonly speedLabel = uniqueId('g-transport-speed');
  protected readonly holding = signal<number | null>(null);
  /** Focus a drag gave the Timeline, which shows no ring until a key is pressed there (Chromium ignores `focusVisible`). */
  protected readonly pointerFocus = signal(false);
  private readonly moreButton = viewChild<ElementRef<HTMLButtonElement>>('moreButton');
  private readonly timeline = viewChild.required<ElementRef<HTMLInputElement>>('timeline');
  private readonly tickRow = viewChild.required<ElementRef<HTMLElement>>('tickRow');
  /** The tick row's width, 0 until it is measured or while ⋯ is closed. */
  private readonly trackPx = signal(0);
  private drag: (Drag & { pointer: number }) | null = null;

  readonly max = computed(() => Math.max(0, this.count() - 1));
  readonly atEnd = computed(() => this.index() >= this.max());
  readonly hasNext = computed(() => this.ticks().some((t) => t.at > this.index()));
  readonly placedTicks = computed(() => {
    const px = this.trackPx();
    const marks: (Tick & { p: number })[] = [];
    for (const tick of this.ticks()) {
      const p = this.fraction(tick.at);
      const mark = marks.at(-1);
      if (mark && px > 0 && (p - mark.p) * px < TICK_SPACE_PX) {
        if (URGENCY[tick.state] > URGENCY[mark.state]) Object.assign(mark, tick, { p });
      } else marks.push({ ...tick, p });
    }
    return marks;
  });
  /** Where the hold chip points: the checkpoint the drag holds on. */
  readonly holdP = computed(() => {
    const at = this.holding();
    return at === null ? 0 : this.fraction(at);
  });
  private readonly unanswered = computed(
    () => new Set(this.guard() ? this.ticks().flatMap((t) => (t.state === 'pending' ? [t.at] : [])) : []),
  );
  /** Each band runs from its first frame to the next band's, or to the last frame. */
  readonly bands = computed(() =>
    this.chapters().map((b, i) => {
      const p = this.fraction(b.start);
      return { p, span: this.fraction(Math.min(b.end + 1, this.max())) - p, odd: i % 2 === 1 };
    }),
  );
  readonly valueText = computed(() => {
    const tick = this.ticks().find((t) => t.at === this.index());
    return `Step ${this.index() + 1} of ${this.count()}${tick ? `, checkpoint${TICK_WORDS[tick.state]}` : ''}`;
  });

  constructor() {
    addIcons({ play, pause, playSkipBack, playSkipForward, refresh, diamondOutline, flagOutline, ellipsisHorizontal });
    effect(() => {
      if (this.asking()) this.moreOpen.set(false);
    });
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      const observer = new ResizeObserver(([entry]) => this.trackPx.set(entry.contentRect.width));
      observer.observe(this.tickRow().nativeElement);
      destroyRef.onDestroy(() => observer.disconnect());
    });
  }

  toggleMore() {
    this.moreOpen.update((open) => !open);
  }

  closeMore() {
    if (!this.moreOpen()) return;
    this.moreOpen.set(false);
    this.moreButton()?.nativeElement.focus();
  }

  /** Restart, Next checkpoint and Jump to result close ⋯; the Timeline and Speed keep it open. */
  fromMore(action: 'restart' | 'nextCheckpoint' | 'toResult') {
    this[action].emit();
    this.closeMore();
  }

  onTimelineKey(e: KeyboardEvent) {
    this.pointerFocus.set(false);
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const handled =
      e.shiftKey && e.key === 'ArrowRight'
        ? () => this.nextCheckpoint.emit()
        : e.shiftKey && e.key === 'ArrowLeft'
          ? () => this.previousCheckpoint.emit()
          : e.key === 'Home'
            ? () => this.seek.emit(0)
            : e.key === 'End'
              ? () => this.toResult.emit()
              : null;
    if (!handled) return;
    e.preventDefault();
    handled();
  }

  onPointerDown(e: PointerEvent) {
    if (e.button !== 0 || this.drag) return;
    e.preventDefault();
    try {
      (e.currentTarget as Element).setPointerCapture(e.pointerId);
    } catch {
      // A pointer the browser no longer tracks cannot be captured; the drag still follows its events here.
    }
    this.timeline().nativeElement.focus({ preventScroll: true });
    this.pointerFocus.set(true);
    this.drag = { value: this.index(), holding: null, holdX: 0, pointer: e.pointerId };
    void haptic.selectStart();
    this.dragTo(e);
  }

  onPointerMove(e: PointerEvent) {
    if (this.drag?.pointer === e.pointerId) this.dragTo(e);
  }

  onPointerUp(e: PointerEvent) {
    const drag = this.drag;
    if (drag?.pointer !== e.pointerId) return;
    this.drag = null;
    this.holding.set(null);
    void haptic.selectEnd();
    if (e.type === 'pointerup' && drag.holding !== null) this.holdRelease.emit(drag.holding);
  }

  /**
   * Without this, a tap's trailing click lands on whatever replaced ⋯ under the finger, such as the checkpoint it opened.
   * A drag's touchend cannot be cancelled (and is followed by no click), and Chrome logs an error if asked to.
   */
  onTouchEnd(e: TouchEvent) {
    if (e.cancelable) e.preventDefault();
  }

  private dragTo(e: PointerEvent) {
    const drag = this.drag!;
    const box = (e.currentTarget as Element).getBoundingClientRect();
    const unanswered = this.unanswered();
    const step = dragTo(drag, e.clientX - box.left, this.max(), box.width, (v) => unanswered.has(v));
    this.drag = { ...step.drag, pointer: drag.pointer };
    if (step.skipped !== null) this.skipTick.emit(step.skipped);
    if (step.held) void haptic.select();
    this.holding.set(step.drag.holding);
    if (step.drag.value !== this.index()) this.seek.emit(step.drag.value);
  }

  private fraction(value: number) {
    return this.max() > 0 ? value / this.max() : 0;
  }
}
