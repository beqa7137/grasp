import { Component, Injector, computed, inject } from '@angular/core';
import { Router, type ActivatedRouteSnapshot } from '@angular/router';
import { IonBadge, IonIcon, IonLabel, IonModal, IonTabBar, IonTabButton, IonTabs } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { chatbubblesOutline, compassOutline, flashOutline, gitNetworkOutline, playCircleOutline } from 'ionicons/icons';
import { refocusAfterRender } from '../core/focus';
import { isOnHiddenPage } from '../core/page-keys';
import { ProgressService } from '../core/progress.service';
import { FeedbackSheetComponent } from '../pilot/feedback-sheet.component';
import { PilotNoticeComponent } from '../pilot/pilot-notice.component';
import { PilotService } from '../pilot/pilot.service';

@Component({
  selector: 'app-tabs',
  imports: [IonTabs, IonTabBar, IonTabButton, IonIcon, IonLabel, IonBadge, IonModal, FeedbackSheetComponent, PilotNoticeComponent],
  template: `
    <ion-tabs>
      <nav aria-label="Main" [class.focus-route]="focusRoute()">
        <ion-tab-bar slot="bottom">
          <ion-tab-button tab="learn" href="/learn">
            <ion-icon name="compass-outline" aria-hidden="true" />
            <ion-label>Learn</ion-label>
          </ion-tab-button>
          <ion-tab-button tab="visualize" href="/visualize">
            <ion-icon name="play-circle-outline" aria-hidden="true" />
            <ion-label>Visualize</ion-label>
          </ion-tab-button>
          <ion-tab-button tab="design" href="/design">
            <ion-icon name="git-network-outline" aria-hidden="true" />
            <ion-label>Design Lab</ion-label>
          </ion-tab-button>
          <ion-tab-button tab="drill" href="/drill">
            <ion-icon name="flash-outline" aria-hidden="true" />
            <ion-label>Review</ion-label>
            @if (due() > 0) {
              <ion-badge>{{ due() }}</ion-badge>
            }
          </ion-tab-button>
          <ion-tab-button tab="interview" href="/interview">
            <ion-icon name="chatbubbles-outline" aria-hidden="true" />
            <ion-label>Interview</ion-label>
          </ion-tab-button>
        </ion-tab-bar>
      </nav>
    </ion-tabs>

    <ion-modal class="g-dialog" aria-label="Send feedback" [isOpen]="pilot.feedbackOpen()" (didDismiss)="pilot.feedbackOpen.set(false)">
      <ng-template>
        <app-feedback-sheet (closed)="pilot.feedbackOpen.set(false)" />
      </ng-template>
    </ion-modal>

    <ion-modal
      class="g-dialog"
      aria-label="Welcome to the Grasp pilot"
      [isOpen]="pilot.noticeOpen()"
      [backdropDismiss]="false"
      (didDismiss)="focusPageHeading()"
    >
      <ng-template>
        <app-pilot-notice (acknowledged)="pilot.acknowledgeNotice()" />
      </ng-template>
    </ion-modal>
  `,
  styles: `
    @media (max-width: 1023.98px) {
      nav.focus-route {
        display: none;
      }
    }
    ion-badge {
      --background: var(--g-predict);
      --color: var(--g-on-fill);
      font-size: 10px;
      min-width: 16px;
    }
  `,
})
export class TabsPage {
  private readonly progress = inject(ProgressService);
  readonly pilot = inject(PilotService);
  private readonly injector = inject(Injector);
  private readonly router = inject(Router);
  /** A focus route (2.6) gives its page the tab bar's height under 1024px; its own dock sits on the bottom safe area instead. */
  readonly focusRoute = computed(() => {
    // Read only to depend on it: the snapshot is not a signal, so each navigation's start and end re-run this.
    this.router.currentNavigation();
    let route: ActivatedRouteSnapshot = this.router.routerState.snapshot.root;
    while (route.firstChild) route = route.firstChild;
    return route.data['focus'] === true;
  });
  readonly due = computed(() => {
    const session = this.progress.session();
    return session.dueTotal + session.boostedIncluded + this.progress.dueMissions().length;
  });

  constructor() {
    addIcons({ compassOutline, playCircleOutline, gitNetworkOutline, flashOutline, chatbubblesOutline });
  }

  /**
   * The welcome dialog opens on load, so no control opened it to take focus back: the page's heading takes it instead.
   * Ionic still traps focus in the dialog while didDismiss runs, hence the wait for the next render.
   */
  focusPageHeading() {
    refocusAfterRender(this.injector, () => {
      const heading = [...document.querySelectorAll<HTMLElement>('ion-router-outlet h1')].find((h) => !isOnHiddenPage(h));
      if (heading) heading.tabIndex = -1;
      return heading;
    });
  }
}
