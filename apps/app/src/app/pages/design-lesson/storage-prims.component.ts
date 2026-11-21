import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { Prim } from './latency-draw';

/**
 * A list of the Storage Engines stage's marks, drawn inside its SVG. Its stylesheet holds the stage's drawing roles,
 * which `storage-text.ts` measures text by. Tracking is by each mark's stable id (a level's, a page's place in its row,
 * a run's level), never by position, so a level added or removed re-animates nothing else.
 */
@Component({
  selector: 'g[app-storage-prims]',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @for (p of prims(); track p.id) {
      @if (p.k === 'text') {
        <svg:text
          [attr.data-id]="p.id"
          [attr.class]="p.cls"
          [attr.x]="p.x"
          [attr.y]="p.y"
          [attr.text-anchor]="p.anchor"
          [attr.data-owner]="p.owner ?? null"
          [attr.data-ground]="p.ground ? '1' : null"
        >
          @for (s of p.spans; track $index) {
            <svg:tspan [attr.class]="s.cls" [attr.dx]="s.dx ?? null">{{ s.t }}</svg:tspan>
          }
        </svg:text>
      } @else if (p.k === 'line') {
        <svg:line
          [attr.data-id]="p.id"
          [attr.class]="p.cls"
          [attr.x1]="p.x1"
          [attr.y1]="p.y1"
          [attr.x2]="p.x2"
          [attr.y2]="p.y2"
          [attr.data-owner]="p.owner ?? null"
        />
      } @else if (p.k === 'rect') {
        <svg:rect
          [attr.data-id]="p.id"
          [attr.class]="p.cls"
          [attr.x]="p.x"
          [attr.y]="p.y"
          [attr.width]="p.w"
          [attr.height]="p.h"
          [attr.rx]="p.rx || null"
        />
      } @else if (p.k === 'circle') {
        @if (p.slide) {
          <svg:circle
            [attr.data-id]="p.id"
            [attr.class]="p.cls + ' slide'"
            [style.transform]="'translate(' + p.cx + 'px, ' + p.cy + 'px)'"
            [attr.r]="p.r"
            [attr.data-owner]="p.owner ?? null"
          />
        } @else {
          <svg:circle
            [attr.data-id]="p.id"
            [attr.class]="p.cls"
            [attr.cx]="p.cx"
            [attr.cy]="p.cy"
            [attr.r]="p.r"
            [attr.data-owner]="p.owner ?? null"
          />
        }
      } @else {
        <svg:path [attr.data-id]="p.id" [attr.class]="p.cls" [attr.d]="p.d" [attr.data-owner]="p.owner ?? null" />
      }
    }
  `,
  styleUrl: './storage-stage.scss',
})
export class StoragePrimsComponent {
  readonly prims = input.required<readonly Prim[]>();
}
