import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IonBackButton, IonButtons, IonContent, IonHeader, IonIcon, IonTitle, IonToolbar } from '@ionic/angular';
import {
  COMPETENCIES,
  EMPTY_STAR_DRAFT,
  isEmptyDraft,
  examplesFor,
  getCompetencySummary,
  storyTitle,
  type StarDraft,
  type StarPart,
  type Story,
} from '@grasp/engine';
import { addIcons } from 'ionicons';
import { arrowForward, chatbubblesOutline, eyeOutline } from 'ionicons/icons';
import { AiInterviewEntryComponent } from './ai-interview-entry.component';
import { ExampleAnswerComponent } from './example-answer.component';
import { StarEditorComponent } from './star-editor.component';
import { StarDraftsService } from './star-drafts.service';
import { StoryBankService } from './story-bank.service';

const QUESTIONS = COMPETENCIES.flatMap((c) => c.questions);

@Component({
  selector: 'app-star-practice',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    IonHeader,
    IonToolbar,
    IonButtons,
    IonBackButton,
    IonTitle,
    IonContent,
    IonIcon,
    AiInterviewEntryComponent,
    ExampleAnswerComponent,
    StarEditorComponent,
  ],
  template: `
    <ion-header [translucent]="true">
      <ion-toolbar>
        <ion-buttons slot="start"><ion-back-button [defaultHref]="backHref()" text="" /></ion-buttons>
        <ion-title>{{ competency()?.name ?? 'Behavioral' }}</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content [fullscreen]="true">
      @if (question(); as q) {
        <div class="page narrow">
          <p class="eyebrow">{{ competency()?.name }} · question {{ number() }} of {{ total() }}</p>
          <h1>{{ q.prompt }}</h1>
          <p class="probes">
            <ion-icon name="eye-outline" aria-hidden="true" /><span><b>What they check:</b> {{ q.probes }}</span>
          </p>

          @if (worked(); as w) {
            <details class="panel worked">
              <summary>See a worked answer to "{{ w.prompt }}"</summary>
              <app-example-answer [answer]="w.example" [notes]="w.example.notes" />
            </details>
          }

          @if (starters().length) {
            <section class="starters" aria-labelledby="starters-title">
              <p id="starters-title">Start from a story in your bank:</p>
              @for (s of starters(); track s.id) {
                <button type="button" class="g-btn" (click)="startFrom(s)">{{ title(s) }}</button>
              }
            </section>
          }

          <app-star-editor [draft]="draft()" (edit)="edit($event.part, $event.text)" />

          <section class="panel follow">
            <h2><ion-icon name="chatbubbles-outline" aria-hidden="true" />Then they ask</h2>
            <ul>
              @for (f of q.followUps; track f) {
                <li>{{ f }}</li>
              }
            </ul>
          </section>

          <app-ai-interview-entry [problemId]="q.id" />

          @if (next(); as n) {
            <a class="g-btn next" [routerLink]="['/behavioral/question', n.id]"
              >Next question<ion-icon name="arrow-forward" aria-hidden="true"
            /></a>
          }
        </div>
      }
    </ion-content>
  `,
  styles: `
    h1 {
      font-size: clamp(1.25rem, 4vw, 1.625rem);
      line-height: 1.35;
      margin: 4px 0 10px;
    }
    .probes {
      display: flex;
      gap: 8px;
      font-size: 0.90625rem;
      line-height: 1.5;
      margin: 0 0 18px;
      ion-icon {
        flex: none;
        margin-top: 3px;
        color: var(--g-accent);
      }
    }
    .worked {
      padding: 12px 16px;
      margin: 0 0 16px;
      summary {
        cursor: pointer;
        font-weight: 600;
        font-size: 0.9375rem;
        line-height: 1.45;
      }
      &[open] summary {
        margin-bottom: 12px;
      }
    }
    .starters {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px;
      margin: 0 0 16px;
      p {
        margin: 0;
        font-size: 0.90625rem;
        flex-basis: 100%;
      }
    }
    .follow {
      padding: 16px;
      margin: 18px 0 16px;
      h2 {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 1rem;
        margin: 0 0 10px;
        ion-icon {
          color: var(--g-accent);
        }
      }
      ul {
        margin: 0;
        padding-left: 18px;
      }
      li {
        line-height: 1.6;
        margin-bottom: 4px;
        font-size: 0.90625rem;
      }
    }
    .next {
      text-decoration: none;
    }
  `,
})
export class StarPracticePage {
  readonly id = input.required<string>();
  private readonly drafts = inject(StarDraftsService);
  private readonly bank = inject(StoryBankService);
  readonly title = storyTitle;
  readonly draft = signal<StarDraft>({ ...EMPTY_STAR_DRAFT });
  private readonly loadedFor = signal<string | null>(null);

  readonly question = computed(() => QUESTIONS.find((q) => q.id === this.id()));
  readonly competency = computed(() => getCompetencySummary(this.question()?.competencyId ?? ''));
  private readonly siblings = computed(() => QUESTIONS.filter((q) => q.competencyId === this.question()?.competencyId));
  readonly number = computed(() => this.siblings().findIndex((q) => q.id === this.id()) + 1);
  readonly total = computed(() => this.siblings().length);
  readonly next = computed(() => QUESTIONS[QUESTIONS.findIndex((q) => q.id === this.id()) + 1]);
  readonly backHref = computed(() => (this.competency() ? `/behavioral/${this.competency()!.id}` : '/behavioral'));
  readonly worked = computed(() => {
    const strong = examplesFor(this.question()?.competencyId ?? '')?.strong ?? [];
    const example = strong.find((s) => s.questionId === this.id()) ?? strong.find((s) => s.level === 'mid');
    const prompt = QUESTIONS.find((q) => q.id === example?.questionId)?.prompt;
    return example && prompt ? { example, prompt } : null;
  });

  readonly starters = computed(() =>
    this.loadedFor() && isEmptyDraft(this.draft()) ? this.bank.tagged(this.question()?.competencyId ?? '') : [],
  );

  constructor() {
    addIcons({ eyeOutline, chatbubblesOutline, arrowForward });
    effect(() => {
      const id = this.id();
      untracked(() => {
        this.loadedFor.set(null);
        this.draft.set({ ...EMPTY_STAR_DRAFT });
        void this.drafts.get(id).then((draft) => {
          if (this.id() !== id) return;
          this.draft.set(draft);
          this.loadedFor.set(id);
        });
      });
    });
  }

  ionViewWillEnter() {
    void this.bank.load();
  }

  startFrom(story: Story) {
    this.draft.set({ ...story.draft });
    const id = this.loadedFor();
    if (id) void this.drafts.save(id, this.draft());
  }

  edit(part: StarPart, text: string) {
    this.draft.update((draft) => ({ ...draft, [part]: text }));
    const id = this.loadedFor();
    if (id) void this.drafts.save(id, this.draft());
  }
}
