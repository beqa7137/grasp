import { Component, Injector, computed, inject } from '@angular/core';
import { IonBadge, IonIcon, IonLabel, IonModal, IonTabBar, IonTabButton, IonTabs } from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  chatbubbleEllipsesOutline,
  chatbubblesOutline,
  compassOutline,
  flashOutline,
  gitNetworkOutline,
  playCircleOutline,
} from 'ionicons/icons';
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
      <nav aria-label="Main">
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

    <button class="feedback-tab" (click)="pilot.feedbackOpen.set(true)" aria-label="Send feedback">
      <ion-icon name="chatbubble-ellipses-outline" aria-hidden="true" />
      <span>Feedback</span>
    </button>

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
    @use '../../chrome' as *;

    .feedback-tab {
      position: fixed;
      right: 0;
      top: 50%;
      z-index: 20;
      transform: translateY(-50%) rotate(180deg);
      writing-mode: vertical-rl;
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 12px 6px;
      border: 1px solid var(--g-line-strong);
      border-left: none;
      border-radius: 8px 0 0 8px;
      background: var(--g-raised);
      color: var(--g-muted);
      font: 500 #{chrome-font-size(11px)} / 1 var(--ion-font-family);
      letter-spacing: 0.04em;
      cursor: pointer;
    }
    .feedback-tab ion-icon {
      font-size: 14px;
      transform: rotate(90deg);
    }
    @media (max-width: 600px) {
      .feedback-tab {
        padding: 10px 5px;
      }
      .feedback-tab span {
        display: none;
      }
    }
    .feedback-tab:hover,
    .feedback-tab:focus-visible {
      color: var(--g-text);
    }
    /* The tab meets the edge of the screen, which would cut off a ring drawn outside it. */
    .feedback-tab:focus-visible {
      outline-offset: -2px;
    }
    ion-badge {
      --background: var(--g-predict);
      --color: #0b0d12;
      font-size: 10px;
      min-width: 16px;
    }
  `,
})
export class TabsPage {
  private readonly progress = inject(ProgressService);
  readonly pilot = inject(PilotService);
  private readonly injector = inject(Injector);
  readonly due = computed(() => {
    const session = this.progress.session();
    return session.dueTotal + session.boostedIncluded + this.progress.dueMissions().length;
  });

  constructor() {
    addIcons({ compassOutline, playCircleOutline, gitNetworkOutline, flashOutline, chatbubblesOutline, chatbubbleEllipsesOutline });
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
