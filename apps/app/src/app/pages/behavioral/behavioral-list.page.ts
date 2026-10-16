import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  COMPETENCY_CATALOG,
  LEVEL_PROFILES,
  QUESTIONS_PER_COMPETENCY,
  competencyStatus,
  currentTarget,
  dueStories,
  type StatusContext,
} from '@grasp/engine';
import { ProgressService } from '../../core/progress.service';
import { ChipComponent } from '../../ui/chip.component';
import { EntryRowComponent } from '../../ui/entry-row.component';
import { SkillStateComponent } from '../../ui/skill-state.component';
import { StarDraftsService } from './star-drafts.service';
import { StoryBankService } from './story-bank.service';

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * The Behavioral hub's Competencies (REDESIGN.md 2.8, 4.8): what the learner has, then the 13 competencies with their
 * state, questions, drafts and stories, Flagged, and Senior focus in a Senior loop. STAR lives on its own page.
 */
@Component({
  selector: 'app-behavioral-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, ChipComponent, EntryRowComponent, SkillStateComponent],
  template: `
    <div class="page narrow">
      <h1>Behavioral interviews</h1>
      <p class="summary">
        @for (part of summary(); track $index; let last = $last) {
          <span>{{ part }}</span
          >{{ last ? '' : ' · ' }}
        }
      </p>
      <p class="guide"><a routerLink="/behavioral/guide">How to answer (STAR) →</a></p>
      @if (due(); as due) {
        <a
          class="rehearse"
          g-entry-row
          [go]="true"
          routerLink="/behavioral/rehearse"
          [heading]="'Rehearse ' + plural(due, 'story', 'stories')"
          [meta]="[due === 1 ? 'Due now. Tell it aloud against the clock.' : 'Due now. Tell each one aloud against the clock.']"
        ></a>
      }

      <ul class="legend" aria-label="Key">
        @for (k of legend; track k) {
          <li><g-skill-state aria-hidden="true" [state]="k" />{{ names[k] }}</li>
        }
      </ul>
      <p class="key-note">
        A competency is Learning once a story is tagged with it or a mock round asks about it, Practiced once one of its stories is
        rehearsed, and Ready once a story is told well twice in a row or a mock round scores it Lean hire or better.
      </p>
      <ul class="rows">
        @for (r of rows(); track r.id) {
          <li>
            <a g-entry-row [heading]="r.name" [meta]="r.meta" [routerLink]="['/behavioral', r.id]">
              <g-skill-state lead [state]="r.state" />
              @if (r.flagged || r.focus) {
                <span end class="marks">
                  @if (r.flagged) {
                    <g-chip tone="warn">Flagged</g-chip>
                  }
                  @if (r.focus) {
                    <g-chip>Senior focus</g-chip>
                  }
                </span>
              }
            </a>
          </li>
        }
      </ul>
    </div>
  `,
  styles: `
    h1 {
      font-size: var(--g-text-display-l);
      margin: var(--g-space-1) 0 var(--g-space-1);
    }
    .summary {
      margin: 0 0 var(--g-space-2);
      /* Holds its line while the drafts and stories load, so nothing below moves when the counts arrive. */
      min-height: 1.5em;
      color: var(--g-muted);
      font-size: var(--g-text-body-s);
      span {
        white-space: nowrap;
      }
    }
    .guide {
      margin: 0 0 var(--g-space-4);
      a {
        display: inline-block;
        padding-block: var(--g-space-1);
        font-weight: 600;
      }
    }
    .rehearse {
      margin-bottom: var(--g-space-4);
    }
    .legend,
    .rows {
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .legend {
      display: flex;
      flex-wrap: wrap;
      gap: var(--g-space-1) var(--g-space-4);
      margin-bottom: var(--g-space-2);
      font-size: var(--g-text-body-s);
      color: var(--g-muted);
      li {
        display: inline-flex;
        align-items: center;
        gap: var(--g-space-1);
      }
    }
    .key-note {
      margin: 0 0 var(--g-space-4);
      font-size: var(--g-text-body-s);
      line-height: 1.5;
      color: var(--g-muted);
    }
    .rows {
      display: grid;
      gap: var(--g-space-2);
    }
    .marks {
      display: flex;
      flex-wrap: wrap;
      justify-content: flex-end;
      gap: var(--g-space-1);
    }
  `,
})
export class BehavioralListPage {
  private readonly drafts = inject(StarDraftsService);
  private readonly bank = inject(StoryBankService);
  private readonly progress = inject(ProgressService);
  readonly plural = plural;
  readonly legend = ['new', 'learning', 'practiced', 'ready'] as const;
  readonly names = { new: 'New', learning: 'Learning', practiced: 'Practiced', ready: 'Ready' } as const;

  readonly due = computed(() => dueStories(this.bank.stories(), this.progress.now(), this.progress.state().behavioral).length);
  readonly rows = computed(() => {
    const state = this.progress.state();
    const profile = LEVEL_PROFILES[currentTarget(state).target.level];
    const ctx: StatusContext = { state, stories: this.bank.stories(), now: this.progress.now(), profile };
    const coverage = new Map(this.bank.review().coverage.map((c) => [c.competencyId, c.storyIds.length]));
    return COMPETENCY_CATALOG.map((c) => {
      const status = competencyStatus(c.id, ctx);
      const drafted = this.drafts.draftedIn(c.id);
      const stories = coverage.get(c.id) ?? 0;
      return {
        id: c.id,
        name: c.name,
        state: status.state,
        flagged: status.flagged,
        focus: profile.level === 'senior' && profile.competencies.some((w) => w.id === c.id && w.weight > 1),
        meta: [
          plural(QUESTIONS_PER_COMPETENCY, 'question'),
          ...(drafted ? [`${drafted} drafted`] : []),
          plural(stories, 'story', 'stories'),
        ],
      };
    });
  });
  readonly summary = computed(() => {
    if (!this.drafts.loaded() || !this.bank.loaded()) return [];
    const { covered, coverage } = this.bank.review();
    const due = this.due();
    return [
      `${covered} of ${coverage.length} competencies ${covered === 1 ? 'has' : 'have'} a story`,
      `${this.drafts.count()} of ${COMPETENCY_CATALOG.length * QUESTIONS_PER_COMPETENCY} questions drafted on this device`,
      ...(due ? [`${plural(due, 'story', 'stories')} due`] : []),
    ];
  });

  ionViewWillEnter() {
    void this.drafts.load();
    void this.bank.load();
  }
}
