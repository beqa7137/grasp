import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ROUND_NAMES, type UpNextCard } from '@grasp/engine';
import { uniqueId } from '../../core/unique-id';
import { CrossLinkDirective } from '../../ui/cross-link.directive';
import { formatMinutes } from '../plan/duration';
import { actionLink, actionQuery } from './up-next-links';

/** The one thing to do next (REDESIGN.md 2.3): its title, round and time, why, and Start or "Not today". */
@Component({
  selector: 'app-up-next-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, CrossLinkDirective],
  template: `
    @let c = card();
    <article class="card" [attr.aria-labelledby]="id + '-title'">
      @if (label()) {
        <p class="label">Up next</p>
      }
      <h3 [id]="id + '-title'" tabindex="-1">{{ c.title }}</h3>
      @if (meta(); as m) {
        <p class="meta">{{ m }}</p>
      }
      <p class="reason" [id]="id + '-reason'">{{ c.reason }}</p>
      <div class="actions">
        @if (link(); as l) {
          <a class="g-btn primary start" [routerLink]="l" [queryParams]="query()" crossLink [attr.aria-describedby]="id + '-reason'">{{
            verb()
          }}</a>
        }
        @if (c.action.kind !== 'rest') {
          <button type="button" class="g-btn ghost" (click)="notToday.emit()">Not today</button>
        }
      </div>
    </article>
  `,
  styles: `
    @use '../../../type' as *;

    .card {
      display: grid;
      gap: var(--g-space-2);
      padding: var(--g-space-4);
      border: 1px solid var(--g-accent);
      border-radius: var(--g-radius-md);
      background: var(--g-surface);
      box-shadow: var(--g-shadow-raised);
    }
    .label {
      @include label;
      margin: 0;
      color: var(--g-accent);
    }
    h3 {
      @include title;
      margin: 0;
      font-size: var(--g-text-title-m);
      line-height: 1.35;
      &:focus {
        outline: none;
      }
    }
    .meta,
    .reason {
      margin: 0;
      font-size: var(--g-text-body);
      line-height: 1.5;
    }
    .meta {
      color: var(--g-muted);
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--g-space-2);
      margin-top: var(--g-space-2);
      .start {
        flex: 1 1 200px;
      }
    }
  `,
})
export class UpNextCardComponent {
  readonly card = input.required<UpNextCard>();
  /** Inside the plan's checklist the card says what it is; under its own "Up next" heading it need not. */
  readonly label = input(false);
  readonly notToday = output<void>();
  readonly id = uniqueId('up-next');
  readonly link = computed(() => actionLink(this.card().action));
  readonly query = computed(() => actionQuery(this.card().action));
  readonly verb = computed(() => {
    switch (this.card().action.kind) {
      case 'device-work':
        return 'Continue';
      case 'review':
        return 'Start review';
      default:
        return 'Start';
    }
  });
  readonly meta = computed(() => {
    const { round, minutes } = this.card();
    const parts = [round ? ROUND_NAMES[round] : null, minutes ? `about ${formatMinutes(minutes)}` : null].filter(Boolean);
    return parts.join(' · ');
  });
}
