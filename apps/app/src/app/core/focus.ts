import { type Injector, afterNextRender } from '@angular/core';
import { isOnHiddenPage } from './page-keys';

let pointerInput = false;
document.addEventListener('pointerdown', () => (pointerInput = true), { capture: true, passive: true });
document.addEventListener('keydown', () => (pointerInput = false), { capture: true, passive: true });

/** Where focus may be taken from: one element, or any of several. */
export type FocusPlaces = Element | null | undefined | readonly (Element | null | undefined)[];

/**
 * Moves focus to `target` when focus was lost (its control was removed, disabled or hidden) or is still inside `within`,
 * whose content just changed. After a tap or click it does not scroll, so the content stays where the pointer left it.
 * After a key press it scrolls the target into view, or leaves that to `reveal`, for a page that must also keep something
 * else in view.
 */
export function refocus(
  target: HTMLElement | SVGElement | null | undefined,
  within?: FocusPlaces,
  reveal?: (target: HTMLElement | SVGElement) => void,
): void {
  if (!target || isOnHiddenPage(target)) return;
  const active = document.activeElement;
  // A control hidden by the change still holds focus until the browser's own fixup, which then drops it to the body.
  const lost =
    !active || active === document.body || (active as HTMLButtonElement).disabled === true || active.checkVisibility?.() === false;
  const places: readonly (Element | null | undefined)[] = Array.isArray(within) ? within : [within as Element | null | undefined];
  if (!lost && !places.some((place) => place?.contains(active))) return;
  if (reveal && !pointerInput) reveal(target);
  target.focus({ preventScroll: pointerInput || !!reveal });
}

/** Refocuses once the change has rendered, looking `target` up then, since the change may be what creates it. */
export function refocusAfterRender(
  injector: Injector,
  target: () => HTMLElement | SVGElement | null | undefined,
  within?: FocusPlaces,
): void {
  afterNextRender(() => refocus(target(), within), { injector });
}
