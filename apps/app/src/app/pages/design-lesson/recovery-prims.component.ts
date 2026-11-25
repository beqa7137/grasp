import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { Prim } from './stage-draw';
import { PRIMS_TEMPLATE } from './stage-prims';

/**
 * A list of the Backups & Recovery stage's marks, drawn inside its SVG, tracked by each mark's stable id (a row's by its
 * plan, a full backup's by its age, a bar's step by its kind), never by position. Its stylesheet holds the stage's
 * drawing roles, which `recovery-text.ts` measures text by.
 */
@Component({
  selector: 'g[app-recovery-prims]',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: PRIMS_TEMPLATE,
  styleUrl: './recovery-stage.scss',
})
export class RecoveryPrimsComponent {
  readonly prims = input.required<readonly Prim[]>();
}
