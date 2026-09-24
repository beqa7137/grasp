import { TestBed } from '@angular/core/testing';
import { ShortcutsService } from './shortcuts.service';

const key = (k: string) => new KeyboardEvent('keydown', { key: k });

describe('ShortcutsService', () => {
  afterEach(() => {
    localStorage.clear();
    document.body.innerHTML = '';
  });

  it('takes character keys and named keys while single-key shortcuts are on', () => {
    document.body.innerHTML = '<app-drill></app-drill>';
    const host = document.querySelector('app-drill')!;
    const shortcuts = TestBed.inject(ShortcutsService);
    expect(['1', 'g', 'Enter', ' ', 'ArrowRight'].map((k) => shortcuts.handles(host, key(k)))).toEqual([true, true, true, true, true]);
  });

  it('drops only the character keys once they are turned off, and remembers that on this device', async () => {
    document.body.innerHTML = '<app-drill></app-drill>';
    const host = document.querySelector('app-drill')!;
    await TestBed.inject(ShortcutsService).setCharacterKeys(false);

    TestBed.resetTestingModule();
    const reloaded = TestBed.inject(ShortcutsService);
    await reloaded.init();
    expect(reloaded.characterKeys()).toBe(false);
    expect(['1', 'g', 'Enter', ' ', 'ArrowRight'].map((k) => reloaded.handles(host, key(k)))).toEqual([false, false, true, true, true]);

    await reloaded.setCharacterKeys(true);
    TestBed.resetTestingModule();
    const again = TestBed.inject(ShortcutsService);
    await again.init();
    expect(again.characterKeys()).toBe(true);
  });
});
