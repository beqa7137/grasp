import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CODING_CATALOG, PATTERNS } from '@grasp/engine';
import { IonBackButton, IonButtons, IonContent, IonHeader, IonIcon, IonTitle, IonToolbar } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { checkmarkCircle, ellipseOutline, timeOutline } from 'ionicons/icons';
import { ProgressService } from '../../core/progress.service';

const patternName = new Map(PATTERNS.map((p) => [p.id, p.name]));

@Component({
  selector: 'app-code-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, IonHeader, IonToolbar, IonButtons, IonBackButton, IonTitle, IonContent, IonIcon],
  template: `
    <ion-header [translucent]="true">
      <ion-toolbar>
        <ion-buttons slot="start"><ion-back-button defaultHref="/learn" text="" /></ion-buttons>
        <ion-title>Code</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content [fullscreen]="true">
      <div class="page">
        <p class="eyebrow">Coding practice</p>
        <h1>Write it. Run it. Watch it.</h1>
        <p class="muted lead">
          Solve in Python, JavaScript or TypeScript against hidden tests, including one large input that only the right complexity passes in
          time. Then step through your own code line by line in the visualizer.
        </p>
        <p class="progress mono">{{ solvedCount() }} / {{ problems.length }} solved</p>

        <div class="list">
          @for (p of problems; track p.id) {
            @let record = progress.state().coding[p.id];
            <a class="panel card-link problem" [routerLink]="['/code', p.id]" [class.solved]="record?.solvedAt">
              <ion-icon
                class="status"
                [name]="record?.solvedAt ? 'checkmark-circle' : record ? 'time-outline' : 'ellipse-outline'"
                [attr.aria-label]="record?.solvedAt ? 'Solved' : record ? 'Attempted' : 'Not started'"
              />
              <div class="body">
                <h2>{{ p.title }}</h2>
                <div class="chips">
                  <span class="chip" [class]="p.difficulty">{{ p.difficulty }}</span>
                  @for (id of p.patternIds; track id) {
                    <span class="chip accent">{{ name(id) }}</span>
                  }
                  @if (record && !record.solvedAt) {
                    <span class="chip mono">best {{ record.bestPassed }}/{{ record.total }}</span>
                  }
                </div>
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
      max-width: 64ch;
      line-height: 1.5;
      margin: 0 0 8px;
    }
    .progress {
      color: var(--g-muted);
      font-size: 0.8125rem;
      margin: 0 0 18px;
    }
    .list {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
      gap: 12px;
    }
    .problem {
      display: flex;
      gap: 14px;
      align-items: flex-start;
      padding: 16px;
    }
    .status {
      font-size: 22px;
      color: var(--g-faint);
      flex: none;
      margin-top: 2px;
    }
    .solved .status {
      color: var(--g-found);
    }
    h2 {
      font-size: 1rem;
      margin: 0 0 8px;
    }
    .chips {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }
  `,
})
export class CodeListPage {
  readonly progress = inject(ProgressService);
  readonly problems = CODING_CATALOG;
  readonly solvedCount = computed(() => Object.values(this.progress.state().coding).filter((c) => c.solvedAt).length);

  constructor() {
    addIcons({ checkmarkCircle, timeOutline, ellipseOutline });
  }

  name(id: string) {
    return patternName.get(id) ?? id;
  }
}
