import { holdKeys, isSearchKey, searchKeyHint } from './search-keys';

/** Presses a key on `target` and asks, as the tabs page's listener does, whether it opens search. */
const opens = (target: Element, init: KeyboardEventInit, characterKeys = true, apple = false) => {
  const host = document.querySelector('app-tabs')!;
  let result: boolean | undefined;
  const listen = (e: KeyboardEvent) => (result = isSearchKey(host, e, characterKeys, apple));
  document.addEventListener('keydown', listen);
  target.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, composed: true, ...init }));
  document.removeEventListener('keydown', listen);
  return result;
};

describe('search keys', () => {
  beforeEach(() => {
    document.body.innerHTML =
      '<app-tabs><main><button>Go</button><input type="search"><div class="cm-editor"><div contenteditable="true"></div></div></main></app-tabs><dialog open><input></dialog>';
  });
  afterEach(() => (document.body.innerHTML = ''));

  it('opens on Ctrl or Cmd K anywhere, a field included, but not in the code editor or a dialog', () => {
    const button = document.querySelector('button')!;
    expect(opens(button, { key: 'k', ctrlKey: true })).toBe(true);
    expect(opens(button, { key: 'K', ctrlKey: true })).toBe(true);
    expect(opens(button, { key: 'k', metaKey: true })).toBe(false);
    expect(opens(document.querySelector('input[type="search"]')!, { key: 'k', ctrlKey: true })).toBe(true);
    expect(opens(document.querySelector('[contenteditable]')!, { key: 'k', ctrlKey: true })).toBe(false);
    expect(opens(document.querySelector('dialog input')!, { key: 'k', ctrlKey: true })).toBe(false);
    expect(opens(button, { key: 'k', ctrlKey: true, shiftKey: true })).toBe(false);
    expect(opens(button, { key: 'k' })).toBe(false);
  });

  it('takes Cmd K on Apple devices, leaving Ctrl K to the field (delete to the end of the line)', () => {
    const button = document.querySelector('button')!;
    expect(opens(button, { key: 'k', metaKey: true }, true, true)).toBe(true);
    expect(opens(button, { key: 'k', ctrlKey: true }, true, true)).toBe(false);
  });

  it('finds K by its place on a layout that types another letter there', () => {
    const button = document.querySelector('button')!;
    expect(opens(button, { key: 'л', code: 'KeyK', ctrlKey: true })).toBe(true);
    expect(opens(button, { key: 'j', code: 'KeyK', ctrlKey: true })).toBe(false);
  });

  it('opens on "/" only while single-key shortcuts are on, and never from a field', () => {
    const button = document.querySelector('button')!;
    expect(opens(button, { key: '/' })).toBe(true);
    expect(opens(button, { key: '/' }, false)).toBe(false);
    expect(opens(document.querySelector('input[type="search"]')!, { key: '/' })).toBe(false);
    expect(opens(button, { key: '/', ctrlKey: true })).toBe(false);
  });

  it('shows the platform modifier', () => {
    expect(searchKeyHint(true)).toBe('⌘ K');
    expect(searchKeyHint(false)).toBe('Ctrl K');
  });

  it('holds what is typed while search opens, so the page behind gets none of it', () => {
    const page = vi.fn();
    document.addEventListener('keydown', page);
    const held = holdKeys(document);
    for (const key of ['r', 'a', 'Shift', 't', 'e']) document.body.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
    expect(held.release()).toBe('rate');
    expect(held.cancelled()).toBe(false);
    expect(page).toHaveBeenCalledTimes(1);
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'x', bubbles: true }));
    expect(page).toHaveBeenCalledTimes(2);
    document.removeEventListener('keydown', page);
  });
});
