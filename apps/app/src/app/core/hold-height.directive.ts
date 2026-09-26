import { DestroyRef, Directive, ElementRef, afterRenderEffect, inject, input } from '@angular/core';
import { IonContent } from '@ionic/angular';

/**
 * Lets the element grow with its content, but shrink only as far as it can without moving. A page scrolled to its end scrolls
 * back by however much its content shrinks, which would move every control above that content; anywhere else the element
 * follows its content. It starts again from its own height when its width changes.
 */
@Directive({ selector: '[gHoldHeight]' })
export class HoldHeightDirective {
  /** What the element shows, such as the current frame: each change gives back what height it can then. */
  readonly gHoldHeight = input.required<unknown>();

  private readonly host: HTMLElement = inject(ElementRef).nativeElement;
  private scroller: HTMLElement | undefined;
  private width = 0;

  constructor() {
    void inject(IonContent, { optional: true })
      ?.getScrollElement()
      .then((scroller) => (this.scroller = scroller));
    const observer = new ResizeObserver(([entry]) => {
      const { inlineSize, blockSize } = entry.borderBoxSize[0];
      if (Math.abs(inlineSize - this.width) > 0.5) {
        this.width = inlineSize;
        // Resizing the element inside its own observer's callback would end in a "ResizeObserver loop" error.
        requestAnimationFrame(() => this.release());
      } else {
        this.hold(blockSize);
      }
    });
    observer.observe(this.host);
    inject(DestroyRef).onDestroy(() => observer.disconnect());
    afterRenderEffect({
      mixedReadWrite: () => {
        this.gHoldHeight();
        this.shrink();
      },
    });
  }

  // Gives back the height the content no longer needs, less whatever the page would then fall short of its scroll position
  // by, since a page scrolled to its end would scroll back. The browser cuts the scroll position only later, so the shortfall
  // is worked out from the page's height. Inside a sticky container resting on the end of its own container, shrinking
  // slides the container down instead, so then the height is kept.
  private shrink() {
    const page = this.scroller;
    if (!page) return;
    const { top, height } = this.host.getBoundingClientRect();
    const scrollTop = page.scrollTop;
    this.hold(0);
    const content = this.host.getBoundingClientRect().height;
    const short = scrollTop - (page.scrollHeight - page.clientHeight);
    this.hold(content + Math.max(0, short));
    if (Math.abs(this.host.getBoundingClientRect().top - top) > 0.5) this.hold(height);
    if (page.scrollTop !== scrollTop) page.scrollTop = scrollTop;
  }

  private release() {
    this.host.style.minHeight = '';
    this.hold(this.host.getBoundingClientRect().height);
  }

  private hold(height: number) {
    this.host.style.minHeight = `${height}px`;
  }
}
