import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { Prim } from './latency-draw';
import { PRIMS_TEMPLATE } from './stage-prims';

/**
 * A list of the Reliability stage's marks, drawn inside its SVG, tracked by each mark's stable id (a part's, a copy's by
 * part and number, a row's by part and copy), never by position. Its stylesheet holds the stage's drawing roles, which
 * `latency-draw.ts` measures text by.
 */
@Component({
  selector: 'g[app-reliability-prims]',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: PRIMS_TEMPLATE,
  styleUrl: './reliability-stage.scss',
})
export class ReliabilityPrimsComponent {
  readonly prims = input.required<readonly Prim[]>();
}
