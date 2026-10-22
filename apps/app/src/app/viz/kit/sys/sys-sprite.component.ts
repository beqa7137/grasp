import { ChangeDetectionStrategy, Component } from '@angular/core';
import { GLYPHS, glyphId, type SysGlyph } from './glyphs';

/**
 * The system diagram's glyph sprite (REDESIGN.md 4.6): one `<symbol>` per kind and role, drawn by `<use>` in each node,
 * with the down hatch and the edges' arrowhead. It is inline in the lazy chunk, so no asset ships with first paint or the
 * native apps, and its symbols carry presentation attributes, since a `<use>` clone takes no component styles. Identical
 * copies on two pages (Ionic keeps a page in the DOM) define the same ids with the same strokes, so either one serves.
 */
@Component({
  selector: 'g-sys-sprite',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg aria-hidden="true" focusable="false" width="0" height="0">
      <defs>
        @for (g of glyphs; track g.id) {
          <svg:symbol
            [attr.id]="g.id"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.75"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            @for (d of g.paths; track $index) {
              <svg:path [attr.d]="d" />
            }
          </svg:symbol>
        }
        <svg:pattern id="g-sys-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <svg:path class="hatch" d="M0 0v6" />
        </svg:pattern>
        <svg:marker
          id="g-sys-arrow"
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="9"
          markerHeight="9"
          markerUnits="userSpaceOnUse"
          orient="auto"
        >
          <svg:path class="arrow" d="M0 0L10 5L0 10z" />
        </svg:marker>
      </defs>
    </svg>
  `,
  styles: `
    :host {
      position: absolute;
      width: 0;
      height: 0;
      overflow: hidden;
    }
    .hatch {
      stroke: var(--g-viz-critical);
      stroke-width: 1.5;
      opacity: 0.5;
    }
    .arrow {
      fill: var(--g-stroke);
    }
  `,
})
export class SysSpriteComponent {
  readonly glyphs = (Object.keys(GLYPHS) as SysGlyph[]).map((g) => ({ id: glyphId(g), paths: GLYPHS[g] }));
}
