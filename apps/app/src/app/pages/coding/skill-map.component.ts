import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import {
  LEVEL_PROFILES,
  PATTERN_CATALOG,
  READY_RULES,
  currentTarget,
  patternStatus,
  problemsForPattern,
  startHerePattern,
  type SkillStatus,
  type StatusContext,
} from '@grasp/engine';
import { ProgressService } from '../../core/progress.service';
import { PatternMapComponent, type PatternMapRow } from './pattern-map.component';

/** The Coding hub's Skill map (REDESIGN.md 2.8): every pattern's state, its solved members, Flagged, Stretch and Start here. */
@Component({
  selector: 'app-skill-map',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, DatePipe, PatternMapComponent],
  template: `
    <div class="page">
      <p class="eyebrow">Pattern map</p>
      <h1>Master the cue, and the problem names itself.</h1>
      <p class="lead">{{ patternCount }} patterns cover the vast majority of coding interviews.</p>
      @if (progress.state().diagnosedAt; as placed) {
        <p class="placement">Placed {{ placed | date: 'MMM d' }}. <a routerLink="/coding/placement">Retake the placement check</a></p>
      } @else {
        <p class="placement">
          Not sure where to start? <a routerLink="/coding/placement">Take the placement check</a> · <span class="nowrap">about 5 min</span>
        </p>
      }
      <app-pattern-map [legend]="legend" [rows]="rows()">
        A pattern is Learning once you open its lesson, its visualizer or one of its problems, Practiced once you solve one of its own
        problems, and Ready once {{ rules.patternSolves }} of them are solved on different days (one at Medium or harder) and
        {{ rules.patternPassing }} of its review cards are recalled.
      </app-pattern-map>
    </div>
  `,
  styles: `
    h1 {
      font-size: var(--g-text-display-l);
      margin: var(--g-space-1) 0 var(--g-space-2);
    }
    .lead {
      margin: 0 0 var(--g-space-3);
      color: var(--g-muted);
      line-height: 1.5;
    }
    .nowrap {
      white-space: nowrap;
    }
    .placement {
      margin: 0 0 var(--g-space-5);
      font-size: var(--g-text-body-s);
      color: var(--g-muted);
    }
  `,
})
export class SkillMapComponent {
  readonly progress = inject(ProgressService);
  readonly patternCount = PATTERN_CATALOG.length;
  readonly rules = READY_RULES;
  readonly legend = [
    { glyph: 'new', label: 'New' },
    { glyph: 'learning', label: 'Learning' },
    { glyph: 'practiced', label: 'Practiced' },
    { glyph: 'ready', label: 'Ready' },
  ] as const;

  readonly rows = computed(() => {
    const state = this.progress.state();
    const profile = LEVEL_PROFILES[currentTarget(state).target.level];
    // Pattern states never read the story bank, which lives outside the event log.
    const ctx: StatusContext = { state, stories: [], now: this.progress.now(), profile };
    const statuses = new Map<string, SkillStatus>(PATTERN_CATALOG.map((p) => [p.id, patternStatus(p.id, ctx)]));
    // Start here moves on once the learner has practised the pattern it named.
    const start = startHerePattern(state.placement, (id) => ['practiced', 'ready'].includes(statuses.get(id)!.state));
    return Object.fromEntries(
      PATTERN_CATALOG.map((p): [string, PatternMapRow] => {
        const status = statuses.get(p.id)!;
        const members = problemsForPattern(p.id);
        const solved = members.filter((m) => state.coding[m.id]?.solvedAt).length;
        return [
          p.id,
          {
            glyph: status.state,
            meta: [`${solved} of ${members.length} solved`],
            flagged: status.flagged,
            stretch: profile.patterns.stretch.includes(p.id),
            startHere: p.id === start,
          },
        ];
      }),
    );
  });
}
