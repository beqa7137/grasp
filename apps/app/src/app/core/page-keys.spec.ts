import { isCharacterKey, isChordForPage, isKeyForPage, isOnHiddenPage } from './page-keys';

/** Presses a key on `target` and asks, as the document-level listeners do, whether it belongs to `host`'s page. */
const keyOn = (host: Element, target: Element, init: KeyboardEventInit = {}, belongs = isKeyForPage) => {
  let forPage: boolean | undefined;
  const listen = (e: KeyboardEvent) => (forPage = belongs(host, e));
  document.addEventListener('keydown', listen);
  target.dispatchEvent(new KeyboardEvent('keydown', { key: '1', bubbles: true, composed: true, ...init }));
  document.removeEventListener('keydown', listen);
  return forPage;
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
    expect(keyOn(shown, document.body)).toBe(true);
    expect(keyOn(hidden, document.body)).toBe(false);
  });

  it('leaves keys typed into a field or an editor to that field', () => {
    document.body.innerHTML =
      '<app-player><input /><select></select><textarea></textarea><div contenteditable="true"><p></p></div></app-player>';
    const host = document.querySelector('app-player')!;
    for (const field of ['input', 'select', 'textarea', '[contenteditable] p']) {
      expect(keyOn(host, document.querySelector(field)!), field).toBe(false);
    }
    expect(keyOn(host, host)).toBe(true);
  });

  it('leaves Enter and Space to the focused control, but takes them when nothing is focused', () => {
    document.body.innerHTML =
      '<app-drill><a href="/today">link</a><button>Easy</button><span role="radio">5 min</span><p tabindex="-1">Correct</p></app-drill>';
    const host = document.querySelector('app-drill')!;
    for (const key of ['Enter', ' ']) {
      for (const control of ['a', 'button', '[role="radio"]']) {
        expect(keyOn(host, document.querySelector(control)!, { key }), `${key} on ${control}`).toBe(false);
      }
      expect(keyOn(host, document.querySelector('p')!, { key })).toBe(true);
      expect(keyOn(host, document.body, { key })).toBe(true);
    }
    expect(keyOn(host, document.querySelector('button')!, { key: '2' })).toBe(true);
  });

  it('sees the focused control inside a shadow root, such as Ionic tab and back buttons', () => {
    // A plain host: if Ionic has already defined ion-tab-button, that element brings its own shadow root.
    document.body.innerHTML = '<app-player></app-player><div class="tab-host"></div>';
    const host = document.querySelector('app-player')!;
    const tab = document.querySelector('.tab-host')!.attachShadow({ mode: 'open' });
    tab.innerHTML = '<a href="/mock" role="tab">Mock</a>';
    const native = tab.querySelector('a')!;
    for (const key of ['Enter', ' ', 'ArrowRight']) {
      expect(keyOn(host, native, { key }), key).toBe(false);
    }
    expect(keyOn(host, native, { key: '2' })).toBe(true);
  });

  it('leaves the arrow keys to a radio group, but not to a plain button', () => {
    document.body.innerHTML = '<app-player><button role="radio">JS</button><button>Random</button></app-player>';
    const host = document.querySelector('app-player')!;
    expect(keyOn(host, document.querySelector('[role="radio"]')!, { key: 'ArrowRight' })).toBe(false);
    expect(keyOn(host, document.querySelector('button:not([role])')!, { key: 'ArrowRight' })).toBe(true);
  });

  it('gives no key to the page while a dialog is open over it', () => {
    document.body.innerHTML =
      '<div aria-hidden="true"><app-drill></app-drill></div><ion-modal><app-feedback-sheet><button>Cancel</button></app-feedback-sheet></ion-modal>';
    const host = document.querySelector('app-drill')!;
    expect(keyOn(host, document.querySelector('ion-modal button')!, { key: '2' })).toBe(false);
    expect(keyOn(host, document.body, { key: 'Enter' })).toBe(false);
  });

  it('tells a character key from Space and the named keys', () => {
    expect(['1', 'g', 'E'].map((key) => isCharacterKey(new KeyboardEvent('keydown', { key })))).toEqual([true, true, true]);
    expect([' ', 'Enter', 'ArrowRight'].map((key) => isCharacterKey(new KeyboardEvent('keydown', { key })))).toEqual([false, false, false]);
  });

  it('leaves Cmd, Ctrl and Alt chords to shortcuts, but still takes a shifted key', () => {
    document.body.innerHTML = '<app-player></app-player>';
    const host = document.querySelector('app-player')!;
    for (const modifier of ['metaKey', 'ctrlKey', 'altKey']) {
      expect(keyOn(host, host, { [modifier]: true }), modifier).toBe(false);
    }
    expect(keyOn(host, host, { key: 'G', shiftKey: true })).toBe(true);
  });

  it('takes a chord typed into a field, but not one typed into a dialog or on a hidden page', () => {
    document.body.innerHTML =
      '<div class="ion-page"><app-code-workspace><textarea></textarea></app-code-workspace></div><ion-modal><textarea></textarea></ion-modal>';
    const host = document.querySelector('app-code-workspace')!;
    const page = host.closest('.ion-page')!;
    const run = { key: 'Enter', metaKey: true };
    expect(keyOn(host, host.querySelector('textarea')!, run, isChordForPage)).toBe(true);
    expect(keyOn(host, document.querySelector('ion-modal textarea')!, run, isChordForPage)).toBe(false);

    page.setAttribute('aria-hidden', 'true');
    expect(keyOn(host, host.querySelector('textarea')!, run, isChordForPage)).toBe(false);
    page.removeAttribute('aria-hidden');
    page.classList.add('ion-page-hidden');
    expect(keyOn(host, host.querySelector('textarea')!, run, isChordForPage)).toBe(false);
  });
});
