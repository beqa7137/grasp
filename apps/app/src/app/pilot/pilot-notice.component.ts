import { ChangeDetectionStrategy, Component, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IonContent } from '@ionic/angular';
import { AI_DISCLOSURE } from '../core/ai-disclosure';

@Component({
  selector: 'app-pilot-notice',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, IonContent],
  template: `
    <ion-content>
      <p class="eyebrow">Pilot</p>
      <h2>Welcome to the Grasp pilot</h2>
      <p>You're one of a small group trying Grasp before anyone else. A few things to know:</p>
      <ul>
        <li>
          We store your learning activity (reviews, predictions, missions) under an anonymous id so progress syncs and we can see what
          works.
        </li>
        <li>{{ aiDisclosure }}</li>
        <li>Send feedback any time from <strong>Settings</strong>. Bugs, confusion and ideas are all useful.</li>
        <li>
          You can export or delete everything we store from
          <!-- Ionic's focus trap only cycles through elements it recognizes, and a plain link is not one of them. -->
          <a routerLink="/settings" tabindex="0" (click)="acknowledged.emit()">Settings</a>.
        </li>
      </ul>
    </ion-content>
    <div class="footer">
      <button class="g-btn primary" (click)="acknowledged.emit()">Got it, let's start</button>
    </div>
  `,
  styles: `
    ion-content {
      --padding-top: 24px;
      --padding-start: 22px;
      --padding-end: 22px;
      line-height: 1.5;
    }
    .footer {
      padding: 12px 22px 28px;
    }
    h2 {
      font: 600 1.375rem/1.2 var(--g-font-display);
      margin: 6px 0 12px;
    }
    ul {
      padding-left: 18px;
      margin: 12px 0 10px;
    }
    li {
      margin-bottom: 8px;
      color: var(--g-muted);
    }
    li strong {
      color: var(--g-text);
    }
    a {
      color: var(--g-accent);
    }
    .g-btn {
      width: 100%;
    }
  `,
})
export class PilotNoticeComponent {
  readonly acknowledged = output<void>();
  readonly aiDisclosure = AI_DISCLOSURE;
}
