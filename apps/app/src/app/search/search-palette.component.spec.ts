import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { SearchPaletteComponent } from './search-palette.component';

function setup() {
  Element.prototype.scrollIntoView = vi.fn();
  const router = { navigateByUrl: vi.fn(async () => true), url: '/coding' };
  TestBed.configureTestingModule({ imports: [SearchPaletteComponent], providers: [{ provide: Router, useValue: router }] });
  const fixture = TestBed.createComponent(SearchPaletteComponent);
  fixture.detectChanges();
  const host: HTMLElement = fixture.nativeElement;
  const dialog = host.querySelector('dialog')!;
  // jsdom has no modal dialogs: open and close as a browser would, with its close event.
  dialog.showModal = () => dialog.setAttribute('open', '');
  dialog.close = () => {
    dialog.removeAttribute('open');
    dialog.dispatchEvent(new Event('close'));
  };
  const input = host.querySelector('input')!;
  const type = (text: string) => {
    input.value = text;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  };
  const press = (key: string) => {
    input.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
    fixture.detectChanges();
  };
  const options = () => [...host.querySelectorAll<HTMLElement>('[role="option"]')];
  return { fixture, host, dialog, input, type, press, options, router, palette: fixture.componentInstance };
}

describe('SearchPaletteComponent', () => {
  it('opens as a modal combobox over grouped results and moves the active option with the arrow keys', () => {
    const { palette, dialog, input, type, press, options, host } = setup();
    palette.show(null);
    expect(dialog.hasAttribute('open')).toBe(true);
    expect(document.activeElement).toBe(input);
    expect(input.getAttribute('role')).toBe('combobox');

    type('rate');
    expect(host.querySelector('.round')?.textContent?.trim()).toBe('System design');
    expect([...host.querySelectorAll('[role="group"]')].map((g) => g.getAttribute('aria-label'))).toEqual([
      'System design: Topics',
      'System design: Cases',
      'System design: Mock rounds',
      'System design: Missions',
    ]);
    const [first, second] = options();
    expect(input.getAttribute('aria-activedescendant')).toBe(first.id);
    expect(first.getAttribute('aria-selected')).toBe('true');
    press('ArrowDown');
    expect(input.getAttribute('aria-activedescendant')).toBe(second.id);
    press('ArrowUp');
    press('ArrowUp');
    expect(input.getAttribute('aria-activedescendant')).toBe(options().at(-1)!.id);
    expect(host.querySelector('[role="status"]')?.textContent).toMatch(/^\d+ results$/);
  });

  it('opens the active result with its origin, closes, and lets the page it opens take focus', async () => {
    const { palette, dialog, type, press, router } = setup();
    const opened = vi.fn();
    palette.opened = opened;
    palette.show(null);
    type('Bot Storm');
    press('Enter');
    expect(dialog.hasAttribute('open')).toBe(false);
    expect(router.navigateByUrl).toHaveBeenCalledExactlyOnceWith('/design/missions/bot-storm', { state: { from: '/coding' } });
    await Promise.resolve();
    await Promise.resolve();
    expect(opened).toHaveBeenCalledWith(null);
  });

  it('caps a kind at eight and offers the rest on the search page', () => {
    const { palette, type, options, router } = setup();
    palette.show(null);
    type('binary search');
    const more = options().find((o) => o.textContent?.includes('See all'))!;
    expect(more.textContent?.trim()).toMatch(/^See all \d+ problems →$/);
    more.click();
    expect(router.navigateByUrl).toHaveBeenCalledWith('/today/search?q=binary%20search&kind=problem', expect.anything());
  });

  it('suggests a close title when nothing matches', () => {
    const { palette, type, host, input, fixture } = setup();
    palette.show(null);
    type('rate limter');
    expect(host.querySelector('.note')?.textContent).toContain('Nothing matches “rate limter”');
    host.querySelector<HTMLButtonElement>('.suggest')!.click();
    fixture.detectChanges();
    expect(input.value).toBe('Rate Limiter');
    expect(document.activeElement).toBe(input);
  });

  it('starts from what was typed while it loaded, and leaves an input method its keys', () => {
    const { palette, input, fixture, options } = setup();
    palette.show(null, 'rate');
    fixture.detectChanges();
    expect(input.value).toBe('rate');
    expect(options().length).toBeGreaterThan(1);
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', isComposing: true, bubbles: true }));
    fixture.detectChanges();
    expect(input.getAttribute('aria-activedescendant')).toBe(options()[0].id);
  });

  it('closes on the search chord, and opens on the top hit again with the last query', () => {
    const { palette, dialog, type, press, input, options, fixture } = setup();
    palette.show(null);
    type('rate');
    press('ArrowDown');
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
    expect(dialog.hasAttribute('open')).toBe(false);
    palette.show(null);
    fixture.detectChanges();
    expect(input.value).toBe('rate');
    expect(input.getAttribute('aria-activedescendant')).toBe(options()[0].id);
  });

  it('leaves a modified click to the browser, which opens the result in a new tab', () => {
    const { palette, type, options, router } = setup();
    palette.show(null);
    type('Bot Storm');
    const [first] = options();
    expect(first.getAttribute('href')).toBe('/design/missions/bot-storm');
    first.dispatchEvent(new MouseEvent('click', { ctrlKey: true, bubbles: true, cancelable: true }));
    expect(router.navigateByUrl).not.toHaveBeenCalled();
  });

  it('returns focus to what opened it when it closes', () => {
    const { palette, dialog } = setup();
    const launcher = document.body.appendChild(document.createElement('button'));
    palette.show(launcher);
    dialog.close();
    expect(document.activeElement).toBe(launcher);
    launcher.remove();
  });
});
