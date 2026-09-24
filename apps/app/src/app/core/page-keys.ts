export function isOnHiddenPage(host: Element): boolean {
  return host.closest('.ion-page-hidden') !== null;
}

/**
 * Whether a document-level key press belongs to the page that hosts `host`. Ionic keeps the pages of other
 * tabs mounted and marks them `ion-page-hidden`, a key typed into a field belongs to that field, and a Cmd, Ctrl
 * or Alt chord is a shortcut, not a page key.
 */
export function isKeyForPage(host: Element, e: KeyboardEvent): boolean {
  const typing = e.target instanceof Element && e.target.closest('input, textarea, select, [contenteditable]');
  return !typing && !e.metaKey && !e.ctrlKey && !e.altKey && !isOnHiddenPage(host);
}
