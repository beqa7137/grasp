import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IonBackButton, IonButtons, IonContent, IonHeader, IonIcon, IonTitle, IonToolbar } from '@ionic/angular';
import { CASE_CATALOG, getScenarioSummary, getSdLesson, getSdTopic, itemsForTopic } from '@grasp/engine';
import { addIcons } from 'ionicons';
import {
  alertCircleOutline,
  bulbOutline,
  chatbubblesOutline,
  constructOutline,
  documentTextOutline,
  flashOutline,
  handLeftOutline,
  schoolOutline,
} from 'ionicons/icons';
import { ProgressService } from '../../core/progress.service';
import { CodeTextComponent } from '../../viz/code-text.component';
import { MasteryRingComponent } from '../../viz/mastery-ring.component';
import { QuickCheckComponent } from '../pattern/quick-check.component';
import { WorkedExampleComponent } from '../pattern/worked-example.component';
import { AvailabilityWidgetComponent } from './availability-widget.component';
import { BudgetWidgetComponent } from './budget-widget.component';
import { CacheWidgetComponent } from './cache-widget.component';
import { CdnWidgetComponent } from './cdn-widget.component';
import { CrackWidgetComponent } from './crack-widget.component';
import { EstimateDrillComponent } from './estimate-drill.component';
import { IdLayoutWidgetComponent } from './id-layout-widget.component';
import { IndexWidgetComponent } from './index-widget.component';
import { LatencyWidgetComponent } from './latency-widget.component';
import { LimiterWidgetComponent } from './limiter-widget.component';
import { PaginationWidgetComponent } from './pagination-widget.component';
import { PartitionWidgetComponent } from './partition-widget.component';
import { PipelineWidgetComponent } from './pipeline-widget.component';
import { QueueWidgetComponent } from './queue-widget.component';
import { QuorumWidgetComponent } from './quorum-widget.component';
import { RegionWidgetComponent } from './region-widget.component';
import { ReplicaWidgetComponent } from './replica-widget.component';
import { RingWidgetComponent } from './ring-widget.component';
import { StorageWidgetComponent } from './storage-widget.component';
import { StreamWidgetComponent } from './stream-widget.component';

/** A system design topic taught hands-on: a widget to experiment with, the ideas to name, worked examples and a quick check. */
@Component({
  selector: 'app-design-lesson',
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
    MasteryRingComponent,
    WorkedExampleComponent,
    QuickCheckComponent,
    LatencyWidgetComponent,
    CacheWidgetComponent,
    RingWidgetComponent,
    QueueWidgetComponent,
    ReplicaWidgetComponent,
    LimiterWidgetComponent,
    AvailabilityWidgetComponent,
    PipelineWidgetComponent,
    QuorumWidgetComponent,
    PartitionWidgetComponent,
    IdLayoutWidgetComponent,
    IndexWidgetComponent,
    StreamWidgetComponent,
    StorageWidgetComponent,
    CdnWidgetComponent,
    RegionWidgetComponent,
    BudgetWidgetComponent,
    PaginationWidgetComponent,
    CrackWidgetComponent,
    EstimateDrillComponent,
  ],
  template: `
    <ion-header [translucent]="true">
      <ion-toolbar>
        <ion-buttons slot="start"><ion-back-button defaultHref="/learn" text="" /></ion-buttons>
        <ion-title>{{ topic()?.name }}</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content [fullscreen]="true">
      @if (topic(); as t) {
        <div class="page narrow">
          <section class="head">
            <g-mastery-ring [value]="progress.masteryOf(t.id)?.mastery ?? 0" [size]="64" />
            <div>
              <p class="eyebrow">System design</p>
              <h1>{{ t.name }}</h1>
            </div>
          </section>
          <p class="one">{{ t.oneLiner }}</p>

          @if (lesson(); as l) {
            <section class="panel block">
              <h2><ion-icon name="school-outline" aria-hidden="true" />Why it matters</h2>
              <p class="prose"><g-code-text [text]="l.why" /></p>
            </section>

            <section class="panel block" id="try">
              <h2><ion-icon name="hand-left-outline" aria-hidden="true" />Try it</h2>
              @switch (l.widget.kind) {
                @case ('queue-latency') {
                  <app-latency-widget />
                }
                @case ('cache') {
                  <app-cache-widget />
                }
                @case ('hash-ring') {
                  <app-ring-widget />
                }
                @case ('queue-backlog') {
                  <app-queue-widget />
                }
                @case ('replica-lag') {
                  <app-replica-widget />
                }
                @case ('rate-limiter') {
                  <app-limiter-widget />
                }
                @case ('availability') {
                  <app-availability-widget />
                }
                @case ('pipeline') {
                  <app-pipeline-widget />
                }
                @case ('quorum') {
                  <app-quorum-widget />
                }
                @case ('partition') {
                  <app-partition-widget />
                }
                @case ('id-layout') {
                  <app-id-layout-widget />
                }
                @case ('inverted-index') {
                  <app-index-widget />
                }
                @case ('stream-windows') {
                  <app-stream-widget />
                }
                @case ('storage-engine') {
                  <app-storage-widget />
                }
                @case ('cdn') {
                  <app-cdn-widget />
                }
                @case ('multi-region') {
                  <app-region-widget />
                }
                @case ('error-budget') {
                  <app-budget-widget />
                }
                @case ('pagination') {
                  <app-pagination-widget />
                }
                @case ('password-hash') {
                  <app-crack-widget />
                }
                @case ('estimate-drill') {
                  <app-estimate-drill [drill]="l.widget.drill ?? []" />
                }
              }
              <h3>Things to try</h3>
              <ol class="try">
                @for (e of l.widget.tryThis; track $index) {
                  <li><g-code-text [text]="e" /></li>
                }
              </ol>
            </section>

            <section class="panel block">
              <h2><ion-icon name="bulb-outline" aria-hidden="true" />The ideas to name</h2>
              <dl class="concepts">
                @for (c of l.concepts; track c.title) {
                  <dt>{{ c.title }}</dt>
                  <dd><g-code-text [text]="c.body" /></dd>
                }
              </dl>
            </section>

            <h2 class="section-title">Worked examples</h2>
            @for (e of l.examples; track e.title) {
              <section class="panel block">
                <app-worked-example [example]="e" />
              </section>
            }

            <section class="panel block">
              <h2><ion-icon name="alert-circle-outline" aria-hidden="true" />Pitfalls</h2>
              <ul>
                @for (p of l.pitfalls; track p) {
                  <li><g-code-text [text]="p" /></li>
                }
              </ul>
            </section>

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

          @if (missions().length || cases().length) {
            <section class="panel block">
              <h2><ion-icon name="construct-outline" aria-hidden="true" />Where it shows up</h2>
              <div class="links">
                @for (m of missions(); track m.id) {
                  <a class="g-btn" [routerLink]="['/design', m.id]"
                    ><ion-icon name="construct-outline" aria-hidden="true" />Mission: {{ m.title }}</a
                  >
                }
                @for (c of cases(); track c.id) {
                  <a class="g-btn" [routerLink]="['/design/case', c.id]"
                    ><ion-icon name="document-text-outline" aria-hidden="true" />Case study: {{ c.title }}</a
                  >
                }
              </div>
            </section>
          }

          <section class="panel block">
            <h2><ion-icon name="flash-outline" aria-hidden="true" />Quick check</h2>
            @if (itemCount()) {
              <app-quick-check [topic]="t.id" />
            } @else {
              <p class="muted">Review questions for this topic unlock with its Design Lab missions.</p>
            }
          </section>
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
    .one {
      font-size: 1.0625rem;
      line-height: 1.55;
      margin: 16px 0 18px;
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
    h3 {
      font-size: 0.9375rem;
      margin: 18px 0 8px;
    }
    .prose {
      margin: 0;
      line-height: 1.6;
      font-size: 0.9375rem;
    }
    .section-title {
      margin: 20px 0 10px;
    }
    ul,
    .try {
      margin: 0;
      padding-left: 20px;
    }
    li {
      line-height: 1.6;
      margin-bottom: 6px;
      font-size: 0.90625rem;
    }
    .concepts {
      margin: 0;
      display: grid;
      gap: 4px;
      dt {
        font-weight: 600;
        font-size: 0.9375rem;
        margin-top: 8px;
        &:first-child {
          margin-top: 0;
        }
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
    .links {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      a {
        text-decoration: none;
      }
    }
  `,
})
export class DesignLessonPage {
  readonly id = input.required<string>();
  readonly progress = inject(ProgressService);
  readonly topic = computed(() => getSdTopic(this.id()));
  readonly lesson = computed(() => getSdLesson(this.id()));
  readonly itemCount = computed(() => itemsForTopic(this.id()).length);
  readonly missions = computed(() => (this.topic()?.scenarioIds ?? []).map((id) => getScenarioSummary(id)!).filter(Boolean));
  readonly cases = computed(() => CASE_CATALOG.filter((c) => c.topics.includes(this.id())));

  constructor() {
    addIcons({
      schoolOutline,
      handLeftOutline,
      bulbOutline,
      alertCircleOutline,
      chatbubblesOutline,
      constructOutline,
      documentTextOutline,
      flashOutline,
    });
  }
}
