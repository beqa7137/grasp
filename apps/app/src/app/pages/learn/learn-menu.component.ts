import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { PopoverController } from '@ionic/angular';

export type LearnMenuChoice = 'feedback' | 'plan';

@Component({
  selector: 'app-learn-menu',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button (click)="choose('feedback')">Send feedback</button>
    <button (click)="choose('plan')">Study plan</button>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      padding: 6px 0;
    }
    button {
      appearance: none;
      border: 0;
      background: none;
      color: var(--g-text);
      font: inherit;
      text-align: left;
      padding: 12px 16px;
      cursor: pointer;
      &:hover {
        background: var(--g-raised);
      }
      &:focus-visible {
        outline-offset: -2px;
      }
    }
  `,
})
export class LearnMenuComponent {
  private readonly popovers = inject(PopoverController);

  choose(choice: LearnMenuChoice) {
    void this.popovers.dismiss(choice);
  }
}
