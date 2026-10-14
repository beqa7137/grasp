import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SD_TOPICS } from '@grasp/engine';
import { ProgressService } from '../../core/progress.service';
import { MasteryRingComponent } from '../../ui/mastery-ring.component';

/** The system design topic cards (Design's Topics), as Learn showed them before R5, until R11 builds the shelves. */
@Component({
  selector: 'app-map',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, MasteryRingComponent],
  template: `
    <div class="page">
      <p class="eyebrow">System design</p>
      <h1>Learn it hands-on, then build it.</h1>
      <p class="muted lead">Hands-on lessons, then Design Lab missions and case studies, kept fresh with generated cases.</p>
      <div class="patterns">
        @for (t of sdTopics; track t.id) {
          <a class="panel card-link pattern" [routerLink]="['/design/topics', t.id]">
            <g-mastery-ring [value]="mastery(t.id)" />
            <div class="info">
              <h2>{{ t.name }}</h2>
              <p class="muted">{{ t.oneLiner }}</p>
            </div>
          </a>
        }
      </div>
    </div>
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
    .patterns {
      display: grid;
      gap: 10px;
      grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    }
    .pattern {
      display: flex;
      align-items: center;
      gap: 14px;
      padding: 12px 14px;
      .info {
        flex: 1;
        min-width: 0;
      }
      h2 {
        margin: 0 0 3px;
        font-size: 0.96875rem;
      }
      p {
        margin: 0;
        font-size: 0.78125rem;
        line-height: 1.4;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
      }
    }
  `,
})
export class MapComponent {
  private readonly progress = inject(ProgressService);
  readonly sdTopics = SD_TOPICS;
  private readonly masteryById = computed(() => new Map(this.progress.mastery().map((m) => [m.topic, m.mastery])));

  mastery(topic: string) {
    return this.masteryById().get(topic) ?? 0;
  }
}
