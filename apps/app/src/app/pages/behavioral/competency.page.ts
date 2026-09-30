import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IonBackButton, IonButtons, IonContent, IonHeader, IonIcon, IonTitle, IonToolbar } from '@ionic/angular';
import { examplesFor, getCompetency, getCompetencySummary, type Seniority } from '@grasp/engine';
import { addIcons } from 'ionicons';
import {
  alertCircleOutline,
  checkmarkCircle,
  checkmarkCircleOutline,
  chevronForward,
  ribbonOutline,
  searchOutline,
  sparklesOutline,
} from 'ionicons/icons';
import { RovingSelectDirective } from '../../core/roving-select.directive';
import { AiInterviewEntryComponent } from './ai-interview-entry.component';
import { ExampleAnswerComponent } from './example-answer.component';
import { SpotFlawsComponent } from './spot-flaws.component';
import { StarDraftsService } from './star-drafts.service';

const LEVELS: { level: Seniority; label: string }[] = [
  { level: 'early', label: 'Early career' },
  { level: 'mid', label: 'Mid-level' },
  { level: 'senior', label: 'Senior' },
];

@Component({
  selector: 'app-competency',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    RovingSelectDirective,
    IonHeader,
    IonToolbar,
    IonButtons,
    IonBackButton,
    IonTitle,
    IonContent,
    IonIcon,
    AiInterviewEntryComponent,
    ExampleAnswerComponent,
    SpotFlawsComponent,
  ],
  template: `
    <ion-header [translucent]="true">
      <ion-toolbar>
        <ion-buttons slot="start"><ion-back-button defaultHref="/behavioral" text="" /></ion-buttons>
        <ion-title>{{ summary()?.name }}</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content [fullscreen]="true">
      @if (competency(); as c) {
        <div class="page narrow">
          <p class="eyebrow">Behavioral competency</p>
          <h1>{{ summary()?.name }}</h1>
          <p class="lead">{{ c.why }}</p>

          <section class="panel block">
            <h2><ion-icon name="ribbon-outline" aria-hidden="true" />What a strong answer shows</h2>
            <ul>
              @for (s of c.strongSignals; track s) {
                <li>{{ s }}</li>
              }
            </ul>
          </section>
          <section class="panel block">
            <h2><ion-icon name="alert-circle-outline" aria-hidden="true" />What sinks it</h2>
            <ul>
              @for (s of c.redFlags; track s) {
                <li>{{ s }}</li>
              }
            </ul>
          </section>

          @if (examples(); as e) {
            <section class="panel block example" id="example">
              <h2><ion-icon name="sparkles-outline" aria-hidden="true" />See it done</h2>
              <div class="levels" role="radiogroup" aria-label="Career stage">
                @for (l of levels; track l.level) {
                  <button
                    class="g-btn"
                    role="radio"
                    [attr.aria-checked]="level() === l.level"
                    [class.primary]="level() === l.level"
                    (click)="level.set(l.level)"
                  >
                    {{ l.label }}
                  </button>
                }
              </div>
              @if (strong(); as s) {
                <p class="asked">"{{ prompt(s.questionId) }}"</p>
                <app-example-answer [answer]="s" [notes]="s.notes" />
              }
            </section>
            @for (w of e.weak; track w.questionId) {
              <section class="panel block example">
                <h2>
                  <ion-icon name="search-outline" aria-hidden="true" />Spot the problems{{
                    e.weak.length > 1 ? ' (' + ($index + 1) + ' of ' + e.weak.length + ')' : ''
                  }}
                </h2>
                <p class="asked">"{{ prompt(w.questionId) }}"</p>
                <app-spot-flaws [example]="w" />
              </section>
            }
          }

          <app-ai-interview-entry [problemId]="c.id" />

          <h2 class="list-title">Questions to practice</h2>
          <ul class="questions">
            @for (q of c.questions; track q.id) {
              @let drafted = drafts.isDrafted(q.id);
              <li>
                <a class="panel item" [routerLink]="['/behavioral/question', q.id]">
                  <ion-icon
                    class="state"
                    [class.done]="drafted"
                    [name]="drafted ? 'checkmark-circle' : 'checkmark-circle-outline'"
                    [attr.aria-label]="drafted ? 'Drafted' : 'Not drafted yet'"
                    role="img"
                  />
                  <span class="prompt">{{ q.prompt }}</span>
                  <ion-icon name="chevron-forward" aria-hidden="true" />
                </a>
              </li>
            }
          </ul>
        </div>
      }
    </ion-content>
  `,
  styles: `
    h1 {
      font-size: clamp(1.625rem, 5vw, 2.25rem);
      margin: 4px 0 8px;
    }
    .lead {
      font-size: 1.0625rem;
      line-height: 1.55;
      margin: 0 0 18px;
    }
    .block {
      padding: 16px;
      margin-bottom: 12px;
    }
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
    .levels {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-bottom: 12px;
    }
    .asked {
      font-style: italic;
      line-height: 1.5;
      margin: 0 0 12px;
    }
    .list-title {
      margin-top: 20px;
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
    .questions {
      list-style: none;
      padding: 0;
      display: grid;
      gap: 8px;
      li {
        margin: 0;
      }
    }
    .item {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 14px 16px;
      color: inherit;
      text-decoration: none;
      > ion-icon {
        flex: none;
        color: var(--g-muted);
      }
      .state.done {
        color: var(--g-found-ink);
      }
    }
    .prompt {
      flex: 1;
      min-width: 0;
      line-height: 1.45;
    }
  `,
})
export class CompetencyPage {
  readonly id = input.required<string>();
  readonly drafts = inject(StarDraftsService);
  readonly summary = computed(() => getCompetencySummary(this.id()));
  readonly competency = computed(() => getCompetency(this.id()));
  readonly examples = computed(() => examplesFor(this.id()));
  readonly levels = LEVELS;
  readonly level = signal<Seniority>('mid');
  readonly strong = computed(() => this.examples()?.strong.find((s) => s.level === this.level()));

  constructor() {
    addIcons({
      ribbonOutline,
      alertCircleOutline,
      checkmarkCircle,
      checkmarkCircleOutline,
      chevronForward,
      sparklesOutline,
      searchOutline,
    });
  }

  prompt(questionId: string) {
    return this.competency()?.questions.find((q) => q.id === questionId)?.prompt ?? '';
  }

  ionViewWillEnter() {
    void this.drafts.load();
  }
}
