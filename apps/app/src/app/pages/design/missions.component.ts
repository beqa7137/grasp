import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { IonIcon } from '@ionic/angular';
import { SCENARIO_CATALOG, SCENARIO_VARIANTS, fmt, getSdTopic, type ScenarioId } from '@grasp/engine';
import { addIcons } from 'ionicons';
import { checkmarkCircle, constructOutline, refreshCircleOutline } from 'ionicons/icons';
import { ProgressService } from '../../core/progress.service';
import { FREE_BUILD } from './free-build';

/**
 * The Design hub's Missions (REDESIGN.md 2.8): the nine missions in a grid with passed, best cost and revisits, then the
 * Lab. A topic in the URL (from a Topics row) keeps only the missions that use it.
 */
@Component({
  selector: 'app-design-missions',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, DatePipe, IonIcon],
  template: `
    <div class="page">
      <h1>Missions</h1>
      <p class="summary">{{ summary() }}</p>
      @if (topicName(); as name) {
        <p class="topic">
          Missions that use {{ name }} ·
          <a routerLink="/design/missions" [replaceUrl]="true">Show all missions</a>
        </p>
      }

      <ul class="grid">
        @for (s of shown(); track s.id) {
          @let done = progress.state().missions[s.id];
          @let revisit = revisitFor(s.id);
          <li>
            <a class="mission" [routerLink]="['/design/missions', s.id]" [class.done]="done">
              <span class="num" aria-hidden="true">{{ s.number }}</span>
              <div class="body">
                <h2 class="title">{{ s.title }}</h2>
                <span class="tagline">{{ s.tagline }}</span>
                <span class="facts">
                  {{ fmt(s.workload.rps) }} rps · {{ percent(s.workload.readRatio) }}% reads
                  @if (s.workload.objectShare) {
                    · {{ percent(s.workload.objectShare) }}% files
                  }
                  · p99 ≤ {{ s.goals.maxP99Ms }} ms · ≤ \${{ fmt(s.goals.maxMonthlyCost) }}/mo
                </span>
                @if (done) {
                  <span class="passed"
                    ><ion-icon name="checkmark-circle" aria-hidden="true" />Passed · best \${{ fmt(done.bestCost) }}/mo ·
                    {{ done.revisitsDone }}/{{ variants[s.id].length }} revisits</span
                  >
                }
              </div>
            </a>
            @if (revisit) {
              <a
                class="revisit"
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
          </li>
        }
        <li>
          <a class="mission free" routerLink="/design/lab">
            <span class="num" aria-hidden="true"><ion-icon name="construct-outline" aria-hidden="true" /></span>
            <div class="body">
              <h2 class="title">The Lab: {{ free.title }}</h2>
              <span class="tagline">{{ free.tagline }}</span>
            </div>
          </a>
        </li>
      </ul>
    </div>
  `,
  styles: `
    @use '../../../breakpoints' as *;

    .page {
      container-type: inline-size;
    }
    h1 {
      margin: 0;
      font-size: var(--g-text-display-l);
      line-height: 1.2;
    }
    .summary {
      margin: var(--g-space-1) 0 var(--g-space-3);
      font-size: var(--g-text-body-s);
      color: var(--g-muted);
    }
    .topic {
      margin: 0 0 var(--g-space-3);
      font-size: var(--g-text-body);
      a {
        padding-block: var(--g-space-1);
      }
    }
    .grid {
      display: grid;
      gap: var(--g-space-3);
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      align-items: start;
    }
    @include container-narrow {
      .grid {
        grid-template-columns: minmax(0, 1fr);
      }
    }
    li {
      display: flex;
      flex-direction: column;
      gap: var(--g-space-1);
    }
    .mission {
      flex: 1;
      display: flex;
      gap: var(--g-space-3);
      align-items: flex-start;
      padding: var(--g-space-4);
      border-radius: var(--g-radius-sm);
      background: var(--g-sunken);
      color: var(--g-text);
      text-decoration: none;
    }
    .num {
      flex: none;
      width: 40px;
      height: 40px;
      border-radius: var(--g-radius-sm);
      display: grid;
      place-items: center;
      background: var(--g-accent-soft);
      color: var(--g-text);
      font-size: var(--g-text-title-l);
      font-weight: 700;
    }
    .done .num {
      background: rgba(var(--g-found-rgb), 0.14);
      color: var(--g-success-ink);
    }
    .free .num {
      background: var(--g-raised);
      color: var(--g-muted);
    }
    .body {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: var(--g-space-1);
    }
    .title {
      margin: 0;
      font-family: inherit;
      letter-spacing: normal;
      font-weight: 600;
      font-size: var(--g-text-title-m);
      line-height: 1.3;
    }
    .tagline {
      font-size: var(--g-text-body);
      line-height: 1.45;
      color: var(--g-muted);
    }
    .facts {
      font-size: var(--g-text-body-s);
      color: var(--g-muted);
      font-variant-numeric: tabular-nums;
    }
    .passed {
      display: inline-flex;
      align-items: center;
      gap: var(--g-space-1);
      font-size: var(--g-text-body-s);
      font-weight: 600;
      color: var(--g-success-ink);
    }
    .revisit {
      display: flex;
      gap: var(--g-space-3);
      align-items: flex-start;
      padding: var(--g-space-3) var(--g-space-4);
      border: 1px solid var(--g-line);
      border-radius: var(--g-radius-sm);
      color: var(--g-text);
      text-decoration: none;
      font-size: var(--g-text-body-s);
      ion-icon {
        flex: none;
        width: 1.4em;
        height: 1.4em;
        color: var(--g-muted);
      }
      strong {
        display: block;
        margin-bottom: var(--g-space-1);
      }
      .muted {
        line-height: 1.45;
      }
      &.due {
        border-color: rgba(var(--g-warn-rgb), 0.55);
        ion-icon,
        strong {
          color: var(--g-warn-ink);
        }
      }
    }
  `,
})
export class MissionsComponent {
  readonly progress = inject(ProgressService);
  readonly variants = SCENARIO_VARIANTS;
  readonly free = FREE_BUILD;
  readonly fmt = fmt;
  /** Bound from the URL: a topic id, from a Topics row's "Used in" link. */
  readonly topic = input<string>();
  private readonly listed = computed(() => getSdTopic(this.topic() ?? '')?.scenarioIds ?? null);
  readonly topicName = computed(() => (this.listed() ? getSdTopic(this.topic()!)!.name : null));
  readonly shown = computed(() => {
    const listed = this.listed();
    return SCENARIO_CATALOG.map((s, i) => ({ ...s, number: i + 1 })).filter((s) => !listed || listed.includes(s.id));
  });
  readonly summary = computed(() => {
    const passed = SCENARIO_CATALOG.filter((s) => this.progress.state().missions[s.id]).length;
    const due = this.progress.dueMissions().length;
    return [`${passed} of ${SCENARIO_CATALOG.length} passed`, ...(due ? [`${due} revisit${due === 1 ? '' : 's'} due`] : [])].join(' · ');
  });

  constructor() {
    addIcons({ checkmarkCircle, constructOutline, refreshCircleOutline });
  }

  ionViewWillEnter() {
    this.progress.now.set(new Date());
  }

  percent(share: number) {
    return Math.round(share * 100);
  }

  revisitFor(id: string) {
    return this.progress.missions().find((m) => m.scenarioId === id) ?? null;
  }

  twist(id: string, variant: number) {
    return SCENARIO_VARIANTS[id as ScenarioId]?.[variant - 1]?.twist ?? '';
  }
}
