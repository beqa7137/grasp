import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IonButtons, IonContent, IonHeader, IonIcon, IonTitle, IonToolbar } from '@ionic/angular';
import { CASE_CATALOG, getScenarioSummary, getSdLesson, getSdTopic, itemsForTopic } from '@grasp/engine';
import { addIcons } from 'ionicons';
import {
  alertCircleOutline,
  bulbOutline,
  chatbubblesOutline,
  constructOutline,
  documentTextOutline,
  handLeftOutline,
  schoolOutline,
} from 'ionicons/icons';
import { ProgressService } from '../../core/progress.service';
import { CodeTextComponent } from '../../viz/code-text.component';
import { MasteryRingComponent } from '../../ui/mastery-ring.component';
import { QuickCheckComponent } from '../pattern/quick-check.component';
import { WorkedExampleComponent } from '../pattern/worked-example.component';
import { AvailabilityWidgetComponent } from './availability-widget.component';
import { BatchWidgetComponent } from './batch-widget.component';
import { BudgetWidgetComponent } from './budget-widget.component';
import { CdnWidgetComponent } from './cdn-widget.component';
import { CrackWidgetComponent } from './crack-widget.component';
import { DeliveryWidgetComponent } from './delivery-widget.component';
import { ClocksWidgetComponent } from './clocks-widget.component';
import { DiscoveryWidgetComponent } from './discovery-widget.component';
import { DurabilityWidgetComponent } from './durability-widget.component';
import { RecoveryWidgetComponent } from './recovery-widget.component';
import { TenancyWidgetComponent } from './tenancy-widget.component';
import { GatewayWidgetComponent } from './gateway-widget.component';
import { EstimateDrillComponent } from './estimate-drill.component';
import { GeoWidgetComponent } from './geo-widget.component';
import { IdLayoutWidgetComponent } from './id-layout-widget.component';
import { IndexWidgetComponent } from './index-widget.component';
import { LimiterWidgetComponent } from './limiter-widget.component';
import { PaginationWidgetComponent } from './pagination-widget.component';
import { PartitionWidgetComponent } from './partition-widget.component';
import { PipelineWidgetComponent } from './pipeline-widget.component';
import { QuorumWidgetComponent } from './quorum-widget.component';
import { RegionWidgetComponent } from './region-widget.component';
import { RingWidgetComponent } from './ring-widget.component';
import { StorageWidgetComponent } from './storage-widget.component';
import { StreamWidgetComponent } from './stream-widget.component';
import { TxnWidgetComponent } from './txn-widget.component';
import { BackComponent } from '../../ui/back.component';
import { quickCheckIcon } from '../../ui/icons';
import { WIDGET_HEIGHTS } from './widget-heights';
import { LazyWidgetComponent } from './lazy-widget.component';

/** A system design topic taught hands-on: a widget to experiment with, the ideas to name, worked examples and a quick check. */
/** Widgets that leave the reading column at container wide, to sit beside their controls and experiments. */
const BREAKOUT = new Set(['balancer', 'feed-model']);

@Component({
  selector: 'app-design-lesson',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    BackComponent,
    RouterLink,
    IonHeader,
    IonToolbar,
    IonButtons,
    IonTitle,
    IonContent,
    IonIcon,
    CodeTextComponent,
    MasteryRingComponent,
    WorkedExampleComponent,
    QuickCheckComponent,
    LazyWidgetComponent,
    RingWidgetComponent,
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
    TxnWidgetComponent,
    BatchWidgetComponent,
    GeoWidgetComponent,
    DeliveryWidgetComponent,
    ClocksWidgetComponent,
    DiscoveryWidgetComponent,
    DurabilityWidgetComponent,
    RecoveryWidgetComponent,
    TenancyWidgetComponent,
    GatewayWidgetComponent,
    EstimateDrillComponent,
  ],
  template: `
    <ion-header [translucent]="true">
      <ion-toolbar>
        <ion-buttons slot="start"><app-back href="/design" /></ion-buttons>
        <ion-title>{{ topic()?.name }}</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content [fullscreen]="true">
      @if (topic(); as t) {
        <div class="lesson">
          <div class="page narrow" [class.has-breakout]="breakout()">
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

              <section class="panel block" id="try" [class.breakout]="breakout()">
                <h2><ion-icon name="hand-left-outline" aria-hidden="true" />Try it</h2>
                @switch (l.widget.kind) {
                  @case ('queue-latency') {
                    <app-lazy-widget [load]="loadLatencyWidget" [placeholder]="heights.latency" />
                  }
                  @case ('cache') {
                    <app-lazy-widget
                      [load]="loadCacheWidget"
                      [inputs]="{ experiments: l.widget.experiments ?? [] }"
                      [placeholder]="heights.cache"
                    />
                  }
                  @case ('hash-ring') {
                    <app-ring-widget />
                  }
                  @case ('queue-backlog') {
                    <app-lazy-widget [load]="loadQueueWidget" [placeholder]="heights.queue" />
                  }
                  @case ('replica-lag') {
                    <app-lazy-widget
                      [load]="loadReplicaWidget"
                      [inputs]="{ experiments: l.widget.experiments ?? [] }"
                      [placeholder]="heights.replica"
                    />
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
                  @case ('transactions') {
                    <app-txn-widget />
                  }
                  @case ('batch-job') {
                    <app-batch-widget />
                  }
                  @case ('geohash') {
                    <app-geo-widget />
                  }
                  @case ('delivery') {
                    <app-delivery-widget />
                  }
                  @case ('feed-model') {
                    <app-lazy-widget
                      [load]="loadFeedModelWidget"
                      [inputs]="{ experiments: l.widget.experiments ?? [] }"
                      [placeholder]="heights.feedModel"
                    />
                  }
                  @case ('overload') {
                    <app-lazy-widget [load]="loadOverloadWidget" [placeholder]="heights.overload" />
                  }
                  @case ('lease') {
                    <app-lazy-widget [load]="loadLeaseWidget" [placeholder]="heights.lease" />
                  }
                  @case ('balancer') {
                    <app-lazy-widget
                      [load]="loadBalancerWidget"
                      [inputs]="{ experiments: l.widget.experiments ?? [] }"
                      [placeholder]="heights.balancer"
                    />
                  }
                  @case ('clocks') {
                    <app-clocks-widget />
                  }
                  @case ('discovery') {
                    <app-discovery-widget />
                  }
                  @case ('durability') {
                    <app-durability-widget />
                  }
                  @case ('recovery') {
                    <app-recovery-widget />
                  }
                  @case ('tenancy') {
                    <app-tenancy-widget />
                  }
                  @case ('gateway') {
                    <app-gateway-widget />
                  }
                  @case ('estimate-drill') {
                    <app-estimate-drill [drill]="l.widget.drill ?? []" />
                  }
                }
                @if (l.widget.tryThis; as tryThis) {
                  <h3>Things to try</h3>
                  <ol class="try">
                    @for (e of tryThis; track $index) {
                      <li><g-code-text [text]="e" /></li>
                    }
                  </ol>
                }
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
                    <a class="g-btn" [routerLink]="['/design/missions', m.id]"
                      ><ion-icon name="construct-outline" aria-hidden="true" />Mission: {{ m.title }}</a
                    >
                  }
                  @for (c of cases(); track c.id) {
                    <a class="g-btn" [routerLink]="['/design/cases', c.id]"
                      ><ion-icon name="document-text-outline" aria-hidden="true" />Case study: {{ c.title }}</a
                    >
                  }
                </div>
              </section>
            }

            <section class="panel block">
              <h2><ion-icon [icon]="quickCheckIcon" aria-hidden="true" />Quick check</h2>
              @if (itemCount()) {
                <app-quick-check [topic]="t.id" />
              } @else {
                <p class="muted">Review questions for this topic unlock with its Lab missions or a finished case study.</p>
              }
            </section>
          </div>
        </div>
      }
    </ion-content>
  `,
  styles: `
    @use '../../../type' as *;
    @use '../../../breakpoints' as *;

    // The page's content box is a size container, so a widget can leave the reading column when the content (not the
    // viewport: a rail takes its share) is wide. The page then takes the content width and holds every other part to the
    // reading column, so nothing spills out of it.
    .lesson {
      container: lesson / inline-size;
    }
    @include container-wide(lesson) {
      .page.has-breakout {
        max-width: var(--g-width-content);
        > :not(.breakout) {
          max-width: calc(var(--g-width-reading) - 2 * var(--g-space-4));
          margin-inline: auto;
        }
      }
    }

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
      @include title;
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
      font-size: var(--g-text-title-s);
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
  readonly quickCheckIcon = quickCheckIcon;
  readonly id = input.required<string>();
  readonly progress = inject(ProgressService);
  readonly topic = computed(() => getSdTopic(this.id()));
  readonly lesson = computed(() => getSdLesson(this.id()));
  readonly itemCount = computed(() => itemsForTopic(this.id()).length);
  readonly missions = computed(() => (this.topic()?.scenarioIds ?? []).map((id) => getScenarioSummary(id)!).filter(Boolean));
  readonly cases = computed(() => CASE_CATALOG.filter((c) => c.topics.includes(this.id())));
  readonly loadCacheWidget = () => import('./cache-widget.component').then((m) => m.CacheWidgetComponent);
  readonly heights = WIDGET_HEIGHTS;
  readonly loadLatencyWidget = () => import('./latency-widget.component').then((m) => m.LatencyWidgetComponent);
  readonly loadQueueWidget = () => import('./queue-widget.component').then((m) => m.QueueWidgetComponent);
  readonly loadOverloadWidget = () => import('./overload-widget.component').then((m) => m.OverloadWidgetComponent);
  readonly loadLeaseWidget = () => import('./lease-widget.component').then((m) => m.LeaseWidgetComponent);
  readonly loadReplicaWidget = () => import('./replica-widget.component').then((m) => m.ReplicaWidgetComponent);
  readonly loadBalancerWidget = () => import('./balancer-widget.component').then((m) => m.BalancerWidgetComponent);
  readonly loadFeedModelWidget = () => import('./feed-model-widget.component').then((m) => m.FeedModelWidgetComponent);
  readonly breakout = computed(() => BREAKOUT.has(this.lesson()?.widget.kind ?? ''));

  constructor() {
    addIcons({
      schoolOutline,
      handLeftOutline,
      bulbOutline,
      alertCircleOutline,
      chatbubblesOutline,
      constructOutline,
      documentTextOutline,
    });
  }
}
