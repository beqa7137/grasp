import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { PopoverController } from '@ionic/angular';

export type TodayMenuChoice = 'feedback' | 'plan' | 'progress';

@Component({
  selector: 'app-today-menu',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button (click)="choose('feedback')">Send feedback</button>
    <button (click)="choose('plan')">Study plan</button>
    <button (click)="choose('progress')">Progress</button>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      padding: var(--g-space-1) 0;
    }
    button {
      appearance: none;
      border: 0;
      background: none;
      color: var(--g-text);
      font: inherit;
      text-align: left;
      padding: var(--g-space-3) var(--g-space-4);
      cursor: pointer;
      &:hover {
        background: rgba(var(--g-text-rgb), 0.06);
      }
      &:focus-visible {
        outline-offset: -2px;
      }
    }
  `,
})
export class TodayMenuComponent {
  private readonly popovers = inject(PopoverController);

  choose(choice: TodayMenuChoice) {
    void this.popovers.dismiss(choice);
  }
}
