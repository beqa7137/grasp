import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PATTERN_CATALOG, SD_TOPICS, type Track } from '@grasp/engine';
import { ProgressService } from '../../core/progress.service';
import { CodeTextComponent } from '../../viz/code-text.component';
import { MasteryRingComponent } from '../../ui/mastery-ring.component';

const TRACKS: { id: Track; title: string; blurb: string }[] = [
  { id: 'foundations', title: 'Foundations', blurb: 'The four patterns behind a third of all interview questions.' },
  { id: 'core', title: 'Core patterns', blurb: 'Stacks, sweeps and heaps: where O(n²) becomes O(n).' },
  { id: 'graphs', title: 'Graphs & trees', blurb: 'Traversal, ordering, connectivity, shortest paths.' },
  { id: 'advanced', title: 'Advanced', blurb: 'Dynamic programming, tries, greedy proofs, bits.' },
];

/** The pattern map (Coding's Skill map) or the system design topic cards (Design's Topics), as Learn showed them before R5. */
@Component({
  selector: 'app-map',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, CodeTextComponent, MasteryRingComponent],
  template: `
    <div class="page">
      @if (show() === 'patterns') {
        <p class="eyebrow">Pattern map</p>
        <h1>Master the cue, and the problem names itself.</h1>
        <p class="muted lead">{{ patternCount }} patterns cover the vast majority of coding interviews.</p>
        @for (t of tracks; track t.id) {
          <div class="track">
            <div class="track-head">
              <h2>{{ t.title }}</h2>
              <p class="muted">{{ t.blurb }}</p>
            </div>
            <div class="patterns">
              @for (p of t.patterns; track p.id) {
                <a class="panel card-link pattern" [routerLink]="['/coding/patterns', p.id]">
                  <g-mastery-ring [value]="mastery(p.id)" />
                  <div class="info">
                    <h3>{{ p.name }}</h3>
                    <p class="muted"><g-code-text [text]="p.oneLiner" /></p>
                  </div>
                </a>
              }
            </div>
          </div>
        }
      } @else {
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
      }
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
    .track {
      margin-top: 22px;
    }
    .track-head {
      display: flex;
      align-items: baseline;
      gap: 12px;
      flex-wrap: wrap;
      margin-bottom: 10px;
      h2 {
        min-width: 0;
        margin: 0;
        font-size: 1.25rem;
      }
      p {
        margin: 0;
        font-size: 0.84375rem;
      }
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
      h2,
      h3 {
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
  readonly show = input<'patterns' | 'topics'>('patterns');
  private readonly progress = inject(ProgressService);
  readonly patternCount = PATTERN_CATALOG.length;
  readonly tracks = TRACKS.map((t) => ({ ...t, patterns: PATTERN_CATALOG.filter((p) => p.track === t.id) }));
  readonly sdTopics = SD_TOPICS;
  private readonly masteryById = computed(() => new Map(this.progress.mastery().map((m) => [m.topic, m.mastery])));

  mastery(topic: string) {
    return this.masteryById().get(topic) ?? 0;
  }
}
