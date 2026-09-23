import { Component, computed, inject } from '@angular/core';
import { IonBadge, IonIcon, IonLabel, IonTabBar, IonTabButton, IonTabs } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { chatbubblesOutline, compassOutline, flashOutline, gitNetworkOutline, playCircleOutline } from 'ionicons/icons';
import { ProgressService } from '../core/progress.service';

@Component({
  selector: 'app-tabs',
  imports: [IonTabs, IonTabBar, IonTabButton, IonIcon, IonLabel, IonBadge],
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
  `,
  styles: `
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
  readonly due = computed(() => {
    const session = this.progress.session();
    return session.dueTotal + session.boostedIncluded + this.progress.dueMissions().length;
  });

  constructor() {
    addIcons({ compassOutline, playCircleOutline, gitNetworkOutline, flashOutline, chatbubblesOutline });
  }
}
