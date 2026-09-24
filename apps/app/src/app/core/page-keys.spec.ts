import { isKeyForPage, isOnHiddenPage } from './page-keys';

const keyOn = (target: Element, init: KeyboardEventInit = {}) => {
  const e = new KeyboardEvent('keydown', { key: '1', bubbles: true, ...init });
  target.dispatchEvent(e);
  return e;
};

describe('page keys', () => {
  afterEach(() => (document.body.innerHTML = ''));

  it('gives a key to the page in view, but not to a page Ionic keeps mounted for another tab', () => {
    document.body.innerHTML =
      '<div class="ion-page"><app-player></app-player></div><div class="ion-page ion-page-hidden"><app-drill></app-drill></div>';
    const shown = document.querySelector('app-player')!;
    const hidden = document.querySelector('app-drill')!;
    expect(isOnHiddenPage(shown)).toBe(false);
    expect(isOnHiddenPage(hidden)).toBe(true);
    expect(isKeyForPage(shown, keyOn(document.body))).toBe(true);
    expect(isKeyForPage(hidden, keyOn(document.body))).toBe(false);
  });

  it('leaves keys typed into a field or an editor to that field', () => {
    document.body.innerHTML =
      '<app-player><input /><select></select><textarea></textarea><div contenteditable="true"><p></p></div></app-player>';
    const host = document.querySelector('app-player')!;
    for (const field of ['input', 'select', 'textarea', '[contenteditable] p']) {
      expect(isKeyForPage(host, keyOn(document.querySelector(field)!)), field).toBe(false);
    }
    expect(isKeyForPage(host, keyOn(host))).toBe(true);
  });

  it('leaves Cmd, Ctrl and Alt chords to shortcuts, but still takes a shifted key', () => {
    document.body.innerHTML = '<app-player></app-player>';
    const host = document.querySelector('app-player')!;
    for (const modifier of ['metaKey', 'ctrlKey', 'altKey']) {
      expect(isKeyForPage(host, keyOn(host, { [modifier]: true })), modifier).toBe(false);
    }
    expect(isKeyForPage(host, keyOn(host, { key: 'G', shiftKey: true }))).toBe(true);
  });
});
