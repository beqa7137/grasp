import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MOCK_PROBLEMS, getPatternSummary, patternProblems } from '@grasp/engine';
import { ProgressService } from '../../core/progress.service';
import { EntryRowComponent } from '../../ui/entry-row.component';
import { problemRow } from '../coding/problem-rows';

/** Problems with a mock round of their own: practising one rehearses that round. */
const MOCKED = new Set(MOCK_PROBLEMS.map((m) => m.catalogId).filter(Boolean));

/**
 * A pattern hub's Problems segment (REDESIGN.md 4.3), in place of the lesson's old "Code:" buttons: every member with its
 * status, difficulty, best score and a Mock marker, the pattern's own problems first. Rows carry the pattern, so the
 * workspace shows it (2.9: inside a pattern hub the pattern is no spoiler).
 */
@Component({
  selector: 'app-pattern-problems',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, EntryRowComponent],
  template: `
    <div class="page narrow">
      <h2>Problems</h2>
      <p class="lead">{{ name }}'s own problems first, then problems where it is one of the patterns.</p>
      <ul class="rows">
        @for (r of rows(); track r.problem.id) {
          <li>
            <a
              g-entry-row
              inline
              [routerLink]="['/coding/problems', r.problem.id]"
              [state]="{ pattern: id, fromHub: true }"
              [heading]="r.problem.title"
              [status]="r.status"
              [meta]="r.meta"
              [level]="r.level"
              [levelLabel]="r.levelLabel"
              [after]="r.after"
            ></a>
          </li>
        }
      </ul>
    </div>
  `,
  styles: `
    h2 {
      font-size: var(--g-text-title-l);
      margin: 0 0 var(--g-space-1);
    }
    .lead {
      margin: 0 0 var(--g-space-3);
      color: var(--g-muted);
      font-size: var(--g-text-body-s);
    }
    .rows {
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      gap: var(--g-space-2);
      margin: 0;
      padding: 0;
      list-style: none;
    }
  `,
})
export class PatternProblemsComponent {
  private readonly progress = inject(ProgressService);
  // A hub shows one pattern, so its segments read the hub's id once.
  readonly id = inject(ActivatedRoute).parent?.snapshot.paramMap.get('id') ?? '';
  readonly name = getPatternSummary(this.id)?.name ?? '';
  readonly rows = computed(() => {
    const coding = this.progress.state().coding;
    return patternProblems(this.id).map((problem) => {
      const record = coding[problem.id];
      return {
        problem,
        status: problemRow.status(record),
        // Under the title, where a narrow row has room for it; the row's end keeps to the pips and the score.
        meta: [...problemRow.alsoIn(problem, this.id), ...(MOCKED.has(problem.id) ? ['Mock round'] : [])],
        level: problemRow.level(problem),
        levelLabel: problemRow.levelLabel(problem),
        after: problemRow.best(record),
      };
    });
  });
}
