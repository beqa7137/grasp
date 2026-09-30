import { DestroyRef, Directive, ElementRef, afterRenderEffect, inject, input } from '@angular/core';
import { IonContent } from '@ionic/angular';

/**
 * Keeps still what the learner is looking at as the element's content changes: the controls above it while its top is on
 * screen, else what follows it below, by scrolling the page by as much as the element changed. A column beside it, which
 * does not move with it, is left where it is.
 */
@Directive({ selector: '[gHoldHeight]' })
export class HoldHeightDirective {
  /** What the element shows, such as the current frame: each change gives back what height it can then. */
  readonly gHoldHeight = input.required<unknown>();

  private readonly host: HTMLElement = inject(ElementRef).nativeElement;
  private scroller: HTMLElement | undefined;
  private width = 0;
  private held = 0;
  /** Where the last scroll by the change meant to leave the element's top, to carry what the page rounded off. */
  private meantTop: number | null = null;
  private anchoredByHand = false;
  private readonly onScroll = () => this.anchorByHandWhileAbove();

  constructor() {
    // The directive scrolls by what the element's content changes, so the browser must not also anchor to something inside
    // it: two corrections of one change add up to a jump. The WebKit the tests run (26.6) anchors too.
    this.host.style.overflowAnchor = 'none';
    const destroyRef = inject(DestroyRef);
    void inject(IonContent, { optional: true })
      ?.getScrollElement()
      .then((scroller) => {
        if (destroyRef.destroyed) return;
        this.scroller = scroller;
        scroller.addEventListener('scroll', this.onScroll, { passive: true });
        this.anchorByHandWhileAbove();
      });
    let releaseFrame = 0;
    const observer = new ResizeObserver(([entry]) => {
      const { inlineSize, blockSize } = entry.borderBoxSize[0];
      if (Math.abs(inlineSize - this.width) > 0.5) {
        this.width = inlineSize;
        // Resizing the element inside its own observer's callback would end in a "ResizeObserver loop" error.
        cancelAnimationFrame(releaseFrame);
        releaseFrame = requestAnimationFrame(() => this.release());
      } else {
        this.hold(blockSize);
      }
    });
    observer.observe(this.host);
    destroyRef.onDestroy(() => {
      observer.disconnect();
      cancelAnimationFrame(releaseFrame);
      this.scroller?.removeEventListener('scroll', this.onScroll);
      this.scroller?.style.removeProperty('overflow-anchor');
    });
    afterRenderEffect(() => {
      this.gHoldHeight();
      this.follow();
    });
  }

  // Top above the view, its end in view and what follows it below it: it takes its content's height and the page scrolls by
  // the change. Otherwise, as with a column beside it, which does not move with it, nothing scrolls: it shrinks only as far
  // as the page runs on below the view, since a page scrolled to its end would scroll back, and not at all where a sticky
  // container resting on the end of its own container would slide down instead.
  private follow() {
    const page = this.scroller;
    if (!page) return;
    const { top, height } = this.host.getBoundingClientRect();
    const content = this.contentHeight(top);
    const { top: visibleTop, bottom: visibleBottom } = visibleBand(page);
    const scrollTop = page.scrollTop;
    const before = this.held;
    if (top < visibleTop && top + before <= visibleBottom && this.followedBelow(top + height)) {
      const rounded = this.meantTop !== null && Math.abs(top - this.meantTop) < 1 ? top - this.meantTop : 0;
      const by = content - before + rounded;
      page.scrollTop = scrollTop + by;
      this.meantTop = top - by;
      this.hold(content);
      return;
    }
    this.meantTop = null;
    if (content >= height) {
      this.hold(content);
      return;
    }
    const below = Math.floor(page.scrollHeight - page.clientHeight - scrollTop);
    this.hold(content);
    // Cut short, the page ended with this element, so what it ran on below the view is exactly what it can give back.
    if (page.scrollTop < scrollTop - 0.5) {
      this.hold(Math.max(content, height - Math.max(0, below)));
      page.scrollTop = scrollTop;
    }
    if (Math.abs(this.host.getBoundingClientRect().top - top) > 0.5) this.hold(height);
  }

  /** Whether the first thing after the element on the page starts below the element's end, rather than beside it. */
  private followedBelow(end: number) {
    for (let el: Element | null = this.host; el && el.tagName !== 'ION-CONTENT'; el = el.parentElement) {
      const next = el.nextElementSibling;
      if (next) return next.getBoundingClientRect().top >= end - 0.5;
    }
    return false;
  }

  // The page is anchored by hand while the element's top is above the view, where a change scrolls it by as much: older Safari
  // cannot anchor, and Chrome anchors to the element's partly visible container rather than to what follows it,
  // so its own anchoring would count the change twice. Elsewhere the browser keeps the learner's place, as through a resize.
  // It is switched as the page scrolls: a scroll also drops the anchor Chrome kept, which it would otherwise put back.
  private anchorByHandWhileAbove() {
    const page = this.scroller;
    if (!page) return;
    const above = this.host.getBoundingClientRect().top < visibleBand(page).top;
    if (above === this.anchoredByHand) return;
    this.anchoredByHand = above;
    page.style.overflowAnchor = above ? 'none' : '';
  }

  // Cleared before it is measured, so the page lays out afresh at the new width and the browser picks its anchor again
  // rather than keeping one beside the element.
  private release() {
    this.host.style.minHeight = '';
    this.hold(this.host.getBoundingClientRect().height);
    this.anchorByHandWhileAbove();
  }

  private contentHeight(top: number) {
    let bottom = top;
    for (const child of this.host.children) bottom = Math.max(bottom, child.getBoundingClientRect().bottom);
    return bottom - top;
  }

  private hold(height: number) {
    this.held = height;
    this.host.style.minHeight = `${height}px`;
  }
}

/** The part of the page's view that its toolbar and tab bar leave clear. */
function visibleBand(page: HTMLElement) {
  const view = page.getBoundingClientRect();
  const padding = getComputedStyle(page);
  return { top: view.top + parseFloat(padding.scrollPaddingTop), bottom: view.bottom - parseFloat(padding.scrollPaddingBottom) };
}
