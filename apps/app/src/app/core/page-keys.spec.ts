import { isKeyForPage, isOnHiddenPage } from './page-keys';

function mount(html: string): HTMLElement {
  document.body.innerHTML = html;
  return document.body;
}

const keyOn = (target: Element) => {
  const e = new KeyboardEvent('keydown', { key: '1', bubbles: true });
  target.dispatchEvent(e);
  return e;
};

describe('page keys', () => {
  afterEach(() => (document.body.innerHTML = ''));

  it('gives a key to the page in view, but not to a page Ionic keeps mounted for another tab', () => {
    const body = mount(
      '<div class="ion-page"><app-player></app-player></div><div class="ion-page ion-page-hidden"><app-drill></app-drill></div>',
    );
    const shown = body.querySelector('app-player')!;
    const hidden = body.querySelector('app-drill')!;
    expect(isOnHiddenPage(shown)).toBe(false);
    expect(isOnHiddenPage(hidden)).toBe(true);
    expect(isKeyForPage(shown, keyOn(body))).toBe(true);
    expect(isKeyForPage(hidden, keyOn(body))).toBe(false);
  });

  it('leaves keys typed into a field or an editor to that field', () => {
    const body = mount('<app-player><input /><select></select><textarea></textarea><div contenteditable="true"><p></p></div></app-player>');
    const host = body.querySelector('app-player')!;
    for (const field of ['input', 'select', 'textarea', '[contenteditable] p']) {
      expect(isKeyForPage(host, keyOn(body.querySelector(field)!)), field).toBe(false);
    }
    expect(isKeyForPage(host, keyOn(host))).toBe(true);
  });
});
