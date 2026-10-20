import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CrossLinkDirective } from '../ui/cross-link.directive';

/** Under a library's search field (REDESIGN.md 2.9): the same words searched across everything. */
@Component({
  selector: 'app-search-everything',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, CrossLinkDirective],
  template: `
    @if (words(); as q) {
      <a routerLink="/today/search" [queryParams]="{ q }" crossLink>Search everything for “{{ q }}” →</a>
    }
  `,
  styles: `
    :host {
      display: block;
    }
    a {
      display: inline-block;
      padding-block: var(--g-space-1);
      font-size: var(--g-text-body-s);
      font-weight: 600;
    }
  `,
})
export class SearchEverythingComponent {
  readonly query = input.required<string>();
  readonly words = computed(() => this.query().trim());
}
