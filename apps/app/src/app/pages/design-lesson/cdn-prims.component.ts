import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { Prim } from './stage-draw';
import { PRIMS_TEMPLATE } from './stage-prims';

/**
 * A list of the CDNs & Edge stage's marks, drawn inside its SVG, tracked by each mark's stable id (a location's column,
 * a request's lane and time, a copy's start), never by position. Its stylesheet holds the stage's drawing roles, which
 * `cdn-text.ts` measures text by.
 */
@Component({
  selector: 'g[app-cdn-prims]',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: PRIMS_TEMPLATE,
  styleUrl: './cdn-stage.scss',
})
export class CdnPrimsComponent {
  readonly prims = input.required<readonly Prim[]>();
}
