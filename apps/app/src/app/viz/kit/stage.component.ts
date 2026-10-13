import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, afterNextRender, inject, input, signal } from '@angular/core';

/**
 * The stage (REDESIGN.md 3.3): a sunken well with a 24px dot grid, at a height its owner fixes for the run so the picture
 * never moves. It measures its own width, so a drawing inside sets its viewBox to `0 0 width height` and one unit is one
 * CSS pixel at every size. The owner projects its layers: an SVG for data and annotations, then handles laid over it.
 */
@Component({
  selector: 'g-stage',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { role: 'group', 'aria-roledescription': 'visualization', '[attr.aria-label]': 'label()' },
  template: `<div class="well" [style.height.px]="height()"><ng-content /></div>`,
  styles: `
    :host {
      display: block;
    }
    .well {
      position: relative;
      overflow: hidden;
      border: 1px solid var(--g-line);
      border-radius: var(--g-radius-md);
      background-color: var(--g-viz-stage);
      background-image: radial-gradient(circle, rgba(var(--g-text-rgb), 0.09) 1px, transparent 1.5px);
      background-size: 24px 24px;
      background-position: 11px 11px;
    }
  `,
})
export class StageComponent {
  readonly height = input.required<number>();
  readonly label = input.required<string>();
  /** The well's inner width in CSS px; 0 until measured. */
  readonly width = signal(0);

  constructor() {
    const host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      // A hidden page (Ionic keeps a tab's page in the DOM, laid out at no size) reports 0: keep the last real width,
      // so the drawing is not torn down and rebuilt on every tab switch.
      const observer = new ResizeObserver(([entry]) => {
        const width = Math.floor(entry.contentRect.width) - 2;
        if (width > 0) this.width.set(width);
      });
      observer.observe(host);
      destroyRef.onDestroy(() => observer.disconnect());
    });
  }
}
