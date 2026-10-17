import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IonIcon } from '@ionic/angular';
import { CrossLinkDirective } from '../ui/cross-link.directive';
import { searchIcon } from '../ui/icons';

/** A header's Search button (REDESIGN.md 2.6): the search page, under 1024px only, where the rail's field is not shown. */
@Component({
  selector: 'app-search-button',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, CrossLinkDirective, IonIcon],
  template: `<a routerLink="/today/search" crossLink aria-label="Search"><ion-icon [icon]="searchIcon" aria-hidden="true" /></a>`,
  styles: `
    @use '../../breakpoints' as *;

    :host {
      display: contents;
    }
    a {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 44px;
      min-height: 44px;
      color: var(--g-muted);
      font-size: var(--g-text-title-l);
      &:hover {
        color: var(--g-text);
      }
    }
    @include desktop {
      a {
        display: none;
      }
    }
  `,
})
export class SearchButtonComponent {
  readonly searchIcon = searchIcon;
}
