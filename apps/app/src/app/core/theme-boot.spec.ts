/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { FIRST_PAINT_KEY } from './theme.service';
import { LOOKS, THEME_RESOLUTIONS, pageLook, resetPage } from './theme.testing';

const BOOT = readFileSync('public/theme-boot.js', 'utf8');
const SHELL = new DOMParser().parseFromString(readFileSync('src/index.html', 'utf8'), 'text/html');

function boot({ saved, systemDark }: { saved?: string; systemDark?: boolean }) {
  document.documentElement.className = SHELL.documentElement.className;
  document.head.replaceChildren(...[...SHELL.head.querySelectorAll('meta')].map((meta) => meta.cloneNode()));
  if (saved !== undefined) localStorage.setItem(FIRST_PAINT_KEY, saved);
  vi.stubGlobal(
    'matchMedia',
    systemDark === undefined ? undefined : (query: string) => ({ matches: systemDark && query === '(prefers-color-scheme: dark)' }),
  );
  new Function(BOOT)();
  return pageLook();
}

describe('index.html', () => {
  it('is dark before any script runs, with the dark background from the stylesheet', () => {
    expect(pageLook(SHELL)).toEqual(LOOKS.dark);
  });
});

describe('theme-boot.js', () => {
  afterEach(resetPage);

  it.each(THEME_RESOLUTIONS)('resolves $saved saved on a $device device to dark: $dark', ({ saved, device, dark }) => {
    expect(boot({ saved: saved === 'none' ? undefined : saved, systemDark: device === 'dark' })).toEqual(dark ? LOOKS.dark : LOOKS.light);
  });

  it('ignores anything else saved under the key', () => {
    expect(boot({ saved: 'sepia', systemDark: false })).toEqual(LOOKS.light);
  });

  it('stays dark where the browser cannot tell the device mode', () => {
    expect(boot({})).toEqual(LOOKS.dark);
  });
});
