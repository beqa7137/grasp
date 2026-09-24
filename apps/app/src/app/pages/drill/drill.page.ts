import { ChangeDetectionStrategy, Component, HostListener, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { IonContent, IonHeader, IonIcon, IonTitle, IonToolbar } from '@ionic/angular';
import {
  RATING,
  formatInterval,
  generateQuestion,
  getPattern,
  getScenario,
  getSdTopic,
  newSeed,
  practiceSet,
  previewDue,
  type Question,
  type ReviewRating,
} from '@grasp/engine';
import { addIcons } from 'ionicons';
import { arrowForward, flame, gitNetworkOutline, leafOutline, pulseOutline, timeOutline } from 'ionicons/icons';
import { haptic } from '../../core/haptics';
import { ProgressService } from '../../core/progress.service';
import { ForecastComponent } from '../../review/forecast.component';
import { QuestionCardComponent, type CardReason } from '../../review/question-card.component';

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
  imports: [RouterLink, DatePipe, IonHeader, IonToolbar, IonTitle, IonContent, IonIcon, QuestionCardComponent, ForecastComponent],
  templateUrl: './drill.page.html',
  styleUrl: './drill.page.scss',
})
export class DrillPage {
  readonly pattern = input<string>();
  readonly progress = inject(ProgressService);

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

  readonly practice = computed(() => Boolean(this.pattern()));
  readonly current = computed(() => this.queue()[this.position()] ?? null);
  readonly finished = computed(() => this.started() && this.position() >= this.queue().length);
  readonly focusName = computed(() => {
    const id = this.pattern();
    return id ? (getPattern(id)?.name ?? getSdTopic(id)?.name ?? id) : null;
  });
  readonly correctCount = computed(() => this.results().filter((r) => r.correct).length);

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

  readonly missedTopics = computed(() => {
    const topics = [
      ...new Set(
        this.results()
          .filter((r) => !r.correct)
          .map((r) => r.topic),
      ),
    ];
    return topics.map((t) => ({ id: t, name: getPattern(t)?.name ?? getSdTopic(t)?.name ?? t }));
  });

  constructor() {
    addIcons({ arrowForward, flame, leafOutline, timeOutline, pulseOutline, gitNetworkOutline });
    effect(() => {
      this.pattern();
      untracked(() => this.start());
    });
  }

  ionViewWillEnter() {
    this.progress.now.set(new Date());
    if (!this.current()) this.start();
  }

  start() {
    const slots: Slot[] = this.practice()
      ? practiceSet(this.pattern()!, Math.random).map((itemId) => this.slot(itemId, 'practice'))
      : this.progress.session().items.map((i) => this.slot(i.itemId, i.reason));
    const session = this.progress.session();
    this.plan.set(this.practice() ? null : { due: session.dueIncluded, fresh: session.newIncluded, minutes: session.estimatedMinutes });
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

  scenarioTitle(id: string) {
    return getScenario(id)?.title ?? id;
  }

  @HostListener('document:keydown', ['$event'])
  onKey(e: KeyboardEvent) {
    if (!this.current() || (e.target as HTMLElement).closest('input, textarea')) return;
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
