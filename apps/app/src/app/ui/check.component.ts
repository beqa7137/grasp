import { ChangeDetectionStrategy, Component, input, model } from '@angular/core';
import { IonIcon } from '@ionic/angular';
import { checkIcon } from './icons';

/** A skinned native checkbox with its label (REDESIGN.md 3.2), so no system box shows in either theme. */
@Component({
  selector: 'g-check',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IonIcon],
  template: `
    <label>
      <input type="checkbox" [checked]="checked()" [disabled]="disabled()" (change)="checked.set($any($event.target).checked)" />
      <span class="box" aria-hidden="true"><ion-icon [icon]="checkIcon" aria-hidden="true" /></span>
      <span class="text"><ng-content /></span>
    </label>
  `,
  styles: `
    :host {
      display: block;
    }
    label {
      position: relative;
      display: flex;
      align-items: flex-start;
      gap: var(--g-space-3);
      min-height: 44px;
      padding: var(--g-space-2) 0;
      cursor: pointer;
      line-height: 1.45;
    }
    input {
      position: absolute;
      opacity: 0;
      width: 22px;
      height: 22px;
      margin: 0;
      cursor: pointer;
    }
    .box {
      flex: none;
      display: grid;
      place-items: center;
      width: 22px;
      height: 22px;
      border-radius: var(--g-radius-xs);
      border: 1.5px solid var(--g-stroke);
      background: var(--g-raised);
      color: var(--g-on-fill);
    }
    .box ion-icon {
      width: 16px;
      height: 16px;
      visibility: hidden;
    }
    input:checked + .box {
      background: var(--g-accent);
      border-color: var(--g-accent);
    }
    input:checked + .box ion-icon {
      visibility: visible;
    }
    input:focus-visible + .box {
      outline: var(--g-focus-ring);
      outline-offset: 2px;
    }
    input:disabled ~ * {
      opacity: 0.5;
    }
    @media (forced-colors: active) {
      .box {
        border-color: CanvasText;
      }
      input:checked + .box {
        background: Highlight;
      }
    }
  `,
})
export class CheckComponent {
  readonly checked = model(false);
  readonly disabled = input(false);
  readonly checkIcon = checkIcon;
}
