import { ChangeDetectionStrategy, Component, input, model } from '@angular/core';
import { IonIcon } from '@ionic/angular';
import { expandIcon } from './icons';

/** A native `details` with a rotating chevron instead of the browser's triangle (REDESIGN.md 3.2). */
@Component({
  selector: 'g-disclosure',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IonIcon],
  template: `
    <details [open]="open()" (toggle)="open.set($any($event.target).open)">
      <summary>
        <span class="summary">{{ summary() }}</span>
        <ion-icon class="chevron" [icon]="expandIcon" aria-hidden="true" />
      </summary>
      <div class="body"><ng-content /></div>
    </details>
  `,
  styles: `
    :host {
      display: block;
    }
    summary {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--g-space-3);
      min-height: 44px;
      list-style: none;
      cursor: pointer;
      font-weight: 600;
      font-size: var(--g-text-body);
    }
    summary::-webkit-details-marker {
      display: none;
    }
    .chevron {
      flex: none;
      width: 1.1em;
      height: 1.1em;
      color: var(--g-muted);
      transition: transform var(--g-motion-quick) var(--g-ease-standard);
    }
    details[open] .chevron {
      transform: rotate(90deg);
    }
    .body {
      padding-bottom: var(--g-space-3);
    }
  `,
})
export class DisclosureComponent {
  readonly summary = input.required<string>();
  readonly open = model(false);
  readonly expandIcon = expandIcon;
}
