import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { Prim } from './stage-draw';
import { PRIMS_TEMPLATE } from './stage-prims';

/**
 * A list of the Unique IDs stage's marks, drawn inside its SVG, tracked by each mark's stable id (a cell's is its id's
 * key and bit, so a new id composes fresh cells). Its stylesheet holds the stage's drawing roles.
 */
@Component({
  selector: 'g[app-ids-prims]',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: PRIMS_TEMPLATE,
  styleUrl: './ids-stage.scss',
})
export class IdsPrimsComponent {
  readonly prims = input.required<readonly Prim[]>();
}
