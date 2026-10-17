import { isChordForPage, isKeyForPage } from '../core/page-keys';

/** The code editor keeps its own chords: Ctrl or Cmd K there is the editor's. */
const EDITOR = '.cm-editor';

/**
 * Whether a key press opens search (REDESIGN.md 2.9): Ctrl or Cmd K anywhere but the code editor or a dialog, and "/" only
 * when single-key shortcuts are on and the key is the page's (not typed into a field).
 */
export function isSearchKey(host: Element, e: KeyboardEvent, characterKeys: boolean): boolean {
  if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'k')
    return isChordForPage(host, e) && !e.composedPath().some((node) => node instanceof Element && node.matches(EDITOR));
  return e.key === '/' && characterKeys && isKeyForPage(host, e);
}

/** A modifier pressed alone, the likely start of Ctrl or Cmd K: the palette's code can start loading. */
export const isSearchChordStart = (e: KeyboardEvent) => e.key === 'Control' || e.key === 'Meta';

/** The hint the rail shows: the platform's own modifier. */
export const searchKeyHint = (nav: Pick<Navigator, 'platform' | 'userAgent'> = navigator) =>
  /Mac|iPhone|iPad/.test(`${nav.platform} ${nav.userAgent}`) ? '⌘ K' : 'Ctrl K';
