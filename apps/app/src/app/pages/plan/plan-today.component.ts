import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IonIcon } from '@ionic/angular';
import { getProblemSummary, type PlanDay, type PlanUnit } from '@grasp/engine';
import { addIcons } from 'ionicons';
import { checkmarkCircle, ellipseOutline } from 'ionicons/icons';
import { CrossLinkDirective } from '../../ui/cross-link.directive';
import { formatMinutes } from './duration';
import { unitLink } from './plan-links';

/** "1 of 5 done · about 25 min left": the header Today puts over the list. Units hidden for today are not left. */
export function daySummary(day: PlanDay, hidden: ReadonlySet<string> = new Set()): string {
  const done = day.slices.filter((s) => s.done).length;
  const open = day.slices.filter((s) => !s.done && !hidden.has(s.unit.id));
  // Slices of a split unit carry odd minutes; the header rounds like every other estimate.
  const left = Math.round(open.reduce((sum, s) => sum + s.minutes, 0) / 5) * 5;
  return `${done} of ${day.slices.length} done${left ? ` · about ${formatMinutes(left)} left` : ''}`;
}

/**
 * Today's slices of the plan as a checklist (REDESIGN.md 2.7), shared by Today and the Study plan page. The row whose unit
 * is `expanded` shows the projected content instead (Today's Up next card); `details` adds each unit's line.
 */
@Component({
  selector: 'app-plan-today',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, IonIcon, CrossLinkDirective],
  template: `
    <ul class="rows">
      @for (s of day().slices; track s.unit.id) {
        @if (s.unit.id === expanded()) {
          <li class="expanded"><ng-content /></li>
        } @else {
          <li class="row" [class.done]="s.done" [class.later]="hidden().has(s.unit.id)">
            <ion-icon [name]="s.done ? 'checkmark-circle' : 'ellipse-outline'" aria-hidden="true" />
            <span class="text">
              <a [routerLink]="link(s.unit)" crossLink>
                @if (s.done) {
                  <span class="visually-hidden">Done: </span>
                }
                {{ s.unit.title }}</a
              >
              @if (details()) {
                <span class="muted">{{ s.unit.detail }}</span>
                @if (s.unit.kind === 'pattern' && !s.done) {
                  <a class="also" [routerLink]="['/coding/problems', s.unit.problemId]" crossLink>Solve {{ problemTitle(s.unit) }}</a>
                }
              }
              <span class="meta"
                >{{ hidden().has(s.unit.id) ? 'Not today · ' : '' }}about {{ duration(s.minutes)
                }}{{ s.parts > 1 ? ' · part ' + s.part + ' of ' + s.parts : '' }}</span
              >
            </span>
          </li>
        }
      }
    </ul>
  `,
  styles: `
    .rows {
      list-style: none;
      margin: 0;
      padding: 0;
      display: grid;
    }
    .row {
      display: flex;
      gap: var(--g-space-3);
      align-items: flex-start;
      padding: var(--g-space-3) 0;
      border-top: 1px solid var(--g-line);
      ion-icon {
        flex: none;
        font-size: var(--g-text-title-l);
        color: var(--g-muted);
      }
      &.done ion-icon {
        color: var(--g-found-ink);
      }
      &.done .text > a:first-child {
        text-decoration: line-through;
      }
      &.later .text {
        color: var(--g-muted);
      }
      &.later .text > a:first-child {
        color: var(--g-muted);
        font-weight: 500;
      }
    }
    .rows > :first-child {
      border-top: 0;
    }
    .expanded {
      padding: var(--g-space-2) 0;
    }
    .expanded + .row {
      border-top: 0;
    }
    .text {
      display: grid;
      gap: var(--g-space-1);
      min-width: 0;
      line-height: 1.45;
      font-size: var(--g-text-title-s);
      > a:first-child {
        font-weight: 600;
      }
      .muted {
        font-size: var(--g-text-body);
      }
    }
    .also {
      font-size: var(--g-text-body);
      justify-self: start;
    }
    .meta {
      font-size: var(--g-text-body-s);
      color: var(--g-muted);
    }
  `,
})
export class PlanTodayComponent {
  readonly day = input.required<PlanDay>();
  readonly expanded = input<string | null>(null);
  readonly details = input(false);
  /** Unit ids hidden with "Not today": still in the list, unchecked, and marked "Not today". */
  readonly hidden = input<ReadonlySet<string>>(new Set());
  readonly link = unitLink;
  readonly duration = formatMinutes;

  constructor() {
    addIcons({ checkmarkCircle, ellipseOutline });
  }

  problemTitle(unit: PlanUnit) {
    return getProblemSummary(unit.problemId ?? '')?.title ?? 'a problem';
  }
}
