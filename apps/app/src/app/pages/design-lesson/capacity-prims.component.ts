import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { Prim } from './stage-draw';
import { PRIMS_TEMPLATE } from './stage-prims';

/**
 * A list of the Capacity & Scaling stage's marks, drawn inside its SVG, tracked by each mark's stable id (an instance's
 * tier, zone and index in the zone), never by position. Its stylesheet holds the stage's drawing roles, which
 * `capacity-plan.ts` measures text by.
 */
@Component({
  selector: 'g[app-capacity-prims]',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: PRIMS_TEMPLATE,
  styleUrl: './capacity-stage.scss',
})
export class CapacityPrimsComponent {
  readonly prims = input.required<readonly Prim[]>();
}
