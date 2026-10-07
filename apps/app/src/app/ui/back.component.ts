import { CUSTOM_ELEMENTS_SCHEMA, ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { Router } from '@angular/router';
import { IonRouterOutlet, NavController } from '@ionic/angular';
import { defineCustomElement } from '@ionic/core/components/ion-back-button.js';
import { tabOf } from './cross-link.directive';

/**
 * The back button of every page (REDESIGN.md 2.5). A view a link brought from another tab returns there, switching back to
 * that tab with its stack intact; any other view pops its own stack, or goes to `href` (its hub) when the stack is empty,
 * as after a reload. Ionic's own button would pop the other tab's stack instead. Android's back button clicks it too
 * (`TabsPage`). It renders Ionic's button element without Ionic's Angular directive, whose click handler would pop, so it
 * defines the element itself, as that directive does.
 */
@Component({
  selector: 'app-back',
  changeDetection: ChangeDetectionStrategy.OnPush,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: `<ion-back-button [defaultHref]="href()" text="" (click)="back()" />`,
})
export class BackComponent {
  readonly href = input.required<string>();
  private readonly nav = inject(NavController);
  private readonly outlet = inject(IonRouterOutlet, { optional: true });
  private readonly from = crossFrom(inject(Router));

  constructor() {
    defineCustomElement();
  }

  back(): void {
    if (this.from) void this.nav.navigateBack(this.from);
    else if (this.outlet?.canGoBack()) void this.outlet.pop();
    else void this.nav.navigateBack(this.href());
  }
}

/** The URL a `crossLink` brought this view from, when it lies in another tab. */
function crossFrom(router: Router): string | null {
  const navigation = router.currentNavigation();
  const state: unknown = navigation ? navigation.extras.state : history.state;
  const from = (state as { from?: unknown } | null)?.from;
  const url = navigation ? router.serializeUrl(navigation.finalUrl ?? navigation.extractedUrl) : router.url;
  return typeof from === 'string' && tabOf(from) !== tabOf(url) ? from : null;
}
