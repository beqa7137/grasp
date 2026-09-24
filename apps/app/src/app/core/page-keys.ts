const FIELD = 'input, textarea, select, [contenteditable]';
const OVERLAY = 'ion-modal, ion-alert, ion-action-sheet, ion-popover, ion-toast, ion-loading, [role="dialog"], [role="alertdialog"]';
const CONTROL =
  'a[href], button, summary, [role="button"], [role="link"], [role="checkbox"], [role="radio"], [role="switch"], [role="tab"], [role="menuitem"], [role="option"]';
const ARROW_WIDGET = '[role="radio"], [role="tab"], [role="slider"], [role="menuitem"], [role="option"]';

export function isOnHiddenPage(host: Element): boolean {
  return host.closest('.ion-page-hidden') !== null;
}

/** A single printable character, such as 1 or G: speech input can type these by accident, so they can be turned off. */
export function isCharacterKey(e: KeyboardEvent): boolean {
  return e.key.length === 1 && e.key !== ' ';
}

/**
 * Whether a document-level key press belongs to the page that hosts `host`. Ionic keeps the pages of other tabs mounted
 * and marks them `ion-page-hidden`, and hides the page behind an open dialog from assistive tech. A key typed into a field
 * or pressed in a dialog belongs there, Enter and Space activate the focused control, the arrow keys move inside a radio
 * group or slider, and a Cmd, Ctrl or Alt chord is a shortcut, not a page key.
 *
 * Call it while the event is dispatched. It reads the composed path because at the document an Ionic control, such as a
 * tab button, reports its host as the target, not the focused element inside its shadow root.
 */
export function isKeyForPage(host: Element, e: KeyboardEvent): boolean {
  const path = e.composedPath().filter((node): node is Element => node instanceof Element);
  const within = (selector: string) => path.some((el) => el.matches(selector));
  const ownedByTarget =
    within(FIELD) ||
    within(OVERLAY) ||
    ((e.key === 'Enter' || e.key === ' ') && within(CONTROL)) ||
    (e.key.startsWith('Arrow') && within(ARROW_WIDGET));
  const pageInert = isOnHiddenPage(host) || host.closest('[aria-hidden="true"], [inert]') !== null;
  return !ownedByTarget && !pageInert && !e.metaKey && !e.ctrlKey && !e.altKey;
}
