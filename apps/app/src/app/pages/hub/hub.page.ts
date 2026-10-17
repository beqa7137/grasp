import { ChangeDetectionStrategy, Component, ElementRef, Injector, afterNextRender, inject, input, viewChild } from '@angular/core';
import { ActivatedRoute, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { IonButtons, IonContent, IonHeader, IonTitle, IonToolbar } from '@ionic/angular';

import { refocus } from '../../core/focus';
import { SearchButtonComponent } from '../../search/search-button.component';
import { SegmentMemory, type KeptSegment } from './segment-memory';

/** The Ionic hooks a segment may keep from when it was a page of its own, and what it hands over to be kept. */
interface Segment extends KeptSegment {
  ionViewWillEnter?(): void;
}

/**
 * A section's hub (REDESIGN.md 2.5): one Ionic page whose segments render in a plain outlet, so switching segments neither
 * animates nor stacks a view, and back leaves the hub. Segment links replace the URL for the same reason. The segments are its
 * route's children, labelled by their titles.
 */
@Component({
  selector: 'app-hub',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, RouterLinkActive, RouterOutlet, IonHeader, IonToolbar, IonTitle, IonButtons, IonContent, SearchButtonComponent],
  template: `
    <ion-header [translucent]="true">
      <ion-toolbar>
        <ion-title>{{ name }}</ion-title>
        <ion-buttons slot="end"><app-search-button /></ion-buttons>
      </ion-toolbar>
    </ion-header>
    <ion-content [fullscreen]="true">
      <nav class="page segments" [class.narrow]="narrow()" [attr.aria-label]="name + ' sections'">
        @for (s of segments; track s.link) {
          <a
            class="chip"
            [routerLink]="s.link"
            [replaceUrl]="true"
            routerLinkActive
            [routerLinkActiveOptions]="exact"
            ariaCurrentWhenActive="page"
            >{{ s.label }}</a
          >
        }
      </nav>
      <router-outlet (activate)="activate($event)" (deactivate)="memory.deactivated($event)" />
    </ion-content>
  `,
  styles: `
    .segments {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      padding-bottom: 0;
    }
    /* Segments start their own page with different first margins; under the row they all start at its padding. */
    :host ::ng-deep router-outlet + * > .page > :first-child {
      margin-top: 0;
    }
    .chip {
      padding: 8px 14px;
      text-decoration: none;
      &[aria-current='page'] {
        background: var(--g-accent-soft);
        border-color: var(--g-accent);
        color: var(--g-text);
        font-weight: 600;
      }
    }
  `,
})
export class HubPage {
  readonly narrow = input(false);
  private readonly config = inject(ActivatedRoute).routeConfig!;
  readonly name = String(this.config.title);
  readonly segments = (this.config.children ?? []).map((child) => ({
    link: child.path ? `/${this.config.path}/${child.path}` : `/${this.config.path}`,
    label: String(child.title),
  }));
  readonly exact = { paths: 'exact', queryParams: 'ignored', fragment: 'ignored', matrixParams: 'ignored' } as const;
  private segment: Segment | null = null;
  private entered = false;
  private readonly outlet = viewChild.required(RouterOutlet);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  private readonly content = viewChild.required(IonContent);
  readonly memory = new SegmentMemory(
    inject(Router),
    this.injector,
    this.segments.map((s) => s.link),
  );

  constructor() {
    afterNextRender(async () => this.memory.attach(await this.content().getScrollElement()));
  }

  activate(segment: Segment) {
    // A link inside the segment that was left (Topics' "3 cases") goes with it, so focus moves to the new segment's heading.
    if (this.segment) afterNextRender(() => this.focusHeading(), { injector: this.injector });
    this.segment = segment;
    this.memory.activated(segment, this.outlet().activatedRoute);
    if (this.entered) segment.ionViewWillEnter?.();
  }

  private focusHeading() {
    const heading = this.host.nativeElement.querySelector<HTMLElement>('router-outlet + * h1');
    if (heading && !heading.hasAttribute('tabindex')) heading.tabIndex = -1;
    refocus(heading);
  }

  ionViewWillEnter() {
    this.entered = true;
    this.segment?.ionViewWillEnter?.();
  }

  ionViewDidLeave() {
    this.entered = false;
  }
}
