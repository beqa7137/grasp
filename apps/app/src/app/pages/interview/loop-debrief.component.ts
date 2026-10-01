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
import type { InterviewSession } from './interview.types';

const verdictLabel = (verdict: string) => verdict.replace(/-/g, ' ');

/** Where a thing to work on is practised, and what the link says. */
function practice(target: FocusTarget): { link: string[]; label: string } {
  switch (target.kind) {
    case 'pattern':
      return { link: ['/learn/pattern', target.patternId], label: `Study ${getPatternSummary(target.patternId)?.name ?? 'the pattern'}` };
    case 'design-topic':
      return { link: ['/learn/design', target.topicId], label: `Read the ${getSdTopic(target.topicId)?.name ?? ''} lesson` };
    case 'case':
      return { link: ['/design/case', target.caseId], label: `Work the ${getCaseSummary(target.caseId)?.title ?? ''} case study` };
    case 'competency':
      return {
        link: ['/behavioral', target.competencyId],
        label: `Read the ${getCompetencySummary(target.competencyId)?.name ?? ''} guide`,
      };
    case 'round':
      return { link: ['/interview', target.sessionId], label: 'Read this round again' };
  }
}

@Component({
  selector: 'app-loop-debrief',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  template: `
    @let d = debrief();
    <section class="panel read" aria-labelledby="read-kind read-title">
      <p id="read-kind" class="eyebrow">Practice read, not a hiring decision</p>
      <h2 id="read-title" class="verdict" [attr.data-verdict]="d.verdict">{{ label(d.verdict) }}</h2>
      <p>
        Read the way a hiring committee reads a loop: the rounds' average, never more than one step above the weakest round.
        @if (d.heldBy) {
          Your {{ names[d.heldBy].toLowerCase() }} round held it down.
        }
      </p>
      @if (d.scripted) {
        <p class="muted">
          Scripted practice scored {{ d.scripted === sessions().length ? 'every round' : d.scripted + ' of the rounds' }}: it checks which
          rubric areas you covered, not whether your answers were right.
        </p>
      }
    </section>

    <h2>Work on next</h2>
    @if (focus().length) {
      <ol class="focus">
        @for (f of focus(); track $index) {
          <li class="panel">
            <p class="eyebrow">{{ names[f.track] }} · {{ f.score }} of 4</p>
            <h3>{{ f.dimension }}</h3>
            @if (f.lookFor) {
              <p class="muted">{{ f.lookFor }}</p>
            }
            <a [routerLink]="f.practice.link">{{ f.practice.label }}</a>
          </li>
        }
      </ol>
    } @else {
      <p class="muted">Every rubric area scored 4 of 4. Keep your reviews going until the day.</p>
    }

    <h2>Rounds</h2>
    <div class="rounds">
      @for (s of sessions(); track s.id) {
        @if (s.scorecard; as card) {
          <section class="panel round" [attr.aria-labelledby]="'round-' + s.id">
            <p class="eyebrow">{{ names[s.track] }} · {{ card.mode === 'ai' ? 'AI feedback' : 'scripted practice estimate' }}</p>
            <h3 [id]="'round-' + s.id">{{ s.problem.title }}</h3>
            <p class="verdict" [attr.data-verdict]="card.verdict">{{ label(card.verdict) }}</p>
            <dl>
              @for (dim of card.dimensions; track dim.name) {
                <dt>{{ dim.name }}</dt>
                <dd class="mono">{{ dim.score }}/4</dd>
              }
            </dl>
            <a [routerLink]="['/interview', s.id]">Scorecard and transcript</a>
          </section>
        }
      }
    </div>
  `,
  styles: `
    h2 {
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
  readonly focus = computed(() => this.debrief().focus.map((f) => ({ ...f, practice: practice(f.target) })));
}
