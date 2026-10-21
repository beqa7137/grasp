import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { generateQuestion, itemsForTopic, newSeed, seeded, shuffle, type Question } from '@grasp/engine';
import { ProgressService } from '../../core/progress.service';
import { QuestionCardComponent } from '../../review/question-card.component';
import { CrossLinkDirective } from '../../ui/cross-link.directive';
import { drillLink } from '../../core/links';

const QUESTIONS = 3;

interface Asked {
  itemId: string;
  question: Question;
}

/** Three of the pattern's own review questions, answered in place and counted as practice. */
@Component({
  selector: 'app-quick-check',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CrossLinkDirective, RouterLink, QuestionCardComponent],
  template: `
    @if (current(); as a) {
      <p class="muted progress">Question {{ position() + 1 }} of {{ asked().length }}</p>
      <g-question-card [question]="a.question" reason="check" [chosen]="chosen()" [focusFirst]="round() > 0" (choose)="answer($event)" />
      @if (chosen() !== null) {
        <button class="g-btn primary next" (click)="next()">
          {{ position() + 1 < asked().length ? 'Next question' : 'See how you did' }}
        </button>
      }
    } @else {
      <p class="summary" role="status">You got {{ correct() }} of {{ asked().length }} right.</p>
      <div class="actions">
        <button class="g-btn" (click)="restart()">Check again</button>
        <a class="g-btn" [routerLink]="drillLink(topic())" [replaceUrl]="inHub()" crossLink>Drill all {{ total() }} cards</a>
      </div>
    }
  `,
  styles: `
    :host {
      display: block;
    }
    .progress {
      font-size: 0.8125rem;
      margin: 0 0 8px;
    }
    .next {
      margin-top: 12px;
    }
    .summary {
      font-weight: 600;
      margin: 0 0 12px;
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      a {
        text-decoration: none;
      }
    }
  `,
})
export class QuickCheckComponent {
  readonly drillLink = drillLink;
  readonly topic = input.required<string>();
  /** In a pattern hub, where the drill is a segment, so its link replaces the URL as the segment row's do. */
  readonly inHub = input(false);
  private readonly progress = inject(ProgressService);
  readonly round = signal(0);
  readonly position = signal(0);
  readonly chosen = signal<number | null>(null);
  private readonly results = signal<boolean[]>([]);
  private shownAt = Date.now();

  readonly total = computed(() => itemsForTopic(this.topic()).length);
  readonly asked = computed<Asked[]>(() => {
    this.round();
    const items = shuffle(seeded(newSeed()), itemsForTopic(this.topic())).slice(0, QUESTIONS);
    return items.map((item) => ({ itemId: item.id, question: generateQuestion(item.id, newSeed()) }));
  });
  readonly current = computed(() => this.asked()[this.position()]);
  readonly correct = computed(() => this.results().filter(Boolean).length);

  async answer(choice: number) {
    const asked = this.current();
    if (!asked || this.chosen() !== null) return;
    this.chosen.set(choice);
    const correct = choice === asked.question.answer;
    this.results.update((r) => [...r, correct]);
    await this.progress.record({ type: 'practice.answered', itemId: asked.itemId, correct, durationMs: Date.now() - this.shownAt });
  }

  next() {
    this.chosen.set(null);
    this.position.update((p) => p + 1);
    this.shownAt = Date.now();
  }

  restart() {
    this.results.set([]);
    this.chosen.set(null);
    this.position.set(0);
    this.round.update((r) => r + 1);
    this.shownAt = Date.now();
  }
}
