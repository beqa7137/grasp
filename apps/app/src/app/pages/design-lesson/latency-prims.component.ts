import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { Prim } from './latency-draw';
import { PRIMS_TEMPLATE } from './stage-prims';

/**
 * A list of the Latency & Queueing stage's marks, drawn inside its SVG. Its stylesheet holds the stage's drawing roles,
 * which `latency-draw.ts` measures text by. A dot that slides is placed by a transform, so a line moving up one place
 * can slide on `--slide`; tracking is by each mark's stable id (a request's, a quantile's), never by position.
 */
@Component({
  selector: 'g[app-latency-prims]',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: PRIMS_TEMPLATE,
  styleUrl: './latency-stage.scss',
})
export class LatencyPrimsComponent {
  readonly prims = input.required<readonly Prim[]>();
}
