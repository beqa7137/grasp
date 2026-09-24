import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IonBackButton, IonButtons, IonContent, IonHeader, IonIcon, IonTitle, IonToolbar } from '@ionic/angular';
import { getAlgorithm, getPattern, itemsForTopic, problemsForPattern } from '@grasp/engine';
import { addIcons } from 'ionicons';
import { alertCircleOutline, codeSlashOutline, flashOutline, playCircle, searchOutline } from 'ionicons/icons';
import { ProgressService } from '../../core/progress.service';
import { CodePanelComponent } from '../../viz/code-panel.component';
import { MasteryRingComponent } from '../../viz/mastery-ring.component';

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
    MasteryRingComponent,
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
              <p class="eyebrow">Pattern {{ p.order }} of 20 · {{ p.complexity }}</p>
              <h1>{{ p.name }}</h1>
            </div>
          </section>
          <p class="one">{{ p.oneLiner }}</p>

          <div class="actions">
            @for (a of algorithms(); track a.id) {
              <a class="g-btn primary" [routerLink]="['/visualize', a.id]"><ion-icon name="play-circle" />Visualize: {{ a.title }}</a>
            }
            <a class="g-btn" routerLink="/drill" [queryParams]="{ pattern: p.id }"
              ><ion-icon name="flash-outline" />Practice {{ itemCount() }} items</a
            >
            @for (c of problems(); track c.id) {
              <a class="g-btn" [routerLink]="['/code', c.id]"><ion-icon name="code-slash-outline" />Code: {{ c.title }}</a>
            }
          </div>

          <section class="panel block">
            <h2><ion-icon name="search-outline" />Cues — how you spot it</h2>
            <ul>
              @for (c of p.cues; track c) {
                <li>{{ c }}</li>
              }
            </ul>
          </section>

          <section class="panel block code">
            <h2>Template</h2>
            <g-code-panel [code]="p.template" />
          </section>

          <section class="panel block">
            <h2><ion-icon name="alert-circle-outline" />Pitfalls</h2>
            <ul>
              @for (c of p.pitfalls; track c) {
                <li>{{ c }}</li>
              }
            </ul>
          </section>

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
    }
    h1 {
      font-size: clamp(26px, 5vw, 36px);
      margin: 4px 0 0;
    }
    .one {
      font-size: 17px;
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
      font-size: 16px;
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
      font-size: 14.5px;
    }
    .foot {
      font-size: 13px;
    }
  `,
})
export class PatternPage {
  readonly id = input.required<string>();
  readonly progress = inject(ProgressService);
  readonly pattern = computed(() => getPattern(this.id()));
  readonly problems = computed(() => problemsForPattern(this.id()));
  readonly algorithms = computed(() => (this.pattern()?.algorithmIds ?? []).map((id) => getAlgorithm(id)!).filter(Boolean));
  readonly itemCount = computed(() => itemsForTopic(this.id()).length);

  constructor() {
    addIcons({ playCircle, flashOutline, searchOutline, alertCircleOutline, codeSlashOutline });
  }
}
