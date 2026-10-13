import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { IonIcon } from '@ionic/angular';
import { type Tone } from './tone';

/**
 * A view with nothing to show yet (REDESIGN.md 3.2): an icon in its tone, a heading, a body and at most one action, which
 * goes in an element marked `action`. The heading takes focus from script, for a view that replaces what had it.
 */
@Component({
  selector: 'g-empty-state',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IonIcon],
  template: `
    @if (icon(); as icon) {
      <ion-icon [icon]="icon" [class]="tone()" aria-hidden="true" />
    }
    <h2 tabindex="-1">{{ heading() }}</h2>
    <div class="body"><ng-content /></div>
    <ng-content select="[action]" />
  `,
  styles: `
    @use '../../tone' as *;

    :host {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: var(--g-space-2);
      text-align: center;
    }
    ion-icon {
      width: 40px;
      height: 40px;
      color: var(--g-muted);
      @include tone-ink;
    }
    h2 {
      margin: 0;
      font-size: var(--g-text-display-l);
      line-height: 1.2;
    }
    .body {
      max-width: 50ch;
      color: var(--g-muted);
      line-height: 1.55;
    }
  `,
})
export class EmptyStateComponent {
  readonly heading = input.required<string>();
  readonly icon = input<string>();
  readonly tone = input<Tone>('neutral');
}
