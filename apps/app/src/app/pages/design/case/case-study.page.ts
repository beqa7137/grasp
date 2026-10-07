import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
  viewChild,
  viewChildren,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { IonBackButton, IonButtons, IonContent, IonHeader, IonIcon, IonTitle, IonToolbar } from '@ionic/angular';
import {
  CASE_CATALOG,
  caseOutcome,
  stageAnswered,
  getCaseBrief,
  getCaseStudy,
  getCaseSummary,
  type CaseStageAnswer,
  type CaseStageKind,
} from '@grasp/engine';
import { addIcons } from 'ionicons';
import { alertCircleOutline, arrowForward, chatbubblesOutline, checkmarkCircle } from 'ionicons/icons';
import { refocus } from '../../../core/focus';
import { ProgressService } from '../../../core/progress.service';
import { CodeTextComponent } from '../../../viz/code-text.component';
import { CaseDraftsService, newCaseDraft, type CaseDraft } from './case-drafts.service';
import { CaseStageComponent } from './case-stage.component';

const KIND_LABELS: Record<CaseStageKind, string> = {
  requirements: 'Requirements',
  estimation: 'Estimation',
  api: 'API',
  data: 'Data model',
  design: 'High-level design',
  'deep-dive': 'Deep dive',
  'wrap-up': 'Wrap-up',
};

/** A classic interview question worked stage by stage, in the order a strong candidate would run the interview. */
@Component({
  selector: 'app-case-study',
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
    CodeTextComponent,
    CaseStageComponent,
  ],
  template: `
    <ion-header [translucent]="true">
      <ion-toolbar>
        <ion-buttons slot="start"><ion-back-button defaultHref="/design" text="" /></ion-buttons>
        <ion-title>{{ summary()?.title }}</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content [fullscreen]="true">
      @if (study(); as study) {
        @let s = summary()!;
        <div class="page narrow">
          <p class="eyebrow">System design case study</p>
          <h1>{{ s.title }}</h1>
          @if (brief(); as b) {
            <blockquote class="question">{{ b.question }}</blockquote>
            <p class="muted lead">{{ b.summary }}</p>
          }

          @if (loaded()) {
            <ol class="stages">
              @for (stage of study.stages; track round() + ':' + $index; let i = $index) {
                @if (i <= reached()) {
                  <li class="panel stage" #stageEl>
                    <h2 tabindex="-1">
                      <span class="num">{{ i + 1 }}</span>
                      <span class="title">{{ stage.title }}</span>
                      <span class="kind">{{ kinds[stage.kind] }}</span>
                    </h2>
                    <app-case-stage
                      [stage]="stage"
                      [caseId]="s.id"
                      [orderSeed]="s.id + ':' + draft().attempt + ':' + i"
                      [answer]="draft().stages[i] ?? unanswered"
                      (answerChange)="answer(i, $event)"
                      [showNext]="i === reached()"
                      [nextLabel]="i + 1 < study.stages.length ? 'Next: ' + study.stages[i + 1].title : 'Finish the case'"
                      (next)="advance()"
                    />
                  </li>
                }
              }
            </ol>
          }

          @if (finished()) {
            <div class="outcome" tabindex="-1" #outcomeEl>
              @if (outcome(); as o) {
                <ion-icon name="checkmark-circle" aria-hidden="true" />
                <p>
                  Case finished. Decisions as recommended: {{ o.bestChoices }} of {{ o.decisions }}. Estimates within 2x:
                  {{ o.closeEstimates }} of {{ o.estimates }}. Its topics are now in your reviews.
                </p>
              } @else {
                <p class="muted">
                  Answer the decisions and estimates still open above to finish the case and add its topics to your reviews.
                </p>
                @if (firstOpen() >= 0) {
                  <button class="g-btn" (click)="goToStage(firstOpen())">
                    Go to stage {{ firstOpen() + 1 }}: {{ study.stages[firstOpen()].title }}
                  </button>
                }
              }
            </div>
            <section class="panel block">
              <h2><ion-icon name="alert-circle-outline" aria-hidden="true" />What costs candidates this question</h2>
              <ul>
                @for (p of study.pitfalls; track p) {
                  <li><g-code-text [text]="p" /></li>
                }
              </ul>
            </section>
            <section class="panel block">
              <h2><ion-icon name="chatbubbles-outline" aria-hidden="true" />Follow-up questions</h2>
              @for (f of study.followUps; track f.question) {
                <details>
                  <summary>{{ f.question }}</summary>
                  <p><g-code-text [text]="f.answer" /></p>
                </details>
              }
            </section>
            <div class="end">
              <button class="g-btn ghost" (click)="restart()">Start over</button>
              @if (nextCase(); as n) {
                <a class="g-btn primary" [routerLink]="['/design/case', n.id]"
                  >Next case: {{ n.title }}<ion-icon name="arrow-forward" aria-hidden="true"
                /></a>
              }
            </div>
          }
        </div>
      }
    </ion-content>
  `,
  styles: `
    ion-content::part(scroll) {
      scroll-behavior: smooth;
    }
    h1 {
      font-size: clamp(1.625rem, 5vw, 2.25rem);
      margin: 4px 0 10px;
    }
    .question {
      margin: 0 0 10px;
      padding: 10px 14px;
      border-left: 3px solid var(--g-accent);
      background: var(--g-accent-soft);
      border-radius: 0 var(--g-radius-sm) var(--g-radius-sm) 0;
      font-size: 1.0625rem;
      line-height: 1.5;
    }
    .lead {
      line-height: 1.55;
      margin: 0 0 18px;
    }
    .stages {
      list-style: none;
      margin: 0;
      padding: 0;
      display: grid;
      gap: 12px;
    }
    .stage,
    .block {
      padding: 16px;
    }
    .block {
      margin-top: 12px;
    }
    h2 {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 8px;
      font-size: 1.0625rem;
      margin: 0 0 10px;
      outline: none;
      ion-icon {
        color: var(--g-accent);
      }
    }
    .num {
      display: grid;
      place-items: center;
      width: 1.75em;
      height: 1.75em;
      border-radius: 50%;
      background: var(--g-accent-soft);
      color: var(--g-accent);
      font-size: 0.875rem;
      font-variant-numeric: tabular-nums;
    }
    .title {
      flex: 1;
      min-width: 0;
    }
    .kind {
      font-size: 0.75rem;
      font-weight: 500;
      color: var(--g-muted);
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    ul {
      margin: 0;
      padding-left: 18px;
    }
    li {
      line-height: 1.6;
      margin-bottom: 4px;
    }
    details {
      border-top: 1px solid var(--g-line);
      padding: 10px 0;
      &:last-child {
        padding-bottom: 0;
      }
    }
    summary {
      cursor: pointer;
      font-weight: 600;
      line-height: 1.45;
    }
    details p {
      margin: 8px 0 0;
      line-height: 1.55;
    }
    .outcome {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      align-items: flex-start;
      margin: 12px 0 0;
      line-height: 1.5;
      outline: none;
      p {
        flex: 1 1 0;
        min-width: 12em;
        margin: 0;
      }
      ion-icon {
        flex: none;
        margin-top: 0.15em;
        font-size: 1.125rem;
        color: var(--g-found);
      }
    }
    .end {
      display: flex;
      flex-wrap: wrap;
      justify-content: space-between;
      gap: 8px;
      margin-top: 16px;
      a {
        text-decoration: none;
      }
    }
  `,
})
export class CaseStudyPage {
  readonly id = input.required<string>();
  readonly kinds = KIND_LABELS;
  readonly unanswered: CaseStageAnswer = {};
  readonly summary = computed(() => getCaseSummary(this.id()));
  readonly brief = computed(() => getCaseBrief(this.id()));
  readonly study = computed(() => getCaseStudy(this.id()));
  readonly draft = signal<CaseDraft>(newCaseDraft());
  /** Stages wait for the saved draft, so its option order is the first one shown and an early tap cannot replace it. */
  readonly loaded = signal(false);
  readonly reached = computed(() => this.draft().reached);
  readonly round = signal(0);
  readonly finished = computed(() => this.reached() >= (this.study()?.stages.length ?? Infinity));
  readonly outcome = computed(() => {
    const study = this.study();
    return study && this.finished() ? caseOutcome(study, this.draft().stages) : null;
  });
  readonly firstOpen = computed(() => {
    const stages = this.study()?.stages ?? [];
    return stages.findIndex((stage, i) => !stageAnswered(stage, this.draft().stages[i]));
  });
  readonly nextCase = computed(() => CASE_CATALOG[CASE_CATALOG.findIndex((c) => c.id === this.id()) + 1]);
  private readonly drafts = inject(CaseDraftsService);
  private readonly progress = inject(ProgressService);
  private readonly stageEls = viewChildren<ElementRef<HTMLElement>>('stageEl');
  private readonly outcomeEl = viewChild<ElementRef<HTMLElement>>('outcomeEl');
  private startOver = inject(Router).currentNavigation()?.extras.state?.['startOver'] === true;
  private readonly injector = inject(Injector);

  constructor() {
    addIcons({ alertCircleOutline, arrowForward, chatbubblesOutline, checkmarkCircle });
    effect(() => {
      const id = this.id();
      this.progress.cleared();
      const fresh = newCaseDraft();
      untracked(() => {
        this.draft.set(fresh);
        this.loaded.set(this.startOver);
      });
      if (this.startOver) {
        this.startOver = false;
        untracked(() => this.restart());
        return;
      }
      void this.drafts
        .get(id)
        .catch(() => null)
        .then((saved) => {
          if (id !== this.id() || this.draft() !== fresh) return;
          if (saved) this.draft.set(saved);
          this.loaded.set(true);
        });
    });
    // Recording follows the outcome rather than the tap, so a run whose draft was saved but whose event was not is
    // recorded on its next load; the id per run keeps that idempotent.
    effect(() => {
      const outcome = this.outcome();
      const topics = this.summary()?.topics;
      if (!outcome || !topics) return;
      const { attempt } = this.draft();
      const caseId = this.id();
      untracked(
        () =>
          void this.progress.record({ id: `case-${caseId}-${attempt}`, type: 'case.completed', caseId, topics: [...topics], ...outcome }),
      );
    });
  }

  answer(index: number, answer: CaseStageAnswer) {
    const { stages } = this.draft();
    const length = Math.max(stages.length, index + 1);
    this.save({ ...this.draft(), stages: Array.from({ length }, (_, i) => (i === index ? answer : (stages[i] ?? {}))) });
  }

  advance() {
    this.save({ ...this.draft(), reached: this.reached() + 1 });
    this.focusCurrent();
  }

  restart() {
    this.draft.set(newCaseDraft());
    this.round.update((r) => r + 1);
    void this.drafts.remove(this.id());
    this.focusCurrent(true);
  }

  private save(draft: CaseDraft) {
    const id = this.id();
    this.draft.set(draft);
    void this.drafts.save(id, draft);
  }

  goToStage(index: number) {
    const stage = this.stageEls()[index]?.nativeElement;
    stage?.scrollIntoView({ block: 'start' });
    stage?.querySelector('h2')?.focus({ preventScroll: true });
  }

  /** Moves focus to the stage just opened, or to the outcome at the end; a restart also moves it there after a tap. */
  private focusCurrent(always = false) {
    afterNextRender(
      () => {
        const stage = this.finished() ? undefined : this.stageEls()[this.reached()]?.nativeElement;
        const target = stage ? stage.querySelector('h2') : this.outcomeEl()?.nativeElement;
        const reveal = () => (stage ?? target)?.scrollIntoView({ block: 'start' });
        if (!always) return refocus(target, null, reveal);
        reveal();
        target?.focus({ preventScroll: true });
      },
      { injector: this.injector },
    );
  }
}
