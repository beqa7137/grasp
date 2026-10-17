import { formatDate } from '@angular/common';
import { ChangeDetectionStrategy, Component, LOCALE_ID, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { getPatternSummary, getSdTopic, type WeakSpot, type WeakSpotReason } from '@grasp/engine';
import { drillLink } from '../../core/links';
import { CrossLinkDirective } from '../../ui/cross-link.directive';
import { EntryRowComponent } from '../../ui/entry-row.component';

export const topicName = (id: string) => getPatternSummary(id)?.name ?? getSdTopic(id)?.name ?? id;

/**
 * Weak spots (REDESIGN.md 4.1): each topic with why it is weak, opening its own drill, and one "Drill these" that drills
 * them all in one sitting (journey 5).
 */
@Component({
  selector: 'app-weak-spot-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, CrossLinkDirective, EntryRowComponent],
  template: `
    <a class="g-btn primary drill" routerLink="/today/drill" [queryParams]="{ topics: topics() }"
      >{{ spots().length === 1 ? 'Drill this' : 'Drill these' }} · {{ cards() }} cards</a
    >
    <ul class="rows">
      @for (s of rows(); track s.topic) {
        <li>
          <a g-entry-row [go]="true" [heading]="s.name" [meta]="[s.why]" [routerLink]="s.link" crossLink></a>
        </li>
      }
    </ul>
  `,
  styles: `
    :host {
      display: grid;
      gap: var(--g-space-2);
    }
    .drill {
      justify-self: start;
    }
    .rows {
      list-style: none;
      margin: 0;
      padding: 0;
      display: grid;
    }
    li + li {
      border-top: 1px solid var(--g-line);
    }
  `,
})
export class WeakSpotListComponent {
  private readonly locale = inject(LOCALE_ID);
  readonly spots = input.required<readonly WeakSpot[]>();
  readonly topics = computed(() =>
    this.spots()
      .map((s) => s.topic)
      .join(','),
  );
  readonly cards = computed(() => this.spots().reduce((sum, s) => sum + s.cards, 0));
  readonly rows = computed(() =>
    this.spots().map((s) => ({ topic: s.topic, name: topicName(s.topic), why: this.why(s.reason), link: drillLink(s.topic) })),
  );

  private why(reason: WeakSpotReason): string {
    switch (reason.kind) {
      case 'flagged':
        return `Flagged in a mock round, ${formatDate(reason.at, 'MMM d', this.locale)}`;
      case 'predictions':
        return `Missed ${reason.missed} of ${reason.total} predictions`;
      case 'fading':
        return `${reason.below} of ${reason.graded} review cards fading`;
    }
  }
}
