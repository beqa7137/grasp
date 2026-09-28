import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IonBackButton, IonButtons, IonContent, IonHeader, IonIcon, IonTitle, IonToolbar } from '@ionic/angular';
import { getAlgorithmSummary, getLesson, getPattern, itemsForTopic, problemsForPattern } from '@grasp/engine';
import { addIcons } from 'ionicons';
import {
  alertCircleOutline,
  chatbubblesOutline,
  codeSlashOutline,
  flashOutline,
  gitBranchOutline,
  playCircle,
  schoolOutline,
  searchOutline,
} from 'ionicons/icons';
import { ProgressService } from '../../core/progress.service';
import { CodePanelComponent } from '../../viz/code-panel.component';
import { CodeTextComponent } from '../../viz/code-text.component';
import { MasteryRingComponent } from '../../viz/mastery-ring.component';
import { WorkedExampleComponent } from './worked-example.component';

@Component({
  selector: 'app-pattern',
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
    CodePanelComponent,
    CodeTextComponent,
    MasteryRingComponent,
    WorkedExampleComponent,
  ],
  template: `
    <ion-header [translucent]="true">
      <ion-toolbar>
        <ion-buttons slot="start"><ion-back-button defaultHref="/learn" text="" /></ion-buttons>
        <ion-title>{{ pattern()?.name }}</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content [fullscreen]="true">
      @if (pattern(); as p) {
        @let m = progress.masteryOf(p.id);
        <div class="page narrow">
          <section class="head">
            <g-mastery-ring [value]="m?.mastery ?? 0" [size]="64" />
            <div>
              <p class="eyebrow">
                Pattern {{ p.order }} of 20 · <span class="complexity">{{ p.complexity }}</span>
              </p>
              <h1>{{ p.name }}</h1>
            </div>
          </section>
          <p class="one"><g-code-text [text]="p.oneLiner" /></p>

          <div class="actions">
            @for (a of algorithms(); track a.id) {
              <a class="g-btn primary" [routerLink]="['/visualize', a.id]"
                ><ion-icon name="play-circle" aria-hidden="true" />Visualize: {{ a.title }}</a
              >
            }
            <a class="g-btn" routerLink="/drill" [queryParams]="{ pattern: p.id }"
              ><ion-icon name="flash-outline" aria-hidden="true" />Practice {{ itemCount() }} items</a
            >
            @for (c of problems(); track c.id) {
              <a class="g-btn" [routerLink]="['/code', c.id]"
                ><ion-icon name="code-slash-outline" aria-hidden="true" />Code: {{ c.title }}</a
              >
            }
          </div>

          @if (lesson(); as l) {
            <section class="panel block">
              <h2><ion-icon name="school-outline" aria-hidden="true" />Why it works</h2>
              <p class="why"><g-code-text [text]="l.why" /></p>
            </section>
          }

          <section class="panel block">
            <h2><ion-icon name="search-outline" aria-hidden="true" />Cues: how you spot it</h2>
            <ul>
              @for (c of p.cues; track c) {
                <li><g-code-text [text]="c" /></li>
              }
            </ul>
          </section>

          <section class="panel block code">
            <h2>Template</h2>
            <g-code-panel [code]="p.template" label="Template" />
          </section>

          @if (lesson(); as l) {
            <h2 class="section-title">Worked examples</h2>
            @for (e of l.examples; track e.title) {
              <section class="panel block">
                <app-worked-example [example]="e" />
              </section>
            }

            <section class="panel block">
              <h2><ion-icon name="git-branch-outline" aria-hidden="true" />Variations</h2>
              <dl class="variations">
                @for (v of l.variations; track v.name) {
                  <dt>{{ v.name }}</dt>
                  <dd><g-code-text [text]="v.how" /></dd>
                }
              </dl>
            </section>
          }

          <section class="panel block">
            <h2><ion-icon name="alert-circle-outline" aria-hidden="true" />Pitfalls</h2>
            <ul>
              @for (c of p.pitfalls; track c) {
                <li><g-code-text [text]="c" /></li>
              }
            </ul>
          </section>

          @if (lesson(); as l) {
            <section class="panel block">
              <h2><ion-icon name="chatbubbles-outline" aria-hidden="true" />What interviewers ask next</h2>
              @for (f of l.followUps; track f.question) {
                <details class="follow-up">
                  <summary><g-code-text [text]="f.question" /></summary>
                  <p><g-code-text [text]="f.answer" /></p>
                </details>
              }
            </section>
          }

          @if (m) {
            <p class="muted foot">
              {{ m.itemsSeen }}/{{ m.itemsTotal }} review items in rotation
              @if (m.predictionAccuracy !== null) {
                · {{ (m.predictionAccuracy * 100).toFixed(0) }}% prediction accuracy
              }
            </p>
          }
        </div>
      }
    </ion-content>
  `,
  styles: `
    .head {
      display: flex;
      align-items: center;
      gap: 16px;
      margin-top: 8px;
      > div {
        min-width: 0;
      }
    }
    h1 {
      font-size: clamp(1.625rem, 5vw, 2.25rem);
      margin: 4px 0 0;
    }
    /* Uppercase would change the notation: O(log n) is not O(LOG N). */
    .complexity {
      text-transform: none;
    }
    .one {
      font-size: 1.0625rem;
      line-height: 1.55;
      margin: 16px 0 18px;
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-bottom: 20px;
      a {
        text-decoration: none;
      }
    }
    .block {
      padding: 16px;
      margin-bottom: 12px;
    }
    .block.code {
      padding: 16px 0 6px;
      h2 {
        padding: 0 16px;
      }
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
    ul {
      margin: 0;
      padding-left: 18px;
    }
    li {
      line-height: 1.6;
      margin-bottom: 4px;
      font-size: 0.90625rem;
    }
    .why {
      margin: 0;
      line-height: 1.6;
      font-size: 0.9375rem;
    }
    .section-title {
      margin: 20px 0 10px;
    }
    .variations {
      margin: 0;
      display: grid;
      gap: 4px;
      dt {
        font-weight: 600;
        font-size: 0.90625rem;
        margin-top: 6px;
      }
      dd {
        margin: 0;
        line-height: 1.55;
        font-size: 0.90625rem;
      }
    }
    .follow-up {
      border-top: 1px solid var(--g-line);
      padding: 10px 0;
      &:first-of-type {
        border-top: 0;
        padding-top: 0;
      }
      summary {
        cursor: pointer;
        font-weight: 600;
        font-size: 0.90625rem;
        line-height: 1.5;
      }
      p {
        margin: 8px 0 0;
        line-height: 1.55;
        font-size: 0.90625rem;
      }
    }
    .foot {
      font-size: 0.8125rem;
    }
  `,
})
export class PatternPage {
  readonly id = input.required<string>();
  readonly progress = inject(ProgressService);
  readonly pattern = computed(() => getPattern(this.id()));
  readonly problems = computed(() => problemsForPattern(this.id()));
  readonly lesson = computed(() => getLesson(this.id()));
  readonly algorithms = computed(() => (this.pattern()?.algorithmIds ?? []).map((id) => getAlgorithmSummary(id)!).filter(Boolean));
  readonly itemCount = computed(() => itemsForTopic(this.id()).length);

  constructor() {
    addIcons({
      playCircle,
      flashOutline,
      searchOutline,
      alertCircleOutline,
      codeSlashOutline,
      schoolOutline,
      gitBranchOutline,
      chatbubblesOutline,
    });
  }
}
