import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, input, model, output, viewChild } from '@angular/core';
import {
  STAR_ANSWER_LIMIT,
  formatClock,
  isEmptyDraft,
  reviewStar,
  starLength,
  storyTitle,
  type StarDraft,
  type StarPart,
  type Story,
} from '@grasp/engine';
import { uniqueId } from '../../core/unique-id';
import { StarEditorComponent } from '../behavioral/star-editor.component';
import { StoryBankService } from '../behavioral/story-bank.service';
import type { InterviewMode } from './interview.types';

const NOTES: Record<InterviewMode, string> = {
  ai: 'Sent to the AI service when you give your answer. Leave out names and confidential details.',
  offline: 'Scripted practice: your answer is kept with this interview and not sent to the AI service.',
};

/** The first turn of a behavioral interview: a STAR answer, optionally started from a story, sent only on "Give answer". */
@Component({
  selector: 'app-behavioral-answer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [StarEditorComponent],
  template: `
    <section class="panel answer" [attr.aria-labelledby]="ids.title">
      <h2 [id]="ids.title">Your answer</h2>
      @if (starters().length) {
        <div class="starters" role="group" [attr.aria-labelledby]="ids.starters">
          <p [id]="ids.starters">Start from a story:</p>
          @for (s of starters(); track s.id) {
            <button type="button" class="g-btn" [disabled]="disabled()" (click)="startFrom(s)">{{ title(s) }}</button>
          }
        </div>
      }
      <app-star-editor [draft]="draft()" [coached]="false" (edit)="edit($event.part, $event.text)" />
      <p class="length">
        <span class="mono">{{ spoken() }}</span> to say aloud, aim for 1:30 to 3:00
      </p>
      @if (over() > 0) {
        <p class="over" role="status">
          {{ over().toLocaleString('en-US') }} characters over the {{ limit.toLocaleString('en-US') }} an answer can hold. Shorten it to
          give it.
        </p>
      }
      <button #giveButton type="button" class="g-btn primary give" [disabled]="disabled() || empty() || over() > 0" (click)="give.emit()">
        Give answer
      </button>
      <p class="muted note">{{ notes[mode()] }}</p>
    </section>
  `,
  styles: `
    .answer {
      padding: 16px;
      margin: 12px 0;
    }
    h2 {
      font-size: 1rem;
      margin: 0 0 12px;
    }
    .starters {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px;
      margin: 0 0 16px;
      p {
        margin: 0;
        flex-basis: 100%;
        font-size: 0.90625rem;
      }
    }
    .length {
      font-size: 0.875rem;
      margin: 12px 0;
      .mono {
        font-weight: 700;
      }
    }
    .over {
      color: var(--g-danger-ink);
      font-size: 0.875rem;
      line-height: 1.5;
      margin: 0 0 12px;
    }
    .note {
      font-size: 0.8125rem;
      line-height: 1.5;
      margin: 10px 0 0;
    }
  `,
})
export class BehavioralAnswerComponent {
  private readonly bank = inject(StoryBankService);
  readonly competencyId = input.required<string>();
  readonly disabled = input(false);
  /** Whether the answer goes to the AI interviewer or stays with scripted practice. */
  readonly mode = input<InterviewMode>('ai');
  readonly draft = model.required<StarDraft>();
  /** Set once the draft is filled from a story, which is then already in the bank. */
  readonly fromStory = model(false);
  readonly give = output<void>();
  private readonly giveButton = viewChild<ElementRef<HTMLButtonElement>>('giveButton');
  readonly ids = { title: uniqueId('answer-title'), starters: uniqueId('answer-starters') };
  readonly notes = NOTES;
  readonly limit = STAR_ANSWER_LIMIT;
  readonly over = computed(() => starLength(this.draft()) - STAR_ANSWER_LIMIT);
  readonly title = storyTitle;
  readonly empty = computed(() => isEmptyDraft(this.draft()));
  readonly spoken = computed(() => formatClock(reviewStar(this.draft()).seconds));
  readonly starters = computed(() => (this.empty() ? this.bank.tagged(this.competencyId()).filter((s) => !isEmptyDraft(s.draft)) : []));

  constructor() {
    void this.bank.load();
  }

  startFrom(story: Story) {
    this.draft.set({ ...story.draft });
    this.fromStory.set(true);
  }

  edit(part: StarPart, text: string) {
    this.draft.update((draft) => ({ ...draft, [part]: text }));
    if (this.empty()) this.fromStory.set(false);
  }

  /** Where focus goes when the answer comes back after it could not be given. */
  focusTarget(): HTMLElement | undefined {
    return this.giveButton()?.nativeElement;
  }
}
