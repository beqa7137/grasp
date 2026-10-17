import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CrossLinkDirective } from '../../ui/cross-link.directive';
import { EntryRowComponent } from '../../ui/entry-row.component';
import type { WorkItem } from './device-work.service';

/** Unfinished work as rows that open it (Today's Continue, Progress's Unfinished), drafts marked "on this device". */
@Component({
  selector: 'app-work-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, CrossLinkDirective, EntryRowComponent],
  template: `
    <ul class="rows">
      @for (w of shown(); track w.id) {
        <li>
          <a
            g-entry-row
            [go]="true"
            [heading]="w.name"
            [meta]="[w.device ? w.detail + ', on this device' : w.detail]"
            [routerLink]="w.link"
            [queryParams]="w.query"
            crossLink
          ></a>
        </li>
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
    li + li {
      border-top: 1px solid var(--g-line);
    }
  `,
})
export class WorkListComponent {
  readonly items = input.required<readonly WorkItem[]>();
  /** How many to show; the rest wait on the Progress page. */
  readonly limit = input<number | null>(null);
  readonly shown = computed(() => this.items().slice(0, this.limit() ?? undefined));
}
