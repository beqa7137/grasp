import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { TAG, type Focus } from './focus-layout';

/**
 * A region an experiment's reveal points at, drawn inside a widget's SVG: a dashed outline and a "Look here" tag, both
 * hidden until `on`. Placed by `focusBoxes`, so the tag covers no text.
 */
@Component({
  selector: 'g[app-focus]',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'focus', '[attr.data-focus]': 'box().id', '[class.focused]': 'on()' },
  template: `
    @let f = box();
    <svg:rect class="focus-outline" [attr.x]="f.x" [attr.y]="f.y" [attr.width]="f.width" [attr.height]="f.height" />
    <svg:rect class="tag" [attr.x]="f.tag.x" [attr.y]="f.tag.y" [attr.width]="tag.width" [attr.height]="tag.height" />
    <svg:text class="look" text-anchor="middle" [attr.x]="f.tag.x + tag.width / 2" [attr.y]="f.tag.y + 12">Look here</svg:text>
  `,
  styles: `
    .focus-outline {
      fill: none;
      stroke: var(--g-accent);
      stroke-width: 2;
      stroke-dasharray: 6 4;
    }
    .tag {
      fill: var(--g-viz-stage);
      stroke: var(--g-accent);
      stroke-width: 1.5;
    }
    .look {
      font: 600 var(--g-text-label) var(--ion-font-family);
      fill: var(--g-accent);
      paint-order: stroke;
      stroke: var(--g-viz-stage);
      stroke-width: 3px;
      stroke-linejoin: round;
    }
    :host(:not(.focused)) {
      visibility: hidden;
    }
  `,
})
export class FocusBoxComponent {
  readonly box = input.required<Focus>();
  readonly on = input(false);
  readonly tag = TAG;
}
