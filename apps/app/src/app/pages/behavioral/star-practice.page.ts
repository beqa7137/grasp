import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IonBackButton, IonButtons, IonContent, IonHeader, IonIcon, IonTitle, IonToolbar } from '@ionic/angular';
import { COMPETENCIES, countWords, examplesFor, getCompetencySummary, reviewStar, type StarDraft, type StarPart } from '@grasp/engine';
import { addIcons } from 'ionicons';
import { alertCircle, arrowForward, checkmarkCircle, chatbubblesOutline, eyeOutline } from 'ionicons/icons';
import { ExampleAnswerComponent } from './example-answer.component';
import { EMPTY_DRAFT, StarDraftsService } from './star-drafts.service';

const PARTS: readonly { part: StarPart; label: string; hint: string }[] = [
  { part: 'situation', label: 'Situation', hint: 'Where and when, in two sentences. Only what the story needs.' },
  { part: 'task', label: 'Task', hint: 'What you owned, and what made it hard.' },
  { part: 'action', label: 'Action', hint: 'What you did and why, step by step. Say "I".' },
  { part: 'result', label: 'Result', hint: 'What changed, with a number: time, errors, users, money, a date.' },
  { part: 'reflection', label: 'Reflection', hint: 'What you learned, or would do differently. One or two sentences.' },
];

const QUESTIONS = COMPETENCIES.flatMap((c) => c.questions);

@Component({
  selector: 'app-star-practice',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, IonHeader, IonToolbar, IonButtons, IonBackButton, IonTitle, IonContent, IonIcon, ExampleAnswerComponent],
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

          <div class="layout">
            <form class="star" (submit)="$event.preventDefault()">
              @for (p of parts; track p.part) {
                <label class="field">
                  <span class="label"
                    >{{ p.label }} <span class="count muted">{{ words()[p.part] }} words</span></span
                  >
                  <textarea
                    [attr.aria-label]="p.label"
                    [value]="draft()[p.part]"
                    (input)="edit(p.part, $any($event.target).value)"
                    [placeholder]="p.hint"
                    [rows]="p.part === 'action' ? 6 : 3"
                  ></textarea>
                </label>
              }
              <p class="saved muted">Saved on this device only.</p>
            </form>

            <aside class="panel checks" aria-label="Answer check">
              <p class="time">
                <span class="big">{{ spoken() }}</span>
                <span class="muted">to say aloud, aim for 1:30 to 3:00</span>
              </p>
              <p class="score">{{ passing() }} of {{ review().checks.length }} checks pass</p>
              <ul>
                @for (c of review().checks; track c.id) {
                  <li [class.ok]="c.ok">
                    <ion-icon [name]="c.ok ? 'checkmark-circle' : 'alert-circle'" [attr.aria-label]="c.ok ? 'Pass' : 'To fix'" role="img" />
                    <span>{{ c.message }}</span>
                  </li>
                }
              </ul>
            </aside>
          </div>

          <section class="panel follow">
            <h2><ion-icon name="chatbubbles-outline" aria-hidden="true" />Then they ask</h2>
            <ul>
              @for (f of q.followUps; track f) {
                <li>{{ f }}</li>
              }
            </ul>
          </section>

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
    .layout {
      display: grid;
      gap: 16px;
      align-items: start;
    }
    @media (min-width: 720px) {
      .layout {
        grid-template-columns: minmax(0, 1fr) 260px;
      }
      .checks {
        position: sticky;
        top: 12px;
      }
    }
    .star {
      display: grid;
      gap: 14px;
    }
    .field {
      display: grid;
      gap: 6px;
    }
    .label {
      display: flex;
      justify-content: space-between;
      gap: 8px;
      font-weight: 600;
      font-size: 0.9375rem;
    }
    .count {
      font-weight: 400;
      font-size: 0.8125rem;
    }
    textarea {
      width: 100%;
      resize: vertical;
      background: var(--g-surface);
      color: var(--g-text);
      border: 1px solid var(--g-stroke);
      border-radius: var(--g-radius-sm);
      padding: 12px;
      font: 0.9375rem/1.5 var(--ion-font-family);
    }
    .saved {
      font-size: 0.8125rem;
      margin: 0;
    }
    .checks {
      padding: 16px;
      ul {
        list-style: none;
        margin: 0;
        padding: 0;
        display: grid;
        gap: 10px;
      }
      li {
        display: flex;
        gap: 8px;
        font-size: 0.875rem;
        line-height: 1.45;
        ion-icon {
          flex: none;
          margin-top: 2px;
          color: var(--g-warn-ink);
        }
        &.ok ion-icon {
          color: var(--g-found-ink);
        }
      }
    }
    .time {
      display: grid;
      margin: 0 0 6px;
      .big {
        font-size: 1.75rem;
        font-weight: 700;
        font-variant-numeric: tabular-nums;
      }
      .muted {
        font-size: 0.8125rem;
      }
    }
    .score {
      font-weight: 600;
      font-size: 0.875rem;
      margin: 0 0 12px;
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
  readonly parts = PARTS;
  readonly draft = signal<StarDraft>({ ...EMPTY_DRAFT });
  private loadedFor: string | null = null;

  readonly question = computed(() => QUESTIONS.find((q) => q.id === this.id()));
  readonly competency = computed(() => getCompetencySummary(this.question()?.competencyId ?? ''));
  private readonly siblings = computed(() => QUESTIONS.filter((q) => q.competencyId === this.question()?.competencyId));
  readonly number = computed(() => this.siblings().findIndex((q) => q.id === this.id()) + 1);
  readonly total = computed(() => this.siblings().length);
  readonly next = computed(() => QUESTIONS[QUESTIONS.findIndex((q) => q.id === this.id()) + 1]);
  readonly backHref = computed(() => (this.competency() ? `/behavioral/${this.competency()!.id}` : '/behavioral'));
  readonly worked = computed(() => {
    const example = examplesFor(this.question()?.competencyId ?? '')?.strong;
    const prompt = QUESTIONS.find((q) => q.id === example?.questionId)?.prompt;
    return example && prompt ? { example, prompt } : null;
  });
  readonly review = computed(() => reviewStar(this.draft()));
  readonly passing = computed(() => this.review().checks.filter((c) => c.ok).length);
  readonly words = computed(() => {
    const draft = this.draft();
    return Object.fromEntries(PARTS.map(({ part }) => [part, countWords(draft[part])])) as Record<StarPart, number>;
  });
  readonly spoken = computed(() => {
    const seconds = this.review().seconds;
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  });

  constructor() {
    addIcons({ eyeOutline, checkmarkCircle, alertCircle, chatbubblesOutline, arrowForward });
    effect(() => {
      const id = this.id();
      untracked(() => {
        this.loadedFor = null;
        this.draft.set({ ...EMPTY_DRAFT });
        void this.drafts.get(id).then((draft) => {
          if (this.id() !== id) return;
          this.draft.set(draft);
          this.loadedFor = id;
        });
      });
    });
  }

  edit(part: StarPart, text: string) {
    this.draft.update((draft) => ({ ...draft, [part]: text }));
    if (this.loadedFor) void this.drafts.save(this.loadedFor, this.draft());
  }
}
