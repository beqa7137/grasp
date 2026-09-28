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
  viewChildren,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { Preferences } from '@capacitor/preferences';
import { IonBackButton, IonButtons, IonContent, IonHeader, IonIcon, IonTitle, IonToolbar } from '@ionic/angular';
import { CASE_CATALOG, getCaseStudy, getCaseSummary, type CaseStageKind } from '@grasp/engine';
import { addIcons } from 'ionicons';
import { alertCircleOutline, arrowForward, chatbubblesOutline } from 'ionicons/icons';
import { refocus } from '../../../core/focus';
import { CodeTextComponent } from '../../../viz/code-text.component';
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
          <blockquote class="question">{{ s.question }}</blockquote>
          <p class="muted lead">{{ s.summary }}</p>

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
                    [showNext]="i === reached()"
                    [nextLabel]="i + 1 < study.stages.length ? 'Next: ' + study.stages[i + 1].title : 'Finish the case'"
                    (next)="advance()"
                  />
                </li>
              }
            }
          </ol>

          @if (finished()) {
            <section class="panel block" #endEl>
              <h2 tabindex="-1"><ion-icon name="alert-circle-outline" aria-hidden="true" />What costs candidates this question</h2>
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
  readonly summary = computed(() => getCaseSummary(this.id()));
  readonly study = computed(() => getCaseStudy(this.id()));
  readonly reached = signal(0);
  readonly round = signal(0);
  readonly finished = computed(() => this.reached() >= (this.study()?.stages.length ?? Infinity));
  readonly nextCase = computed(() => CASE_CATALOG[CASE_CATALOG.findIndex((c) => c.id === this.id()) + 1]);
  private readonly stageEls = viewChildren<ElementRef<HTMLElement>>('stageEl');
  private readonly endEls = viewChildren<ElementRef<HTMLElement>>('endEl');
  private readonly injector = inject(Injector);

  constructor() {
    addIcons({ alertCircleOutline, arrowForward, chatbubblesOutline });
    effect(() => {
      const key = this.storageKey();
      untracked(() => this.reached.set(0));
      void Preferences.get({ key }).then(({ value }) => {
        const saved = Number(value);
        if (key === this.storageKey() && Number.isInteger(saved) && saved > 0) this.reached.set(saved);
      });
    });
  }

  private storageKey() {
    return `grasp.case.${this.id()}`;
  }

  advance() {
    this.reached.update((r) => r + 1);
    void Preferences.set({ key: this.storageKey(), value: String(this.reached()) });
    this.focusCurrent();
  }

  restart() {
    this.reached.set(0);
    this.round.update((r) => r + 1);
    void Preferences.remove({ key: this.storageKey() });
    this.focusCurrent(true);
  }

  /** Moves focus to the stage (or closing section) just opened; a restart also scrolls back up to it after a tap. */
  private focusCurrent(always = false) {
    afterNextRender(
      () => {
        const target = (this.finished() ? this.endEls()[0] : this.stageEls()[this.reached()])?.nativeElement;
        const reveal = () => target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        if (always) reveal();
        refocus(target?.querySelector('h2'), null, reveal);
      },
      { injector: this.injector },
    );
  }
}
