import { Component, computed, inject } from '@angular/core';
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
import { ProgressService } from '../core/progress.service';
import { FeedbackSheetComponent } from '../pilot/feedback-sheet.component';
import { PilotNoticeComponent } from '../pilot/pilot-notice.component';
import { PilotService } from '../pilot/pilot.service';

@Component({
  selector: 'app-tabs',
  imports: [IonTabs, IonTabBar, IonTabButton, IonIcon, IonLabel, IonBadge, IonModal, FeedbackSheetComponent, PilotNoticeComponent],
  template: `
    <ion-tabs>
      <ion-tab-bar slot="bottom">
        <ion-tab-button tab="learn" href="/learn">
          <ion-icon name="compass-outline" />
          <ion-label>Learn</ion-label>
        </ion-tab-button>
        <ion-tab-button tab="visualize" href="/visualize">
          <ion-icon name="play-circle-outline" />
          <ion-label>Visualize</ion-label>
        </ion-tab-button>
        <ion-tab-button tab="design" href="/design">
          <ion-icon name="git-network-outline" />
          <ion-label>Design Lab</ion-label>
        </ion-tab-button>
        <ion-tab-button tab="drill" href="/drill">
          <ion-icon name="flash-outline" />
          <ion-label>Review</ion-label>
          @if (due() > 0) {
            <ion-badge>{{ due() }}</ion-badge>
          }
        </ion-tab-button>
        <ion-tab-button tab="interview" href="/interview">
          <ion-icon name="chatbubbles-outline" />
          <ion-label>Interview</ion-label>
        </ion-tab-button>
      </ion-tab-bar>
    </ion-tabs>

    <button class="feedback-tab" (click)="pilot.feedbackOpen.set(true)" aria-label="Send feedback">
      <ion-icon name="chatbubble-ellipses-outline" aria-hidden="true" />
      <span>Feedback</span>
    </button>

    <ion-modal class="g-dialog" [isOpen]="pilot.feedbackOpen()" (didDismiss)="pilot.feedbackOpen.set(false)">
      <ng-template>
        <app-feedback-sheet (closed)="pilot.feedbackOpen.set(false)" />
      </ng-template>
    </ion-modal>

    <ion-modal class="g-dialog" [isOpen]="pilot.noticeOpen()" [backdropDismiss]="false">
      <ng-template>
        <app-pilot-notice (acknowledged)="pilot.acknowledgeNotice()" />
      </ng-template>
    </ion-modal>
  `,
  styles: `
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
      font: 500 11px/1 var(--ion-font-family);
      letter-spacing: 0.04em;
      cursor: pointer;
      opacity: 0.85;
    }
    .feedback-tab ion-icon {
      font-size: 14px;
      transform: rotate(90deg);
    }
    @media (max-width: 600px) {
      .feedback-tab {
        padding: 10px 3px;
      }
      .feedback-tab span {
        display: none;
      }
    }
    .feedback-tab:hover,
    .feedback-tab:focus-visible {
      opacity: 1;
      color: var(--g-text);
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
  readonly due = computed(() => {
    const session = this.progress.session();
    return session.dueTotal + session.boostedIncluded + this.progress.dueMissions().length;
  });

  constructor() {
    addIcons({ compassOutline, playCircleOutline, gitNetworkOutline, flashOutline, chatbubblesOutline, chatbubbleEllipsesOutline });
  }
}
