import {
  ChangeDetectionStrategy,
  Component,
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
import { IonButtons, IonContent, IonHeader, IonIcon, IonTitle, IonToolbar } from '@ionic/angular';
import {
  RATING,
  formatInterval,
  generateQuestion,
  getPatternSummary,
  getSdTopic,
  newSeed,
  practiceMix,
  practiceSet,
  previewDue,
  type Question,
  type ReviewRating,
} from '@grasp/engine';
import { addIcons } from 'ionicons';
import { arrowForward, flame, timeOutline } from 'ionicons/icons';
import { haptic } from '../../core/haptics';
import { onPageKey } from '../../core/on-page-key';
import { ProgressService } from '../../core/progress.service';
import { ShortcutsService } from '../../core/shortcuts.service';
import { QuestionCardComponent, type CardReason } from '../../review/question-card.component';
import { RouterLink } from '@angular/router';
import { BackComponent } from '../../ui/back.component';
import { EmptyStateComponent } from '../../ui/empty-state.component';
import { lessonLink } from '../../core/links';
import { DrillSummaryComponent, type DrillScore } from './drill-summary.component';

interface Slot {
  itemId: string;
  reason: CardReason;
  seed: number;
  question: Question;
}

interface Result {
  itemId: string;
  topic: string;
  correct: boolean;
  rating: ReviewRating | null;
}

/** Items that fall due again within this window after an "Again" are re-shown in the same sitting. */
const REQUEUE_WINDOW_MS = 20 * 60_000;
/** A missed item is re-shown at most this many times per sitting; after that it waits for the next session. */
const MAX_REQUEUES_PER_ITEM = 2;

@Component({
  selector: 'app-drill',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    BackComponent,
    RouterLink,
    EmptyStateComponent,
    IonHeader,
    IonToolbar,
    IonButtons,
    IonTitle,
    IonContent,
    IonIcon,
    QuestionCardComponent,
    DrillSummaryComponent,
  ],
  templateUrl: './drill.page.html',
  styleUrl: './drill.page.scss',
})
export class DrillPage {
  readonly pattern = input<string>();
  /** Set by the `/today/drill` route only, so a `topics` query on any other page drills nothing. */
  readonly weakSpots = input(false);
  /** The topics Weak spots' "Drill these" drills together, `/today/drill?topics=a,b`. */
  readonly topics = input<string>();
  readonly mix = computed(() => [...new Set((this.topics() ?? '').split(','))].filter((id) => getPatternSummary(id) || getSdTopic(id)));
  readonly progress = inject(ProgressService);
  readonly shortcuts = inject(ShortcutsService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly card = viewChild(QuestionCardComponent);
  private readonly actions = viewChild<ElementRef<HTMLElement>>('actions');

  readonly queue = signal<Slot[]>([]);
  readonly position = signal(0);
  readonly chosen = signal<number | null>(null);
  readonly results = signal<Result[]>([]);
  readonly started = signal(false);
  readonly minutes = signal(0);
  private answeredMs = 0;
  private requeues = new Map<string, number>();
  readonly plan = signal<{ due: number; fresh: number; minutes: number } | null>(null);
  private shownAt = Date.now();
  private sessionStart = Date.now();

  readonly weakDrill = computed(() => this.weakSpots() && !this.pattern());
  readonly practice = computed(() => Boolean(this.pattern()) || this.weakDrill());
  readonly current = computed(() => this.queue()[this.position()] ?? null);
  readonly finished = computed(() => this.started() && this.position() >= this.queue().length);
  readonly focusName = computed(() => {
    const id = this.pattern();
    if (!id) return this.weakDrill() ? 'Weak spots' : null;
    return getPatternSummary(id)?.name ?? getSdTopic(id)?.name ?? id;
  });
  readonly mixNames = computed(() => this.mix().map((id) => getPatternSummary(id)?.name ?? getSdTopic(id)?.name ?? id));
  readonly backHref = computed(() => {
    const id = this.pattern();
    return id ? lessonLink(id) : '/today';
  });

  readonly previews = computed(() => {
    const slot = this.current();
    if (!slot || this.chosen() === null || this.practice()) return null;
    const now = new Date();
    const state = this.progress.state();
    const due = previewDue(slot.itemId, state.cards[slot.itemId], now, state.settings.retention);
    return {
      again: formatInterval(now, due[1]),
      hard: formatInterval(now, due[2]),
      good: formatInterval(now, due[3]),
      easy: formatInterval(now, due[4]),
    };
  });

  readonly score = computed((): DrillScore | null => {
    if (!this.finished()) return null;
    const results = this.results();
    const missed = [...new Set(results.filter((r) => !r.correct).map((r) => r.topic))];
    return {
      correct: results.filter((r) => r.correct).length,
      total: results.length,
      minutes: this.minutes(),
      missed: missed.map((t) => ({ id: t, name: getPatternSummary(t)?.name ?? getSdTopic(t)?.name ?? t })),
    };
  });

  constructor() {
    addIcons({ arrowForward, flame, timeOutline });
    effect(() => {
      this.pattern();
      this.mix();
      untracked(() => this.start());
    });
    onPageKey((e) => this.onKey(e), { kind: 'shortcuts' });
    // The sticky rating bar appears with the verdict, under which it would otherwise sit after a tap.
    afterRenderEffect(() => {
      const bar = this.actions()?.nativeElement;
      const verdict = this.card()?.reveal()?.nativeElement;
      if (!bar || !verdict || getComputedStyle(bar).position !== 'sticky') return;
      this.host.nativeElement.style.setProperty('--actions-h', `${bar.offsetHeight}px`);
      verdict.scrollIntoView({ block: 'nearest' });
    });
  }

  ionViewWillEnter() {
    this.progress.now.set(new Date());
    if (!this.current()) this.start();
  }

  start() {
    const pattern = this.pattern();
    const slots: Slot[] = !this.practice()
      ? this.progress.session().items.map((i) => this.slot(i.itemId, i.reason))
      : (pattern ? practiceSet(pattern, Math.random) : practiceMix(this.mix(), Math.random)).map((itemId) => this.slot(itemId, 'practice'));
    const session = this.progress.session();
    this.plan.set(
      this.practice() ? null : { due: this.progress.reviewDue(), fresh: session.newIncluded, minutes: session.estimatedMinutes },
    );
    this.queue.set(slots);
    this.position.set(0);
    this.results.set([]);
    this.chosen.set(null);
    this.requeues.clear();
    this.started.set(slots.length > 0);
    this.shownAt = this.sessionStart = Date.now();
  }

  answer(choice: number) {
    const slot = this.current();
    if (!slot || this.chosen() !== null) return;
    this.chosen.set(choice);
    this.answeredMs = Date.now() - this.shownAt;
    void (choice === slot.question.answer ? haptic.success() : haptic.error());
  }

  isCorrect() {
    const slot = this.current();
    return slot !== null && this.chosen() === slot.question.answer;
  }

  async rate(rating: ReviewRating) {
    const slot = this.current();
    if (!slot || this.chosen() === null) return;
    const correct = this.isCorrect();
    const durationMs = this.answeredMs;
    const topic = slot.question.topic;

    if (this.practice()) {
      await this.progress.record({ type: 'practice.answered', itemId: slot.itemId, correct, durationMs });
      this.results.update((r) => [...r, { itemId: slot.itemId, topic, correct, rating: null }]);
    } else {
      await this.progress.record({ type: 'review.graded', itemId: slot.itemId, rating, correct, durationMs, seed: slot.seed });
      this.results.update((r) => [...r, { itemId: slot.itemId, topic, correct, rating }]);
      const card = this.progress.state().cards[slot.itemId];
      const learning = card?.phase === 'learning' || card?.phase === 'relearning';
      const shown = this.requeues.get(slot.itemId) ?? 0;
      if (learning && shown < MAX_REQUEUES_PER_ITEM && Date.parse(card.due) - Date.now() <= REQUEUE_WINDOW_MS) {
        this.requeues.set(slot.itemId, shown + 1);
        this.queue.update((q) => [...q, this.slot(slot.itemId, 'relearn')]);
      }
    }
    this.next();
  }

  private onKey(e: KeyboardEvent) {
    if (!this.current()) return;
    if (this.chosen() === null) {
      if (/^[1-4]$/.test(e.key)) this.answer(Number(e.key) - 1);
      return;
    }
    const graded = this.isCorrect() && !this.practice();
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowRight') {
      e.preventDefault();
      void this.rate(this.isCorrect() || this.practice() ? RATING.good : RATING.again);
    } else if (graded && e.key.toLowerCase() === 'g') {
      void this.rate(RATING.hard);
    } else if (graded && e.key.toLowerCase() === 'e') {
      void this.rate(RATING.easy);
    }
  }

  private next() {
    this.chosen.set(null);
    this.position.update((p) => p + 1);
    this.shownAt = Date.now();
    if (this.position() >= this.queue().length) this.minutes.set(Math.max(1, Math.round((Date.now() - this.sessionStart) / 60_000)));
  }

  private slot(itemId: string, reason: CardReason): Slot {
    const seed = newSeed();
    return { itemId, reason, seed, question: generateQuestion(itemId, seed) };
  }
}
