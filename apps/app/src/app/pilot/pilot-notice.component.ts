import { ChangeDetectionStrategy, Component, output } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-pilot-notice',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  template: `
    <div class="notice">
      <p class="eyebrow">Pilot</p>
      <h2>Welcome to the Grasp pilot</h2>
      <p>You're one of a small group trying Grasp before anyone else. A few things to know:</p>
      <ul>
        <li>
          We store your learning activity (reviews, predictions, missions) under an anonymous id so progress syncs and we can see what
          works.
        </li>
        <li>Interview transcripts are sent to Anthropic's Claude API to run and score the AI interviewer.</li>
        <li>Use the <strong>Feedback</strong> tab on the right edge any time. Bugs, confusion and ideas are all useful.</li>
        <li>You can export or delete everything we store from <a routerLink="/settings" (click)="acknowledged.emit()">Settings</a>.</li>
      </ul>
      <button class="g-btn primary" (click)="acknowledged.emit()">Got it, let's start</button>
    </div>
  `,
  styles: `
    .notice {
      padding: 24px 22px 30px;
      max-width: 560px;
      margin: 0 auto;
      line-height: 1.5;
    }
    h2 {
      font: 600 22px/1.2 var(--g-font-display);
      margin: 6px 0 12px;
    }
    ul {
      padding-left: 18px;
      margin: 12px 0 22px;
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
}
