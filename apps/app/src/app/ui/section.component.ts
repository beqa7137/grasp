import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { IonIcon } from '@ionic/angular';
import { type Tone } from './tone';

/** A card of a page with its heading (REDESIGN.md 3.2). The icon's tone follows meaning: danger for Pitfalls, success for Strengths. */
@Component({
  selector: 'g-section',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IonIcon],
  host: { class: 'panel' },
  template: `
    <h2>
      @if (icon(); as icon) {
        <ion-icon [icon]="icon" [class]="tone()" aria-hidden="true" />
      }
      {{ heading() }}
    </h2>
    <ng-content />
  `,
  styles: `
    @use '../../tone' as *;

    :host {
      display: block;
      padding: var(--g-space-4) var(--g-space-4) var(--g-space-2);
      margin-bottom: var(--g-space-4);
    }
    h2 {
      display: flex;
      align-items: center;
      gap: var(--g-space-2);
      margin: 0 0 var(--g-space-2);
      font-size: var(--g-text-title-m);
      line-height: 1.2;
    }
    ion-icon {
      flex: none;
      width: 1.1em;
      height: 1.1em;
      color: var(--g-muted);
      @include tone-ink;
    }
  `,
})
export class SectionComponent {
  readonly heading = input.required<string>();
  readonly icon = input<string>();
  readonly tone = input<Tone>('neutral');
}
