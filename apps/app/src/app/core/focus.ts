import { type Injector, afterNextRender } from '@angular/core';
import { isOnHiddenPage } from './page-keys';

let pointerInput = false;
document.addEventListener('pointerdown', () => (pointerInput = true), { capture: true, passive: true });
document.addEventListener('keydown', () => (pointerInput = false), { capture: true, passive: true });

/**
 * Moves focus to `target` when focus was lost (its control was removed or disabled) or is still inside `within`, whose
 * content just changed. After a tap or click it does not scroll, so the content stays where the pointer left it.
 */
export function refocus(target: HTMLElement | SVGElement | null | undefined, within?: Element | null): void {
  if (!target || isOnHiddenPage(target)) return;
  const active = document.activeElement;
  const lost = !active || active === document.body || (active as HTMLButtonElement).disabled === true;
  if (lost || (within && within.contains(active))) target.focus({ preventScroll: pointerInput });
}

/** Refocuses once the change has rendered, looking `target` up then, since the change may be what creates it. */
export function refocusAfterRender(
  injector: Injector,
  target: () => HTMLElement | SVGElement | null | undefined,
  within?: Element | null,
): void {
  afterNextRender(() => refocus(target(), within), { injector });
}
