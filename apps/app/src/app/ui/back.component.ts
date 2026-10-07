import { CUSTOM_ELEMENTS_SCHEMA, ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { IonRouterOutlet, NavController } from '@ionic/angular';
import { defineCustomElement } from '@ionic/core/components/ion-back-button.js';
import { CrossSections } from './cross-link.directive';

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
  private readonly sections = inject(CrossSections);

  constructor() {
    defineCustomElement();
  }

  back(): void {
    // Read on each click: Ionic reuses this view for the same URL, entered another way.
    const from = this.sections.from();
    if (from) void this.nav.navigateBack(from);
    else if (this.outlet?.canGoBack()) void this.outlet.pop();
    else void this.nav.navigateBack(this.href());
  }
}
