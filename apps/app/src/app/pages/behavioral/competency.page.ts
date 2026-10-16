import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, input, linkedSignal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IonButtons, IonContent, IonHeader, IonIcon, IonTitle, IonToolbar } from '@ionic/angular';
import { SENIORITY_LEVELS, currentTarget, examplesFor, getCompetency, getCompetencySummary, type Seniority } from '@grasp/engine';
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
import { motionScroll } from '../../core/motion';
import { ProgressService } from '../../core/progress.service';
import { RovingSelectDirective } from '../../core/roving-select.directive';
import { AiInterviewEntryComponent } from './ai-interview-entry.component';
import { ExampleAnswerComponent } from './example-answer.component';
import { SpotFlawsComponent } from './spot-flaws.component';
import { StarDraftsService } from './star-drafts.service';
import { BackComponent } from '../../ui/back.component';
import { SectionComponent } from '../../ui/section.component';

type Part = 'questions' | 'guide' | 'examples';
/** Room between the jump row and the heading it scrolled to. */
const JUMP_GAP = 12;

/**
 * A competency (REDESIGN.md 4.8): its questions first, then the guide and the worked examples, with a jump row that
 * stays in view. What interviewers look for and the worked answer both start at the Target's level.
 */
@Component({
  selector: 'app-competency',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    BackComponent,
    RouterLink,
    RovingSelectDirective,
    IonHeader,
    IonToolbar,
    IonButtons,
    IonTitle,
    IonContent,
    IonIcon,
    AiInterviewEntryComponent,
    ExampleAnswerComponent,
    SectionComponent,
    SpotFlawsComponent,
  ],
  template: `
    <ion-header [translucent]="true">
      <ion-toolbar>
        <ion-buttons slot="start"><app-back href="/behavioral" /></ion-buttons>
        <ion-title>{{ summary()?.name }}</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content [fullscreen]="true">
      @if (competency(); as c) {
        <div class="page narrow">
          <p class="eyebrow">Behavioral competency</p>
          <h1>{{ summary()?.name }}</h1>
          <p class="lead">{{ summary()?.oneLiner }}</p>
          @if (lookFor(); as line) {
            <p class="at-level">
              <strong>At your level ({{ targetLabel() }}{{ assumed() ? ', assumed' : '' }}):</strong> {{ line }}
            </p>
          }

          <nav class="jump" aria-label="On this page">
            <button type="button" class="g-btn ghost" (click)="jump('questions')">Questions ({{ c.questions.length }})</button>
            <button type="button" class="g-btn ghost" (click)="jump('guide')">Guide</button>
            @if (examples()) {
              <button type="button" class="g-btn ghost" (click)="jump('examples')">Examples</button>
            }
          </nav>

          <section class="part" id="questions" aria-labelledby="questions-head">
            <h2 id="questions-head" tabindex="-1">Questions to practice</h2>
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
          </section>

          <section class="part" id="guide" aria-labelledby="guide-head">
            <h2 id="guide-head" tabindex="-1">Guide</h2>
            <p class="why">{{ c.why }}</p>
            <g-section heading="What a strong answer shows" [icon]="icons.strong" tone="success">
              <ul>
                @for (s of c.strongSignals; track s) {
                  <li>{{ s }}</li>
                }
              </ul>
            </g-section>
            <g-section heading="What sinks it" [icon]="icons.sinks" tone="danger">
              <ul>
                @for (s of c.redFlags; track s) {
                  <li>{{ s }}</li>
                }
              </ul>
            </g-section>
          </section>

          @if (examples(); as e) {
            <section class="part" id="examples" aria-labelledby="examples-head">
              <div class="panel block example" id="example">
                <h2 id="examples-head" tabindex="-1"><ion-icon name="sparkles-outline" aria-hidden="true" />See it done</h2>
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
              </div>
              @for (w of e.weak; track w.questionId) {
                <div class="panel block example">
                  <h2>
                    <ion-icon name="search-outline" aria-hidden="true" />Spot the problems{{
                      e.weak.length > 1 ? ' (' + ($index + 1) + ' of ' + e.weak.length + ')' : ''
                    }}
                  </h2>
                  <p class="asked">"{{ prompt(w.questionId) }}"</p>
                  <app-spot-flaws [example]="w" />
                </div>
              }
            </section>
          }

          <app-ai-interview-entry [problemId]="c.id" />
        </div>
      }
    </ion-content>
  `,
  styles: `
    @use '../../../type' as *;

    h1 {
      font-size: var(--g-text-display-l);
      margin: var(--g-space-1) 0 var(--g-space-1);
    }
    .lead {
      margin: 0 0 var(--g-space-3);
      color: var(--g-muted);
      line-height: 1.5;
    }
    .at-level {
      margin: 0 0 var(--g-space-3);
      padding-left: var(--g-space-3);
      border-left: 3px solid var(--g-accent);
      font-size: var(--g-text-body-s);
      line-height: 1.5;
    }
    /* Stays under the toolbar while the page scrolls, so any part is one tap away. Top 0 is the toolbar's edge: the scroller
       is padded by the header's height in a fullscreen ion-content. */
    .jump {
      position: sticky;
      top: 0;
      z-index: 1;
      display: flex;
      flex-wrap: wrap;
      gap: var(--g-space-1);
      margin: 0 calc(-1 * var(--g-space-4)) var(--g-space-3);
      padding: var(--g-space-1) var(--g-space-4);
      background: var(--g-bg);
      border-bottom: 1px solid var(--g-line);
    }
    .part {
      margin-bottom: var(--g-space-5);
    }
    h2 {
      @include title;
      display: flex;
      align-items: center;
      gap: var(--g-space-2);
      font-size: var(--g-text-title-m);
      margin: 0 0 var(--g-space-2);
      ion-icon {
        color: var(--g-accent);
      }
    }
    .why {
      margin: 0 0 var(--g-space-3);
      line-height: 1.55;
    }
    .block {
      padding: var(--g-space-4);
      margin-bottom: var(--g-space-3);
    }
    .levels {
      display: flex;
      flex-wrap: wrap;
      gap: var(--g-space-2);
      margin-bottom: var(--g-space-3);
    }
    .asked {
      font-style: italic;
      line-height: 1.5;
      margin: 0 0 var(--g-space-3);
    }
    ul {
      margin: 0 0 var(--g-space-2);
      padding-left: var(--g-space-5);
    }
    li {
      line-height: 1.6;
      margin-bottom: var(--g-space-1);
      font-size: var(--g-text-body-s);
    }
    .questions {
      list-style: none;
      padding: 0;
      display: grid;
      gap: var(--g-space-2);
      li {
        margin: 0;
        font-size: inherit;
      }
    }
    .item {
      display: flex;
      align-items: center;
      gap: var(--g-space-3);
      padding: var(--g-space-3) var(--g-space-4);
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
  private readonly progress = inject(ProgressService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  readonly summary = computed(() => getCompetencySummary(this.id()));
  readonly competency = computed(() => getCompetency(this.id()));
  readonly examples = computed(() => examplesFor(this.id()));
  readonly levels = SENIORITY_LEVELS;
  readonly icons = { strong: ribbonOutline, sinks: alertCircleOutline };
  // Strings, not an object: a new object on every change of progress would reset the level the learner picked below.
  readonly targetLevel = computed(() => currentTarget(this.progress.state()).target.level);
  readonly assumed = computed(() => currentTarget(this.progress.state()).source === 'assumed');
  readonly targetLabel = computed(() => SENIORITY_LEVELS.find((l) => l.level === this.targetLevel())!.label);
  /** The Target's level until the learner picks another for this view, which never writes the Target (REDESIGN.md 2.1). */
  readonly level = linkedSignal<Seniority>(() => this.targetLevel());
  readonly strong = computed(() => this.examples()?.strong.find((s) => s.level === this.level()));
  readonly lookFor = computed(() => this.examples()?.strong.find((s) => s.level === this.targetLevel())?.lookFor);

  constructor() {
    addIcons({
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

  /** Scrolls the part's heading to just under the jump row, which sticks at the top of the scroller's padding (the toolbar). */
  jump(part: Part) {
    const heading = this.host.nativeElement.querySelector<HTMLElement>(`#${part}-head`);
    const row = this.host.nativeElement.querySelector<HTMLElement>('.jump');
    if (!heading) return;
    // The row's height changes as it wraps, so the margin is measured on each jump.
    heading.style.scrollMarginTop = `${(row?.offsetHeight ?? 0) + JUMP_GAP}px`;
    heading.scrollIntoView({ behavior: motionScroll(), block: 'start' });
    heading.focus({ preventScroll: true });
  }

  ionViewWillEnter() {
    void this.drafts.load();
  }
}
