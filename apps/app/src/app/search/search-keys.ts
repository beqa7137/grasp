import { isChordForPage, isKeyForPage } from '../core/page-keys';

/** The code editor keeps its own chords: Ctrl or Cmd K there is the editor's. */
const EDITOR = '.cm-editor';

const APPLE = /Mac|iPhone|iPad/.test(`${navigator.platform} ${navigator.userAgent}`);

/**
 * Ctrl K, or Cmd K on Apple devices, where Ctrl K deletes to the end of the line in a field. K by its key, or by its place
 * when the layout types another letter there (Cyrillic, Greek).
 */
export function isSearchChord(e: KeyboardEvent, apple = APPLE): boolean {
  const k = e.key.toLowerCase() === 'k' || (e.code === 'KeyK' && !/^[\x20-\x7e]$/.test(e.key));
  return k && (apple ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey) && !e.altKey && !e.shiftKey;
}

/**
 * Whether a key press opens search (REDESIGN.md 2.9): the search chord anywhere but the code editor or a dialog, and "/"
 * only when single-key shortcuts are on and the key is the page's (not typed into a field).
 */
export function isSearchKey(host: Element, e: KeyboardEvent, characterKeys: boolean, apple = APPLE): boolean {
  if (isSearchChord(e, apple))
    return isChordForPage(host, e) && !e.composedPath().some((node) => node instanceof Element && node.matches(EDITOR));
  return e.key === '/' && characterKeys && isKeyForPage(host, e);
}

/** The chord's modifier pressed alone, the likely start of it: the palette's code can start loading. */
export const isSearchChordStart = (e: KeyboardEvent, apple = APPLE) => e.key === (apple ? 'Meta' : 'Control');

/** The hint the rail shows: the platform's own chord. */
export const searchKeyHint = (apple = APPLE) => (apple ? '⌘ K' : 'Ctrl K');

/**
 * Holds what is typed while search opens, so no key reaches the page behind it; `release` stops and returns the text. Esc
 * cancels the opening.
 */
export function holdKeys(doc: Document): { release(): string; cancelled(): boolean } {
  let typed = '';
  let cancelled = false;
  const hold = (e: KeyboardEvent) => {
    if (e.key === 'Escape') cancelled = true;
    else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) typed += e.key;
    else return;
    e.preventDefault();
    e.stopImmediatePropagation();
  };
  doc.addEventListener('keydown', hold, true);
  return {
    release: () => {
      doc.removeEventListener('keydown', hold, true);
      return typed;
    },
    cancelled: () => cancelled,
  };
}
