/** Whether `host` sits on a page that Ionic keeps mounted for a tab out of view (marked `ion-page-hidden`). */
export function isOnHiddenPage(host: Element): boolean {
  return host.closest('.ion-page-hidden') !== null;
}

/**
 * Whether a document-level key press belongs to the page that hosts `host`. Ionic keeps the pages of other
 * tabs mounted and marks them `ion-page-hidden`, and a key typed into a field belongs to that field.
 */
export function isKeyForPage(host: Element, e: KeyboardEvent): boolean {
  const typing = e.target instanceof Element && e.target.closest('input, textarea, select, [contenteditable]');
  return !typing && !isOnHiddenPage(host);
}
