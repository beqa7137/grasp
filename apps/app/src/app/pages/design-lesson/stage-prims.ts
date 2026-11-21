/**
 * The template that draws a list of `Prim` marks inside a stage's SVG, for a widget's own prims component to pair with
 * its stylesheet of drawing roles. A dot that slides is placed by a transform, so a line moving up one place can slide on
 * `--slide`; tracking is by each mark's stable id, never by position.
 */
export const PRIMS_TEMPLATE = `
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
`;
