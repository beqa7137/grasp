import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  ALGORITHM_CATALOG,
  ALGORITHM_STRUCTURES,
  ALGORITHM_STRUCTURE_NAMES,
  PATTERN_CATALOG,
  PATTERN_TRACKS,
  type AlgorithmStructure,
  type PatternSummary,
} from '@grasp/engine';
import { ProgressService } from '../../core/progress.service';
import { ChipComponent } from '../../ui/chip.component';
import { CodeTextComponent } from '../../viz/code-text.component';

const STRUCTURES = Object.keys(ALGORITHM_STRUCTURE_NAMES) as AlgorithmStructure[];
const PATTERNS = new Map<string, PatternSummary>(PATTERN_CATALOG.map((p) => [p.id, p]));
const DIFFICULTY_NAMES = { easy: 'Easy', medium: 'Medium', hard: 'Hard' } as const;
/** The visualizers in roadmap order: by their pattern's place in the tracks (REDESIGN.md 2.8). */
const IN_ORDER = [...ALGORITHM_CATALOG].sort((a, b) => PATTERNS.get(a.patternId)!.order - PATTERNS.get(b.patternId)!.order);

/** The Coding hub's Visualizers: the 23 players in track order, with checkpoint accuracy and Structure chips kept in the URL. */
@Component({
  selector: 'app-visualizers',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, ChipComponent, CodeTextComponent],
  template: `
    <div class="page">
      <p class="eyebrow">Step-through visualizers</p>
      <h1>Watch the algorithm think.</h1>
      <p class="lead">
        Scrub forward and back, edit the input, and call the next move before it happens. Every checkpoint feeds your mastery score.
      </p>
      <div class="filters">
        <div class="structures" role="group" aria-label="Structure">
          @for (s of structures; track s.id) {
            <button type="button" g-chip [attr.aria-pressed]="chosen().includes(s.id)" (click)="toggle(s.id)">
              {{ s.name }} <span class="count">{{ s.count }}</span>
            </button>
          }
        </div>
        <p class="results" role="status">{{ resultLine() }}</p>
      </div>

      @for (t of tracks(); track t.id) {
        <section [attr.aria-labelledby]="'vis-' + t.id">
          <h2 [id]="'vis-' + t.id">{{ t.name }}</h2>
          <div class="grid">
            @for (a of t.algorithms; track a.id) {
              @let acc = progress.state().predictions[a.patternId];
              <a class="panel card-link item" [routerLink]="['/coding/visualizers', a.id]">
                <div class="top">
                  <g-chip>{{ patternName(a.patternId) }}</g-chip>
                  <g-chip>{{ difficulty[a.difficulty] }}</g-chip>
                </div>
                <h3>{{ a.title }}</h3>
                <p class="summary"><g-code-text [text]="a.summary" /></p>
                <div class="bottom">
                  <span class="mono">{{ a.complexity.time }}</span>
                  @if (acc) {
                    <span class="acc">{{ acc.correct }} of {{ acc.total }} checkpoints right</span>
                  } @else {
                    <span class="acc new">Start →</span>
                  }
                </div>
              </a>
            }
          </div>
        </section>
      }
    </div>
  `,
  styles: `
    h1 {
      font-size: var(--g-text-display-l);
      margin: var(--g-space-1) 0 var(--g-space-2);
    }
    .lead {
      max-width: 60ch;
      line-height: 1.5;
      margin: 0 0 var(--g-space-4);
      color: var(--g-muted);
    }
    .filters {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: var(--g-space-2) var(--g-space-4);
      margin-bottom: var(--g-space-2);
    }
    .structures {
      display: flex;
      flex-wrap: wrap;
      gap: var(--g-space-2);
    }
    .count {
      color: var(--g-muted);
      font-variant-numeric: tabular-nums;
    }
    .results {
      margin: 0;
      font-size: var(--g-text-body-s);
      color: var(--g-muted);
    }
    section {
      margin-top: var(--g-space-5);
    }
    section h2 {
      margin: 0 0 var(--g-space-2);
      font-size: var(--g-text-title-l);
    }
    .grid {
      display: grid;
      gap: var(--g-space-3);
      grid-template-columns: repeat(auto-fill, minmax(min(280px, 100%), 1fr));
    }
    .item {
      padding: var(--g-space-4);
      display: flex;
      flex-direction: column;
      gap: var(--g-space-2);
    }
    .top {
      display: flex;
      flex-wrap: wrap;
      gap: var(--g-space-1);
    }
    h3 {
      margin: var(--g-space-1) 0 0;
    }
    .summary {
      margin: 0;
      flex: 1;
      line-height: 1.5;
      font-size: var(--g-text-body);
      color: var(--g-muted);
    }
    .bottom {
      display: flex;
      flex-wrap: wrap;
      justify-content: space-between;
      align-items: center;
      gap: var(--g-space-2);
      margin-top: var(--g-space-2);
      font-size: var(--g-text-body-s);
      color: var(--g-muted);
    }
    .acc {
      color: var(--g-predict-ink);
      font-weight: 600;
    }
    .acc.new {
      color: var(--g-accent);
    }
  `,
})
export class VisualizersComponent {
  readonly progress = inject(ProgressService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  readonly difficulty = DIFFICULTY_NAMES;
  readonly structures = STRUCTURES.map((id) => ({
    id,
    name: ALGORITHM_STRUCTURE_NAMES[id],
    count: ALGORITHM_CATALOG.filter((a) => ALGORITHM_STRUCTURES[a.id] === id).length,
  }));

  /** The query parameter, bound by the router: the URL is the only filter state (REDESIGN.md 2.5). Unknown values are dropped. */
  readonly structure = input<string>();
  readonly chosen = computed(() => {
    const given = new Set((this.structure() ?? '').split(','));
    return STRUCTURES.filter((s) => given.has(s));
  });
  readonly shown = computed(() => {
    const chosen = this.chosen();
    return chosen.length ? IN_ORDER.filter((a) => chosen.includes(ALGORITHM_STRUCTURES[a.id])) : IN_ORDER;
  });
  readonly tracks = computed(() =>
    PATTERN_TRACKS.map((t) => ({ ...t, algorithms: this.shown().filter((a) => PATTERNS.get(a.patternId)!.track === t.id) })).filter(
      (t) => t.algorithms.length,
    ),
  );
  readonly resultLine = computed(() => {
    const n = this.shown().length;
    return this.chosen().length ? `${n} of ${IN_ORDER.length} visualizers` : `${n} visualizers`;
  });

  toggle(structure: AlgorithmStructure): void {
    const chosen = this.chosen();
    const next = chosen.includes(structure) ? chosen.filter((s) => s !== structure) : [...chosen, structure];
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { structure: next.length ? STRUCTURES.filter((s) => next.includes(s)).join(',') : null },
      replaceUrl: true,
    });
  }

  patternName(id: string): string {
    return PATTERNS.get(id)?.name ?? id;
  }
}
