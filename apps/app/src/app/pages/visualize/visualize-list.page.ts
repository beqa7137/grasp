import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IonContent, IonHeader, IonTitle, IonToolbar } from '@ionic/angular';
import { ALGORITHMS, getPattern } from '@grasp/engine';
import { ProgressService } from '../../core/progress.service';
import { CodeTextComponent } from '../../viz/code-text.component';

@Component({
  selector: 'app-visualize-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, IonHeader, IonToolbar, IonTitle, IonContent, CodeTextComponent],
  template: `
    <ion-header [translucent]="true">
      <ion-toolbar><ion-title>Visualize</ion-title></ion-toolbar>
    </ion-header>
    <ion-content [fullscreen]="true">
      <div class="page">
        <p class="eyebrow">Step-through visualizers</p>
        <h1>Watch the algorithm think.</h1>
        <p class="muted lead">
          Scrub forward and back, edit the input, and call the next move before it happens. Every prediction feeds your mastery score.
        </p>

        <div class="grid">
          @for (a of algorithms; track a.id) {
            @let acc = progress.state().predictions[a.patternId];
            <a class="panel card-link item" [routerLink]="['/visualize', a.id]">
              <div class="top">
                <span class="chip accent">{{ patternName(a.patternId) }}</span>
                <span class="chip" [class]="a.difficulty">{{ a.difficulty }}</span>
              </div>
              <h2>{{ a.title }}</h2>
              <p class="muted"><g-code-text [text]="a.summary" /></p>
              <div class="bottom">
                <span class="mono muted">{{ a.complexity.time }}</span>
                @if (acc) {
                  <span class="acc">{{ acc.correct }}/{{ acc.total }} predicted</span>
                } @else {
                  <span class="acc new">Start →</span>
                }
              </div>
            </a>
          }
        </div>
      </div>
    </ion-content>
  `,
  styles: `
    h1 {
      font-size: clamp(1.625rem, 5vw, 2.375rem);
      margin: 6px 0 8px;
    }
    .lead {
      max-width: 60ch;
      line-height: 1.5;
      margin: 0 0 22px;
    }
    .grid {
      display: grid;
      gap: 14px;
      grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    }
    .item {
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .top {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }
    h2 {
      font-size: 1.1875rem;
      margin: 6px 0 0;
    }
    p {
      margin: 0;
      line-height: 1.5;
      font-size: 0.875rem;
      flex: 1;
    }
    .bottom {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-top: 8px;
      font-size: 0.8125rem;
    }
    .acc {
      color: var(--g-predict);
      font-weight: 600;
    }
    .acc.new {
      color: var(--g-accent);
    }
  `,
})
export class VisualizeListPage {
  readonly progress = inject(ProgressService);
  readonly algorithms = ALGORITHMS;

  patternName(id: string) {
    return getPattern(id)?.name ?? id;
  }
}
