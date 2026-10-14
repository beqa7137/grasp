import { Injector, afterNextRender } from '@angular/core';
import { type ActivatedRoute, type Router, type UrlTree } from '@angular/router';

/** What a segment may hand its hub to keep, beyond its scroll position; it gets it back before its first render. */
export interface KeptSegment {
  keepState?(): unknown;
  restoreState?(state: unknown): void;
}

interface Memory {
  scroll: number;
  state: unknown;
}

/** Frames to wait for the hub's page to show again, as Ionic unhides it only when its back transition starts. */
const SHOW_FRAMES = 60;
/** The restored position is held until the page has been still this long (the tab bar returning, WebKit's resize)... */
const SETTLE_MS = 600;
/** ...and at most this long. */
const HOLD_MS = 4000;

const pathOf = (tree: UrlTree) => `/${(tree.root.children['primary']?.segments ?? []).map((s) => s.path).join('/')}`;

/**
 * Keeps each segment of a hub where the learner left it across the pages opened above the hub (REDESIGN.md 2.5). Ionic
 * keeps the hub's page in its stack, but Angular destroys the segment in the hub's plain outlet whenever the hub's route
 * is left, so back from the workspace would rebuild the list at its top. Memories are kept by the segment's URL, filters
 * included. Switching to another segment of the same hub forgets the one left, so a segment opened from the hub's row
 * starts at its top.
 */
export class SegmentMemory {
  private readonly memories = new Map<string, Memory>();
  private scroller: HTMLElement | null = null;
  private scroll = 0;
  private route: ActivatedRoute | null = null;
  private stopHolding = () => {};

  constructor(
    private readonly router: Router,
    private readonly injector: Injector,
    /** The hub's own segment paths, as `/coding/problems`. */
    private readonly segments: readonly string[],
  ) {}

  /** The hub's scrolling element, once its content has one. */
  attach(scroller: HTMLElement): void {
    this.scroller = scroller;
    // A navigation away removes the list, and WebKit reports the clamped scroll before the segment is destroyed.
    scroller.addEventListener(
      'scroll',
      () => {
        if (!this.router.currentNavigation()) this.scroll = scroller.scrollTop;
      },
      { passive: true },
    );
  }

  activated(segment: KeptSegment, route: ActivatedRoute): void {
    this.route = route;
    const key = this.key(route);
    const memory = this.memories.get(key);
    this.memories.delete(key);
    if (!memory) return;
    segment.restoreState?.(memory.state);
    afterNextRender(() => void this.restore(memory.scroll), { injector: this.injector });
  }

  deactivated(segment: KeptSegment): void {
    this.stopHolding();
    const route = this.route;
    this.route = null;
    const next = this.router.currentNavigation()?.finalUrl;
    if (!route || (next && this.segments.includes(pathOf(next)))) return;
    this.memories.set(this.key(route), { scroll: this.scroll, state: segment.keepState?.() });
  }

  private key(route: ActivatedRoute): string {
    return this.router.serializeUrl(this.router.createUrlTree(['.'], { relativeTo: route, queryParams: route.snapshot.queryParams }));
  }

  private async restore(scroll: number): Promise<void> {
    const el = this.scroller;
    if (!el) return;
    for (let frame = 0; frame < SHOW_FRAMES && !el.clientHeight; frame++) await new Promise(requestAnimationFrame);
    const put = () => {
      el.scrollTop = scroll;
      this.scroll = el.scrollTop;
    };
    put();
    // The page resizes as the tab bar comes back, and WebKit then moves the scroll; the position is held until the page
    // has been still for a moment, or until the learner scrolls.
    let quiet = setTimeout(() => release(), SETTLE_MS);
    const cap = setTimeout(() => release(), HOLD_MS);
    const reassert = () => {
      if (el.scrollTop !== scroll) put();
      clearTimeout(quiet);
      quiet = setTimeout(() => release(), SETTLE_MS);
    };
    const hold = new ResizeObserver(reassert);
    const inputs = ['wheel', 'touchstart', 'keydown', 'pointerdown'];
    const release = () => {
      hold.disconnect();
      clearTimeout(quiet);
      clearTimeout(cap);
      el.removeEventListener('scroll', reassert);
      for (const type of inputs) el.removeEventListener(type, release);
      this.stopHolding = () => {};
    };
    this.stopHolding = release;
    hold.observe(el);
    el.addEventListener('scroll', reassert, { passive: true });
    for (const type of inputs) el.addEventListener(type, release, { passive: true });
  }
}
