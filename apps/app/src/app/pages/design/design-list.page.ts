import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { IonContent, IonHeader, IonIcon, IonTitle, IonToolbar } from '@ionic/angular';
import { CASE_CATALOG, SCENARIO_CATALOG, fmt, getScenarioSummary, getSdTopic } from '@grasp/engine';
import { addIcons } from 'ionicons';
import { checkmarkCircle, constructOutline, documentTextOutline, refreshCircleOutline } from 'ionicons/icons';
import { ProgressService } from '../../core/progress.service';
import { FREE_BUILD } from './free-build';

@Component({
  selector: 'app-design-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, DecimalPipe, DatePipe, IonHeader, IonToolbar, IonTitle, IonContent, IonIcon],
  template: `
    <ion-header [translucent]="true">
      <ion-toolbar><ion-title>Design Lab</ion-title></ion-toolbar>
    </ion-header>
    <ion-content [fullscreen]="true">
      <div class="page">
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
            <a class="panel card-link mission" [routerLink]="['/design', s.id]" [class.done]="done">
              <span class="num display">{{ i + 1 }}</span>
              <div class="body">
                <h2>{{ s.title }}</h2>
                <p class="muted">{{ s.tagline }}</p>
                <div class="chips">
                  <span class="chip mono">{{ fmt(s.workload.rps) }} rps</span>
                  <span class="chip mono">{{ s.workload.readRatio * 100 | number: '1.0-0' }}% reads</span>
                  <span class="chip mono">p99 ≤ {{ s.goals.maxP99Ms }} ms</span>
                  <span class="chip mono">≤ \${{ fmt(s.goals.maxMonthlyCost) }}/mo</span>
                </div>
              </div>
              @if (done) {
                <span class="badge"
                  ><ion-icon name="checkmark-circle" aria-hidden="true" />best \${{ fmt(done.bestCost) }}/mo · {{ done.revisitsDone }}/{{
                    s.variants.length
                  }}
                  revisits</span
                >
              }
            </a>
            @if (revisit) {
              <a
                class="panel card-link revisit"
                [class.due]="revisit.due"
                [routerLink]="['/design', s.id]"
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
          <a class="panel card-link mission free" [routerLink]="['/design', free.id]">
            <span class="num"><ion-icon name="construct-outline" aria-hidden="true" /></span>
            <div class="body">
              <h2>{{ free.title }}</h2>
              <p class="muted">{{ free.tagline }}</p>
            </div>
          </a>
        </div>

        <h2 class="section-title" id="cases">Interview case studies</h2>
        <p class="muted section-lead">
          Classic questions worked the way a strong candidate runs the interview: clarify, estimate, design, then defend the trade-offs.
        </p>
        <div class="list">
          @for (c of cases; track c.id) {
            <a class="panel card-link mission" [routerLink]="['/design/case', c.id]">
              <span class="num"><ion-icon name="document-text-outline" aria-hidden="true" /></span>
              <div class="body">
                <h3>{{ c.title }}</h3>
                <p class="muted">{{ c.summary }}</p>
                <div class="chips">
                  <span class="chip">{{ c.level === 'core' ? 'Core' : 'Advanced' }}</span>
                  @for (t of c.topics; track t) {
                    <span class="chip">{{ topicName(t) }}</span>
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
    .section-title {
      font-size: 1.25rem;
      margin: 32px 0 6px;
    }
    .section-lead {
      max-width: 62ch;
      line-height: 1.5;
      margin: 0 0 14px;
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
    @media (max-width: 560px) {
      .badge {
        position: static;
        align-self: center;
      }
      .mission {
        flex-wrap: wrap;
      }
    }
  `,
})
export class DesignListPage {
  readonly progress = inject(ProgressService);
  readonly scenarios = SCENARIO_CATALOG;
  readonly free = FREE_BUILD;
  readonly cases = CASE_CATALOG;
  readonly fmt = fmt;

  constructor() {
    addIcons({ checkmarkCircle, constructOutline, documentTextOutline, refreshCircleOutline });
  }

  topicName(id: string) {
    return getSdTopic(id)?.name ?? id;
  }

  ionViewWillEnter() {
    this.progress.now.set(new Date());
  }

  revisitFor(id: string) {
    return this.progress.missions().find((m) => m.scenarioId === id) ?? null;
  }

  twist(id: string, variant: number) {
    return getScenarioSummary(id)?.variants[variant - 1]?.twist ?? '';
  }
}
