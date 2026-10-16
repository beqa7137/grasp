import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  TRACK_NAMES,
  getCaseSummary,
  getCompetencySummary,
  getPatternSummary,
  getSdTopic,
  type FocusTarget,
  type LoopDebrief,
} from '@grasp/engine';
import { scoredBy, type InterviewSession } from './interview.types';
import { CrossLinkDirective } from '../../ui/cross-link.directive';

const verdictLabel = (verdict: string) => verdict.replace(/-/g, ' ');

/** Where a thing to work on is practised, and what the link says. */
function practice(target: FocusTarget): { link: string[]; label: string } {
  switch (target.kind) {
    case 'pattern': {
      const name = getPatternSummary(target.patternId)?.name;
      return { link: ['/coding/patterns', target.patternId], label: name ? `Study ${name}` : 'Study the pattern' };
    }
    case 'design-topic': {
      const name = getSdTopic(target.topicId)?.name;
      return { link: ['/design/topics', target.topicId], label: name ? `Read the ${name} lesson` : 'Read the lesson' };
    }
    case 'case': {
      const title = getCaseSummary(target.caseId)?.title;
      return { link: ['/design/cases', target.caseId], label: title ? `Work the ${title} case study` : 'Work the case study' };
    }
    case 'competency': {
      const name = getCompetencySummary(target.competencyId)?.name;
      return { link: ['/behavioral', target.competencyId], label: name ? `Read the ${name} guide` : 'Read the guide' };
    }
    case 'round':
      return { link: ['/mock', target.sessionId], label: 'Reread how this round went' };
  }
}

@Component({
  selector: 'app-loop-debrief',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CrossLinkDirective, RouterLink],
  template: `
    @let d = debrief();
    <section class="panel read" aria-labelledby="read-kind read-title">
      @if (allScripted()) {
        <p id="read-kind" class="eyebrow">Coverage estimate from scripted practice, not a hiring decision</p>
        <p class="muted">
          Scripted practice scored every round: it checks which rubric areas you covered, not whether your answers were right.
        </p>
        <h2 id="read-title" class="verdict neutral">{{ label(d.verdict) }}</h2>
      } @else {
        <p id="read-kind" class="eyebrow">Practice read, not a hiring decision</p>
        <h2 id="read-title" class="verdict" [attr.data-verdict]="d.verdict">{{ label(d.verdict) }}</h2>
      }
      <p>
        A simple practice rule, not how any one company decides: the average of your round verdicts, rounded down, and never more than one
        step above your weakest round. Real committees differ, and at many companies one clear no hire is enough to stop an offer on its
        own.
      </p>
      @if (d.noHire) {
        <p>Your {{ names[d.noHire].toLowerCase() }} round was a no hire. Treat it as the first thing to fix.</p>
      } @else if (d.heldBy) {
        <p>Your {{ names[d.heldBy].toLowerCase() }} round held the read down.</p>
      }
      @if (d.scripted && !allScripted()) {
        <p class="muted">
          Scripted practice scored {{ d.scripted }} of your {{ sessions().length }} rounds. Those rounds check which rubric areas you
          covered, not whether your answers were right, so this read is rougher than an all-AI loop.
        </p>
      }
    </section>

    <h2>Practice next</h2>
    @if (focus().length) {
      <ol class="focus">
        @for (f of focus(); track $index) {
          <li class="panel">
            <p class="eyebrow">{{ names[f.track] }} · {{ f.score }} of 4</p>
            <h3>{{ f.dimension }}</h3>
            @if (f.lookFor) {
              <p class="muted">{{ f.lookFor }}</p>
            }
            <a [routerLink]="f.practice.link" crossLink>{{ f.practice.label }}</a>
          </li>
        }
      </ol>
    } @else {
      <p class="muted">Nothing below the top score in any round. Keep your reviews going until your interview.</p>
    }

    <h2>Rounds</h2>
    <div class="rounds">
      @for (s of sessions(); track s.id) {
        @if (s.scorecard; as card) {
          <section class="panel round" [attr.aria-labelledby]="'round-' + s.id">
            <p class="eyebrow">{{ names[s.track] }} · {{ scoredBy(s) }}</p>
            <h3 [id]="'round-' + s.id">{{ s.problem.title }}</h3>
            <p class="verdict" [class.neutral]="card.mode === 'offline'" [attr.data-verdict]="card.verdict">{{ label(card.verdict) }}</p>
            <dl>
              @for (dim of card.dimensions; track dim.name) {
                <dt>{{ dim.name }}</dt>
                <dd>{{ dim.score }} of 4</dd>
              }
            </dl>
            <a [routerLink]="['/mock', s.id]">Scorecard and transcript</a>
          </section>
        }
      }
    </div>
  `,
  styles: `
    @use '../../../type' as *;

    h2 {
      @include title;
      font-size: 1.125rem;
      margin: 24px 0 10px;
    }
    .read {
      padding: 16px;
      h2 {
        margin: 2px 0 8px;
        font-size: 1.5rem;
      }
      p {
        line-height: 1.55;
        margin: 0 0 8px;
      }
      p:last-child {
        margin-bottom: 0;
      }
    }
    .verdict {
      font-weight: 600;
      text-transform: capitalize;
      color: var(--g-warn-ink);
    }
    .verdict[data-verdict='hire'],
    .verdict[data-verdict='strong-hire'] {
      color: var(--g-found-ink);
    }
    .verdict[data-verdict='no-hire'] {
      color: var(--g-danger-ink);
    }
    .verdict.neutral {
      color: var(--g-text);
    }
    .focus {
      list-style: none;
      margin: 0;
      padding: 0;
      display: grid;
      gap: 8px;
      li {
        padding: 14px 16px;
      }
      h3 {
        font-size: 1rem;
        margin: 2px 0 6px;
      }
      p.muted {
        font-size: 0.875rem;
        line-height: 1.5;
        margin: 0 0 8px;
      }
    }
    .rounds {
      display: grid;
      gap: 8px;
    }
    .round {
      padding: 14px 16px;
      h3 {
        font-size: 1rem;
        margin: 2px 0 4px;
      }
      .verdict {
        margin: 0 0 8px;
        font-size: 0.9375rem;
      }
      dl {
        display: grid;
        grid-template-columns: 1fr auto;
        gap: 4px 16px;
        margin: 0 0 10px;
        font-size: 0.875rem;
      }
      dd {
        margin: 0;
      }
    }
  `,
})
export class LoopDebriefComponent {
  readonly debrief = input.required<LoopDebrief>();
  readonly sessions = input.required<InterviewSession[]>();
  readonly names = TRACK_NAMES;
  readonly label = verdictLabel;
  readonly scoredBy = scoredBy;
  readonly allScripted = computed(() => this.debrief().scripted === this.sessions().length);
  readonly focus = computed(() => this.debrief().focus.map((f) => ({ ...f, practice: practice(f.target) })));
}
