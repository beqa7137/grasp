import { DestroyRef, ElementRef, inject } from '@angular/core';
import { isChordForPage, isKeyForPage } from './page-keys';
import { ShortcutsService } from './shortcuts.service';

/**
 * Which key presses reach the handler. `page`: those `isKeyForPage` gives the page. `shortcuts`: the same, less the
 * single-character ones while Settings has them turned off. `chord`: a Cmd or Ctrl chord meant to work while typing, such
 * as Cmd+Enter to run the code from the editor.
 */
export type PageKeyKind = 'page' | 'shortcuts' | 'chord';

/** Calls `handler` for the document's key presses that belong to the calling component's page, until it is destroyed. */
export function onPageKey(handler: (e: KeyboardEvent) => void, { kind = 'page' }: { kind?: PageKeyKind } = {}): void {
  const host: Element = inject(ElementRef).nativeElement;
  const shortcuts = inject(ShortcutsService);
  const guards: Record<PageKeyKind, (e: KeyboardEvent) => boolean> = {
    page: (e) => isKeyForPage(host, e),
    shortcuts: (e) => shortcuts.handles(host, e),
    chord: (e) => isChordForPage(host, e),
  };
  const belongs = guards[kind];
  const listener = (e: KeyboardEvent) => {
    if (belongs(e)) handler(e);
  };
  document.addEventListener('keydown', listener);
  inject(DestroyRef).onDestroy(() => document.removeEventListener('keydown', listener));
}
