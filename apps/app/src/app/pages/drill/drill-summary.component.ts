import { ChangeDetectionStrategy, Component, ElementRef, afterNextRender, computed, inject, input, output } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { IonIcon } from '@ionic/angular';
import { getScenarioSummary } from '@grasp/engine';
import { drillLink } from '../../core/links';
import { ProgressService } from '../../core/progress.service';
import { ForecastComponent } from '../../review/forecast.component';
import { ChipComponent } from '../../ui/chip.component';
import { CrossLinkDirective } from '../../ui/cross-link.directive';
import { EmptyStateComponent } from '../../ui/empty-state.component';
import { EntryRowComponent } from '../../ui/entry-row.component';
import { caughtUpIcon, designIcon, visualizeIcon } from '../../ui/icons';
import { StatComponent } from '../../ui/stat.component';

export interface DrillScore {
  correct: number;
  total: number;
  minutes: number;
  missed: { id: string; name: string }[];
}

/** What a review or practice shows once no card is left: the sitting's score, or "All caught up", and any mission revisits. */
@Component({
  selector: 'app-drill-summary',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    RouterLink,
    IonIcon,
    CrossLinkDirective,
    ForecastComponent,
    ChipComponent,
    EmptyStateComponent,
    EntryRowComponent,
    StatComponent,
  ],
  template: `
    @if (score(); as s) {
      <section class="panel summary">
        <h2 class="score" tabindex="-1">{{ s.correct }}/{{ s.total }}</h2>
        <p class="muted">{{ practice() ? 'practice answers' : 'reviews' }} · {{ s.minutes }} min</p>

        @if (!practice()) {
          <div class="metrics">
            <g-stat label="Retention (30d)" [value]="retention()" hint="target 90%" />
            <g-stat label="Next review" [value]="(progress.session().nextDueAt | date: 'EEE h:mm a') ?? '–'" />
          </div>
        }

        <div class="actions">
          @if (!practice() && progress.session().items.length) {
            <button class="g-btn primary" (click)="keepGoing.emit()">Keep going · {{ progress.session().items.length }} more</button>
          }
          @if (practice()) {
            <a class="g-btn primary" routerLink="/today/review" crossLink>Back to your review</a>
          }
        </div>

        @if (s.missed.length) {
          <p class="sub">You missed these today. Practice them now or let the schedule bring them back:</p>
          <div class="chips">
            @for (t of s.missed; track t.id) {
              <a g-chip [routerLink]="drillLink(t.id)" crossLink>{{ t.name }}</a>
            }
          </div>
        }

        @if (!practice()) {
          <div class="coming">
            <p class="eyebrow">Coming up</p>
            <g-forecast [days]="progress.forecast()" />
          </div>
        }
      </section>
    } @else {
      <section class="panel summary">
        <g-empty-state heading="All caught up" [icon]="icons.caughtUp" tone="success">
          @if (progress.session().nextDueAt; as next) {
            Next review {{ next | date: 'EEE h:mm a' }}. Coming back on time is what makes spacing work.
          } @else {
            Nothing scheduled yet.
          }
        </g-empty-state>
        @if (progress.settings().newPerDay === 0) {
          <p class="muted small">New cards are paused. <a routerLink="/today/settings" crossLink>Change it in Settings</a>.</p>
        }
        <div class="coming">
          <p class="eyebrow">Coming up</p>
          <g-forecast [days]="progress.forecast()" />
        </div>
        <p class="sub">Unlock more kinds of review:</p>
        <div class="unlocks">
          <a class="g-btn" routerLink="/coding/visualizers" crossLink
            ><ion-icon [icon]="icons.visualize" aria-hidden="true" />Visualize an algorithm → predict checkpoints</a
          >
          <a class="g-btn" routerLink="/design/missions" crossLink
            ><ion-icon [icon]="icons.design" aria-hidden="true" />Finish a Design Lab mission → system design cards</a
          >
        </div>
      </section>
    }

    @if (progress.dueMissions().length) {
      <section class="panel missions">
        <p class="eyebrow">Mission revisits due</p>
        @for (m of progress.dueMissions(); track m.scenarioId) {
          <a
            g-entry-row
            [heading]="scenarioTitle(m.scenarioId) + ' · revisit ' + m.variant"
            [kind]="icons.design"
            [go]="true"
            [routerLink]="['/design/missions', m.scenarioId]"
            [queryParams]="{ revisit: m.variant }"
            crossLink
          ></a>
        }
      </section>
    }
  `,
  styles: `
    :host {
      display: block;
    }
    .summary {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: var(--g-space-3);
      padding: var(--g-space-6) var(--g-space-5);
      text-align: center;
    }
    p {
      margin: 0;
      max-width: 50ch;
      line-height: 1.55;
    }
    .score {
      margin: 0;
      font-size: var(--g-text-display-xl);
      line-height: 1.1;
      font-variant-numeric: tabular-nums;
    }
    .sub {
      margin-top: var(--g-space-3);
      font-size: var(--g-text-body);
      color: var(--g-muted);
    }
    .metrics {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(10em, 1fr));
      gap: var(--g-space-2);
      width: 100%;
      max-width: 420px;
      margin-top: var(--g-space-2);
    }
    .chips {
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      gap: var(--g-space-2);
    }
    .coming {
      width: 100%;
      max-width: 420px;
      margin-top: var(--g-space-3);
      text-align: left;
    }
    .coming .eyebrow {
      margin-bottom: var(--g-space-2);
    }
    .actions {
      display: flex;
      gap: var(--g-space-2);
      margin-top: var(--g-space-3);
    }
    .actions:empty {
      display: none;
    }
    .unlocks {
      display: flex;
      flex-direction: column;
      gap: var(--g-space-2);
      width: 100%;
      max-width: 460px;
    }
    .unlocks .g-btn {
      justify-content: flex-start;
      font-size: var(--g-text-body-s);
    }
    .missions {
      display: flex;
      flex-direction: column;
      gap: var(--g-space-2);
      margin-top: var(--g-space-4);
      padding: var(--g-space-4);
    }
  `,
})
export class DrillSummaryComponent {
  readonly practice = input(false);
  /** The sitting's result, or null when there was nothing to review. */
  readonly score = input<DrillScore | null>(null);
  readonly keepGoing = output<void>();
  readonly progress = inject(ProgressService);
  readonly drillLink = drillLink;
  readonly icons = { caughtUp: caughtUpIcon, visualize: visualizeIcon, design: designIcon };
  readonly retention = computed(() => {
    const r = this.progress.retention();
    return r === null ? '–' : `${(r * 100).toFixed(0)}%`;
  });

  constructor() {
    const host: HTMLElement = inject(ElementRef).nativeElement;
    // The summary replaces the last card, so the content would otherwise keep that card's scroll, and focus the card's
    // gone button.
    afterNextRender(() => {
      void (host.closest('ion-content') as HTMLIonContentElement | null)?.scrollToTop(0);
      host.querySelector<HTMLElement>('.summary h2')?.focus({ preventScroll: true });
    });
  }

  scenarioTitle(id: string) {
    return getScenarioSummary(id)?.title ?? id;
  }
}
