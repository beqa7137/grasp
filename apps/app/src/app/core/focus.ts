import { isOnHiddenPage } from './page-keys';

let pointerInput = false;
if (typeof document !== 'undefined') {
  document.addEventListener('pointerdown', () => (pointerInput = true), { capture: true, passive: true });
  document.addEventListener('keydown', () => (pointerInput = false), { capture: true, passive: true });
}

/**
 * Moves focus to `target` when the page lost it, because the control that had it was removed or disabled, or when focus
 * is still inside `within`, whose content just changed. Keyboard and screen reader users then carry on from the new
 * content instead of from the top of the page. After a tap or click the page does not scroll to the new focus, so the
 * content stays where the pointer left it.
 */
export function refocus(target: HTMLElement | SVGElement | null | undefined, within?: Element | null): void {
  if (!target || isOnHiddenPage(target)) return;
  const active = document.activeElement;
  const lost = !active || active === document.body || (active as HTMLButtonElement).disabled === true;
  if (lost || (within && within.contains(active))) target.focus({ preventScroll: pointerInput });
}
