import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { IonIcon } from '@ionic/angular';
import {
  CASE_CATALOG,
  SCENARIO_CATALOG,
  SCENARIO_VARIANTS,
  getCaseBrief,
  fmt,
  getSdTopic,
  type CaseSummary,
  type ScenarioId,
} from '@grasp/engine';
import { addIcons } from 'ionicons';
import { checkmarkCircle, constructOutline, documentTextOutline, refreshCircleOutline } from 'ionicons/icons';
import { ProgressService } from '../../core/progress.service';
import { CaseDraftsService } from './case/case-drafts.service';
import { FREE_BUILD } from './free-build';

@Component({
  selector: 'app-design-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, DecimalPipe, DatePipe, IonIcon],
  template: `
    <div class="page">
      @if (show() === 'missions') {
        <p class="eyebrow">System design sandbox</p>
        <h1>Build it. Load it. Break it.</h1>
        <p class="muted lead">
          Wire up real components, then watch utilization, tail latency, errors and cost react as the traffic hits. Each mission is a
          production incident waiting to happen.
        </p>

        <div class="list">
          @for (s of scenarios; track s.id; let i = $index) {
            @let done = progress.state().missions[s.id];
            @let revisit = revisitFor(s.id);
            <a class="panel card-link mission" [routerLink]="['/design/missions', s.id]" [class.done]="done">
              <span class="num display">{{ i + 1 }}</span>
              <div class="body">
                <h2>{{ s.title }}</h2>
                <p class="muted">{{ s.tagline }}</p>
                <div class="chips">
                  <span class="chip mono">{{ fmt(s.workload.rps) }} rps</span>
                  <span class="chip mono">{{ s.workload.readRatio * 100 | number: '1.0-0' }}% reads</span>
                  @if (s.workload.objectShare) {
                    <span class="chip mono">{{ s.workload.objectShare * 100 | number: '1.0-0' }}% files</span>
                  }
                  <span class="chip mono">p99 ≤ {{ s.goals.maxP99Ms }} ms</span>
                  <span class="chip mono">≤ \${{ fmt(s.goals.maxMonthlyCost) }}/mo</span>
                </div>
              </div>
              @if (done) {
                <span class="badge"
                  ><ion-icon name="checkmark-circle" aria-hidden="true" />best \${{ fmt(done.bestCost) }}/mo · {{ done.revisitsDone }}/{{
                    variants[s.id].length
                  }}
                  revisits</span
                >
              }
            </a>
            @if (revisit) {
              <a
                class="panel card-link revisit"
                [class.due]="revisit.due"
                [routerLink]="['/design/missions', s.id]"
                [queryParams]="{ revisit: revisit.variant }"
              >
                <ion-icon name="refresh-circle-outline" aria-hidden="true" />
                <span>
                  <strong>Revisit {{ revisit.variant }} {{ revisit.due ? 'is due' : 'unlocks ' + (revisit.dueAt | date: 'MMM d') }}</strong>
                  <span class="muted">{{ twist(s.id, revisit.variant) }}</span>
                </span>
              </a>
            }
          }
          <a class="panel card-link mission free" routerLink="/design/lab">
            <span class="num"><ion-icon name="construct-outline" aria-hidden="true" /></span>
            <div class="body">
              <h2>{{ free.title }}</h2>
              <p class="muted">{{ free.tagline }}</p>
            </div>
          </a>
        </div>
      } @else {
        <p class="eyebrow">Interview case studies</p>
        <h1>Run the interview, then defend it.</h1>
        <p class="muted lead">
          Classic questions worked the way a strong candidate runs the interview: clarify, estimate, design, then defend the trade-offs.
        </p>
        <div class="list">
          @for (c of cases; track c.id) {
            @let draft = drafts.draft(c.id);
            @let finished = progress.state().cases[c.id];
            @let stage = stageOf(c);
            <a class="panel card-link mission case" [routerLink]="['/design/cases', c.id]" [class.done]="finished && !stage">
              <span class="num"><ion-icon name="document-text-outline" aria-hidden="true" /></span>
              <div class="body">
                <h2>{{ c.title }}</h2>
                <p class="muted">{{ brief(c.id) }}</p>
                <div class="chips">
                  <span class="chip">{{ c.level === 'core' ? 'Core' : 'Advanced' }}</span>
                  @for (t of c.topics; track t) {
                    <span class="chip">{{ topicName(t) }}</span>
                  }
                </div>
              </div>
              @if (stage) {
                <span class="badge progress">Stage {{ stage }} of {{ c.stages }}</span>
              } @else if (finished) {
                <span class="badge"><ion-icon name="checkmark-circle" aria-hidden="true" />Finished</span>
              }
            </a>
            @if (finished && !stage) {
              <div class="panel case-done">
                <span class="muted"
                  >Decisions as recommended: {{ finished.bestChoices }} of {{ finished.decisions }}. Estimates within 2x:
                  {{ finished.closeEstimates }} of {{ finished.estimates }}.</span
                >
                @if (draft) {
                  <span class="actions">
                    <a class="g-btn ghost" [routerLink]="['/design/cases', c.id]" [attr.aria-label]="'Review: ' + c.title">Review</a>
                    <button class="g-btn ghost" (click)="restart(c.id)" [attr.aria-label]="'Start over: ' + c.title">Start over</button>
                  </span>
                }
              </div>
            }
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
      max-width: 62ch;
      line-height: 1.5;
      margin: 0 0 22px;
    }
    .list {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .mission {
      display: flex;
      gap: 16px;
      align-items: flex-start;
      padding: 16px;
      position: relative;
    }
    .num {
      flex: none;
      width: 44px;
      height: 44px;
      border-radius: 12px;
      display: grid;
      place-items: center;
      background: var(--g-accent-soft);
      color: var(--g-accent);
      font-size: 20px;
      font-weight: 700;
    }
    .done .num {
      background: rgba(var(--g-found-rgb), 0.14);
      color: var(--g-found);
    }
    .free .num {
      background: var(--g-raised);
      color: var(--g-muted);
    }
    .body {
      flex: 1;
      min-width: 0;
    }
    h2,
    h3 {
      font-size: 1.125rem;
      margin: 2px 0 4px;
    }
    p {
      margin: 0 0 10px;
      font-size: 0.875rem;
    }
    .chips {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }
    .badge {
      position: absolute;
      top: 14px;
      right: 14px;
      display: inline-flex;
      align-items: center;
      gap: 4px;
      color: var(--g-found);
      font-size: 0.75rem;
      font-weight: 600;
    }
    .revisit {
      display: flex;
      gap: 12px;
      align-items: flex-start;
      padding: 12px 16px;
      margin: -6px 0 0 24px;
      font-size: 0.84375rem;
      ion-icon {
        font-size: 22px;
        color: var(--g-muted);
        flex: none;
      }
      strong {
        display: block;
        margin-bottom: 3px;
      }
      .muted {
        line-height: 1.45;
      }
      &.due {
        border-color: rgba(var(--g-warn-rgb), 0.55);
        ion-icon,
        strong {
          color: var(--g-warn);
        }
      }
    }
    .badge.progress {
      color: var(--g-accent);
    }
    .case-done {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 8px 12px;
      padding: 10px 16px;
      margin: -6px 0 0 24px;
      font-size: 0.84375rem;
      .muted {
        line-height: 1.45;
      }
      .actions {
        display: flex;
        gap: 8px;
      }
      a {
        text-decoration: none;
      }
    }
    @media (max-width: 560px) {
      .badge {
        position: static;
        align-self: center;
      }
      .mission {
        flex-wrap: wrap;
      }
      .case .body {
        flex-basis: calc(100% - 60px);
      }
      .case .badge {
        margin-left: 60px;
      }
    }
  `,
})
export class DesignListPage {
  readonly show = input<'missions' | 'cases'>('missions');
  readonly progress = inject(ProgressService);
  readonly drafts = inject(CaseDraftsService);
  private readonly router = inject(Router);
  readonly scenarios = SCENARIO_CATALOG;
  readonly variants = SCENARIO_VARIANTS;
  readonly free = FREE_BUILD;
  readonly cases = CASE_CATALOG;
  readonly fmt = fmt;

  constructor() {
    addIcons({ checkmarkCircle, constructOutline, documentTextOutline, refreshCircleOutline });
  }

  topicName(id: string) {
    return getSdTopic(id)?.name ?? id;
  }

  brief(id: string) {
    return getCaseBrief(id)?.summary;
  }

  ionViewWillEnter() {
    this.progress.now.set(new Date());
    void this.drafts.load();
  }

  /** The stage a run on this device has open, or null when there is none or it finished the case. */
  stageOf(c: CaseSummary): number | null {
    const draft = this.drafts.draft(c.id);
    if (!draft || (draft.reached >= c.stages && this.progress.state().cases[c.id])) return null;
    return Math.min(draft.reached + 1, c.stages);
  }

  restart(caseId: string) {
    void this.router.navigate(['/design/cases', caseId], { state: { startOver: true } });
  }

  revisitFor(id: string) {
    return this.progress.missions().find((m) => m.scenarioId === id) ?? null;
  }

  twist(id: string, variant: number) {
    return SCENARIO_VARIANTS[id as ScenarioId]?.[variant - 1]?.twist ?? '';
  }
}
